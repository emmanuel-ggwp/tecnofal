#!/usr/bin/env bash
# [toolkit agent-multiple-supabase-local] Doctor: chequea los prerequisitos del aislamiento por agente y dice qué
# falta ANTES de que un script falle a mitad de camino. Corre esto primero si algo no funciona.
#
# Uso:  scripts/agente-doctor.sh          # exit 0 si todo OK, 1 si falta algo duro
set -uo pipefail
cd "$(dirname "$0")/.."
fallos=0
ok(){ echo "  ✓ $1"; }
mal(){ echo "  ✗ $1" >&2; fallos=$((fallos+1)); }
aviso(){ echo "  ! $1"; }

echo "→ config del proyecto"
if [ -f .agente/agente.conf ]; then
  . .agente/agente.conf
  ok ".agente/agente.conf (PROYECTO=${PROYECTO:-?})"
else
  mal "falta .agente/agente.conf (copia plantillas/agente.conf.example del toolkit agent-multiple-supabase-local)"
fi
PROYECTO="${PROYECTO:-}"
[ -n "$PROYECTO" ] || { echo "sin PROYECTO no puedo seguir"; exit 1; }
DB="${SUPABASE_DB_CONTAINER:-supabase_db_${PROYECTO}}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"

echo "→ toolchain"
for cmd in docker git; do
  command -v "$cmd" >/dev/null 2>&1 && ok "$cmd en PATH" || mal "$cmd no está en PATH"
done

echo "→ Docker / contenedor del proyecto"
if docker info >/dev/null 2>&1; then
  ok "docker daemon responde"
  if docker ps --format '{{.Names}}' | grep -q "^${DB}$"; then
    ok "contenedor $DB arriba"
  else
    mal "contenedor $DB NO está corriendo (arranca el stack Supabase del proyecto)"
  fi
else
  mal "docker daemon no responde (¿Docker Desktop apagado?)"
fi

echo "→ plantilla vs migraciones del checkout"
if docker ps --format '{{.Names}}' | grep -q "^${DB}$"; then
  if docker exec "$DB" psql -U postgres -d postgres -tAc "select 1 from pg_database where datname='plantilla';" 2>/dev/null | grep -q 1; then
    en_plantilla=$(docker exec "$DB" psql -U postgres -d plantilla -tAc "select count(*) from supabase_migrations.schema_migrations;" 2>/dev/null | tr -d '[:space:]')
    esperadas=0
    for f in "$MIGRATIONS_DIR"/*.sql; do
      [ -e "$f" ] || continue
      b=$(basename "$f"); skip=0
      for pat in ${MIGRACIONES_EXCLUIDAS:-}; do case "$b" in $pat) skip=1;; esac; done
      [ "$skip" = 1 ] || esperadas=$((esperadas+1))
    done
    if [ "${en_plantilla:-0}" = "$esperadas" ]; then
      ok "plantilla al día ($en_plantilla migraciones)"
    else
      mal "plantilla desactualizada: tiene ${en_plantilla:-0}, el checkout trae $esperadas → corre scripts/db-plantilla.sh"
    fi
  else
    aviso "plantilla no existe aún (db-agente.sh la construye al primer uso)"
  fi
fi

echo "→ higiene"
n=$(docker exec "$DB" psql -U postgres -d postgres -tAc "select count(*) from pg_database where datname like 'agente_%';" 2>/dev/null | tr -d '[:space:]')
[ "${n:-0}" = "0" ] && ok "sin bases agente_* colgando" || aviso "$n base(s) agente_* colgando (barre con scripts/db-agente.sh --drop-all)"
hooks=$(git config core.hooksPath 2>/dev/null || true)
[ -n "$hooks" ] && ok "hooks activados ($hooks)" || aviso "core.hooksPath sin configurar (si el proyecto versiona hooks: git config core.hooksPath .githooks)"
reg="$HOME/.agente-stack/puertos.conf"
if [ -f "$reg" ] && grep -q "^${PROYECTO}[[:space:]]" "$reg"; then
  ok "proyecto registrado en $reg"
else
  aviso "proyecto sin registrar en $reg (evita colisiones de puertos entre proyectos)"
fi

echo ""
if [ "$fallos" -gt 0 ]; then echo "✗ doctor: $fallos problema(s) duro(s)"; exit 1; fi
echo "✓ doctor: todo OK"
