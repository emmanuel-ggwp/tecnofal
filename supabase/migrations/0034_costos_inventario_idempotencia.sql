-- Idempotencia de costos/inventario (auditoría de duplicación, fase 3).
-- Mismo patrón que 0031/0032/0033: clave natural o idempotency_key (default aleatorio) + unique,
-- y escrituras que se vuelven idempotentes. Incluye dedup defensivo de datos existentes antes
-- de cada unique NATURAL (para que la constraint pueda crearse en producción).

-- ============================================================
-- costo_lineas: unique por clave natural para tipos SINGLETON (todos menos 'parte',
-- que sí admite multiplicidad legítima — varias partes por laptop).
-- ============================================================
-- Dedup: conserva por (user_id, ambito, ambito_id, tipo) la fila con mayor real/estimado.
delete from costo_lineas a using costo_lineas b
where a.tipo <> 'parte' and b.tipo <> 'parte'
  and a.user_id = b.user_id and a.ambito = b.ambito and a.ambito_id = b.ambito_id and a.tipo = b.tipo
  and (coalesce(a.monto_real, a.monto_estimado, 0), a.id)
    < (coalesce(b.monto_real, b.monto_estimado, 0), b.id);

create unique index costo_lineas_singleton_uidx
  on costo_lineas (user_id, ambito, ambito_id, tipo) where tipo <> 'parte';

-- RPC idempotente para el real de una línea de lote (reemplaza el select-then-insert no
-- atómico de registrarCostoRealLote, que duplicaba líneas 'real' ante race/retry).
create function registrar_costo_real_lote(p_lote uuid, p_tipo text, p_monto numeric)
returns void language plpgsql security invoker as $$
begin
  insert into costo_lineas (ambito, ambito_id, tipo, monto_real, fecha_real)
  values ('lote', p_lote, p_tipo::costo_tipo_t, p_monto, now())
  on conflict (user_id, ambito, ambito_id, tipo) where tipo <> 'parte'
  do update set monto_real = excluded.monto_real, fecha_real = excluded.fecha_real;
end $$;

-- ============================================================
-- paquetes: idempotency_key + unique. crearPaquete (INSERT crudo) → upsert idempotente.
-- ============================================================
alter table paquetes add column idempotency_key text not null default gen_random_uuid()::text;
create unique index paquetes_idem_uidx on paquetes (user_id, idempotency_key);

-- ============================================================
-- paquete_items: idempotency_key (para parte/personal, inserts crudos del cliente) +
-- unique natural (paquete_id, ref_id) para ítems tipo laptop.
-- ============================================================
alter table paquete_items add column idempotency_key text not null default gen_random_uuid()::text;
create unique index paquete_items_idem_uidx on paquete_items (user_id, idempotency_key);

delete from paquete_items a using paquete_items b
where a.tipo = 'laptop' and b.tipo = 'laptop' and a.ref_id = b.ref_id and a.paquete_id = b.paquete_id
  and a.id < b.id;
create unique index paquete_items_laptop_uidx
  on paquete_items (paquete_id, ref_id) where tipo = 'laptop' and ref_id is not null;

-- ============================================================
-- lote_partes_encontradas: unique natural (lote_id, parte_id). agregarParteEncontrada → upsert.
-- ============================================================
delete from lote_partes_encontradas a using lote_partes_encontradas b
where a.lote_id = b.lote_id and a.parte_id = b.parte_id and a.id < b.id;
create unique index lote_partes_encontradas_uidx on lote_partes_encontradas (lote_id, parte_id);

-- ============================================================
-- partes_especificas: idempotency_key + unique (inserts crudos crearEspecifica/cosecharParte).
-- ============================================================
alter table partes_especificas add column idempotency_key text not null default gen_random_uuid()::text;
create unique index partes_especificas_idem_uidx on partes_especificas (user_id, idempotency_key);

-- ============================================================
-- laptop_partes: idempotency_key + unique. instalar_parte (commodity) → idempotente.
-- ============================================================
alter table laptop_partes add column idempotency_key text not null default gen_random_uuid()::text;
create unique index laptop_partes_idem_uidx on laptop_partes (user_id, idempotency_key);

create or replace function instalar_parte(
  p_laptop_id uuid,
  p_parte_id uuid default null,
  p_especifica_id uuid default null,
  p_idempotency_key text default null
) returns void
language plpgsql security invoker as $$
declare
  v_parte_id uuid := p_parte_id;
  v_costo numeric;
  v_cantidad numeric;
  v_nombre text;
  v_fecha date := current_date;
  v_key text := coalesce(p_idempotency_key, gen_random_uuid()::text);
  v_inserted uuid;
  v_asignada uuid;
begin
  -- Idempotencia: retry con la misma clave = no-op (antes de tocar stock/específica).
  if p_idempotency_key is not null then
    perform 1 from laptop_partes where user_id = auth.uid() and idempotency_key = p_idempotency_key;
    if found then return; end if;
  end if;

  if p_especifica_id is null then
    if p_parte_id is null then
      raise exception 'Debe indicar parte_id (commodity) o especifica_id (específica)';
    end if;
    select cantidad, costo_promedio into v_cantidad, v_costo
    from partes_stock where parte_id = p_parte_id for update;
    if not found or v_cantidad < 1 then
      raise exception 'No hay stock disponible de esta parte';
    end if;
  else
    select parte_id, costo_real, laptop_asignada_id into v_parte_id, v_costo, v_asignada
    from partes_especificas where id = p_especifica_id for update;
    if not found then raise exception 'Parte específica % no encontrada', p_especifica_id; end if;
    if v_asignada is not null then raise exception 'Esta parte específica ya está asignada a una laptop'; end if;
  end if;

  select nombre into v_nombre from partes_catalogo where id = v_parte_id;

  -- La inserción de laptop_partes es la compuerta de idempotencia: los efectos secundarios
  -- (descuento de stock / asignación de específica / costo_linea) SOLO corren si insertó.
  insert into laptop_partes (laptop_id, parte_id, parte_especifica_id, costo_aplicado, fecha, idempotency_key)
  values (p_laptop_id, v_parte_id, p_especifica_id, v_costo, v_fecha, v_key)
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_inserted;
  if v_inserted is null then return; end if;

  if p_especifica_id is null then
    update partes_stock set cantidad = cantidad - 1 where parte_id = p_parte_id;
  else
    update partes_especificas set laptop_asignada_id = p_laptop_id where id = p_especifica_id;
  end if;

  insert into costo_lineas (ambito, ambito_id, tipo, monto_real, fecha_real, descripcion)
  values ('laptop', p_laptop_id, 'parte', v_costo, v_fecha, v_nombre);
end $$;
