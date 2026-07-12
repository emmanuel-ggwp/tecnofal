-- Migración 0022: RPCs transaccionales para los 5 flujos de escritura multi-paso
-- detectados en la auditoría del 2026-07-11 (apps/web/src/data/*.ts hacía 2-4 escrituras
-- secuenciales sin envolverlas en una transacción — una interrupción a mitad de camino
-- podía dejar estado inconsistente). security invoker → RLS sigue aplicando igual que
-- en 0014/0015/0016. Cada función = una transacción atómica.

-- ============================================================
-- 1) Instalar una parte (commodity o específica) en una laptop
-- ============================================================
-- p_especifica_id NULL → commodity: descuenta partes_stock (con lock, sin condición de
-- carrera) y usa costo_promedio. p_especifica_id presente → específica: valida que no esté
-- ya asignada y usa costo_real. En ambos casos crea laptop_partes + costo_lineas.
create function instalar_parte(
  p_laptop_id uuid,
  p_parte_id uuid default null,
  p_especifica_id uuid default null
) returns void
language plpgsql security invoker as $$
declare
  v_parte_id uuid := p_parte_id;
  v_costo numeric;
  v_cantidad numeric;
  v_nombre text;
  v_fecha date := current_date;
begin
  if p_especifica_id is null then
    if p_parte_id is null then
      raise exception 'Debe indicar parte_id (commodity) o especifica_id (específica)';
    end if;
    select cantidad, costo_promedio into v_cantidad, v_costo
    from partes_stock where parte_id = p_parte_id for update;
    if not found or v_cantidad < 1 then
      raise exception 'No hay stock disponible de esta parte';
    end if;
    update partes_stock set cantidad = cantidad - 1 where parte_id = p_parte_id;
  else
    declare v_asignada uuid;
    begin
      select parte_id, costo_real, laptop_asignada_id into v_parte_id, v_costo, v_asignada
      from partes_especificas where id = p_especifica_id for update;
      if not found then
        raise exception 'Parte específica % no encontrada', p_especifica_id;
      end if;
      if v_asignada is not null then
        raise exception 'Esta parte específica ya está asignada a una laptop';
      end if;
    end;
    update partes_especificas set laptop_asignada_id = p_laptop_id where id = p_especifica_id;
  end if;

  select nombre into v_nombre from partes_catalogo where id = v_parte_id;

  insert into laptop_partes (laptop_id, parte_id, parte_especifica_id, costo_aplicado, fecha)
  values (p_laptop_id, v_parte_id, p_especifica_id, v_costo, v_fecha);

  insert into costo_lineas (ambito, ambito_id, tipo, monto_real, fecha_real, descripcion)
  values ('laptop', p_laptop_id, 'parte', v_costo, v_fecha, v_nombre);
end $$;

-- ============================================================
-- 2) Agregar una laptop como ítem de un paquete
-- ============================================================
create function agregar_item_laptop_paquete(
  p_paquete_id uuid,
  p_laptop_id uuid,
  p_volumen_pie3 numeric,
  p_valor_declarado numeric
) returns uuid
language plpgsql security invoker as $$
declare
  v_item_id uuid;
  v_paquete_actual uuid;
begin
  select paquete_id into v_paquete_actual from laptops where id = p_laptop_id for update;
  if not found then
    raise exception 'Laptop % no encontrada', p_laptop_id;
  end if;
  if v_paquete_actual is not null then
    raise exception 'Esta laptop ya está asignada a un paquete';
  end if;

  insert into paquete_items (paquete_id, tipo, ref_id, volumen_pie3, valor_declarado)
  values (p_paquete_id, 'laptop', p_laptop_id, p_volumen_pie3, p_valor_declarado)
  returning id into v_item_id;

  update laptops set paquete_id = p_paquete_id, estado = 'en_transito' where id = p_laptop_id;

  return v_item_id;
end $$;

-- ============================================================
-- 3) Registrar un abono a por_cobrar / por_pagar
-- ============================================================
-- p_tabla restringido por CHECK a los 2 valores válidos; sin SQL dinámico sobre el
-- nombre de tabla (evita cualquier riesgo de inyección vía identificador).
create function registrar_abono(
  p_tabla text,
  p_id uuid,
  p_monto_abono numeric,
  p_cuenta_id uuid,
  p_fecha date default current_date
) returns text
language plpgsql security invoker as $$
declare
  v_monto numeric;
  v_abonado numeric;
  v_persona text;
  v_nuevo_abonado numeric;
  v_nuevo_estado deuda_estado_t;
begin
  if p_tabla not in ('por_cobrar', 'por_pagar') then
    raise exception 'Tabla inválida: %', p_tabla;
  end if;
  if p_monto_abono is null or p_monto_abono <= 0 then
    raise exception 'El monto del abono debe ser > 0';
  end if;

  if p_tabla = 'por_cobrar' then
    select monto, abonado, persona into v_monto, v_abonado, v_persona from por_cobrar where id = p_id for update;
  else
    select monto, abonado, persona into v_monto, v_abonado, v_persona from por_pagar where id = p_id for update;
  end if;
  if not found then
    raise exception '% % no encontrado', p_tabla, p_id;
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

  insert into movimientos (cuenta_id, fecha, tipo, monto, categoria, concepto)
  values (
    p_cuenta_id, p_fecha,
    (case when p_tabla = 'por_cobrar' then 'ingreso' else 'egreso' end)::mov_tipo_t,
    p_monto_abono, 'negocio',
    case when p_tabla = 'por_cobrar' then concat('Abono de ', v_persona) else concat('Abono a ', v_persona) end
  );

  return v_nuevo_estado;
end $$;

-- ============================================================
-- 4) Registrar una compra de lote completa (lote + líneas de costo + laptops)
-- ============================================================
-- Reemplaza a crearLoteEbay (lotes.ts) y crearLote (calculadora.ts) — ambos hacían
-- exactamente esta misma secuencia por su cuenta. p_lineas/p_laptops son arrays JSON;
-- el llamador (TS) decide qué campos manda (estado por laptop, tipos de línea, etc.),
-- esta función solo escribe todo en una transacción.
create function registrar_compra_lote(
  p_lote jsonb,
  p_lineas jsonb default '[]'::jsonb,
  p_laptops jsonb default '[]'::jsonb
) returns uuid
language plpgsql security invoker as $$
declare
  v_lote_id uuid;
  v_linea jsonb;
  v_laptop jsonb;
begin
  insert into lotes (fecha_compra, origen, url_ebay, vendedor, precio_subasta, envio_usa, costo_proyectado_total, metodo_estimado)
  values (
    coalesce((p_lote->>'fecha_compra')::date, current_date),
    coalesce(p_lote->>'origen', 'ebay')::origen_compra_t,
    p_lote->>'url_ebay',
    p_lote->>'vendedor',
    (p_lote->>'precio_subasta')::numeric,
    coalesce((p_lote->>'envio_usa')::numeric, 0),
    (p_lote->>'costo_proyectado_total')::numeric,
    (p_lote->>'metodo_estimado')::paquete_metodo_t
  )
  returning id into v_lote_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    insert into costo_lineas (ambito, ambito_id, tipo, monto_estimado, estimado_congelado_at, monto_real, fecha_real, descripcion)
    values (
      'lote', v_lote_id,
      (v_linea->>'tipo')::costo_tipo_t,
      (v_linea->>'monto_estimado')::numeric,
      case when v_linea ? 'estimado_congelado_at' then (v_linea->>'estimado_congelado_at')::timestamptz else null end,
      case when v_linea ? 'monto_real' then (v_linea->>'monto_real')::numeric else null end,
      case when v_linea ? 'fecha_real' then (v_linea->>'fecha_real')::timestamptz else null end,
      v_linea->>'descripcion'
    );
  end loop;

  for v_laptop in select * from jsonb_array_elements(p_laptops) loop
    insert into laptops (lote_id, modelo_id, cpu_tipo, cpu_gen, ram_gb, ssd_gb, tiene_hdd, pantalla_pulgadas, pantalla_tactil, service_tag, estado)
    values (
      v_lote_id,
      (v_laptop->>'modelo_id')::uuid,
      (v_laptop->>'cpu_tipo')::cpu_tipo_t,
      (v_laptop->>'cpu_gen')::int,
      (v_laptop->>'ram_gb')::int,
      (v_laptop->>'ssd_gb')::int,
      coalesce((v_laptop->>'tiene_hdd')::boolean, false),
      (v_laptop->>'pantalla_pulgadas')::numeric,
      coalesce((v_laptop->>'pantalla_tactil')::boolean, false),
      v_laptop->>'service_tag',
      coalesce(v_laptop->>'estado', 'comprada')::laptop_estado_t
    );
  end loop;

  return v_lote_id;
end $$;
