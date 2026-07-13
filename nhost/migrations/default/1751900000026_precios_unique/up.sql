-- Espejo de supabase/migrations/0027_precios_unique.sql:
-- clave natural única en precios_ideales para habilitar el push de config (upsert idempotente).
delete from precios_ideales a
using precios_ideales b
where a.id > b.id
  and a.user_id = b.user_id
  and a.cpu_tipo = b.cpu_tipo
  and a.gen_desde = b.gen_desde
  and a.gen_hasta = b.gen_hasta;

alter table precios_ideales
  add constraint precios_ideales_user_natural_key
  unique (user_id, cpu_tipo, gen_desde, gen_hasta);
