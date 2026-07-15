-- Prueba de 0031: registrar_compra_lote idempotente por (user_id, idempotency_key).
-- Corre en una transacción con ROLLBACK: no deja rastro. Ejecutar vía docker exec psql.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000009', 'idem-test@tecnofal.test');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-000000000009';
  v_lote jsonb := '{"origen":"ebay","url_ebay":"https://ebay.com/itm/123","precio_subasta":100,"envio_usa":10,"costo_proyectado_total":110}'::jsonb;
  v_lineas jsonb := '[{"tipo":"subasta","monto_estimado":100},{"tipo":"envio_usa","monto_estimado":10}]'::jsonb;
  v_laptops jsonb := '[{"cpu_tipo":"i5","cpu_gen":8,"ram_gb":8,"ssd_gb":256,"estado":"comprada"},{"cpu_tipo":"i5","cpu_gen":8,"ram_gb":8,"ssd_gb":256,"estado":"comprada"}]'::jsonb;
  v_id1 uuid; v_id2 uuid; v_id3 uuid;
  n_lotes int; n_laptops int; n_lineas int;
begin
  -- 1) Primera compra con clave 'k-abc'
  v_id1 := registrar_compra_lote(v_lote, v_lineas, v_laptops, 'k-abc');

  -- 2) Re-push con la MISMA clave → debe devolver el mismo lote, sin crear nada nuevo
  v_id2 := registrar_compra_lote(v_lote, v_lineas, v_laptops, 'k-abc');
  if v_id1 <> v_id2 then
    raise exception 'FALLO idempotencia: dos ids distintos (% vs %) para la misma clave', v_id1, v_id2;
  end if;

  select count(*) into n_lotes   from lotes   where user_id = v_uid and idempotency_key = 'k-abc';
  select count(*) into n_laptops from laptops where user_id = v_uid and lote_id = v_id1;
  select count(*) into n_lineas  from costo_lineas where user_id = v_uid and ambito = 'lote' and ambito_id = v_id1;
  if n_lotes <> 1   then raise exception 'FALLO: % lotes con la clave (esperaba 1)', n_lotes; end if;
  if n_laptops <> 2 then raise exception 'FALLO: % laptops en el lote (esperaba 2 — se duplicaron)', n_laptops; end if;
  if n_lineas <> 2  then raise exception 'FALLO: % costo_lineas en el lote (esperaba 2 — se duplicaron)', n_lineas; end if;

  -- 3) Clave DISTINTA → sí crea un lote nuevo (compra genuinamente diferente)
  v_id3 := registrar_compra_lote(v_lote, v_lineas, v_laptops, 'k-xyz');
  if v_id3 = v_id1 then raise exception 'FALLO: clave distinta devolvió el mismo lote'; end if;

  -- 4) Sin clave (NULL) → comportamiento legado: cada llamada crea un lote nuevo
  perform registrar_compra_lote(v_lote, v_lineas, v_laptops, null);
  perform registrar_compra_lote(v_lote, v_lineas, v_laptops, null);
  select count(*) into n_lotes from lotes where user_id = v_uid and idempotency_key is null;
  if n_lotes <> 2 then raise exception 'FALLO: sin clave esperaba 2 lotes, hubo %', n_lotes; end if;

  raise notice 'IDEMPOTENCIA-OK: misma clave=1 lote/2 laptops/2 lineas; clave distinta=lote nuevo; sin clave=no dedup';
end $$;

rollback;
