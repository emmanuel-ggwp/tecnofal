-- Migración 0023: sincroniza lotes.precio_subasta/envio_usa con costo_lineas
-- (hallazgo #2 del backlog, 2026-07-11) — sin eliminar las columnas.
--
-- Auditoría completa mostró que eliminar precio_subasta/envio_usa de `lotes` tocaría
-- 8 archivos, incluidas pruebas de 4 pantallas YA CERRADAS que siembran un lote solo
-- como dependencia FK. En vez de ese riesgo, este trigger mantiene ambas fuentes
-- sincronizadas automáticamente: cualquier insert/update en costo_lineas (ámbito lote,
-- tipo subasta/envio_usa) actualiza la columna correspondiente en `lotes` con
-- coalesce(monto_real, monto_estimado) — el mismo criterio "real si existe, si no
-- estimado" que usan las demás vistas del sistema (v_laptop_costos). Elimina el riesgo
-- de divergencia sin cambiar ningún código de aplicación existente.
create function fn_sync_lote_costos() returns trigger
language plpgsql as $$
declare
  v_monto numeric;
begin
  if new.ambito = 'lote' and new.tipo in ('subasta', 'envio_usa') then
    v_monto := coalesce(new.monto_real, new.monto_estimado);
    if v_monto is not null then
      if new.tipo = 'subasta' then
        update lotes set precio_subasta = v_monto where id = new.ambito_id;
      else
        update lotes set envio_usa = v_monto where id = new.ambito_id;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger trg_sync_lote_costos
  after insert or update of monto_estimado, monto_real on costo_lineas
  for each row execute function fn_sync_lote_costos();
