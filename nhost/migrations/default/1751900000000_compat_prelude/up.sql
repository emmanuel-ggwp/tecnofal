-- Prelude de compatibilidad Nhost ⇄ Supabase (§21).
-- En Supabase: auth.uid() y los roles ya existen → todo esto es no-op.
-- En Nhost: crea el stub auth.uid() (lee X-Hasura-User-Id de la sesión Hasura)
-- y los roles que las políticas RLS referencian. Las políticas quedan DORMIDAS
-- bajo Hasura (conecta como dueño de las tablas) y activas el día de migrar.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  -- service_role: en Supabase lo crea el CLI/la plataforma con BYPASSRLS antes de
  -- correr migraciones de usuario (nunca hace falta crearlo ahí). En Nhost no existe
  -- por defecto — sin este stub, cualquier migración que le otorgue GRANT (ej. 0018)
  -- falla con "role service_role does not exist" y tumba toda la cadena.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;
-- En Supabase, USAGE sobre `auth` para anon/authenticated/service_role lo concede
-- la plataforma antes de correr migraciones de usuario (verificado: siempre presente).
-- En este stub de Nhost hay que darlo explícito, o cualquier trigger/policy que
-- llame a auth.uid() por nombre calificado falla con "permission denied for schema auth".
grant usage on schema auth to anon, authenticated, service_role;

do $$ begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    create function auth.uid() returns uuid language sql stable as
    $f$ select nullif(coalesce(current_setting('hasura.user', true)::json ->> 'x-hasura-user-id', ''), '')::uuid $f$;
  end if;
end $$;
