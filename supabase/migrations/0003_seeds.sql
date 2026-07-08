-- TecnoFal — Migración 0003: seeds
-- `modelos` (GLOBAL): se inserta aquí una sola vez.
-- Config POR USUARIO (parametros, precios_ideales, ajustes_config, detalles_catalogo,
-- partes_catalogo, cuentas): se siembra como PLANTILLA al crear cada usuario
-- (trigger en auth.users → fn_seed_usuario), no como filas globales.

-- ============ modelos — semilla Apéndice A (compartida) ============
-- regla: ram_soldada = total → bloqueada; revisar → advertencia ⚠ antes de pujar

-- Dell Latitude / XPS
insert into modelos (marca, modelo, ram_soldada, regla_compra, motivo_regla, notas) values
  ('Dell', 'Latitude 7390', 'no', 'normal', null, '1 slot SODIMM'),
  ('Dell', 'Latitude 7490', 'no', 'normal', null, '2 slots'),
  ('Dell', 'Latitude 7400', 'no', 'normal', null, 'Clamshell: 2 slots. ¡La versión 2-en-1 es soldada!'),
  ('Dell', 'Latitude 7400 2-in-1', 'total', 'bloqueada', 'RAM soldada LPDDR3', null),
  ('Dell', 'Latitude 7410', 'total', 'bloqueada', 'RAM soldada LPDDR4x', null),
  ('Dell', 'Latitude 7420', 'total', 'bloqueada', 'RAM soldada LPDDR4x', null),
  ('Dell', 'Latitude 7430', 'total', 'bloqueada', 'RAM soldada LPDDR4x', null),
  ('Dell', 'Latitude 7310', 'total', 'bloqueada', 'RAM soldada LPDDR4x', null),
  ('Dell', 'Latitude 7320', 'total', 'bloqueada', 'RAM soldada LPDDR4x', null),
  ('Dell', 'Latitude 7330', 'total', 'bloqueada', 'RAM soldada LPDDR4x', null),
  ('Dell', 'Latitude 5320', 'total', 'bloqueada', 'RAM soldada LPDDR4x (13.3")', null),
  ('Dell', 'Latitude 5300', 'revisar', 'normal', null, 'SODIMM por confirmar'),
  ('Dell', 'Latitude 5310', 'revisar', 'normal', null, 'SODIMM por confirmar'),
  ('Dell', 'Latitude 5400', 'no', 'normal', null, '2 slots'),
  ('Dell', 'Latitude 5500', 'no', 'normal', null, '2 slots'),
  ('Dell', 'Latitude 5510', 'no', 'normal', null, '2 slots'),
  ('Dell', 'Latitude 5430', 'no', 'normal', null, '2 slots'),
  ('Dell', 'Latitude 5440', 'no', 'normal', null, '2 slots'),
  ('Dell', 'Latitude 5410', 'no', 'bloqueada', 'Carcasa se marca fácil', null),
  ('Dell', 'Latitude 5420', 'no', 'bloqueada', 'Carcasa se marca fácil', null),
  ('Dell', 'Latitude 3301', 'revisar', 'normal', null, 'Soldada/mixto'),
  ('Dell', 'Latitude 3310', 'revisar', 'normal', null, 'Soldada/mixto'),
  ('Dell', 'Latitude 9410', 'total', 'bloqueada', 'RAM soldada', null),
  ('Dell', 'Latitude 9420', 'total', 'bloqueada', 'RAM soldada', null),
  ('Dell', 'Latitude 9510', 'total', 'bloqueada', 'RAM soldada', null),
  ('Dell', 'XPS 13', 'total', 'bloqueada', 'RAM soldada (todas las gens 8va+)', null),
  ('Dell', 'XPS 15', 'no', 'normal', null, '2 slots');

