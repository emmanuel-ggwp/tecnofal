#!/usr/bin/env bash
# [toolkit agent-multiple-supabase-local] Bootstrap de agente — UN solo comando que deja al agente listo para
# trabajar AISLADO, sin nada que recordar (ver CLAUDE.md §"Aislamiento de BD por agente"):
#   1. workspace fresco: git worktree nuevo creado desde origin/main (rama agente/<tarea>)
#   2. base propia:      clon agente_<tarea> de `plantilla`
#   3. conexión default: escribe .agente.env con PG* apuntando a agente_<tarea>, así un `psql`
#      ad-hoc va a TU clon y NO a la `postgres` compartida (el "forzado" es que la vía por
#      defecto ya es la aislada; no depende de disciplina).
#
# IMPORTANTE (límite del aislamiento): el clon es SOLO para trabajo SQL/esquema. El e2e web corre
# contra la `postgres` compartida — salvo que uses agente-stack-up.sh (e2e aislado).
#
# Uso:   scripts/agente-init.sh <tarea>            # crea worktree + rama + clon + .agente.env
#        scripts/agente-init.sh <tarea> --drop     # elimina worktree + rama + clon
#
# Diseñado para correr en PARALELO desde varios agentes: tanto `git worktree add` como el clonado
# de BD reintentan ante la contención esperada (index.lock / template en uso).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .agente/agente.conf ] && . .agente/agente.conf
PROYECTO="${PROYECTO:?falta .agente/agente.conf con PROYECTO=<project_id>}"
tarea="${1:?uso: agente-init.sh <tarea> [--drop]}"
wt="../wt-${PROYECTO}-${tarea}"
rama="agente/${tarea}"

if [ "${2:-}" = "--drop" ]; then
  git worktree remove --force "$wt" 2>/dev/null || true
  git branch -D "$rama" 2>/dev/null || true
  scripts/db-agente.sh "$tarea" --drop
  echo "→ workspace, rama y clon de '$tarea' eliminados"
  exit 0
fi

echo "→ [1/3] workspace fresco desde origin/main (rama $rama)"
base="main"
if git fetch origin >/dev/null 2>&1 && git rev-parse --verify -q origin/main >/dev/null; then
  base="origin/main"
else
  echo "   (aviso) sin fetch de origin; uso 'main' local como base"
fi
# Varios `git worktree add` simultáneos chocan en .git/index.lock (y refs). Reintentar ante eso.
err="$(mktemp)"; intentos=0
until git worktree add -B "$rama" "$wt" "$base" >/dev/null 2>"$err"; do
  intentos=$((intentos+1))
  if ! grep -qiE "index\.lock|unable to create|cannot lock ref|another git process" "$err" || [ "$intentos" -ge 30 ]; then
    cat "$err" >&2; rm -f "$err"; exit 1
  fi
  sleep 1
done
rm -f "$err"
echo "   worktree: $wt"

echo "→ [2/3] base de datos propia (clon de plantilla; el clonado ya es concurrency-safe)"
scripts/db-agente.sh "$tarea" | sed 's/^/   /'

echo "→ [3/3] conexión por defecto = tu clon (.agente.env)"
cat > "$wt/.agente.env" <<EOF
# Autogenerado por agente-init.sh — haz 'source .agente.env' para que psql apunte a TU clon.
# El e2e web NO usa esto: corre contra la postgres compartida (o contra agente-stack-up.sh).
export PGHOST=127.0.0.1 PGPORT=${PUERTO_DB:-55322} PGUSER=postgres PGPASSWORD=postgres PGDATABASE=agente_${tarea}
EOF
echo "   escrito $wt/.agente.env  (PGDATABASE=agente_${tarea})"

cat <<EOF

✓ Listo. Para trabajar aislado:
    cd $wt && source .agente.env
    psql                        # conecta a agente_${tarea}, NO a postgres
  Al terminar:  scripts/agente-init.sh ${tarea} --drop
EOF
