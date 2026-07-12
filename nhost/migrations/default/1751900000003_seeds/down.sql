drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.fn_on_auth_user_created();
drop function if exists public.fn_seed_usuario(uuid);
delete from modelos;
