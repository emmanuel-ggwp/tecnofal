-- Migración 0027: clave natural única en precios_ideales (habilita el PUSH de config).
-- El push local→Supabase hace upsert idempotente por (user_id, cpu_tipo, gen_desde, gen_hasta);
-- sin este unique cada sync insertaría filas duplicadas. La constraint refuerza además un
-- invariante real del negocio: dos filas con la misma CPU y el mismo rango de generación
-- serían contradictorias (¿cuál precio base aplica?). Ver packages/provider-supabase guardarConfig.

-- Dedup DEFENSIVO antes de crear la constraint: si por algún estado previo hubiese filas
-- con la misma tupla natural, conserva la de id menor. Los seeds tienen rangos disjuntos,
-- así que en la práctica no borra nada; es un guardarraíl para no fallar el ALTER.
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
