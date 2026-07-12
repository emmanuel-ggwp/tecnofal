-- Pruebas del plan-01 (vistas 0013 + RPCs 0014–0016) contra el Supabase local.
-- Ejecutar: scripts/test-sql.sh  (docker exec psql -f). TODO corre en una transacción
-- que termina en ROLLBACK: no deja rastro en la base local.
\set ON_ERROR_STOP on
begin;

-- Usuario de prueba: dispara fn_seed_usuario + fn_seed_extra (plantilla completa).
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000001', 'sql-test@tecnofal.test');

-- auth.uid() en supabase lee request.jwt.claims → simular el JWT del usuario.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-000000000001';
  v_lote uuid; v_laptop uuid; v_laptop2 uuid; v_cuenta uuid; v_cuenta_bs uuid;
  v_venta uuid; v_venta_vieja uuid; v_paquete uuid; v_conv uuid;
  n numeric; t text;
begin
  -- ===== semilla mínima =====
  select id into v_cuenta from cuentas where user_id = v_uid and nombre = 'Efectivo USD';
  select id into v_cuenta_bs from cuentas where user_id = v_uid and nombre = 'Efectivo Bs';
  if v_cuenta is null then raise exception 'fn_seed_usuario no sembró cuentas'; end if;

  insert into lotes (precio_subasta) values (100) returning id into v_lote;
  insert into laptops (lote_id, estado, service_tag) values (v_lote, 'lista_para_venta', 'TESTA111') returning id into v_laptop;
  insert into laptops (lote_id, estado, service_tag) values (v_lote, 'en_revision', 'TESTB222') returning id into v_laptop2;

  -- ===== 0014 registrar_venta =====
  -- estado inválido → excepción
  begin
    perform registrar_venta(v_laptop2, null, 100, 'USD', null, null, v_cuenta);
    raise exception 'FALLO: permitió vender una laptop en_revision';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;
  -- moneda de cuenta ≠ moneda de venta → excepción
  begin
    perform registrar_venta(v_laptop, null, 100, 'USD', null, null, v_cuenta_bs);
    raise exception 'FALLO: permitió cobrar USD en cuenta Bs';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;
  -- camino feliz
  v_venta := registrar_venta(v_laptop, null, 400, 'USD', null, null, v_cuenta);
  select estado::text into t from laptops where id = v_laptop;
  if t <> 'vendida' then raise exception 'laptop no quedó vendida: %', t; end if;
  select sum(case when tipo = 'ingreso' then monto else -monto end) into n
    from movimientos where cuenta_id = v_cuenta;
  if n <> 400 then raise exception 'movimiento de venta incorrecto: %', n; end if;
  select saldo into n from v_cuentas_saldos where cuenta_id = v_cuenta;
  if n <> 400 then raise exception 'v_cuentas_saldos no cuadra: %', n; end if;

  -- ===== 0014 devolver_garantia =====
  -- fuera de plazo → excepción (venta con fecha de hace 5 meses)
  update laptops set estado = 'lista_para_venta' where id = v_laptop2;
  v_venta_vieja := registrar_venta(v_laptop2, null, 300, 'USD', null, null, v_cuenta, (current_date - interval '5 months')::date);
  begin
    perform devolver_garantia(v_venta_vieja, v_cuenta, 300);
    raise exception 'FALLO: permitió devolución fuera de garantía';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;
  -- dentro de plazo: revierte estados y registra egreso
  perform devolver_garantia(v_venta, v_cuenta, 400);
  select estado::text into t from ventas where id = v_venta;
  if t <> 'devuelta_garantia' then raise exception 'venta no quedó devuelta: %', t; end if;
  select estado::text into t from laptops where id = v_laptop;
  if t <> 'para_repuestos' then raise exception 'laptop no quedó para_repuestos: %', t; end if;
  select count(*) into n from v_garantias_vigentes where venta_id = v_venta;
  if n <> 0 then raise exception 'venta devuelta sigue en garantías vigentes'; end if;

  -- ===== 0015 paquetes =====
  insert into paquetes (courier, metodo) values ('Test Courier', 'barco') returning id into v_paquete;
  update laptops set paquete_id = v_paquete, estado = 'en_transito' where id = v_laptop2;
  -- la devolución dejó v_laptop2 vendida→... no: v_laptop2 quedó vendida por v_venta_vieja.
  -- Usar una laptop nueva para el flujo de paquete:
  insert into laptops (lote_id, estado, service_tag, paquete_id) values (v_lote, 'en_transito', 'TESTC333', v_paquete) returning id into v_laptop;
  insert into paquete_items (paquete_id, tipo, ref_id, volumen_pie3, valor_declarado)
  values (v_paquete, 'laptop', v_laptop, 0.5, 120);
  -- salto de estado inválido → excepción (generada → transito_nacional)
  begin
    perform avanzar_paquete(v_paquete, 'transito_nacional');
    raise exception 'FALLO: permitió saltar sub-estados del courier';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;
  perform avanzar_paquete(v_paquete, 'factura');
  perform recibir_paquete(v_paquete, 100, 10, 0);
  select estado::text into t from paquetes where id = v_paquete;
  if t <> 'recibido' then raise exception 'paquete no quedó recibido: %', t; end if;
  select estado::text into t from laptops where id = v_laptop;
  if t <> 'en_revision' then raise exception 'laptop del paquete no pasó a en_revision: %', t; end if;
  select flete_prorrateado into n from paquete_items where paquete_id = v_paquete;
  if n <> 100 then raise exception 'prorrateo de flete incorrecto: %', n; end if;
  select flete_real from paquete_costos where paquete_id = v_paquete into n;
  if n <> 100 then raise exception 'paquete_costos.flete_real incorrecto: %', n; end if;
  -- recibir dos veces → excepción
  begin
    perform recibir_paquete(v_paquete, 1, 1, 1);
    raise exception 'FALLO: permitió recibir dos veces';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;

  -- ===== 0016 registrar_conversion =====
  v_conv := registrar_conversion(v_cuenta, v_cuenta_bs, 100, 3650, current_date, 'test');
  select count(*) into n from movimientos m join conversiones c
    on m.id in (c.movimiento_origen_id, c.movimiento_destino_id) where c.id = v_conv;
  if n <> 2 then raise exception 'la conversión no enlazó 2 movimientos: %', n; end if;
  select round(total_origen / total_destino, 6) into n
    from v_resultado_cambiario where cuenta_origen = 'Efectivo USD' and cuenta_destino = 'Efectivo Bs';
  if n <> round(100.0 / 3650, 6) then raise exception 'tasa implícita incorrecta: %', n; end if;
  -- misma cuenta → excepción
  begin
    perform registrar_conversion(v_cuenta, v_cuenta, 10, 10, current_date, null);
    raise exception 'FALLO: permitió conversión a la misma cuenta';
  exception when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
  end;

  -- ===== 0013 dashboard =====
  select count(*) into n from v_dashboard_totales;
  if n <> 1 then raise exception 'v_dashboard_totales debe dar 1 fila'; end if;

  raise notice 'PLAN01-OK: todas las aserciones pasaron';
end $$;

rollback;
