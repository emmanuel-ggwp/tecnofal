-- TecnoFal — Migración 0005: listings autocontenidos para lotes
-- La cantidad de laptops y los totales evaluados pasan a columnas explícitas
-- (antes solo vivían dentro del jsonb evaluacion_manual): sin ellos no se puede
-- reconstruir el total con el que se compró.

alter table listings
  add column cantidad_laptops int not null default 1,
  add column costo_estimado_total numeric,   -- cadena completa al evaluar (total del lote)
  add column valor_esperado_total numeric;   -- VE unidad × cantidad − deducciones

comment on column listings.precio_visto is 'Precio del listing (total del lote si cantidad_laptops > 1)';
comment on column listings.evaluacion_manual is 'JSON: entrada, faltantes[{cantidad}], deducciones[{cantidad}] — detalle completo de la evaluación';
