-- Reversa best-effort de la 0024: restaura defaults previos y re-bloquea exactamente los
-- modelos que esta migración desbloqueó (no se pueden distinguir por columna tras el up,
-- por eso se listan explícitamente en vez de usar el criterio ram_soldada = 'total').

update detalles_catalogo
  set deduccion_base = 0
  where nombre in ('RAM soldada', 'SSD soldado');

create or replace function public.fn_seed_extra(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into parametros (user_id, clave, valor, descripcion) values
    (p_user, 'envio_vzla_por_laptop', 12, 'Envío Vzla en $ por laptop (típico barco $12); default del panel, editable por evaluación')
  on conflict do nothing;

  insert into detalles_catalogo (user_id, nombre, deduccion_base, categoria) values
    (p_user, 'Solo 4GB RAM',   15, 'specs'),
    (p_user, 'Solo 128GB SSD', 10, 'specs'),
    (p_user, 'Solo 128GB HDD', 20, 'specs'),
    (p_user, 'RAM soldada',     0, 'specs'),
    (p_user, 'SSD soldado',     0, 'specs')
  on conflict (user_id, nombre) do nothing;

  update detalles_catalogo
    set categoria = 'specs'
    where user_id = p_user and nombre in ('Tecla(s) faltante(s)', 'Carcasa marcada');
end $$;

update modelos
  set ssd_soldado = false
  where marca = 'Dell' and modelo = 'XPS 13 9310 2-in-1';

update modelos
  set regla_compra = 'bloqueada', motivo_regla = v.motivo
from (values
  ('Dell', 'Latitude 7400 2-in-1', 'RAM soldada LPDDR3'),
  ('Dell', 'Latitude 7410', 'RAM soldada LPDDR4x'),
  ('Dell', 'Latitude 7420', 'RAM soldada LPDDR4x'),
  ('Dell', 'Latitude 7430', 'RAM soldada LPDDR4x'),
  ('Dell', 'Latitude 7310', 'RAM soldada LPDDR4x'),
  ('Dell', 'Latitude 7320', 'RAM soldada LPDDR4x'),
  ('Dell', 'Latitude 7330', 'RAM soldada LPDDR4x'),
  ('Dell', 'Latitude 5320', 'RAM soldada LPDDR4x (13.3")'),
  ('Dell', 'Latitude 9410', 'RAM soldada'),
  ('Dell', 'Latitude 9420', 'RAM soldada'),
  ('Dell', 'Latitude 9510', 'RAM soldada'),
  ('Dell', 'XPS 13', 'RAM soldada (todas las gens 8va+)'),
  ('Dell', 'XPS 13 9310 2-in-1', 'RAM y SSD soldados — sin upgrade posible'),
  ('Dell', 'Latitude 7370', 'RAM LPDDR3 soldada (Core M/Y-series)'),
  ('Dell', 'Latitude 7390 2-in-1', 'RAM LPDDR3 soldada — variante 2-in-1 (la clamshell SÍ es upgradeable)'),
  ('Dell', 'Inspiron 7386 2-in-1', 'RAM LPDDR3 soldada'),
  ('Dell', 'Inspiron 7391 2-in-1', 'RAM LPDDR3 soldada'),
  ('Dell', 'Inspiron 7490', 'RAM LPDDR3 soldada'),
  ('Dell', 'XPS 15 9575 2-in-1', 'RAM soldada — Kaby Lake-G + AMD Radeon Vega (único XPS 15 con RAM soldada)'),
  ('Lenovo', 'ThinkPad T490s', 'RAM soldada'),
  ('Lenovo', 'ThinkPad T495s', 'RAM soldada'),
  ('Lenovo', 'ThinkPad T14s', 'RAM soldada (todas las gens)'),
  ('Lenovo', 'ThinkPad X1 Carbon', 'RAM soldada (todas las gens)'),
  ('Lenovo', 'ThinkPad X1 Yoga', 'RAM soldada'),
  ('Lenovo', 'ThinkPad X280', 'RAM soldada'),
  ('Lenovo', 'ThinkPad X390', 'RAM soldada'),
  ('Lenovo', 'ThinkPad X13', 'RAM soldada'),
  ('HP', 'EliteBook x360 1030', 'RAM soldada (todas)'),
  ('HP', 'EliteBook x360 1040', 'RAM soldada (todas)'),
  ('HP', 'Elite Dragonfly', 'RAM soldada (todas)'),
  ('HP', 'EliteBook 1040', 'RAM soldada G4+ (no x360)')
) as v(marca, modelo, motivo)
where modelos.marca = v.marca and modelos.modelo = v.modelo;
