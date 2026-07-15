-- Migración 0029: vendedor (username, % positivo, total feedback) y cantidad de ofertas
-- (bids) en listings — scrapeados de eBay junto al resto del listing.
-- cantidad_ofertas es NULL para listings Buy It Now (no es subasta) o no capturado.
-- listings.vendedor es AUTO-SCRAPEADO por listing — distinto de lotes.vendedor (confirmado
-- manualmente al comprar, migración 0001). No se unifican las columnas; se comparan
-- normalizadas (trim+lowercase) en parser.ts para el aviso "vendedor nuevo".
-- Sin cambios de RLS (0002_rls.sql cubre listings genéricamente por user_id) ni de GRANT
-- (0018_endurecer_grants.sql ya cubre todas las tablas/columnas, presentes y futuras).
-- Sin índice: apps/web/src/data/listings.ts no filtra ni ordena por estas columnas.

alter table listings
  add column vendedor text,
  add column vendedor_pct_positivo numeric,
  add column vendedor_total_ventas int,
  add column cantidad_ofertas int;

comment on column listings.vendedor is
  'Username del vendedor eBay, auto-scrapeado. NULL = no capturado. No confundir con '
  'lotes.vendedor (confirmado manualmente al registrar una compra).';
comment on column listings.vendedor_pct_positivo is '% de feedback positivo del vendedor al ver el listing. NULL = no capturado.';
comment on column listings.vendedor_total_ventas is 'Total de feedback/ventas del vendedor. NULL = no capturado.';
comment on column listings.cantidad_ofertas is 'Cantidad de ofertas (bids). NULL = Buy It Now o no capturado.';
