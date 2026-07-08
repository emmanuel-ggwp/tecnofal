-- TecnoFal — Fase 1 · Migración 0001: esquema completo (§2 de la especificación)
-- MULTI-USUARIO: todas las tablas de datos llevan user_id (estampado por trigger, filtrado por RLS).
-- EXCEPCIÓN: `modelos` es GLOBAL/compartida (el conocimiento de RAM soldada y reglas crece para todos).
create extension if not exists pgcrypto;

-- ============ ENUMS ============
create type cpu_tipo_t as enum ('i3','i5','i7','ryzen3','ryzen5','ryzen7','otro');
create type ram_soldada_t as enum ('no','parcial','total','revisar');
create type regla_compra_t as enum ('normal','condicional','bloqueada');
create type laptop_estado_t as enum ('evaluando','comprada','en_transito','en_revision','falta_partes','lista_para_venta','reservada','vendida','para_repuestos');
create type paquete_metodo_t as enum ('barco','avion_zoom');
create type paquete_estado_t as enum ('generada','factura','aduana_usa','transito_internacional','aduana_venezuela','central_caracas','transito_nacional','listo_para_entregar','recibido');
create type paquete_item_tipo_t as enum ('laptop','parte','personal');
create type costo_ambito_t as enum ('laptop','lote','paquete','orden_partes');
-- §13: comision_zinli ELIMINADA como tipo de costo — el resultado cambiario vive SOLO en `conversiones`
-- §12: flete_nacional para compras locales (delivery Venezuela)
create type costo_tipo_t as enum ('subasta','envio_usa','impuesto_ebay','seguro','envio_vzla','flete_nacional','revision','parte','reparacion','otro');
create type origen_compra_t as enum ('ebay','local','otro');
create type moneda_t as enum ('USD','VES');
create type venta_estado_t as enum ('activa','devuelta_garantia');
create type mov_tipo_t as enum ('ingreso','egreso');
create type mov_categoria_t as enum ('negocio','personal');
create type semaforo_t as enum ('verde','amarillo','rojo');
create type listing_estado_t as enum ('visto','evaluado','comprado','descartado');
create type detalle_categoria_t as enum ('carcasa','pantalla','puertos','bateria','teclado','touchpad','audio','otro');
create type pantalla_cond_t as enum ('ok','manchas','lineas','rota');
create type cond_t as enum ('ok','detalle','malo');
create type parte_origen_t as enum ('compra','cosechada');
create type tasa_tipo_t as enum ('bcv','paralelo','usdt','paypal');
create type deuda_estado_t as enum ('pendiente','parcial','saldada');

-- ============ 2.1 Catálogos y configuración ============

-- GLOBAL (compartida entre usuarios): base de conocimiento de modelos
create table modelos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  modelo text not null,
  cpu_tipo cpu_tipo_t,
  ram_soldada ram_soldada_t not null default 'revisar',
  ssd_soldado boolean not null default false,
  regla_compra regla_compra_t not null default 'normal',
  motivo_regla text,
  notas text,
  unique (marca, modelo)
);

-- POR USUARIO (cada quien su mercado y umbrales; seeds como plantilla al crear usuario)
create table precios_ideales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  cpu_tipo cpu_tipo_t not null,
  gen_desde int not null,
  gen_hasta int not null,
  precio_base numeric not null,
  check (gen_desde <= gen_hasta)
);

create table ajustes_config (
  user_id uuid not null references auth.users(id),
  clave text not null,
  delta numeric not null,
  nota text,
  primary key (user_id, clave)
);

create table detalles_catalogo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nombre text not null,
  deduccion_base numeric not null,
  categoria detalle_categoria_t not null default 'otro',
  unique (user_id, nombre)
);

-- valor NULL = sin valor vigente (cargar en Studio/Configuración)
create table parametros (
  user_id uuid not null references auth.users(id),
  clave text not null,
  valor numeric,
  descripcion text,
  primary key (user_id, clave)
);

-- ============ 2.2 Compras e inventario ============
create table lotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  fecha_compra date not null default current_date,
  -- §12: local → sin url_ebay/envio_usa/impuesto/seguro/envio_vzla (no crear líneas en cero);
  -- laptops locales no se asocian a paquete: comprada → en_revision directa
  origen origen_compra_t not null default 'ebay',
  url_ebay text,
  vendedor text,
  precio_subasta numeric not null,
  envio_usa numeric not null default 0,
  costo_proyectado_total numeric -- snapshot congelado al comprar (inmutable)
);

