#!/usr/bin/env bash
# [toolkit agent-multiple-supabase-local] (Re)construye la database `plantilla`: el template canónico con TODAS las
# migraciones aplicadas, del que cada agente clona su propia base de trabajo (ver db-agente.sh y
# CLAUDE.md §"Aislamiento de BD por agente"). Es reproducible: reconstruye desde el esquema base
# (schema `auth` de la principal, SOLO estructura, sin datos) + las migraciones del checkout en
# orden, excluyendo las de MIGRACIONES_EXCLUIDAS (igual que CI). NO escribe en la base `postgres`
# (solo la lee con pg_dump).
#
# Uso:  scripts/db-plantilla.sh
# Config del proyecto: .agente/agente.conf (PROYECTO, MIGRATIONS_DIR, MIGRACIONES_EXCLUIDAS).
# Requiere el stack Supabase local del proyecto arriba.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .agente/agente.conf ] && . .agente/agente.conf
PROYECTO="${PROYECTO:?falta .agente/agente.conf con PROYECTO=<project_id>}"
DB="${SUPABASE_DB_CONTAINER:-supabase_db_${PROYECTO}}"
# El template refleja las migraciones del checkout actual. Si trabajas en una rama con migraciones
# más nuevas (o quieres construirlo desde otro worktree), apunta MIGRATIONS_DIR a esa carpeta.
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"
# Patrones glob (separados por espacio) de migraciones a NO aplicar, p. ej. "0025_*".
EXCL="${MIGRACIONES_EXCLUIDAS:-}"

echo "→ recreando 'plantilla' en $DB (no toca la base principal 'postgres')"
docker exec -i "$DB" psql -U postgres -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='plantilla' AND pid<>pg_backend_pid();" >/dev/null
docker exec -i "$DB" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS plantilla WITH (FORCE);" >/dev/null
docker exec -i "$DB" psql -U postgres -d postgres -c "CREATE DATABASE plantilla;" >/dev/null

echo "→ cargando esquema base (auth, solo estructura — las migraciones solo dependen de"
echo "  auth.users y auth.uid())"
docker exec -i "$DB" bash -lc \
  "pg_dump -U postgres -d postgres --schema=auth --schema-only --no-owner 2>/dev/null | psql -U postgres -d plantilla -q >/dev/null 2>&1"
docker exec -i "$DB" psql -U postgres -d plantilla -q -c \
  "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key);" >/dev/null

echo "→ aplicando migraciones en orden (excluye: ${EXCL:-ninguna})"
docker cp "$MIGRATIONS_DIR" "$DB":/migs_plantilla >/dev/null
docker exec -i -e EXCL="$EXCL" "$DB" bash -lc '
set -e
for f in $(ls /migs_plantilla/*.sql | sort); do
  b=$(basename "$f")
  skip=0
  for pat in $EXCL; do case "$b" in $pat) skip=1;; esac; done
  if [ "$skip" = 1 ]; then echo "  SKIP  $b (excluida)"; continue; fi
  ver="${b%%_*}"
  psql -U postgres -d plantilla -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  psql -U postgres -d plantilla -q -c "insert into supabase_migrations.schema_migrations(version) values ('"'"'$ver'"'"') on conflict do nothing;"
  echo "  OK    $b"
done'
docker exec -i "$DB" bash -lc 'rm -rf /migs_plantilla'

echo -n "→ plantilla lista: "
docker exec -i "$DB" psql -U postgres -d plantilla -tAc \
  "select count(*)||' migraciones (última '||max(version)||')' from supabase_migrations.schema_migrations;"
