-- Idempotencia de partes_compras (auditoría de duplicación, fase 1 — CRÍTICO).
--
-- partes_compras dispara trg_partes_promedio AFTER INSERT (0001:190-202), que recalcula el
-- costo promedio ponderado y acumula cantidad en partes_stock. Un doble-insert de la MISMA
-- compra NO solo duplica la fila: corrompe el promedio Y crea cantidad fantasma, sin forma
-- de revertir. Dos vías lo permitían:
--   - registrarCompraStock (apps/web/src/data/partes.ts) — INSERT crudo del cliente.
--   - recibir_orden_partes (0001:571) — RPC SIN 'for update', con race bajo doble-click.
--
-- Fix: clave de idempotencia por fila. Se usa un default aleatorio para que toda inserción
-- SIN clave explícita (p. ej. congelar_reparto_lote, 0024) siga creando filas nuevas como
-- hoy; solo las inserciones que pasan una clave estable se deduplican.

alter table partes_compras
  add column idempotency_key text not null default gen_random_uuid()::text;

-- Unique PLANO (no parcial): el default aleatorio garantiza unicidad para filas sin clave
-- explícita, así que un índice plano es seguro y permite ON CONFLICT sin predicado.
create unique index partes_compras_idem_uidx
  on partes_compras (user_id, idempotency_key);

-- recibir_orden_partes: + 'for update' (serializa llamadas concurrentes) + clave de
-- idempotencia derivada del id del ítem de orden (estable). Belt-and-suspenders: aunque dos
-- llamadas se solapen, el segundo insert por ítem cae en el índice único y no duplica.
create or replace function recibir_orden_partes(p_orden uuid) returns void language plpgsql as $$
declare it record;
begin
  perform prorratear_orden_partes(p_orden);
  for it in select * from orden_partes_items where orden_id = p_orden and not recibido for update loop
    insert into partes_compras (user_id, parte_id, cantidad, costo_unitario, idempotency_key)
    values (it.user_id, it.parte_id, it.cantidad,
            it.precio_unitario + coalesce(it.prorrateo, 0) / it.cantidad,
            'orden_item:' || it.id)
    on conflict (user_id, idempotency_key) do nothing;
    update orden_partes_items set recibido = true where id = it.id;
  end loop;
end $$;
