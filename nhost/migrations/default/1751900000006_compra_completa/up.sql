-- TecnoFal — Migración 0006: snapshot de compra completo
-- 1) costo_lineas.descripcion: las líneas 'parte'/'otro' necesitan decir QUÉ son
--    ("SSD 256GB × 2", "Cargador × 1") — antes el desglose se perdía en un total.
-- 2) lotes.metodo_estimado: con qué método de envío se congeló el estimado
--    (el real lo define el paquete al crearse).

alter table costo_lineas add column descripcion text;
alter table lotes add column metodo_estimado paquete_metodo_t;

comment on column costo_lineas.descripcion is 'Detalle de la línea (ej. "SSD 256GB × 2" en tipo parte)';
comment on column lotes.metodo_estimado is 'Método de envío asumido al congelar el estimado; el real vive en el paquete';
