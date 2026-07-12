# Nhost — backend activo (§21)

- `migrations/default/*/up.sql` — ÚNICA fuente de verdad del esquema (SQL plano
  portable a Supabase). Prohibido definir esquema desde dashboards.
- `metadata/` — permisos Hasura (role `user`: user_id = X-Hasura-User-Id;
  `modelos` global). Regenerable con `node scripts/gen-metadata-hasura.mjs`
  (DATABASE_URL apuntando al postgres local de `nhost up`).
- El prelude (1751900000000) crea el stub `auth.uid()` y los roles para que las
  políticas RLS (dormidas bajo Hasura) sean válidas — despiertan en Supabase.
- Las VISTAS no están trackeadas en Hasura a propósito: no tienen user_id y la
  RLS está dormida — se consumen en la fase web vía SQL/funciones.

## Setup

```bash
npm i -g nhost
nhost init   # genera nhost.toml y .secrets (no versionar .secrets)
# este repo ya aporta migrations/ y metadata/
nhost up     # local (Docker): aplica migraciones + metadata
```

Flujo por tabla nueva (§21b): migración SQL en `migrations/default/` → track en
Hasura → `nhost metadata export` (o regenerar con el script) → commit de ambos.

Deploy (§21c): vincular el repo en app.nhost.io; el push a `main` APLICA las
migraciones automáticamente. Trabajar en rama `dev` y probar con `nhost up`
antes de merge.
