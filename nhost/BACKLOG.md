# Backlog de espejado a Nhost

Nhost es solo respaldo (ver `nhost/README.md`) — no hay proyecto activo en
app.nhost.io. Desde 2026-07-12, las migraciones nuevas de `supabase/migrations/`
**no se copian automáticamente** aquí; en su lugar se registran en la tabla de
abajo. Si algún día se decide activar Nhost de verdad, esta tabla es el checklist
para ponerse al día de una sola vez (copiar cada `up.sql` listado, renombrando el
timestamp, y regenerar `metadata/` si tocó tablas nuevas).

**Ya espejadas (0001–0026), no requieren acción.**

## Pendientes de espejar

| Migración Supabase | Fecha agregada | Nota |
|---|---|---|
| _(ninguna todavía — la próxima migración nueva de `supabase/migrations/` se agrega aquí en vez de copiarse a `migrations/default/`)_ | | |
