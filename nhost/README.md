# Nhost — respaldo/espejo (§21)

**Backend activo real: Supabase** (proyecto "Tecnofal", panel web en Vercel). Este
directorio es un espejo de respaldo del esquema — no el destino de deploy. **No hay
ni debe crearse un proyecto real en app.nhost.io** salvo decisión explícita en
contrario.

**Política de espejado (desde 2026-07-12): ya NO se espeja automáticamente.**
Migraciones `0001`–`0026` de `supabase/migrations/` ya tienen su copia aquí — eso
queda tal cual, no hay que tocarlo. Pero de aquí en adelante, **cada migración nueva
NO se copia a `nhost/migrations/`** — en su lugar se anota en `nhost/BACKLOG.md`.
Mirar cada migración costaba tiempo por cero beneficio real (no hay proyecto Nhost
activo) y ya causó al menos una colisión de numeración. Si algún día se decide
activar Nhost de verdad, `nhost/BACKLOG.md` es el checklist para ponerse al día de
una sola vez.

- `migrations/default/*/up.sql` — espejo de `supabase/migrations/0001` a `0026`
  (congelado ahí, ver política arriba), mismo contenido, SQL plano portable entre
  ambos proveedores. Prohibido definir esquema desde dashboards.
- `BACKLOG.md` — migraciones de Supabase posteriores a la `0026` aún sin espejar.
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
