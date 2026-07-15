-- Prueba de 0033: registrar_conversion y registrar_abono idempotentes.
-- Corre en transacción con ROLLBACK. docker exec psql -f.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000000b', 'idem-dinero@tecnofal.test');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-00000000000b';
  v_c1 uuid; v_c2 uuid;
  v_conv1 uuid; v_conv2 uuid;
  v_deuda uuid;
  n_conv int; n_mov int; n_mov_abono int;
  v_abonado numeric; v_estado text;
begin
  select id into v_c1 from cuentas where user_id = v_uid and nombre = 'Efectivo USD';
  select id into v_c2 from cuentas where user_id = v_uid and nombre = 'Efectivo Bs';

  -- === Conversión: misma clave dos veces = 1 conversión + 2 movimientos ===
  v_conv1 := registrar_conversion(v_c1, v_c2, 100, 3600, current_date, null, 'k-conv-1');
  v_conv2 := registrar_conversion(v_c1, v_c2, 100, 3600, current_date, null, 'k-conv-1');
  if v_conv1 <> v_conv2 then raise exception 'FALLO: conversión dio ids distintos (% vs %)', v_conv1, v_conv2; end if;
  select count(*) into n_conv from conversiones where user_id = v_uid;
  select count(*) into n_mov from movimientos where user_id = v_uid;
  if n_conv <> 1 then raise exception 'FALLO: % conversiones (esperaba 1)', n_conv; end if;
  if n_mov <> 2 then raise exception 'FALLO: % movimientos de conversión (esperaba 2)', n_mov; end if;

  -- Clave distinta → conversión nueva
  perform registrar_conversion(v_c1, v_c2, 50, 1800, current_date, null, 'k-conv-2');
  select count(*) into n_conv from conversiones where user_id = v_uid;
  if n_conv <> 2 then raise exception 'FALLO: clave distinta no creó conversión nueva (%)', n_conv; end if;

  -- === Abono: misma clave dos veces = abonado sumado UNA vez ===
  insert into por_cobrar (user_id, persona, monto, moneda, fecha)
    values (v_uid, 'Cliente Test', 100, 'USD', current_date) returning id into v_deuda;

  v_estado := registrar_abono('por_cobrar', v_deuda, 40, v_c1, current_date, 'k-abono-1');
  v_estado := registrar_abono('por_cobrar', v_deuda, 40, v_c1, current_date, 'k-abono-1'); -- retry
  select abonado, estado into v_abonado, v_estado from por_cobrar where id = v_deuda;
  select count(*) into n_mov_abono from movimientos where user_id = v_uid and concepto like 'Abono%';
  if v_abonado <> 40 then raise exception 'FALLO: abonado = % (esperaba 40 — se duplicó el abono)', v_abonado; end if;
  if v_estado <> 'parcial' then raise exception 'FALLO: estado = % (esperaba parcial)', v_estado; end if;
  if n_mov_abono <> 1 then raise exception 'FALLO: % movimientos de abono (esperaba 1)', n_mov_abono; end if;

  -- Clave distinta → segundo abono sí aplica (llega a saldada)
  v_estado := registrar_abono('por_cobrar', v_deuda, 60, v_c1, current_date, 'k-abono-2');
  select abonado into v_abonado from por_cobrar where id = v_deuda;
  if v_abonado <> 100 or v_estado <> 'saldada' then
    raise exception 'FALLO: segundo abono no aplicó (abonado=%, estado=%)', v_abonado, v_estado;
  end if;

  raise notice 'IDEMPOTENCIA-DINERO-OK: conversión y abono deduplican por clave; claves distintas sí aplican';
end $$;

rollback;
