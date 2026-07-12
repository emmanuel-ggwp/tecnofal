-- TecnoFal — Migración 0004: parámetro envio_vzla_por_laptop
-- El panel usa $ por laptop para el envío a Venezuela (típico barco: $12), editable
-- por evaluación. Este es su default configurable (principio nº 5: nada hardcodeado).

create function public.fn_seed_extra(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into parametros (user_id, clave, valor, descripcion) values
    (p_user, 'envio_vzla_por_laptop', 12, 'Envío Vzla en $ por laptop (típico barco $12); default del panel, editable por evaluación')
  on conflict do nothing;
end $$;

-- Usuarios nuevos: el trigger siembra plantilla + extras
create or replace function public.fn_on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_seed_usuario(new.id);
  perform public.fn_seed_extra(new.id);
  return new;
end $$;

-- Usuarios existentes
do $$
declare u uuid;
begin
  for u in select distinct user_id from parametros loop
    perform public.fn_seed_extra(u);
  end loop;
end $$;