create table paquetes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  courier text,
  guia text,
  metodo paquete_metodo_t not null default 'barco',
  estado paquete_estado_t not null default 'generada',
  volumen_estimado_pie3 numeric,
  peso_estimado_kg numeric,
  flete_estimado numeric,
  seguro_estimado numeric,
  revision_estimada numeric,
  fecha_recibido timestamptz -- confirmación MANUAL
  -- Los reales de flete/seguro/revisión viven en costo_lineas (ámbito paquete); ver vista paquete_costos
);

create table laptops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  modelo_id uuid references modelos(id),
  lote_id uuid references lotes(id),
  service_tag text,
  alias text generated always as (right(service_tag, 4)) stored, -- búsqueda principal
  cpu_tipo cpu_tipo_t, -- de la unidad (un mismo modelo viene en i5 o i7)
  cpu_gen int,
  ram_gb int,
  ssd_gb int,
  tiene_hdd boolean not null default false,
  pantalla_pulgadas numeric, -- necesario para ajustes de precio (15.6 / 14 / 12.5)
  pantalla_tactil boolean not null default false,
  estado laptop_estado_t not null default 'evaluando',
  paquete_id uuid references paquetes(id),
  es_donante boolean not null default false,
  fotos text[] not null default '{}'
);
create index laptops_alias_idx on laptops (user_id, alias);
create index laptops_estado_idx on laptops (user_id, estado);

create table laptop_condicion (
  laptop_id uuid primary key references laptops(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  bateria_horas numeric,
  pantalla pantalla_cond_t default 'ok',
  puertos_malos jsonb not null default '{}',
  teclado cond_t default 'ok',
  touchpad cond_t default 'ok',
  bisagras cond_t default 'ok',
  carcasa cond_t default 'ok',
  audio cond_t default 'ok',
  notas text
);

create table laptop_detalles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  laptop_id uuid not null references laptops(id) on delete cascade,
  detalle_id uuid not null references detalles_catalogo(id),
  deduccion_aplicada numeric not null, -- parte de deduccion_base, editable según gravedad
  notas text
);

-- ============ 2.3 Partes (por usuario: precios de referencia de SU mercado) ============
create table partes_catalogo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nombre text not null,
  precio_referencia numeric, -- referencia de costo ATERRIZADO estimado (precio típico + envío típico)
  valor_nominal numeric,     -- valor asignado a partes descubiertas dentro de un lote (§2.3c)
  volumen_pie3 numeric,
  peso_kg numeric,
  unique (user_id, nombre)
);

create table partes_stock (
  parte_id uuid primary key references partes_catalogo(id),
  user_id uuid not null references auth.users(id),
  cantidad numeric not null default 0,
  costo_promedio numeric not null default 0
);

-- cada compra recalcula el promedio ponderado (trigger)
create table partes_compras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  parte_id uuid not null references partes_catalogo(id),
  fecha date not null default current_date,
  cantidad numeric not null check (cantidad > 0),
  costo_unitario numeric not null
);

create function fn_partes_promedio() returns trigger language plpgsql as $$
begin
  insert into partes_stock (parte_id, user_id, cantidad, costo_promedio)
  values (new.parte_id, new.user_id, new.cantidad, new.costo_unitario)
  on conflict (parte_id) do update set
    costo_promedio = case when partes_stock.cantidad + new.cantidad = 0 then 0
      else (partes_stock.cantidad * partes_stock.costo_promedio + new.cantidad * new.costo_unitario)
           / (partes_stock.cantidad + new.cantidad) end,
    cantidad = partes_stock.cantidad + new.cantidad;
  return new;
end $$;
create trigger trg_partes_promedio after insert on partes_compras
for each row execute function fn_partes_promedio();

create table partes_especificas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  parte_id uuid not null references partes_catalogo(id),
  identificador text,
  costo_real numeric not null default 0, -- cosechadas: default 0, editable
  laptop_asignada_id uuid references laptops(id),
  origen parte_origen_t not null default 'compra',
  cosechada_de_laptop_id uuid references laptops(id)
);

