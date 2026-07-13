# Runbook (histórico): migración Nhost → Supabase (§21)

> **Ya no aplica al estado actual.** Esta migración ya se hizo: Supabase es el backend
> activo/principal (extensión y panel web `apps/web` en Vercel). Nhost quedó como
> respaldo/espejo — no hay proyecto real en app.nhost.io. Se conserva este runbook como
> referencia por si algún instalador viejo aún corre sobre Nhost y necesita pasarse.

La lógica de negocio NO se toca: depende solo de las interfaces `DataProvider`/
`AuthProvider` de `@tecnofal/core`. Las políticas RLS ya viven en las migraciones
(dormidas bajo Hasura) y despiertan solas en Supabase.

## Pasos

1. **Esquema** — copiar migraciones (SQL plano portable):
   ```bash
   # cada nhost/migrations/default/<ts>_<nombre>/up.sql → supabase/migrations/<NNNN>_<nombre>.sql
   # (renombrado de timestamps; el prelude es no-op en Supabase y puede incluirse igual)
   supabase db push
   ```
   La metadata de Hasura (nhost/metadata) se DESCARTA: RLS toma su lugar.

2. **Datos**:
   ```bash
   pg_dump "$NHOST_DATABASE_URL" --schema=public --data-only --no-owner > datos.sql
   psql "$SUPABASE_DATABASE_URL" < datos.sql
   ```
   Usuarios de auth: recrearlos en Supabase Auth (mismo email; el trigger de
   onboarding NO debe resembrar si ya hay datos → los seeds usan `on conflict do nothing`).
   Después de restaurar, actualizar user_id si los uuid de auth cambiaron:
   `update <tabla> set user_id = '<nuevo>' where user_id = '<viejo>';` (o migrar con mismos uuid vía API admin).

3. **Clientes** — cambiar 2 env vars y recompilar:
   ```env
   VITE_PROVIDER=supabase
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
   ```bash
   npm run build   # recargar extensión en chrome://extensions
   ```

4. **Verificar**: login desde el popup, badges con ✓, guardar una evaluación de prueba.

## Diferencia de modelos de deploy (§21c)

| | Supabase (activo) | Nhost (respaldo, si algún día se activara) |
|---|---|---|
| Deploy | **Imperativo**: `supabase db push` cuando el dev decida (hoy: CI + comando manual al proyecto real) | **Declarativo**: push a la rama vinculada de GitHub aplicaría migraciones+metadata |
| Git | Opcional | Sería el mecanismo de deploy |
| Flujo | libre | rama `main` = producción; trabajar en `dev`, probar con `nhost up` local, merge a `main` solo migraciones probadas |

**Nunca commitear migraciones sin validarlas primero** (contenedor Postgres desechable —
ver `planes/README.md`).
