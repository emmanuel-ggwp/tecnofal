-- Migración 0028: tiempo de fin de subasta en listings (habilita "tiempo restante" en
-- la pantalla /listings del panel web, ordenada por lo que termina antes).
-- "Finalizada" es un estado DERIVADO (fecha_fin_subasta < now()), no un valor nuevo del
-- enum listing_estado_t (visto|evaluado|comprado|descartado) — no se toca ese enum.
-- No hace falta tocar RLS (0002_rls.sql ya cubre listings genéricamente vía el loop por
-- user_id) ni GRANTs (0018_endurecer_grants.sql ya cubre todas las tablas).

alter table listings
  add column fecha_fin_subasta timestamptz;

comment on column listings.fecha_fin_subasta is
  'Hora absoluta de cierre de la subasta de eBay, parseada de texto relativo tipo '
  '"2d 3h left" (o de un timestamp exacto si eBay lo expone) al capturar el listing. '
  'NULL = no capturado. "Finalizada" es un estado derivado (fecha_fin_subasta < now()), '
  'no un valor de listing_estado_t.';

create index idx_listings_user_fecha_fin on listings (user_id, fecha_fin_subasta);
