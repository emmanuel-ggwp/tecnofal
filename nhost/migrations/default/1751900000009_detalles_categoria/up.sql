-- TecnoFal — Migración 0009: categoría en detalles_catalogo
-- Detalles pasan a categoría + descripción (nombre); backfill por patrón del nombre.

alter table detalles_catalogo add column categoria text not null default 'Otro';

update detalles_catalogo set categoria = 'Puerto'   where nombre ilike 'puerto%';
update detalles_catalogo set categoria = 'Batería'  where nombre ilike 'batería%' or nombre ilike 'bateria%';
update detalles_catalogo set categoria = 'Carcasa'  where nombre ilike 'carcasa%' or nombre ilike 'bisagra%';
update detalles_catalogo set categoria = 'Pantalla' where nombre ilike 'pantalla%';
update detalles_catalogo set categoria = 'Teclado'  where nombre ilike 'tecla%' or nombre ilike 'falla botón touchpad%' or nombre ilike 'falla boton touchpad%';
update detalles_catalogo set categoria = 'Audio'    where nombre ilike 'corneta%';

comment on column detalles_catalogo.categoria is 'Agrupador del selector: Puerto, Carcasa, Batería, Pantalla, Teclado, Audio, Otro…';
