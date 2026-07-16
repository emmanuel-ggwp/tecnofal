#!/usr/bin/env bash
# [toolkit agent-multiple-supabase-local] Crea (o elimina) una database de trabajo AISLADA por agente, clonada de
# `plantilla`. Regla dura: NUNCA trabajes sobre la base `postgres` (principal, compartida entre
# agentes/CI). Para cualquier cambio de esquema o dato de prueba, clona tu propia base con este
# script y usa SOLO esa. Ver CLAUDE.md §"Aislamiento de BD por agente".
#
# Uso:
#   scripts/db-agente.sh <tarea>          # crea (recreando si existe) agente_<tarea>
#   scripts/db-agente.sh <tarea> --drop   # la elimina (hazlo al terminar tu tarea)
#   scripts/db-agente.sh --drop-all       # barre TODAS las agente_* (preserva `plantilla`)
#
# Config del proyecto: .agente/agente.conf (PROYECTO, PUERTO_DB…). Ejemplos de conexión:
#   docker exec -i supabase_db_<proyecto> psql -U postgres -d agente_<tarea> -f mi_prueba.sql
#   psql "postgresql://postgres:postgres@127.0.0.1:<PUERTO_DB>/agente_<tarea>"   # desde el host
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .agente/agente.conf ] && . .agente/agente.conf
PROYECTO="${PROYECTO:?falta .agente/agente.conf con PROYECTO=<project_id>}"
DB="${SUPABASE_DB_CONTAINER:-supabase_db_${PROYECTO}}"

# Barrido: elimina TODAS las bases de trabajo agente_* de una vez (preserva `plantilla`, que no
# empieza por 'agente_'). Cierra el hueco de acumulación cuando un agente olvida su --drop. Usa
# `for` (no `while read` con docker exec -i, que se comería el stdin y borraría solo la primera).
if [ "${1:-}" = "--drop-all" ]; then
  n=0
  for db in $(docker exec "$DB" psql -U postgres -d postgres -tAc \
        "select datname from pg_database where datname like 'agente_%';"); do
    docker exec "$DB" psql -U postgres -d postgres \
      -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE);" >/dev/null
    echo "→ $db eliminada"; n=$((n+1))
  done
  echo "→ barrido completo: $n base(s) agente_* eliminada(s)"
  exit 0
fi

tarea="${1:?uso: db-agente.sh <tarea> [--drop]  |  db-agente.sh --drop-all}"
nombre="agente_${tarea}"

if [ "${2:-}" = "--drop" ]; then
  docker exec -i "$DB" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $nombre WITH (FORCE);" >/dev/null
  echo "→ $nombre eliminada"
  exit 0
fi

# Asegura que exista la plantilla (la construye si falta).
if ! docker exec -i "$DB" psql -U postgres -d postgres -tAc \
     "select 1 from pg_database where datname='plantilla';" | grep -q 1; then
  echo "→ 'plantilla' no existe; construyéndola con db-plantilla.sh…"
  scripts/db-plantilla.sh
fi

docker exec -i "$DB" psql -U postgres -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$nombre' AND pid<>pg_backend_pid();" >/dev/null
docker exec -i "$DB" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $nombre WITH (FORCE);" >/dev/null
# CREATE DATABASE ... TEMPLATE bloquea la plantilla durante la copia: dos clones simultáneos desde
# la misma plantilla chocan ("source database «plantilla» is being accessed by other users"). Como
# varios agentes clonan en paralelo sin coordinarse, reintentamos ante ESE error (y solo ese).
err="$(mktemp)"
intentos=0
until docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
        -c "CREATE DATABASE $nombre TEMPLATE plantilla;" >/dev/null 2>"$err"; do
  intentos=$((intentos+1))
  if ! grep -q "being accessed by other users" "$err" || [ "$intentos" -ge 30 ]; then
    cat "$err" >&2; rm -f "$err"; exit 1
  fi
  sleep 1
done
rm -f "$err"

echo "→ $nombre lista (clon de plantilla, con todas las migraciones). Conéctate con:"
echo "   docker exec -i $DB psql -U postgres -d $nombre"
echo "   psql \"postgresql://postgres:postgres@127.0.0.1:${PUERTO_DB:-55322}/$nombre\""
echo "   Al terminar: scripts/db-agente.sh $tarea --drop"