create table laptop_partes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  laptop_id uuid not null references laptops(id) on delete cascade,
  parte_id uuid not null references partes_catalogo(id),
  parte_especifica_id uuid references partes_especificas(id),
  costo_aplicado numeric not null, -- promedio del momento, o costo_real si es específica
  fecha date not null default current_date
);

-- ============ 2.4 Paquetes: ítems y prorrateo ============
create table paquete_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  paquete_id uuid not null references paquetes(id) on delete cascade,
  tipo paquete_item_tipo_t not null,
  ref_id uuid, -- laptop o parte; null si personal
  descripcion text,
  volumen_pie3 numeric not null default 0,    -- base del prorrateo del FLETE
  valor_declarado numeric not null default 0, -- base del prorrateo del SEGURO (§4.3)
  flete_prorrateado numeric,
  seguro_prorrateado numeric
);

-- ============ 2.5 Costos por línea (única fuente de verdad) ============
create table costo_lineas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ambito costo_ambito_t not null,
  ambito_id uuid not null,
  tipo costo_tipo_t not null,
  monto_estimado numeric,
  estimado_congelado_at timestamptz,
  monto_real numeric, -- null = pendiente; ADMITE NEGATIVOS (ej. comisión Zinli favorable)
  fecha_real timestamptz,
  moneda moneda_t not null default 'USD',
  movimiento_id uuid -- FK a movimientos (se agrega tras crear movimientos)
);
create index costo_lineas_ambito_idx on costo_lineas (user_id, ambito, ambito_id);

-- ============ 2.6 Reparto de lotes (fijo e inmutable) ============
-- PRECISIÓN: el reparto se congela AL COMPLETAR LA REVISIÓN FÍSICA (cuando se conocen
-- partes incluidas y detalles), vía congelar_reparto_lote(). El costo PROYECTADO
-- congelado al comprar (costo_lineas del lote) no cambia.
create table lote_reparto (
  lote_id uuid not null references lotes(id),
  laptop_id uuid not null references laptops(id),
  user_id uuid not null references auth.users(id),
  valor_esperado_al_comprar numeric not null,
  proporcion numeric not null,
  costo_asignado numeric not null,
  primary key (lote_id, laptop_id)
);

-- ============ 2.7 Ventas, compradores y garantía ============
create table compradores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nombre text not null,
  telefono text,
  notas text
);

create table ventas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  laptop_id uuid not null references laptops(id),
  comprador_id uuid references compradores(id),
  fecha date not null default current_date,
  precio_venta numeric not null, -- siempre en USD equivalente
  moneda moneda_t not null default 'USD',
  monto_ves numeric,
  tasa_implicita numeric,
  estado venta_estado_t not null default 'activa',
  garantia_hasta date generated always as ((fecha + interval '4 months')::date) stored
  -- ganancia_bruta / ganancia_neta: VISTA v_ventas_ganancia, nunca columnas guardadas
);

-- ============ 2.8 Dinero multi-moneda ============
create table cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nombre text not null, -- Binance, Zinli, Efectivo USD, Efectivo Bs, PayPal…
  moneda moneda_t not null,
  unique (user_id, nombre)
);

create table movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  cuenta_id uuid not null references cuentas(id),
  fecha date not null default current_date,
  tipo mov_tipo_t not null,
  monto numeric not null check (monto > 0),
  categoria mov_categoria_t not null default 'negocio',
  concepto text,
  venta_id uuid references ventas(id),
  lote_id uuid references lotes(id),
  costo_linea_id uuid references costo_lineas(id)
);
alter table costo_lineas add constraint costo_lineas_movimiento_fk
  foreign key (movimiento_id) references movimientos(id);

create table conversiones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  fecha date not null default current_date,
  movimiento_origen_id uuid not null references movimientos(id),
  movimiento_destino_id uuid not null references movimientos(id),
  monto_origen numeric not null,
  monto_destino numeric not null,
  nota text
  -- tasa implícita = monto_origen / monto_destino (exacta y auditable)
  -- §13: el RESULTADO CAMBIARIO (ganancia/pérdida del cambio de dinero) se captura
  -- ÚNICAMENTE aquí — nunca como costo_linea de lotes u órdenes
);

create table tasas_dia (
  user_id uuid not null references auth.users(id),
  fecha date not null,
  tipo tasa_tipo_t not null,
  valor numeric not null,
  primary key (user_id, fecha, tipo)
);

