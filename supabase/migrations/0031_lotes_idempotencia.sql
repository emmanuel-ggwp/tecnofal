-- Idempotencia de compras: cierra la duplicación de lotes/laptops/costo_lineas.
--
-- Origen del bug: ni ProveedorSupabase.comprar() (extensión) ni registrar_compra_lote
-- (panel web) eran idempotentes, y `lotes` no tenía ninguna clave única de negocio.
-- Cuatro vías producían duplicados byte-idénticos:
--   1) race de sincronizar() solapado en la extensión (arreglado aparte con un lock),
--   2) re-push tras muerte del service worker MV3 (comprar() remoto tuvo éxito pero
--      marcarCompraSincronizada() no llegó a commitear → la compra local sigue
--      'pendiente' y se reenvía en el siguiente ciclo),
--   4) RPC no idempotente + reintento manual del usuario tras un falso error de red.
--
-- Fix de raíz: una clave de idempotencia que viaja del cliente al servidor. La extensión
-- usa el id local de la compra (`local:UUID`, estable entre reintentos); el web genera un
-- client_request_id que reusa entre reintentos del mismo submit. La BD rechaza el segundo
-- insert con la misma clave y el RPC devuelve el lote ya creado en vez de duplicarlo.
--
-- Replica el patrón defensivo de 0027_precios_unique.sql (unique por clave natural).

-- Clave de idempotencia por lote (nullable: los lotes históricos y cualquier alta sin
-- clave quedan con NULL y no participan del índice).
alter table lotes add column idempotency_key text;

-- Índice único PARCIAL: solo aplica cuando hay clave. No afecta filas existentes (todas
-- NULL) ni altas legadas sin clave; Postgres permite múltiples NULL, pero lo hacemos
-- explícito con el WHERE para dejar la intención clara.
create unique index lotes_idempotency_key_uidx
  on lotes (user_id, idempotency_key)
  where idempotency_key is not null;

-- ============================================================
-- registrar_compra_lote: ahora idempotente por (user_id, idempotency_key).
-- Se DROPa la versión de 3 args (0022) y se recrea con un 4º parámetro con default,
-- así los llamadores que aún pasen 3 args por nombre siguen resolviendo.
-- ============================================================
drop function if exists registrar_compra_lote(jsonb, jsonb, jsonb);

create function registrar_compra_lote(
  p_lote jsonb,
  p_lineas jsonb default '[]'::jsonb,
  p_laptops jsonb default '[]'::jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql security invoker as $$
declare
  v_lote_id uuid;
  v_linea jsonb;
  v_laptop jsonb;
begin
  -- Idempotencia: si ya existe un lote con esta clave para el usuario, devolverlo tal cual.
  -- El insert previo ya creó líneas y laptops en la MISMA transacción (atómica), así que
  -- devolver el id existente es todo lo que hace falta — no re-insertamos nada.
  if p_idempotency_key is not null then
    select id into v_lote_id
    from lotes
    where user_id = auth.uid() and idempotency_key = p_idempotency_key;
    if found then
      return v_lote_id;
    end if;
  end if;

  insert into lotes (fecha_compra, origen, url_ebay, vendedor, precio_subasta, envio_usa, costo_proyectado_total, metodo_estimado, idempotency_key)
  values (
    coalesce((p_lote->>'fecha_compra')::date, current_date),
    coalesce(p_lote->>'origen', 'ebay')::origen_compra_t,
    p_lote->>'url_ebay',
    p_lote->>'vendedor',
    (p_lote->>'precio_subasta')::numeric,
    coalesce((p_lote->>'envio_usa')::numeric, 0),
    (p_lote->>'costo_proyectado_total')::numeric,
    (p_lote->>'metodo_estimado')::paquete_metodo_t,
    p_idempotency_key
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
exception when unique_violation then
  -- Carrera: otra llamada concurrente insertó el lote con la misma clave primero
  -- (la única fuente de unique_violation aquí es lotes_idempotency_key_uidx). Toda esta
  -- transacción se revierte; devolvemos el lote que ganó la carrera.
  select id into v_lote_id
  from lotes
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_lote_id;
end $$;
