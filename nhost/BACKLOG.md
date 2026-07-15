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
| `0031_lotes_idempotencia.sql` | 2026-07-15 | Agrega `lotes.idempotency_key` (text, nullable) + índice único parcial `lotes_idempotency_key_uidx (user_id, idempotency_key)`. Recrea `registrar_compra_lote` con 4º parámetro `p_idempotency_key` para dedup de compras (early-return si el lote ya existe). Nhost usa GraphQL/Hasura, no este RPC — si se activa, replicar la constraint y adaptar la mutación de compra. |
| `0032_partes_compras_idempotencia.sql` | 2026-07-15 | `partes_compras.idempotency_key` + unique `(user_id, idempotency_key)`; `recibir_orden_partes` con `for update` + clave por ítem. |
| `0033_dinero_idempotencia.sql` | 2026-07-15 | `idempotency_key` + unique en `movimientos`/`conversiones`/`por_cobrar`/`por_pagar`; `registrar_conversion` y `registrar_abono` idempotentes. |
| `0034_costos_inventario_idempotencia.sql` | 2026-07-15 | Unique natural en `costo_lineas` (singleton), `lote_partes_encontradas`, `paquete_items` (laptop); `idempotency_key` en `paquetes`/`paquete_items`/`partes_especificas`/`laptop_partes`; RPCs `registrar_costo_real_lote` (nuevo) e `instalar_parte` (idempotente). |
| `0035_ventas_unique_activa.sql` | 2026-07-15 | Unique parcial `ventas (user_id, laptop_id) where estado='activa'`. |

**IMPORTANTE (auditoría de duplicación 2026-07-15):** las migraciones 0031-0035 endurecieron
TODAS las escrituras transaccionales contra duplicación (unique naturales / `idempotency_key` +
RPCs idempotentes). El adaptador `provider-nhost` NO replica nada de esto (ver comentario en
`comprar()`). Si Nhost se activa, portar el patrón completo es obligatorio, no opcional.
