-- Prueba de 0032: recibir_orden_partes idempotente (doble llamada no duplica partes_compras
-- ni corrompe partes_stock). Corre en transacción con ROLLBACK. docker exec psql -f.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000000a', 'idem-partes@tecnofal.test');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-00000000000a';
  v_parte uuid;
  v_orden uuid;
  n_compras int; v_cant numeric; v_prom numeric;
begin
  insert into partes_catalogo (user_id, nombre, valor_nominal) values (v_uid, 'RAM 8GB test', 20)
    returning id into v_parte;

  -- Orden con un ítem no recibido
  insert into ordenes_partes (user_id, origen, envio_usa, fees) values (v_uid, 'ebay', 0, 0)
    returning id into v_orden;
  insert into orden_partes_items (user_id, orden_id, parte_id, cantidad, precio_unitario, recibido)
    values (v_uid, v_orden, v_parte, 2, 10, false);

  -- 1) Primera recepción
  perform recibir_orden_partes(v_orden);
  -- 2) Segunda recepción (simula reintento/doble-click): NO debe duplicar
  perform recibir_orden_partes(v_orden);

  select count(*) into n_compras from partes_compras where user_id = v_uid and parte_id = v_parte;
  select cantidad, costo_promedio into v_cant, v_prom from partes_stock where parte_id = v_parte;

  if n_compras <> 1 then raise exception 'FALLO: % filas en partes_compras (esperaba 1 — se duplicó)', n_compras; end if;
  if v_cant <> 2 then raise exception 'FALLO: partes_stock.cantidad = % (esperaba 2 — cantidad fantasma)', v_cant; end if;
  if v_prom <> 10 then raise exception 'FALLO: costo_promedio = % (esperaba 10 — promedio corrompido)', v_prom; end if;

  raise notice 'IDEMPOTENCIA-PARTES-OK: doble recepción = 1 compra, stock 2u @ 10 (sin corrupción)';
end $$;

rollback;
