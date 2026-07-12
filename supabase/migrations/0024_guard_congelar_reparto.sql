-- Migración 0024: guardia de inmutabilidad en congelar_reparto_lote (hallazgo #1 del backlog,
-- plan-04, 2026-07-10 / cerrado por plan-10 2026-07-11).
--
-- El principio de diseño (§2.6 de la especificación) dice que el reparto de un lote es FIJO
-- e INMUTABLE una vez congelado. Hasta ahora esa regla la garantizaba SOLO la UI (oculta el
-- botón "Congelar reparto" si ya existe reparto); la función SQL en sí no rechazaba una
-- segunda invocación: si se llamaba dos veces sobre un lote con laptops, borraba y volvía a
-- insertar `lote_reparto` sin error, lo que podría cambiar retroactivamente `costo_asignado`
-- de laptops ya vendidas ante una llamada directa al RPC o un bug futuro de UI.
--
-- Este `create or replace function` agrega un guard al inicio: si el lote ya tiene reparto
-- (rama con laptops: existe `lote_reparto`; rama solo-de-partes: ya hay
-- `lote_partes_encontradas.en_stock = true`), lanza excepción y no toca nada. El resto del
-- cuerpo queda idéntico a 0001_schema.sql — no cambia ningún cálculo, solo impide repetirlo.
create or replace function congelar_reparto_lote(p_lote uuid) returns void language plpgsql as $$
declare
  v_costo numeric;
  v_nominales numeric;
  v_pesos numeric;
  v_n int;
begin
  if exists (select 1 from lote_reparto where lote_id = p_lote)
     or exists (
       select 1 from lote_partes_encontradas
       where lote_id = p_lote and en_stock
     )
  then
    raise exception 'El reparto del lote % ya fue congelado: es inmutable y no puede recalcularse', p_lote
      using errcode = 'P0001';
  end if;

  select coalesce(sum(coalesce(monto_real, monto_estimado)), 0) into v_costo
  from costo_lineas
  where ambito = 'lote' and ambito_id = p_lote
    and tipo in ('subasta','envio_usa','impuesto_ebay','flete_nacional');

  select coalesce(sum(cantidad * valor_nominal_aplicado), 0) into v_nominales
  from lote_partes_encontradas where lote_id = p_lote;

  select count(*) into v_n from laptops where lote_id = p_lote;

  if v_n = 0 then
    -- Lote solo de partes: distribuir el costo total proporcional a valores nominales
    insert into partes_compras (user_id, parte_id, cantidad, costo_unitario)
    select user_id, parte_id, cantidad,
           (v_costo * (cantidad * valor_nominal_aplicado) / nullif(v_nominales, 0)) / cantidad
    from lote_partes_encontradas where lote_id = p_lote and not en_stock;
    update lote_partes_encontradas set en_stock = true where lote_id = p_lote and not en_stock;
    return;
  end if;

  -- Partes encontradas → stock a valor nominal (una sola vez); nada se duplica ni se pierde
  insert into partes_compras (user_id, parte_id, cantidad, costo_unitario)
  select user_id, parte_id, cantidad, valor_nominal_aplicado
  from lote_partes_encontradas where lote_id = p_lote and not en_stock;
  update lote_partes_encontradas set en_stock = true where lote_id = p_lote and not en_stock;

  select sum(coalesce(ps.precio_sugerido, 0)) into v_pesos
  from laptops l left join v_laptop_precio_sugerido ps on ps.laptop_id = l.id
  where l.lote_id = p_lote;

  delete from lote_reparto where lote_id = p_lote;
  if v_pesos is null or v_pesos <= 0 then
    insert into lote_reparto (lote_id, laptop_id, user_id, valor_esperado_al_comprar, proporcion, costo_asignado)
    select p_lote, l.id, l.user_id, 0, 1.0 / v_n, (v_costo - v_nominales) / v_n
    from laptops l where l.lote_id = p_lote;
  else
    insert into lote_reparto (lote_id, laptop_id, user_id, valor_esperado_al_comprar, proporcion, costo_asignado)
    select p_lote, l.id, l.user_id,
           coalesce(ps.precio_sugerido, 0),
           coalesce(ps.precio_sugerido, 0) / v_pesos,
           (v_costo - v_nominales) * coalesce(ps.precio_sugerido, 0) / v_pesos
    from laptops l left join v_laptop_precio_sugerido ps on ps.laptop_id = l.id
    where l.lote_id = p_lote;
  end if;
end $$;
