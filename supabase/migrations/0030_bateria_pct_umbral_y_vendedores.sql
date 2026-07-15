-- TecnoFal — Migración 0030: % de batería
-- (a) parámetro bateria_pct_umbral (por-usuario, dentro de `parametros`): por encima de este %
--     no hace falta presupuestar batería nueva (principio nº 5: nada hardcodeado).
-- (b) tabla GLOBAL/COMPARTIDA vendedores_bateria: vendedores de eBay conocidos por indicar el
--     % de batería en sus publicaciones — igual criterio que tipos_aviso/modelo_avisos (§23):
--     lo que un usuario descubre beneficia a todos. Solo se agrega conocimiento, nunca se pisa/borra.

-- (a) fn_seed_extra (0004, redefinida en 0012) ahora también siembra bateria_pct_umbral
create or replace function public.fn_seed_extra(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into parametros (user_id, clave, valor, descripcion) values
    (p_user, 'envio_vzla_por_laptop', 12, 'Envío Vzla en $ por laptop (típico barco $12); default del panel, editable por evaluación'),
    (p_user, 'bateria_pct_umbral', 70, 'Umbral % de salud de batería: por encima no hace falta presupuestar batería nueva')
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

-- Usuarios existentes: backfill del nuevo parámetro
do $$
declare u uuid;
begin
  for u in select distinct user_id from parametros loop
    insert into parametros (user_id, clave, valor, descripcion) values
      (u, 'bateria_pct_umbral', 70, 'Umbral % de salud de batería: por encima no hace falta presupuestar batería nueva')
    on conflict do nothing;
  end loop;
end $$;

-- (b) tabla global — mismo patrón que tipos_aviso/modelo_avisos (0007)
create table vendedores_bateria (
  id uuid primary key default gen_random_uuid(),
  vendedor text not null unique,
  user_id uuid references auth.users(id), -- autor, para auditar
  created_at timestamptz not null default now()
);

alter table vendedores_bateria enable row level security;
create policy vendedores_bateria_sel on public.vendedores_bateria for select to authenticated using (true);
create policy vendedores_bateria_ins on public.vendedores_bateria for insert to authenticated with check (true);
create trigger trg_autor before insert on public.vendedores_bateria for each row execute function fn_set_user_id();