-- Lenovo ThinkPad
insert into modelos (marca, modelo, ram_soldada, regla_compra, motivo_regla, notas) values
  ('Lenovo', 'ThinkPad T480', 'no', 'normal', null, '2 slots'),
  ('Lenovo', 'ThinkPad T480s', 'parcial', 'normal', null, '1 soldada + 1 slot'),
  ('Lenovo', 'ThinkPad T490', 'parcial', 'normal', null, '1 soldada + 1 slot'),
  ('Lenovo', 'ThinkPad T14 Gen 1', 'parcial', 'normal', null, '1 soldada + 1 slot'),
  ('Lenovo', 'ThinkPad T14 Gen 2', 'parcial', 'normal', null, '1 soldada + 1 slot'),
  ('Lenovo', 'ThinkPad T490s', 'total', 'bloqueada', 'RAM soldada', null),
  ('Lenovo', 'ThinkPad T495s', 'total', 'bloqueada', 'RAM soldada', null),
  ('Lenovo', 'ThinkPad T14s', 'total', 'bloqueada', 'RAM soldada (todas las gens)', null),
  ('Lenovo', 'ThinkPad X1 Carbon', 'total', 'bloqueada', 'RAM soldada (todas las gens)', null),
  ('Lenovo', 'ThinkPad X1 Yoga', 'total', 'bloqueada', 'RAM soldada', null),
  ('Lenovo', 'ThinkPad X280', 'total', 'bloqueada', 'RAM soldada', null),
  ('Lenovo', 'ThinkPad X390', 'total', 'bloqueada', 'RAM soldada', null),
  ('Lenovo', 'ThinkPad X13', 'total', 'bloqueada', 'RAM soldada', null),
  ('Lenovo', 'ThinkPad E14', 'parcial', 'normal', null, 'Gen 2+: 1 soldada + 1 slot'),
  ('Lenovo', 'ThinkPad E15', 'parcial', 'normal', null, 'Gen 2+: 1 soldada + 1 slot'),
  ('Lenovo', 'ThinkPad L380', 'revisar', 'normal', null, 'Soldada o mixto'),
  ('Lenovo', 'ThinkPad L390', 'revisar', 'normal', null, 'Soldada o mixto'),
  ('Lenovo', 'ThinkPad L13', 'revisar', 'normal', null, 'Soldada o mixto'),
  ('Lenovo', 'ThinkPad L14', 'no', 'normal', null, '2 slots'),
  ('Lenovo', 'ThinkPad L15', 'no', 'normal', null, '2 slots'),
  ('Lenovo', 'ThinkPad T14 Gen 3', 'parcial', 'normal', null, 'Versión DDR4: 1 soldada + 1 slot');

-- HP EliteBook / ProBook
insert into modelos (marca, modelo, ram_soldada, regla_compra, motivo_regla)
select 'HP', 'EliteBook ' || serie || ' G' || g, 'no'::ram_soldada_t, 'normal'::regla_compra_t, null
from unnest(array['830','840','850']) serie, generate_series(5, 8) g;

insert into modelos (marca, modelo, ram_soldada, regla_compra, motivo_regla) values
  ('HP', 'EliteBook 840 G1', 'no', 'condicional', 'Bisagras frágiles'),
  ('HP', 'EliteBook 840 G2', 'no', 'condicional', 'Bisagras frágiles'),
  ('HP', 'EliteBook 840 Aero G8', 'revisar', 'normal', 'RAM por confirmar'),
  ('HP', 'EliteBook x360 1030', 'total', 'bloqueada', 'RAM soldada (todas)'),
  ('HP', 'EliteBook x360 1040', 'total', 'bloqueada', 'RAM soldada (todas)'),
  ('HP', 'Elite Dragonfly', 'total', 'bloqueada', 'RAM soldada (todas)'),
  ('HP', 'EliteBook 1040', 'total', 'bloqueada', 'RAM soldada G4+ (no x360)'),
  ('HP', 'ProBook 635 Aero', 'revisar', 'normal', 'RAM por confirmar');

insert into modelos (marca, modelo, ram_soldada, regla_compra, motivo_regla)
select 'HP', 'ProBook ' || serie || ' G' || g, 'no'::ram_soldada_t, 'normal'::regla_compra_t, null
from unnest(array['440','450']) serie, generate_series(5, 9) g;