create table por_cobrar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  persona text not null,
  monto numeric not null,
  moneda moneda_t not null default 'USD',
  fecha date not null default current_date,
  estado deuda_estado_t not null default 'pendiente',
  abonado numeric not null default 0,
  notas text
);

create table por_pagar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  persona text not null,
  monto numeric not null,
  moneda moneda_t not null default 'USD',
  fecha date not null default current_date,
  estado deuda_estado_t not null default 'pendiente',
  abonado numeric not null default 0,
  notas text
);

-- ============ 2.9 Extensión / evaluaciones ============
create table listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ebay_item_id text not null,
  url text,
  titulo text,
  precio_visto numeric,
  fecha_visto timestamptz not null default now(),
  semaforo semaforo_t,
  specs_parseadas jsonb,
  precio_max_puja numeric,
  precio_puja_decente numeric,
  evaluacion_manual jsonb,
  estado listing_estado_t not null default 'visto',
  lote_id uuid references lotes(id), -- se llena al pulsar "Comprada"
  unique (user_id, ebay_item_id)
);

-- ============ VISTAS (valores derivados; security_invoker → RLS filtra por usuario) ============

create view paquete_costos with (security_invoker = true) as
select p.id as paquete_id,
  sum(cl.monto_real)     filter (where cl.tipo = 'envio_vzla') as flete_real,
  sum(cl.monto_real)     filter (where cl.tipo = 'seguro')     as seguro_real,
  sum(cl.monto_real)     filter (where cl.tipo = 'revision')   as revision_real,
  sum(cl.monto_estimado) filter (where cl.tipo = 'envio_vzla') as flete_estimado_lineas,
  sum(cl.monto_estimado) filter (where cl.tipo = 'seguro')     as seguro_estimado_lineas,
  sum(cl.monto_estimado) filter (where cl.tipo = 'revision')   as revision_estimada_lineas
from paquetes p
left join costo_lineas cl on cl.ambito = 'paquete' and cl.ambito_id = p.id
group by p.id;

-- Con RLS + security_invoker, cada usuario solo ve sus propias filas de ajustes_config
create function ajuste(p_clave text) returns numeric language sql stable as
$$ select coalesce((select delta from ajustes_config where clave = p_clave limit 1), 0) $$;

