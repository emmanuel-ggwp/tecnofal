-- Idempotencia de las tablas de dinero (auditoría de duplicación, fase 2).
--
-- movimientos/conversiones/por_cobrar/por_pagar no tenían clave natural ni idempotencia:
--   - registrar_conversion (0016) hacía 3 INSERT sin dedup → un retry tras falso error de red
--     duplicaba la conversión completa (2 movimientos + 1 conversión).
--   - registrar_abono (0022) sumaba `abonado` incondicionalmente e insertaba un movimiento →
--     un retry duplicaba el abono (doble descuento + saldo inflado).
--   - crearDeuda / crearMovimiento eran INSERT crudos del cliente.
--
-- Fix: mismo patrón que 0032 — columna idempotency_key con default aleatorio (las escrituras
-- sin clave siguen creando filas nuevas) + unique plano (user_id, idempotency_key); y los RPCs
-- se vuelven idempotentes cuando reciben la clave.

alter table movimientos  add column idempotency_key text not null default gen_random_uuid()::text;
alter table conversiones add column idempotency_key text not null default gen_random_uuid()::text;
alter table por_cobrar   add column idempotency_key text not null default gen_random_uuid()::text;
alter table por_pagar    add column idempotency_key text not null default gen_random_uuid()::text;

create unique index movimientos_idem_uidx  on movimientos  (user_id, idempotency_key);
create unique index conversiones_idem_uidx on conversiones (user_id, idempotency_key);
create unique index por_cobrar_idem_uidx   on por_cobrar   (user_id, idempotency_key);
create unique index por_pagar_idem_uidx    on por_pagar    (user_id, idempotency_key);

-- ============================================================
-- registrar_conversion idempotente (4º→ p_idempotency_key)
-- ============================================================
drop function if exists registrar_conversion(uuid, uuid, numeric, numeric, date, text);

create function registrar_conversion(
  p_cuenta_origen uuid,
  p_cuenta_destino uuid,
  p_monto_origen numeric,
  p_monto_destino numeric,
  p_fecha date default current_date,
  p_nota text default null,
  p_idempotency_key text default null
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

  -- Idempotencia: si ya existe una conversión con esta clave, devolverla (los movimientos ya
  -- se crearon en la misma transacción atómica).
  if p_idempotency_key is not null then
    select id into v_conversion from conversiones
    where user_id = auth.uid() and idempotency_key = p_idempotency_key;
    if found then return v_conversion; end if;
  end if;

  select * into v_origen from cuentas where id = p_cuenta_origen;
  if not found then raise exception 'Cuenta origen % no encontrada', p_cuenta_origen; end if;
  select * into v_destino from cuentas where id = p_cuenta_destino;
  if not found then raise exception 'Cuenta destino % no encontrada', p_cuenta_destino; end if;

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto, idempotency_key)
  values (p_cuenta_origen, v_fecha, 'egreso', p_monto_origen, 'negocio',
          concat('Conversión → ', v_destino.nombre),
          coalesce(p_idempotency_key || ':orig', gen_random_uuid()::text))
  returning id into v_mov_origen;

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto, idempotency_key)
  values (p_cuenta_destino, v_fecha, 'ingreso', p_monto_destino, 'negocio',
          concat('Conversión ← ', v_origen.nombre),
          coalesce(p_idempotency_key || ':dest', gen_random_uuid()::text))
  returning id into v_mov_destino;

  insert into conversiones (fecha, movimiento_origen_id, movimiento_destino_id,
                            monto_origen, monto_destino, nota, idempotency_key)
  values (v_fecha, v_mov_origen, v_mov_destino, p_monto_origen, p_monto_destino, p_nota,
          coalesce(p_idempotency_key, gen_random_uuid()::text))
  returning id into v_conversion;

  return v_conversion;
exception when unique_violation then
  -- Carrera concurrente con la misma clave: devolver la conversión ganadora.
  select id into v_conversion from conversiones
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_conversion;
end $$;

-- ============================================================
-- registrar_abono idempotente (6º→ p_idempotency_key)
-- ============================================================
drop function if exists registrar_abono(text, uuid, numeric, uuid, date);

create function registrar_abono(
  p_tabla text,
  p_id uuid,
  p_monto_abono numeric,
  p_cuenta_id uuid,
  p_fecha date default current_date,
  p_idempotency_key text default null
) returns text
language plpgsql security invoker as $$
declare
  v_monto numeric;
  v_abonado numeric;
  v_persona text;
  v_estado_actual deuda_estado_t;
  v_nuevo_abonado numeric;
  v_nuevo_estado deuda_estado_t;
  v_key text := coalesce(p_idempotency_key, gen_random_uuid()::text);
  v_inserted uuid;
begin
  if p_tabla not in ('por_cobrar', 'por_pagar') then
    raise exception 'Tabla inválida: %', p_tabla;
  end if;
  if p_monto_abono is null or p_monto_abono <= 0 then
    raise exception 'El monto del abono debe ser > 0';
  end if;

  -- Bloquea la deuda (serializa llamadas concurrentes sobre la misma deuda).
  if p_tabla = 'por_cobrar' then
    select monto, abonado, persona, estado into v_monto, v_abonado, v_persona, v_estado_actual
    from por_cobrar where id = p_id for update;
  else
    select monto, abonado, persona, estado into v_monto, v_abonado, v_persona, v_estado_actual
    from por_pagar where id = p_id for update;
  end if;
  if not found then raise exception '% % no encontrado', p_tabla, p_id; end if;

  -- El movimiento del abono es la clave de idempotencia: si ya se insertó (retry con la misma
  -- clave), NO re-suma abonado ni duplica el movimiento; devuelve el estado actual.
  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto, idempotency_key)
  values (
    p_cuenta_id, p_fecha,
    (case when p_tabla = 'por_cobrar' then 'ingreso' else 'egreso' end)::mov_tipo_t,
    p_monto_abono, 'negocio',
    case when p_tabla = 'por_cobrar' then concat('Abono de ', v_persona) else concat('Abono a ', v_persona) end,
    v_key
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return v_estado_actual::text; -- abono ya aplicado: no-op idempotente
  end if;

  v_nuevo_abonado := v_abonado + p_monto_abono;
  v_nuevo_estado := case when v_nuevo_abonado >= v_monto then 'saldada'
                         when v_nuevo_abonado > 0 then 'parcial'
                         else 'pendiente' end;

  if p_tabla = 'por_cobrar' then
    update por_cobrar set abonado = v_nuevo_abonado, estado = v_nuevo_estado where id = p_id;
  else
    update por_pagar set abonado = v_nuevo_abonado, estado = v_nuevo_estado where id = p_id;
  end if;

  return v_nuevo_estado;
end $$;