-- ============ Plantilla por usuario ============
create function public.fn_seed_usuario(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into parametros (user_id, clave, valor, descripcion) values
    (p_user, 'impuesto_ebay', 1.07, 'Multiplicador de impuesto eBay (semilla 1.07)'),
    (p_user, 'seguro_valor_declarado', 0.05, 'Seguro sobre valor declarado (siempre)'),
    (p_user, 'seguro_zoom', 0.01, 'Recargo adicional Zoom (+1% si aplica)'),
    (p_user, 'comision_zinli_estimada', 0.05, '§13: OPCIONAL — solo para ser conservador al calcular S_max/S_decente. NO genera línea de costo: el resultado cambiario real vive en conversiones.'),
    (p_user, 'costo_revision', 5, 'Revisión estimada por laptop (el real puede ser 0)'),
    (p_user, 'ganancia_minima', 0.50, 'Margen mínimo (semáforo amarillo)'),
    (p_user, 'ganancia_decente', 0.70, 'Margen decente (semáforo verde)'),
    (p_user, 'tarifa_barco_por_pie3', null, 'SIN SEMILLA: cargar valor vigente; varía en el tiempo'),
    (p_user, 'tarifa_avion_zoom_por_kg', null, 'SIN SEMILLA: cargar valor vigente; varía en el tiempo')
  on conflict do nothing;

  insert into precios_ideales (user_id, cpu_tipo, gen_desde, gen_hasta, precio_base) values
    (p_user, 'i5', 4, 5, 160), (p_user, 'i5', 6, 7, 180), (p_user, 'i5', 8, 9, 220),
    (p_user, 'i5', 10, 10, 240), (p_user, 'i5', 11, 11, 260);

  insert into ajustes_config (user_id, clave, delta, nota) values
    (p_user, 'i7_sobre_i5', 20, 'i7 sobre i5, misma generación'),
    (p_user, 'ram_por_8gb', 10, 'Nominal +$20; actual +$10 por exceso de stock — fluctúa con inventario'),
    (p_user, 'ssd_por_256gb', 20, 'Por cada 256GB extra'),
    (p_user, 'pantalla_grande', 20, '15.6"'),
    (p_user, 'pantalla_tactil', 10, null),
    (p_user, 'pantalla_pequena', -20, '12.5"')
  on conflict do nothing;

  insert into detalles_catalogo (user_id, nombre, deduccion_base, categoria) values
    (p_user, 'Carcasa marcada', 10, 'carcasa'),
    (p_user, 'Carcasa rota/fisurada', 25, 'carcasa'),
    (p_user, 'Pantalla con manchas', 20, 'pantalla'),
    (p_user, 'Pantalla con líneas', 30, 'pantalla'),
    (p_user, 'Puerto USB malo', 10, 'puertos'),
    (p_user, 'Puerto HDMI malo', 10, 'puertos'),
    (p_user, 'Batería < 3h', 15, 'bateria'),
    (p_user, 'Batería < 1h', 30, 'bateria'),
    (p_user, 'Tecla(s) faltante(s)', 10, 'teclado'),
    (p_user, 'Falla botón touchpad', 10, 'touchpad'),
    (p_user, 'Corneta dañada', 10, 'audio'),
    (p_user, 'Bisagra floja', 15, 'carcasa')
  on conflict do nothing;

  -- precio_referencia = costo ATERRIZADO estimado; valor_nominal = partes halladas en lotes (§10)
  insert into partes_catalogo (user_id, nombre, precio_referencia, valor_nominal, volumen_pie3, peso_kg) values
    (p_user, 'Cargador 65W punta fina', 12, 4, 0.02, 0.35),
    (p_user, 'Cargador 65W USB-C', 15, 4, 0.02, 0.35),
    (p_user, 'Batería (genérica por familia)', 25, 3, 0.03, 0.30),
    (p_user, 'Cable de batería', 5, 1, 0.005, 0.02),
    (p_user, 'SSD 256GB', 22, 5, 0.005, 0.05),
    (p_user, 'SSD 512GB', 35, 8, 0.005, 0.05),
    (p_user, 'RAM 8GB DDR4', 14, 4, 0.003, 0.02),
    (p_user, 'RAM 16GB DDR4', 28, 8, 0.003, 0.02),
    (p_user, 'Pantalla 14" FHD', 45, 10, 0.05, 0.40),
    (p_user, 'Teclado', 18, 5, 0.02, 0.20),
    (p_user, 'Tapa/carcasa', 20, 5, 0.05, 0.30),
    (p_user, 'Corneta', 8, 2, 0.01, 0.05)
  on conflict do nothing;

  insert into cuentas (user_id, nombre, moneda) values
    (p_user, 'Binance', 'USD'), (p_user, 'Zinli', 'USD'), (p_user, 'Efectivo USD', 'USD'),
    (p_user, 'Efectivo Bs', 'VES'), (p_user, 'PayPal', 'USD')
  on conflict do nothing;
end $$;

-- Onboarding automático al crear el usuario en Supabase Auth
create function public.fn_on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_seed_usuario(new.id);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.fn_on_auth_user_created();
