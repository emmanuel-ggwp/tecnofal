-- Limpieza de lotes/laptops/costo_lineas duplicados en producción, causados por
-- sincronizar() corriendo sin lock de reentrancia (fix en
-- apps/extension/src/background/index.ts — ver syncEnCurso). Dos ejecuciones
-- solapadas de sincronizar() podían leer la misma compra 'pendiente' antes de
-- que ninguna la marcara sincronizada, y ambas llamaban comprar() con los
-- mismos datos → lotes/laptops/costo_lineas duplicados byte-idénticos.
--
-- ALCANCE: solo toca lotes con url_ebay no nulo (origen confirmado del bug),
-- agrupados por (user_id, url_ebay) — dos compras reales nunca comparten la
-- misma URL de listing de eBay.
--
-- "Últimos añadidos" = ninguna tabla (lotes/laptops/costo_lineas) tiene
-- created_at, así que se usa age(xmin) como proxy de antigüedad transaccional
-- (age menor = insertado/modificado más recientemente; válido porque estas
-- filas son inmutables una vez creadas — "snapshot congelado al comprar").
--
-- SEGURIDAD: aborta (RAISE EXCEPTION, sin borrar nada) si algún laptop
-- candidato a borrar ya avanzó más allá de 'comprada' o tiene datos reales
-- asociados (condición, detalles, partes, paquete) — en ese caso ya no es un
-- duplicado "fresco" del bug y hay que revisarlo a mano.
--
-- CÓMO CORRERLO:
--   1) Hacer un respaldo/snapshot de la base antes de nada.
--   2) Ejecutar este archivo completo (psql -f, o pegarlo en el SQL editor de
--      Supabase). Queda todo dentro de una transacción abierta.
--   3) Revisar el resultado del SELECT de vista previa (primera consulta) y
--      los mensajes NOTICE.
--   4) Si se ve razonable: COMMIT;   Si no: ROLLBACK;
--      (el archivo NO hace commit solo, a propósito).

begin;

create temporary table _lotes_dup on commit drop as
select l.id, l.user_id, l.url_ebay,
       row_number() over (partition by l.user_id, l.url_ebay order by age(l.xmin) asc) as orden
from lotes l
where l.url_ebay is not null;

create temporary table _lotes_a_borrar on commit drop as
select id, user_id, url_ebay from _lotes_dup where orden > 1;

create temporary table _lotes_mapa on commit drop as
select d.id as lote_viejo, k.id as lote_conservado
from _lotes_dup d
join _lotes_dup k on k.user_id = d.user_id and k.url_ebay = d.url_ebay and k.orden = 1
where d.orden > 1;

-- Vista previa: cuántos grupos duplicados hay y cuántas filas se borrarían
select user_id, url_ebay, count(*) + 1 as total_filas_grupo
from _lotes_a_borrar
group by user_id, url_ebay
order by total_filas_grupo desc;

-- Guard: abortar si algún laptop candidato a borrar ya no es un duplicado "fresco"
do $$
declare v_conflictos int;
begin
  select count(*) into v_conflictos
  from laptops lp
  where lp.lote_id in (select id from _lotes_a_borrar)
    and (
      lp.estado <> 'comprada'
      or lp.paquete_id is not null
      or exists (select 1 from laptop_condicion lc where lc.laptop_id = lp.id)
      or exists (select 1 from laptop_detalles ld where ld.laptop_id = lp.id)
      or exists (select 1 from laptop_partes lpp where lpp.laptop_id = lp.id)
      or exists (select 1 from partes_especificas pe
                 where pe.laptop_asignada_id = lp.id or pe.cosechada_de_laptop_id = lp.id)
      or exists (select 1 from paquete_items pi where pi.ref_id = lp.id)
    );

  if v_conflictos > 0 then
    raise exception
      'Abortado: % laptop(s) candidatas a borrar ya tienen progreso/datos reales asociados — revisar manualmente antes de continuar.',
      v_conflictos;
  end if;

  raise notice 'Guard OK: ningún laptop candidato tiene datos reales asociados.';
end $$;

-- Repuntar listings.lote_id de los lotes duplicados hacia el lote que se conserva
update listings s
set lote_id = m.lote_conservado
from _lotes_mapa m
where s.lote_id = m.lote_viejo;

-- Borrar dependientes de los lotes duplicados, en orden (FKs sin cascade)
delete from lote_reparto where lote_id in (select id from _lotes_a_borrar);
delete from laptops where lote_id in (select id from _lotes_a_borrar);
delete from costo_lineas where ambito = 'lote' and ambito_id in (select id from _lotes_a_borrar);
delete from lotes where id in (select id from _lotes_a_borrar);

-- Revisa arriba (vista previa + NOTICE) y decide:
-- commit;
-- rollback;
