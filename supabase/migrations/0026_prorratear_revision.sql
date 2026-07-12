-- Migración 0026: prorratea el costo real de "revisión" de un paquete entre sus
-- paquete_items, igual que ya ocurre con flete/seguro (hallazgo #6 del backlog, plan-10b/
-- plan-10c, 2026-07-11).
--
-- Diagnóstico (ver planes/plan-10c-cohesion-verificacion.md, "Hallazgos para la
-- especificación"): `prorratear_paquete()` solo leía costo_lineas.tipo IN
-- ('envio_vzla','seguro') y solo poblaba paquete_items.flete_prorrateado/
-- seguro_prorrateado. El tipo 'revision' se guardaba en costo_lineas (ámbito paquete) y se
-- exponía de solo lectura en paquete_costos, pero JAMÁS llegaba a v_laptop_costos ni, por
-- tanto, a v_ventas_ganancia.ganancia_neta ni al Dashboard: un usuario que pagara una
-- revisión real de inspección/testing al recibir un paquete nunca veía ese gasto reducir
-- ninguna ganancia reportada.
--
-- Base del prorrateo: volumen_pie3 (igual que flete), NO valor_declarado (que es la base
-- de seguro). Decisión de diseño: la revisión física es proporcional al volumen/cantidad de
-- trabajo de inspección de cada ítem, no a su valor declarado. plan-04-lotes-paquetes.md
-- (§Contexto esencial, tarea 3) solo documenta "flete por volumen, seguro por valor
-- declarado" y no menciona una base para revisión — no hay nada ahí que contradiga usar
-- volumen_pie3 también para revisión.
--
-- NO se toca v_dashboard_totales.total_invertido (usa v_laptop_costos.costo_proyectado,
-- que deliberadamente NO incluye prorrateo de paquete — es el estimado antes de recibir el
-- paquete; eso es una decisión de diseño existente, fuera del alcance de este fix).

alter table paquete_items add column if not exists revision_prorrateado numeric;

create or replace function prorratear_paquete(p_id uuid) returns void language plpgsql as $$
declare
  v_vol numeric;
  v_val numeric;
  v_flete numeric;
  v_seguro numeric;
  v_revision numeric;
begin
  select sum(volumen_pie3), sum(valor_declarado) into v_vol, v_val
  from paquete_items where paquete_id = p_id;
  select coalesce(sum(monto_real) filter (where tipo = 'envio_vzla'), 0),
         coalesce(sum(monto_real) filter (where tipo = 'seguro'), 0),
         coalesce(sum(monto_real) filter (where tipo = 'revision'), 0)
    into v_flete, v_seguro, v_revision
  from costo_lineas where ambito = 'paquete' and ambito_id = p_id;

  update paquete_items set
    flete_prorrateado    = v_flete    * volumen_pie3    / nullif(v_vol, 0),
    seguro_prorrateado   = v_seguro   * valor_declarado / nullif(v_val, 0),
    revision_prorrateado = v_revision * volumen_pie3    / nullif(v_vol, 0)
  where paquete_id = p_id;
end $$;

create or replace view v_laptop_costos with (security_invoker = true) as
select l.id as laptop_id,
  coalesce(lr.costo_asignado, 0) as costo_lote,
  coalesce(pi.flete_prorrateado, 0) + coalesce(pi.seguro_prorrateado, 0) + coalesce(pi.revision_prorrateado, 0) as prorrateo_paquete,
  coalesce(cl.total_estimado, 0) as lineas_estimado,
  coalesce(cl.total_actual, 0) as lineas_actual,
  coalesce(cl.partes_actual, 0) as partes_actual,
  coalesce(lr.costo_asignado, 0) + coalesce(cl.partes_actual, 0) as costo_directo,
  coalesce(lr.costo_asignado, 0) + coalesce(cl.total_estimado, 0) as costo_proyectado,
  coalesce(lr.costo_asignado, 0) + coalesce(cl.total_actual, 0)
    + coalesce(pi.flete_prorrateado, 0) + coalesce(pi.seguro_prorrateado, 0) + coalesce(pi.revision_prorrateado, 0) as costo_final
from laptops l
left join lote_reparto lr on lr.laptop_id = l.id
left join lateral (
  select sum(x.flete_prorrateado) as flete_prorrateado,
         sum(x.seguro_prorrateado) as seguro_prorrateado,
         sum(x.revision_prorrateado) as revision_prorrateado
  from paquete_items x where x.tipo = 'laptop' and x.ref_id = l.id
) pi on true
left join lateral (
  select
    sum(c.monto_estimado) as total_estimado,
    sum(coalesce(c.monto_real, c.monto_estimado)) as total_actual,
    sum(coalesce(c.monto_real, c.monto_estimado)) filter (where c.tipo = 'parte') as partes_actual
  from costo_lineas c where c.ambito = 'laptop' and c.ambito_id = l.id
) cl on true;