-- precio_sugerido = base ± ajustes − deducciones (config base: 8GB / 256GB / 14")
create view v_laptop_precio_sugerido with (security_invoker = true) as
select l.id as laptop_id,
  base.precio_base,
  base.precio_base
  + case when coalesce(l.cpu_tipo, m.cpu_tipo) = 'i7' and base.cpu_tipo = 'i5' then ajuste('i7_sobre_i5') else 0 end
  + floor(greatest(coalesce(l.ram_gb, 8) - 8, 0) / 8.0) * ajuste('ram_por_8gb')
  + floor(greatest(coalesce(l.ssd_gb, 256) - 256, 0) / 256.0) * ajuste('ssd_por_256gb')
  + case when l.pantalla_pulgadas >= 15 then ajuste('pantalla_grande')
         when l.pantalla_pulgadas <= 13 then ajuste('pantalla_pequena')
         else 0 end
  + case when l.pantalla_tactil then ajuste('pantalla_tactil') else 0 end
  - coalesce((select sum(ld.deduccion_aplicada) from laptop_detalles ld where ld.laptop_id = l.id), 0)
  as precio_sugerido
from laptops l
left join modelos m on m.id = l.modelo_id
left join lateral (
  select p.precio_base, p.cpu_tipo
  from precios_ideales p
  where l.cpu_gen between p.gen_desde and p.gen_hasta
    and (p.cpu_tipo = coalesce(l.cpu_tipo, m.cpu_tipo)
         or (coalesce(l.cpu_tipo, m.cpu_tipo) = 'i7' and p.cpu_tipo = 'i5'))
  order by (p.cpu_tipo = coalesce(l.cpu_tipo, m.cpu_tipo)) desc
  limit 1
) base on true;

-- Costos por laptop: proyectado (estimados congelados) / actual / directo (§4.4)
create view v_laptop_costos with (security_invoker = true) as
select l.id as laptop_id,
  coalesce(lr.costo_asignado, 0) as costo_lote,
  coalesce(pi.flete_prorrateado, 0) + coalesce(pi.seguro_prorrateado, 0) as prorrateo_paquete,
  coalesce(cl.total_estimado, 0) as lineas_estimado,
  coalesce(cl.total_actual, 0) as lineas_actual,
  coalesce(cl.partes_actual, 0) as partes_actual,
  coalesce(lr.costo_asignado, 0) + coalesce(cl.partes_actual, 0) as costo_directo,
  coalesce(lr.costo_asignado, 0) + coalesce(cl.total_estimado, 0) as costo_proyectado,
  coalesce(lr.costo_asignado, 0) + coalesce(cl.total_actual, 0)
    + coalesce(pi.flete_prorrateado, 0) + coalesce(pi.seguro_prorrateado, 0) as costo_final
from laptops l
left join lote_reparto lr on lr.laptop_id = l.id
left join lateral (
  select sum(x.flete_prorrateado) as flete_prorrateado, sum(x.seguro_prorrateado) as seguro_prorrateado
  from paquete_items x where x.tipo = 'laptop' and x.ref_id = l.id
) pi on true
left join lateral (
  select
    sum(c.monto_estimado) as total_estimado,
    sum(coalesce(c.monto_real, c.monto_estimado)) as total_actual,
    sum(coalesce(c.monto_real, c.monto_estimado)) filter (where c.tipo = 'parte') as partes_actual
  from costo_lineas c where c.ambito = 'laptop' and c.ambito_id = l.id
) cl on true;

-- Desviación estimado vs. real por tipo y laptop
create view v_laptop_desviacion with (security_invoker = true) as
select ambito_id as laptop_id, tipo,
  sum(monto_estimado) as estimado,
  sum(monto_real) as real,
  sum(monto_real) - sum(monto_estimado) as desviacion
from costo_lineas
where ambito = 'laptop'
group by ambito_id, tipo;

-- §13: Resultado cambiario — acumulado por período y par de cuentas.
-- Visible en Cuentas y en el Dashboard como línea SEPARADA de la ganancia por laptops.
create view v_resultado_cambiario with (security_invoker = true) as
select date_trunc('month', cv.fecha)::date as mes,
  co.nombre as cuenta_origen, cd.nombre as cuenta_destino,
  co.moneda as moneda_origen, cd.moneda as moneda_destino,
  count(*) as operaciones,
  sum(cv.monto_origen) as total_origen,
  sum(cv.monto_destino) as total_destino,
  -- misma moneda: ganancia(+) / pérdida(−) exacta; entre monedas: usar la tasa implícita
  case when co.moneda = cd.moneda then sum(cv.monto_destino - cv.monto_origen) end as resultado,
  avg(cv.monto_origen / nullif(cv.monto_destino, 0)) as tasa_implicita_promedio
from conversiones cv
join movimientos mo on mo.id = cv.movimiento_origen_id
join movimientos md on md.id = cv.movimiento_destino_id
join cuentas co on co.id = mo.cuenta_id
join cuentas cd on cd.id = md.cuenta_id
group by 1, co.nombre, cd.nombre, co.moneda, cd.moneda;

-- Ganancia (§4.4): SIEMPRE vista — refleja costos reales aunque lleguen después de la venta
create view v_ventas_ganancia with (security_invoker = true) as
select v.id as venta_id, v.laptop_id, v.fecha, v.estado, v.garantia_hasta,
  v.precio_venta,
  c.costo_directo, c.costo_final,
  v.precio_venta - c.costo_directo as ganancia_bruta,
  v.precio_venta - c.costo_final as ganancia_neta
from ventas v
join v_laptop_costos c on c.laptop_id = v.laptop_id;

-- ============ FUNCIONES ============

-- Prorrateo al recibir el paquete (§4.3): FLETE por volumen, SEGURO por valor declarado.
-- Ítems personales participan de ambos → gastos personales.
create function prorratear_paquete(p_id uuid) returns void language plpgsql as $$
declare
  v_vol numeric;
  v_val numeric;
  v_flete numeric;
  v_seguro numeric;
begin
  select sum(volumen_pie3), sum(valor_declarado) into v_vol, v_val
  from paquete_items where paquete_id = p_id;
  select coalesce(sum(monto_real) filter (where tipo = 'envio_vzla'), 0),
         coalesce(sum(monto_real) filter (where tipo = 'seguro'), 0)
    into v_flete, v_seguro
  from costo_lineas where ambito = 'paquete' and ambito_id = p_id;

  update paquete_items set
    flete_prorrateado  = v_flete  * volumen_pie3    / nullif(v_vol, 0),
    seguro_prorrateado = v_seguro * valor_declarado / nullif(v_val, 0)
  where paquete_id = p_id;
end $$;

-- Sugerencia automática falta_partes → lista_para_venta (la confirmación es del usuario)
create view v_sugerencia_partes_completas with (security_invoker = true) as
select l.id as laptop_id, l.alias
from laptops l
where l.estado = 'falta_partes'
  and not exists (
    select 1 from costo_lineas c
    where c.ambito = 'laptop' and c.ambito_id = l.id
      and c.tipo = 'parte' and c.monto_real is null
  );

-- ============ 2.3b Órdenes de partes — costo ATERRIZADO (§9) ============
create table ordenes_partes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  fecha date not null default current_date,
  origen origen_compra_t not null default 'ebay', -- §12
  fuente text, -- eBay, Amazon, AliExpress…
  envio_usa numeric not null default 0,
  fees numeric not null default 0, -- impuesto/comisión si aplica
  notas text
);

