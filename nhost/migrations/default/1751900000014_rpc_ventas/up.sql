-- TecnoFal — Migración 0014: RPCs transaccionales de ventas (plan-01)
-- security invoker → corren como el usuario autenticado y RLS aplica (igual que 0001).
-- Cada función es atómica: una llamada RPC = una transacción.

-- Registrar venta: valida laptop en lista_para_venta|reservada; inserta venta;
-- movimiento de ingreso en la cuenta (monto = precio si USD, monto_ves si VES) con venta_id;
-- laptop → vendida. Devuelve el id de la venta.
create function registrar_venta(
  p_laptop uuid,
  p_comprador uuid,
  p_precio numeric,
  p_moneda moneda_t,
  p_monto_ves numeric,
  p_tasa numeric,
  p_cuenta uuid,
  p_fecha date default current_date
) returns uuid
language plpgsql security invoker as $$
declare
  v_estado laptop_estado_t;
  v_alias text;
  v_cuenta_moneda moneda_t;
  v_fecha date := coalesce(p_fecha, current_date);
  v_monto numeric;
  v_venta_id uuid;
begin
  select estado, alias into v_estado, v_alias
  from laptops where id = p_laptop for update;
  if not found then
    raise exception 'Laptop % no encontrada', p_laptop;
  end if;
  if v_estado not in ('lista_para_venta', 'reservada') then
    raise exception 'Solo se vende una laptop en lista_para_venta o reservada (estado actual: %)', v_estado;
  end if;

  if p_precio is null or p_precio <= 0 then
    raise exception 'El precio de venta debe ser > 0';
  end if;
  if p_moneda = 'VES' and (p_monto_ves is null or p_monto_ves <= 0) then
    raise exception 'Una venta en VES requiere monto_ves > 0';
  end if;

  select moneda into v_cuenta_moneda from cuentas where id = p_cuenta;
  if not found then
    raise exception 'Cuenta % no encontrada', p_cuenta;
  end if;
  if v_cuenta_moneda <> p_moneda then
    raise exception 'La moneda de la cuenta (%) no coincide con la moneda de la venta (%)', v_cuenta_moneda, p_moneda;
  end if;

  -- monto del ingreso en la moneda de la cuenta
  v_monto := case when p_moneda = 'USD' then p_precio else p_monto_ves end;

  insert into ventas (laptop_id, comprador_id, fecha, precio_venta, moneda, monto_ves, tasa_implicita)
  values (p_laptop, p_comprador, v_fecha, p_precio, p_moneda, p_monto_ves, p_tasa)
  returning id into v_venta_id;

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto, venta_id)
  values (p_cuenta, v_fecha, 'ingreso', v_monto, 'negocio',
          concat('Venta laptop ', coalesce(v_alias, '')), v_venta_id);

  update laptops set estado = 'vendida' where id = p_laptop;

  return v_venta_id;
end $$;

-- Devolución por garantía: valida venta activa y dentro de garantía;
-- venta → devuelta_garantia; movimiento de egreso (reembolso, con venta_id);
-- laptop → para_repuestos.
create function devolver_garantia(
  p_venta uuid,
  p_cuenta uuid,
  p_monto_reembolso numeric
) returns void
language plpgsql security invoker as $$
declare
  v_venta ventas%rowtype;
  v_alias text;
begin
  select * into v_venta from ventas where id = p_venta for update;
  if not found then
    raise exception 'Venta % no encontrada', p_venta;
  end if;
  if v_venta.estado <> 'activa' then
    raise exception 'La venta no está activa (estado actual: %)', v_venta.estado;
  end if;
  if v_venta.garantia_hasta < current_date then
    raise exception 'Fuera de garantía: venció el %', v_venta.garantia_hasta;
  end if;
  if p_monto_reembolso is null or p_monto_reembolso <= 0 then
    raise exception 'El monto del reembolso debe ser > 0';
  end if;
  if not exists (select 1 from cuentas where id = p_cuenta) then
    raise exception 'Cuenta % no encontrada', p_cuenta;
  end if;

  select alias into v_alias from laptops where id = v_venta.laptop_id;

  update ventas set estado = 'devuelta_garantia' where id = p_venta;

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto, venta_id)
  values (p_cuenta, current_date, 'egreso', p_monto_reembolso, 'negocio',
          concat('Reembolso garantía laptop ', coalesce(v_alias, '')), p_venta);

  update laptops set estado = 'para_repuestos' where id = v_venta.laptop_id;
end $$;
