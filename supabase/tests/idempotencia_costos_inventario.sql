-- Prueba de 0034: instalar_parte (commodity) idempotente, costo_lineas real idempotente,
-- lote_partes_encontradas upsert. Corre en transacción con ROLLBACK.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000000c', 'idem-inv@tecnofal.test');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-00000000000c';
  v_parte uuid; v_lote uuid; v_laptop uuid;
  n int; v_stock numeric; v_monto numeric;
begin
  -- Stock: 2 unidades @ 10
  insert into partes_catalogo (user_id, nombre) values (v_uid, 'SSD test') returning id into v_parte;
  insert into partes_compras (user_id, parte_id, cantidad, costo_unitario) values (v_uid, v_parte, 2, 10);

  insert into lotes (user_id, precio_subasta) values (v_uid, 100) returning id into v_lote;
  insert into laptops (user_id, lote_id, estado) values (v_uid, v_lote, 'en_revision') returning id into v_laptop;

  -- === instalar_parte commodity: misma clave dos veces = 1 instalación, stock -1 una sola vez ===
  perform instalar_parte(v_laptop, v_parte, null, 'k-inst-1');
  perform instalar_parte(v_laptop, v_parte, null, 'k-inst-1'); -- retry
  select count(*) into n from laptop_partes where user_id = v_uid and laptop_id = v_laptop;
  select cantidad into v_stock from partes_stock where parte_id = v_parte;
  if n <> 1 then raise exception 'FALLO: % laptop_partes (esperaba 1 — se duplicó)', n; end if;
  if v_stock <> 1 then raise exception 'FALLO: stock = % (esperaba 1 — se descontó doble)', v_stock; end if;
  select count(*) into n from costo_lineas where ambito='laptop' and ambito_id=v_laptop and tipo='parte';
  if n <> 1 then raise exception 'FALLO: % costo_lineas parte (esperaba 1)', n; end if;

  -- === costo_lineas real: dos llamadas al mismo (lote,tipo) = 1 línea, último monto gana ===
  perform registrar_costo_real_lote(v_lote, 'subasta', 90);
  perform registrar_costo_real_lote(v_lote, 'subasta', 95); -- reintento con corrección
  select count(*) into n from costo_lineas where ambito='lote' and ambito_id=v_lote and tipo='subasta';
  select monto_real into v_monto from costo_lineas where ambito='lote' and ambito_id=v_lote and tipo='subasta';
  if n <> 1 then raise exception 'FALLO: % líneas subasta (esperaba 1 — se duplicó el real)', n; end if;
  if v_monto <> 95 then raise exception 'FALLO: monto_real = % (esperaba 95)', v_monto; end if;

  -- === lote_partes_encontradas: re-agregar misma parte = 1 fila (upsert) ===
  insert into lote_partes_encontradas (user_id, lote_id, parte_id, cantidad, valor_nominal_aplicado)
    values (v_uid, v_lote, v_parte, 1, 20)
    on conflict (lote_id, parte_id) do update set cantidad = excluded.cantidad;
  insert into lote_partes_encontradas (user_id, lote_id, parte_id, cantidad, valor_nominal_aplicado)
    values (v_uid, v_lote, v_parte, 3, 20)
    on conflict (lote_id, parte_id) do update set cantidad = excluded.cantidad;
  select count(*) into n from lote_partes_encontradas where lote_id = v_lote and parte_id = v_parte;
  if n <> 1 then raise exception 'FALLO: % lote_partes_encontradas (esperaba 1 — se duplicó)', n; end if;

  raise notice 'IDEMPOTENCIA-INVENTARIO-OK: instalar/costo-real/parte-encontrada deduplican correctamente';
end $$;

rollback;