create table orden_partes_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  orden_id uuid not null references ordenes_partes(id) on delete cascade,
  parte_id uuid not null references partes_catalogo(id),
  cantidad numeric not null check (cantidad > 0),
  precio_unitario numeric not null,
  prorrateo numeric,          -- envío+fees asignados al ítem (total del ítem, no unitario)
  prorrateo_manual boolean not null default false, -- true = editado por orden (caso baterías), no se recalcula
  recibido boolean not null default false
);

-- Prorrateo POR VALOR por default; los ítems con prorrateo_manual=true conservan el suyo
create function prorratear_orden_partes(p_orden uuid) returns void language plpgsql as $$
declare
  v_gastos numeric;
  v_manual numeric;
  v_valor_auto numeric;
begin
  select o.envio_usa + o.fees into v_gastos from ordenes_partes o where o.id = p_orden;
  select coalesce(sum(prorrateo) filter (where prorrateo_manual), 0),
         coalesce(sum(cantidad * precio_unitario) filter (where not prorrateo_manual), 0)
    into v_manual, v_valor_auto
  from orden_partes_items where orden_id = p_orden;

  update orden_partes_items set
    prorrateo = (v_gastos - v_manual) * (cantidad * precio_unitario) / nullif(v_valor_auto, 0)
  where orden_id = p_orden and not prorrateo_manual;
end $$;

-- Recepción: entra a inventario a costo ATERRIZADO (precio + prorrateo de envío/fees).
-- El flete a Venezuela se suma después vía paquete_items.
create function recibir_orden_partes(p_orden uuid) returns void language plpgsql as $$
declare it record;
begin
  perform prorratear_orden_partes(p_orden);
  for it in select * from orden_partes_items where orden_id = p_orden and not recibido loop
    insert into partes_compras (user_id, parte_id, cantidad, costo_unitario)
    values (it.user_id, it.parte_id, it.cantidad,
            it.precio_unitario + coalesce(it.prorrateo, 0) / it.cantidad);
    update orden_partes_items set recibido = true where id = it.id;
  end loop;
end $$;

-- ============ 2.3c Partes encontradas en lotes — valor nominal (§10) ============
create table lote_partes_encontradas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  lote_id uuid not null references lotes(id) on delete cascade,
  parte_id uuid not null references partes_catalogo(id),
  cantidad numeric not null check (cantidad > 0),
  valor_nominal_aplicado numeric not null, -- default partes_catalogo.valor_nominal, editable
  en_stock boolean not null default false
);

-- Congela el reparto FIJO del lote AL COMPLETAR LA REVISIÓN FÍSICA (§2.6):
--   repartible = costo del lote (subasta+envío+zinli+ebay; real si existe) − Σ nominales encontradas
--   pesos = precio sugerido vigente de cada laptop (fallback: partes iguales)
--   lote SOLO de partes: el total se distribuye entre las partes por valor nominal
create function congelar_reparto_lote(p_lote uuid) returns void language plpgsql as $$
declare
  v_costo numeric;
  v_nominales numeric;
  v_pesos numeric;
  v_n int;
begin
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
