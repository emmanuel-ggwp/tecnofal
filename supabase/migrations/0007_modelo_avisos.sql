-- TecnoFal — Migración 0007 (§23): avisos de modelo creados por el usuario
-- El conocimiento de modelos pasa a `modelo_avisos` (extensible, auditable);
-- los campos regla_compra/motivo_regla/ram_soldada de `modelos` quedan como LEGADO
-- de lectura y se migran aquí. Globales/compartidos como `modelos` (§8).

create type severidad_aviso_t as enum ('bloquea','condiciona','advierte','nota');
create type origen_aviso_t as enum ('seed','usuario');

create table tipos_aviso (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  origen origen_aviso_t not null default 'usuario',
  user_id uuid references auth.users(id), -- autor (null = seed)
  created_at timestamptz not null default now()
);

create table modelo_avisos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references modelos(id) on delete cascade,
  tipo_aviso_id uuid not null references tipos_aviso(id),
  severidad severidad_aviso_t not null,
  motivo text,
  origen origen_aviso_t not null default 'usuario',
  user_id uuid references auth.users(id), -- autor, para auditar/revertir
  created_at timestamptz not null default now()
);
create index modelo_avisos_modelo_idx on modelo_avisos (modelo_id);

-- Globales (regla de modelos §8): SELECT/INSERT/UPDATE autenticados; sin DELETE
alter table tipos_aviso enable row level security;
alter table modelo_avisos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tipos_aviso','modelo_avisos'] loop
    execute format('create policy %I_sel on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('create trigger trg_autor before insert on public.%I for each row execute function fn_set_user_id()', t);
  end loop;
end $$;

-- Tipos semilla (catálogo extensible por el usuario)
insert into tipos_aviso (clave, nombre, origen) values
  ('ram_soldada', 'RAM soldada', 'seed'),
  ('ssd_soldado', 'SSD soldado', 'seed'),
  ('carcasa_se_marca', 'Carcasa se marca fácil', 'seed'),
  ('bisagras_fragiles', 'Bisagras frágiles', 'seed'),
  ('bloqueado', 'Bloqueado (general)', 'seed'),
  ('revisar', 'Revisar antes de pujar', 'seed');

-- Migración del conocimiento existente → avisos
insert into modelo_avisos (modelo_id, tipo_aviso_id, severidad, motivo, origen)
select m.id, t.id, 'bloquea', coalesce(m.motivo_regla, 'RAM totalmente soldada'), 'seed'
from modelos m join tipos_aviso t on t.clave = 'ram_soldada' where m.ram_soldada = 'total';

insert into modelo_avisos (modelo_id, tipo_aviso_id, severidad, motivo, origen)
select m.id, t.id, 'advierte', 'RAM posiblemente soldada — VERIFICAR service manual antes de pujar', 'seed'
from modelos m join tipos_aviso t on t.clave = 'revisar' where m.ram_soldada = 'revisar';

insert into modelo_avisos (modelo_id, tipo_aviso_id, severidad, motivo, origen)
select m.id, t.id, 'nota', 'RAM parcial: 1 soldada + 1 slot libre', 'seed'
from modelos m join tipos_aviso t on t.clave = 'ram_soldada' where m.ram_soldada = 'parcial';

insert into modelo_avisos (modelo_id, tipo_aviso_id, severidad, motivo, origen)
select m.id, t.id, 'advierte', 'SSD posiblemente soldado — revisar', 'seed'
from modelos m join tipos_aviso t on t.clave = 'ssd_soldado' where m.ssd_soldado;

insert into modelo_avisos (modelo_id, tipo_aviso_id, severidad, motivo, origen)
select m.id, t.id, 'bloquea', m.motivo_regla, 'seed'
from modelos m join tipos_aviso t
  on t.clave = case when m.motivo_regla ilike '%carcasa%' then 'carcasa_se_marca' else 'bloqueado' end
where m.regla_compra = 'bloqueada' and m.ram_soldada <> 'total';

insert into modelo_avisos (modelo_id, tipo_aviso_id, severidad, motivo, origen)
select m.id, t.id, 'condiciona', m.motivo_regla, 'seed'
from modelos m join tipos_aviso t
  on t.clave = case when m.motivo_regla ilike '%bisagra%' then 'bisagras_fragiles' else 'bloqueado' end
where m.regla_compra = 'condicional';

comment on column modelos.regla_compra is 'LEGADO §23: la fuente nueva es modelo_avisos';
comment on column modelos.motivo_regla is 'LEGADO §23: la fuente nueva es modelo_avisos';
