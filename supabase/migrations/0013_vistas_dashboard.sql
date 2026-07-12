-- TecnoFal — Migración 0013: vistas de dashboard (plan-01)
-- Todas con security_invoker = true → heredan el filtro RLS por usuario, igual que las de 0001.
-- Solo AÑADE vistas; no toca nada existente.

-- Saldo por cuenta = Σ ingresos − Σ egresos
create view v_cuentas_saldos with (security_invoker = true) as
select c.id as cuenta_id,
  c.nombre,
  c.moneda,
  coalesce(sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end), 0) as saldo
from cuentas c
left join movimientos m on m.cuenta_id = c.id
group by c.id, c.nombre, c.moneda;

-- Totales del Dashboard: una fila por usuario (RLS + security_invoker → cada usuario ve la suya).
-- total_invertido: Σ costo_proyectado (v_laptop_costos) de laptops no vendidas ni para_repuestos.
-- valor_inventario: Σ precio_sugerido de laptops en_revision/falta_partes/lista_para_venta/reservada.
-- ganancia_*_acum: Σ de v_ventas_ganancia con estado = 'activa'.
-- por_cobrar/por_pagar pendiente: monto − abonado donde estado ≠ 'saldada'.
create view v_dashboard_totales with (security_invoker = true) as
select
  (select coalesce(sum(c.costo_proyectado), 0)
     from laptops l
     join v_laptop_costos c on c.laptop_id = l.id
    where l.estado not in ('vendida', 'para_repuestos')) as total_invertido,
  (select coalesce(sum(ps.precio_sugerido), 0)
     from laptops l
     join v_laptop_precio_sugerido ps on ps.laptop_id = l.id
    where l.estado in ('en_revision', 'falta_partes', 'lista_para_venta', 'reservada')) as valor_inventario,
  (select coalesce(sum(g.ganancia_bruta), 0)
     from v_ventas_ganancia g where g.estado = 'activa') as ganancia_bruta_acum,
  (select coalesce(sum(g.ganancia_neta), 0)
     from v_ventas_ganancia g where g.estado = 'activa') as ganancia_neta_acum,
  (select coalesce(sum(monto - abonado), 0)
     from por_cobrar where estado <> 'saldada') as por_cobrar_pendiente,
  (select coalesce(sum(monto - abonado), 0)
     from por_pagar where estado <> 'saldada') as por_pagar_pendiente;

-- Conteo de laptops por estado
create view v_laptops_por_estado with (security_invoker = true) as
select estado, count(*) as cantidad
from laptops
group by estado;

-- Garantías vigentes: ventas activas con garantia_hasta ≥ hoy
create view v_garantias_vigentes with (security_invoker = true) as
select v.id as venta_id,
  v.laptop_id,
  l.alias,
  co.nombre as comprador,
  v.fecha,
  v.garantia_hasta,
  (v.garantia_hasta - current_date) as dias_restantes
from ventas v
join laptops l on l.id = v.laptop_id
left join compradores co on co.id = v.comprador_id
where v.estado = 'activa'
  and v.garantia_hasta >= current_date;
