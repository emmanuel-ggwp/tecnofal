-- Migración 0018: endurece 0017 (mínimo privilegio) + cierra el gap de service_role.
--
-- 1) `anon` no necesita GRANT de tabla en esta app: toda pantalla requiere sesión y
--    ningún flujo (web ni extensión) consulta `public` sin JWT válido. `anon` tenía
--    0 políticas RLS aplicables (verificado), así que el GRANT de 0017 era inerte —
--    pero la anon key es pública (embebida en el bundle/.crx), así que retirarlo
--    reduce superficie: si una política futura se escribe mal (`to public` en vez de
--    `to authenticated`), sin este GRANT de por medio esa fuga necesitaría un segundo
--    error independiente para materializarse.
-- 2) `service_role` ya tiene el atributo BYPASSRLS (lo fija Supabase al crear el rol),
--    pero BYPASSRLS solo salta la evaluación de políticas — el GRANT de tabla base
--    sigue siendo obligatorio. Sin él, ni siquiera el backend/admin (usado por
--    e2e/helpers/db.ts vía clienteAdmin(), nunca expuesto al navegador) puede leer
--    o escribir. Se lo otorgamos completo: es el rol de confianza total del proyecto.

revoke select, insert, update, delete on all tables in schema public from anon;
revoke usage, select on all sequences in schema public from anon;
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;
alter default privileges in schema public
  revoke usage, select on sequences from anon;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
