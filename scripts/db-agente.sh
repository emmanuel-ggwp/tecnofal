#!/usr/bin/env bash
# Crea (o elimina) una database de trabajo AISLADA por agente, clonada de `plantilla`.
# Regla dura: NUNCA trabajes sobre la base `postgres` (principal, compartida entre agentes/CI).
# Para cualquier cambio de esquema o dato de prueba, clona tu propia base con este script y usa
# SOLO esa. Ver CLAUDE.md §"Aislamiento de BD por agente".
#
# Uso:
#   scripts/db-agente.sh <tarea>          # crea (recreando si existe) agente_<tarea>
#   scripts/db-agente.sh <tarea> --drop   # la elimina (hazlo al terminar tu tarea)
#
# Ejemplos de conexión a la base ya creada:
#   docker exec -i supabase_db_tecnofal psql -U postgres -d agente_<tarea> -f mi_prueba.sql
#   psql "postgresql://postgres:postgres@127.0.0.1:55322/agente_<tarea>"   # desde el host
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${SUPABASE_DB_CONTAINER:-supabase_db_tecnofal}"
tarea="${1:?uso: db-agente.sh <tarea> [--drop]}"
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
docker exec -i "$DB" psql -U postgres -d postgres -c "CREATE DATABASE $nombre TEMPLATE plantilla;" >/dev/null

echo "→ $nombre lista (clon de plantilla, con todas las migraciones). Conéctate con:"
echo "   docker exec -i $DB psql -U postgres -d $nombre"
echo "   psql \"postgresql://postgres:postgres@127.0.0.1:55322/$nombre\""
echo "   Al terminar: scripts/db-agente.sh $tarea --drop"
