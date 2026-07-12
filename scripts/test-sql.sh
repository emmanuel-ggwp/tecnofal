#!/usr/bin/env bash
# Pruebas SQL del plan-01 contra el Supabase local (contenedor supabase_db_tecnofal).
# Corren en una transacción con ROLLBACK: no dejan rastro. Requiere `npx supabase start`.
set -euo pipefail
cd "$(dirname "$0")/.."
docker cp supabase/tests/plan01.sql supabase_db_tecnofal:/plan01.sql >/dev/null
docker exec supabase_db_tecnofal bash -c 'psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /plan01.sql' \
  | grep -E "PLAN01-OK|ERROR" || { echo "FALLO: revisar salida completa"; exit 1; }
