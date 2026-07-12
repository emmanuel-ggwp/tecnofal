# Nhost — respaldo/espejo (§21)

**Backend activo real: Supabase** (proyecto "Tecnofal", panel web en Vercel). Este
directorio es un espejo de respaldo del esquema — no el destino de deploy. Cada
migración nueva en `supabase/migrations/000X_nombre.sql` se copia aquí en
`migrations/default/175190000000X_nombre/up.sql` para no perder la opción de migrar
de proveedor en el futuro, pero **no hay ni debe crearse un proyecto real en
app.nhost.io** salvo decisión explícita en contrario.

- `migrations/default/*/up.sql` — espejo de `supabase/migrations/*.sql`, mismo
  contenido, SQL plano portable entre ambos proveedores. Prohibido definir
  esquema desde dashboards.
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

Deploy (§21c, hipotético — NO es el flujo actual): si algún día se migra de
proveedor, se vincularía el repo en app.nhost.io para que el push a `main`
aplique las migraciones automáticamente. Hoy el deploy real es Supabase + Vercel
(ver `apps/web/README.md`); este flujo de Nhost no está activo.
