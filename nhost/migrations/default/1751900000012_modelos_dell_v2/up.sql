-- Migración 0012: (a) datos de detalles 'specs' — movidos desde la 0011 porque el valor
-- nuevo del enum debe estar commiteado antes de usarse (55P04); (b) referencia Dell v2.

-- (a1) Mover items frecuentes a la categoría specs (todas las cuentas; corre como owner)
update detalles_catalogo
  set categoria = 'specs'
  where nombre in ('Tecla(s) faltante(s)', 'Carcasa marcada');

-- (a2) Nuevos detalles specs POR USUARIO — detalles_catalogo es por-usuario:
-- user_id NOT NULL y unique(user_id, nombre); el original de 0011 insertaba sin
-- user_id y con on conflict (nombre): fallaba siempre.
do $$
declare u uuid;
begin
  for u in select distinct user_id from parametros loop
    insert into detalles_catalogo (user_id, nombre, deduccion_base, categoria) values
      (u, 'Solo 4GB RAM',   15, 'specs'),
      (u, 'Solo 128GB SSD', 10, 'specs'),
      (u, 'Solo 128GB HDD', 20, 'specs'),
      (u, 'RAM soldada',     0, 'specs'),
      (u, 'SSD soldado',     0, 'specs')
    on conflict (user_id, nombre) do update
      set categoria = excluded.categoria,
          deduccion_base = excluded.deduccion_base;
  end loop;
end $$;

-- (a3) Usuarios FUTUROS: fn_seed_extra (0004) ahora también siembra los detalles specs
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

-- (b) Referencia Dell v2 (+43 modelos)
values
  ('Dell', 'Latitude 7370',         'i5',  6,  'total',  'bloqueada',   'RAM LPDDR3 soldada (Core M/Y-series)'),
  ('Dell', 'Latitude 7280',         'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Latitude 7290',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Latitude 7380',         'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Latitude 7390',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Latitude 7390 2-in-1',  'i5',  8,  'total',  'bloqueada',   'RAM LPDDR3 soldada — variante 2-in-1 (la clamshell SÍ es upgradeable)'),
  ('Dell', 'Latitude 5300',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Latitude 5310',         'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Latitude 3480',         'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Latitude 3580',         'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Latitude 3400',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 5368 2-in-1',  'i5',  6,  'no',     'normal',      null),
  ('Dell', 'Inspiron 5378 2-in-1',  'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Inspiron 5379 2-in-1',  'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7368 2-in-1',  'i5',  6,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7378 2-in-1',  'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7373 2-in-1',  'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7386 2-in-1',  'i5',  8,  'total',  'bloqueada',   'RAM LPDDR3 soldada'),
  ('Dell', 'Inspiron 7391 2-in-1',  'i5',  10, 'total',  'bloqueada',   'RAM LPDDR3 soldada'),
  ('Dell', 'Inspiron 3467',         'i5',  7,  'no',     'condicional', 'Solo 1 slot SODIMM'),
  ('Dell', 'Inspiron 5480',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 5482 2-in-1',  'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 5488',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 5490',         'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Inspiron 5493',         'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Inspiron 5494',         'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Inspiron 7460',         'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7472',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7490',         'i5',  8,  'total',  'bloqueada',   'RAM LPDDR3 soldada'),
  ('Dell', 'Inspiron 5770',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 3780',         'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7773 2-in-1',  'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7786 2-in-1',  'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Inspiron 7791 2-in-1',  'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Vostro 5370',           'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Vostro 5391',           'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Vostro 5471',           'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Vostro 5481',           'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Vostro 5490',           'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Vostro 5401',           'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Vostro 5402',           'i5',  11, 'no',     'normal',      null),
  ('Dell', 'Vostro 5568',           'i5',  7,  'no',     'normal',      null),
  ('Dell', 'Vostro 3583',           'i5',  8,  'no',     'normal',      null),
  ('Dell', 'Vostro 5501',           'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Vostro 5502',           'i5',  11, 'no',     'normal',      null),
  ('Dell', 'XPS 15 9575 2-in-1',    'i7',  8,  'total',  'bloqueada',   'RAM soldada — Kaby Lake-G + AMD Radeon Vega (único XPS 15 con RAM soldada)'),
  ('Dell', 'Precision M2800',        'i5',  4,  'no',     'normal',      null),
  ('Dell', 'Precision M3800',        'i7',  4,  'no',     'normal',      null),
  ('Dell', 'Precision 3541',         'i5',  9,  'no',     'normal',      null),
  ('Dell', 'Precision 3550',         'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Precision 3551',         'i5',  10, 'no',     'normal',      null),
  ('Dell', 'Precision 3560',         'i5',  11, 'no',     'normal',      null),
  ('Dell', 'Precision 5750',         'i7',  10, 'no',     'normal',      null)
on conflict (marca, modelo) do update
  set cpu_tipo     = excluded.cpu_tipo,
      cpu_gen      = excluded.cpu_gen,
      ram_soldada  = excluded.ram_soldada,
      regla_compra = excluded.regla_compra,
      motivo_regla = excluded.motivo_regla;
