-- TecnoFal — Migración 0009: categoría en detalles_catalogo
-- Detalles pasan a categoría + descripción (nombre); backfill por patrón del nombre.
-- La columna ya existe en remoto como enum detalle_categoria_t
-- (carcasa, pantalla, puertos, bateria, teclado, touchpad, audio, otro).

alter table detalles_catalogo
  add column if not exists categoria detalle_categoria_t not null default 'otro';

update detalles_catalogo set categoria = 'puertos'  where nombre ilike 'puerto%';
update detalles_catalogo set categoria = 'bateria'  where nombre ilike 'batería%' or nombre ilike 'bateria%';
update detalles_catalogo set categoria = 'carcasa'  where nombre ilike 'carcasa%' or nombre ilike 'bisagra%';
update detalles_catalogo set categoria = 'pantalla' where nombre ilike 'pantalla%';
update detalles_catalogo set categoria = 'touchpad' where nombre ilike '%touchpad%';
update detalles_catalogo set categoria = 'teclado'  where nombre ilike 'tecla%';
update detalles_catalogo set categoria = 'audio'    where nombre ilike 'corneta%';

comment on column detalles_catalogo.categoria is
  'Agrupador del selector (enum detalle_categoria_t): carcasa, pantalla, puertos, bateria, teclado, touchpad, audio, otro';