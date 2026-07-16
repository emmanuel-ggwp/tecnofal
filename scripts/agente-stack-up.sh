#!/usr/bin/env bash
# [toolkit agent-multiple-supabase-local] Levanta (o baja) un STACK Supabase AISLADO por agente para correr el e2e
# web EN PARALELO con otros agentes sin contención. Reusa el ÚNICO Postgres del proyecto (los
# clones no cuestan RAM) y levanta por agente solo lo que el e2e usa: PostgREST + GoTrue + un
# proxy nginx que emula el gateway Kong (ruteo + CORS). Footprint medido: ~87 MiB de
# contenedores/agente (el grueso del costo es el dev server de la web, en el host).
# Ver CLAUDE.md §"E2E aislado por agente".
#
# CUÁNDO usarlo: SOLO si necesitas VARIOS agentes corriendo el e2e web a la vez. El e2e normal
# corre contra la `postgres` compartida con --workers=1 y NO necesita esto.
#
# Uso:
#   scripts/agente-stack-up.sh <tarea>          # clon + rest+auth+proxy; imprime SUPABASE_URL y cómo correr el e2e
#   scripts/agente-stack-up.sh <tarea> --drop   # baja el stack y elimina el clon
#
# Config del proyecto: .agente/agente.conf. Requiere el stack Supabase del proyecto arriba
# (copia de él imágenes, env y red) y Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .agente/agente.conf ] && . .agente/agente.conf
PROYECTO="${PROYECTO:?falta .agente/agente.conf con PROYECTO=<project_id>}"
REF="${SUPABASE_REF_PROJECT:-$PROYECTO}"
DBC="supabase_db_${REF}"
NET="supabase_network_${REF}"
WEB_DIR="${WEB_DIR:-apps/web}"
WEB_DEV="${WEB_DEV:-bun run dev}"
tarea="${1:?uso: agente-stack-up.sh <tarea> [--drop]}"
clon="agente_${tarea}"
pr="ag_${tarea}_rest"; pa="ag_${tarea}_auth"; px="ag_${tarea}_proxy"

# Servicios soportados hoy: rest y auth (lo mínimo que supabase-js necesita). Si un proyecto
# declara otros (storage, realtime…), fallar claro en vez de fingir que se levantaron.
for s in ${SERVICIOS_E2E:-rest auth}; do
  case "$s" in rest|auth) ;; *)
    echo "✗ SERVICIOS_E2E incluye '$s', aún no soportado por agente-stack-up (hoy: rest auth)." >&2
    exit 1;;
  esac
done

libre(){ ! ( : < "/dev/tcp/127.0.0.1/$1" ) 2>/dev/null; }

if [ "${2:-}" = "--drop" ]; then
  docker rm -f "$pr" "$pa" "$px" >/dev/null 2>&1 || true
  scripts/db-agente.sh "$tarea" --drop
  echo "→ stack y clon de '$tarea' eliminados"
  exit 0
fi

echo "→ [1/5] clon de BD ($clon)"
scripts/db-agente.sh "$tarea" >/dev/null

echo "→ [2/5] preparar schema auth del clon para GoTrue (migraciones + ownership + extensions)"
# Sembrar auth.schema_migrations (la plantilla lo trae vacío → si no, GoTrue re-migra y choca).
docker exec -i "$DBC" bash -lc "pg_dump -U postgres -d postgres --data-only --table=auth.schema_migrations 2>/dev/null | psql -U postgres -d $clon -q" >/dev/null
# Dueño de auth -> supabase_auth_admin (el --no-owner de la plantilla lo deja en postgres, y la RLS
# le oculta schema_migrations a GoTrue) + schema extensions. Requiere el superusuario supabase_admin.
docker exec -i "$DBC" psql -U supabase_admin -d "$clon" -q >/dev/null <<'SQL'
create schema if not exists extensions;
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='auth' and c.relkind in ('r','p') loop
    begin execute format('alter table auth.%I owner to supabase_auth_admin', r.relname); exception when others then null; end;
  end loop;
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' loop
    begin execute format('alter function auth.%I(%s) owner to supabase_auth_admin', r.proname, r.a); exception when others then null; end;
  end loop;
end $$;
SQL

echo "→ [3/5] puerto libre para el gateway"
port="${PROXY_PORT:-${PUERTO_GATEWAY_BASE:-56321}}"
while ! libre "$port"; do port=$((port+1)); done

