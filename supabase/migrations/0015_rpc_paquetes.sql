-- TecnoFal — Migración 0015: RPCs transaccionales de paquetes (plan-01)
-- security invoker → corren como el usuario autenticado y RLS aplica (igual que 0001).
-- Cada función es atómica: una llamada RPC = una transacción.

-- Recibir paquete: paquete → recibido + fecha_recibido = now(); upsert de costo_lineas
-- (ámbito paquete, tipos envio_vzla/seguro/revision) con monto_real (0 permitido —
-- "a veces no cobran la revisión"); llama prorratear_paquete; laptops del paquete
-- en_transito → en_revision.
create function recibir_paquete(
  p_paquete uuid,
  p_flete_real numeric,
  p_seguro_real numeric,
  p_revision_real numeric
) returns void
language plpgsql security invoker as $$
declare
  v_estado paquete_estado_t;
  r record;
begin
  select estado into v_estado from paquetes where id = p_paquete for update;
  if not found then
    raise exception 'Paquete % no encontrado', p_paquete;
  end if;
  if v_estado = 'recibido' then
    raise exception 'El paquete ya fue recibido';
  end if;

  -- Upsert de los reales (0 permitido; null se toma como 0).
  -- Si ya existe la línea (p. ej. con estimado congelado) se actualiza; si no, se crea.
  for r in
    select * from (values
      ('envio_vzla'::costo_tipo_t, coalesce(p_flete_real, 0)),
      ('seguro'::costo_tipo_t,     coalesce(p_seguro_real, 0)),
      ('revision'::costo_tipo_t,   coalesce(p_revision_real, 0))
    ) as v(tipo, monto)
  loop
    update costo_lineas
       set monto_real = r.monto, fecha_real = now()
     where ambito = 'paquete' and ambito_id = p_paquete and tipo = r.tipo;
    if not found then
      insert into costo_lineas (ambito, ambito_id, tipo, monto_real, fecha_real)
      values ('paquete', p_paquete, r.tipo, r.monto, now());
    end if;
  end loop;

  update paquetes
     set estado = 'recibido', fecha_recibido = now()
   where id = p_paquete;

  -- Prorrateo §4.3 con los reales recién cargados
  perform prorratear_paquete(p_paquete);

  update laptops
     set estado = 'en_revision'
   where paquete_id = p_paquete and estado = 'en_transito';
end $$;

-- Avanzar paquete por la secuencia del courier: solo el siguiente estado,
-- el mismo (no-op) o retroceso de 1 para corregir. 'recibido' se marca SOLO
-- con recibir_paquete() (registra costos reales y prorratea).
create function avanzar_paquete(
  p_paquete uuid,
  p_estado paquete_estado_t
) returns void
language plpgsql security invoker as $$
declare
  v_actual paquete_estado_t;
  v_secuencia constant paquete_estado_t[] := array[
    'generada', 'factura', 'aduana_usa', 'transito_internacional',
    'aduana_venezuela', 'central_caracas', 'transito_nacional',
    'listo_para_entregar', 'recibido'
  ]::paquete_estado_t[];
  v_pos_actual int;
  v_pos_nueva int;
begin
  select estado into v_actual from paquetes where id = p_paquete for update;
  if not found then
    raise exception 'Paquete % no encontrado', p_paquete;
  end if;

  if p_estado = 'recibido' then
    raise exception 'Para marcar recibido usar recibir_paquete() (carga costos reales y prorratea)';
  end if;

  v_pos_actual := array_position(v_secuencia, v_actual);
  v_pos_nueva  := array_position(v_secuencia, p_estado);
  if (v_pos_nueva - v_pos_actual) not in (0, 1, -1) then
    raise exception 'Transición inválida: % → % (solo el siguiente estado, el mismo, o retroceso de 1)',
      v_actual, p_estado;
  end if;

  update paquetes
     set estado = p_estado,
         -- retroceso desde recibido (corrección): se limpia la fecha de recepción
         fecha_recibido = case when v_actual = 'recibido' then null else fecha_recibido end
   where id = p_paquete;
end $$;
