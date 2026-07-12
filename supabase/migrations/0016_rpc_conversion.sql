-- TecnoFal — Migración 0016: RPC transaccional de conversión entre cuentas (plan-01)
-- security invoker → corre como el usuario autenticado y RLS aplica (igual que 0001).
-- Atómica: crea los DOS movimientos (egreso origen / ingreso destino, categoria negocio)
-- + la fila de `conversiones` que los enlaza, en una sola transacción.
-- (La extensión hoy lo hace en 3 inserts desde el cliente; la web usa este RPC.)
-- Tasa implícita = monto_origen / monto_destino — exacta y auditable (§13).
create function registrar_conversion(
  p_cuenta_origen uuid,
  p_cuenta_destino uuid,
  p_monto_origen numeric,
  p_monto_destino numeric,
  p_fecha date default current_date,
  p_nota text default null
) returns uuid
language plpgsql security invoker as $$
declare
  v_origen cuentas%rowtype;
  v_destino cuentas%rowtype;
  v_fecha date := coalesce(p_fecha, current_date);
  v_mov_origen uuid;
  v_mov_destino uuid;
  v_conversion uuid;
begin
  if p_cuenta_origen = p_cuenta_destino then
    raise exception 'La cuenta origen y la cuenta destino deben ser distintas';
  end if;
  if p_monto_origen is null or p_monto_origen <= 0
     or p_monto_destino is null or p_monto_destino <= 0 then
    raise exception 'Los montos de la conversión deben ser > 0';
  end if;

  select * into v_origen from cuentas where id = p_cuenta_origen;
  if not found then
    raise exception 'Cuenta origen % no encontrada', p_cuenta_origen;
  end if;
  select * into v_destino from cuentas where id = p_cuenta_destino;
  if not found then
    raise exception 'Cuenta destino % no encontrada', p_cuenta_destino;
  end if;

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto)
  values (p_cuenta_origen, v_fecha, 'egreso', p_monto_origen, 'negocio',
          concat('Conversión → ', v_destino.nombre))
  returning id into v_mov_origen;

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto)
  values (p_cuenta_destino, v_fecha, 'ingreso', p_monto_destino, 'negocio',
          concat('Conversión ← ', v_origen.nombre))
  returning id into v_mov_destino;

  insert into conversiones (fecha, movimiento_origen_id, movimiento_destino_id,
                            monto_origen, monto_destino, nota)
  values (v_fecha, v_mov_origen, v_mov_destino, p_monto_origen, p_monto_destino, p_nota)
  returning id into v_conversion;

  return v_conversion;
end $$;
