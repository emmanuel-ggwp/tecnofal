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
| `0028_listings_fecha_fin_subasta.sql` | 2026-07-12 | Agrega `listings.fecha_fin_subasta` (timestamptz, nullable) + índice `idx_listings_user_fecha_fin`. Sin cambios de RLS/GRANT (ya cubiertos genéricamente). |
| `0029_listings_vendedor_ofertas.sql` | 2026-07-14 | Agrega `listings.vendedor`, `vendedor_pct_positivo`, `vendedor_total_ventas`, `cantidad_ofertas` (nullable). Sin cambios de RLS/GRANT. Sin índice. |