echo "→ [4/5] PostgREST + GoTrue (env copiado de $REF, DB -> $clon)"
docker rm -f "$pr" "$pa" "$px" >/dev/null 2>&1 || true
tmp="$(mktemp -d)"
docker inspect "supabase_rest_${REF}" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^PGRST_' | sed "s#5432/postgres#5432/$clon#" > "$tmp/rest.env"
docker inspect "supabase_auth_${REF}" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^GOTRUE_|^API_EXTERNAL_URL=' | sed "s#5432/postgres#5432/$clon#" > "$tmp/auth.env"
docker run -d --name "$pr" --network "$NET" --env-file "$tmp/rest.env" "$(docker inspect "supabase_rest_${REF}" --format '{{.Config.Image}}')" >/dev/null
docker run -d --name "$pa" --network "$NET" --env-file "$tmp/auth.env" "$(docker inspect "supabase_auth_${REF}" --format '{{.Config.Image}}')" >/dev/null

echo "→ [5/5] proxy nginx (emula Kong: ruteo + CORS único) en :$port"
# CORS: GoTrue emite su propio ACAO y PostgREST ninguno; ocultamos el del upstream y ponemos UNO
# (dos ACAO rompen al browser con "Failed to fetch"), y respondemos el preflight OPTIONS.
cat > "$tmp/nginx.conf" <<NGINX
server {
  listen 80;
  location /rest/v1/ {
    proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Access-Control-Allow-Credentials;
    if (\$request_method = 'OPTIONS') {
      add_header Access-Control-Allow-Origin \$http_origin always;
      add_header Access-Control-Allow-Credentials true always;
      add_header Access-Control-Allow-Methods "GET, POST, PATCH, PUT, DELETE, OPTIONS" always;
      add_header Access-Control-Allow-Headers \$http_access_control_request_headers always;
      add_header Access-Control-Max-Age 86400 always; return 204;
    }
    add_header Access-Control-Allow-Origin \$http_origin always;
    add_header Access-Control-Allow-Credentials true always;
    add_header Access-Control-Expose-Headers "content-range, content-profile" always;
    proxy_pass http://$pr:3000/; proxy_set_header Host \$host;
  }
  location /auth/v1/ {
    proxy_hide_header Access-Control-Allow-Origin; proxy_hide_header Access-Control-Allow-Credentials;
    if (\$request_method = 'OPTIONS') {
      add_header Access-Control-Allow-Origin \$http_origin always;
      add_header Access-Control-Allow-Credentials true always;
      add_header Access-Control-Allow-Methods "GET, POST, PATCH, PUT, DELETE, OPTIONS" always;
      add_header Access-Control-Allow-Headers \$http_access_control_request_headers always;
      add_header Access-Control-Max-Age 86400 always; return 204;
    }
    add_header Access-Control-Allow-Origin \$http_origin always;
    add_header Access-Control-Allow-Credentials true always;
    proxy_pass http://$pa:9999/; proxy_set_header Host \$host;
  }
  location = /health { return 200 "ok\n"; }
}
NGINX
docker run -d --name "$px" --network "$NET" -p "$port:80" nginx:alpine >/dev/null
docker cp "$tmp/nginx.conf" "$px":/etc/nginx/conf.d/default.conf >/dev/null
docker exec "$px" nginx -s reload >/dev/null 2>&1 || docker restart "$px" >/dev/null
rm -rf "$tmp"

# Esperar a que el gateway responda (auth listo).
for _ in $(seq 1 25); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/auth/v1/health" 2>/dev/null)" = "200" ]; then break; fi
  sleep 1
done

webport="${PUERTO_WEB_BASE:-3100}"; while ! libre "$webport"; do webport=$((webport+1)); done
anon="$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$WEB_DIR/.env.local.example" | cut -d= -f2-)"
svc="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$WEB_DIR/.env.local.example" | cut -d= -f2-)"

cat <<TXT

✓ Stack aislado de '$tarea' listo. Gateway: http://127.0.0.1:$port
  Para correr el e2e web contra ESTE stack (no la postgres compartida), exporta y arranca:

    export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$port"
    export NEXT_PUBLIC_SUPABASE_ANON_KEY="$anon"
    export SUPABASE_SERVICE_ROLE_KEY="$svc"
    export AISLADO_WEB_PORT=$webport
    ( cd $WEB_DIR && PORT=$webport $WEB_DEV >/tmp/next-$tarea.log 2>&1 & )   # espera unos segundos a que compile
    ( cd $WEB_DIR && bunx playwright test --config=playwright.aislado.config.ts --workers=1 )

  Al terminar:  scripts/agente-stack-up.sh $tarea --drop
TXT
