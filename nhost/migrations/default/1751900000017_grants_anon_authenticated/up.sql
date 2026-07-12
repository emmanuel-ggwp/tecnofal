-- Migración 0017: GRANTs de tabla para anon/authenticated (bug pre-existente en 0002_rls).
--
-- Postgres exige el GRANT de tabla ANTES de siquiera evaluar las políticas RLS: sin él,
-- toda consulta desde la API (aunque autenticada) falla con "permission denied for
-- table X" — las políticas de 0002_rls nunca llegan a ejecutarse. Confirmado con
-- information_schema.role_table_grants: ninguna de las 32 tablas de negocio tenía
-- SELECT/INSERT/UPDATE/DELETE otorgado a `authenticated` (solo TRIGGER/TRUNCATE/
-- REFERENCES, que Postgres concede a los dueños de FKs entrantes). Esto bloqueaba
-- CUALQUIER pantalla de la web, no solo una — hallado independientemente por los
-- agentes de plan-02 y plan-08 al verificar sus specs de Playwright.
--
-- Seguro: `anon` no tiene ninguna política RLS aplicable (0002_rls: "anon: sin
-- políticas → sin acceso a nada") — el GRANT de tabla por sí solo no expone ninguna
-- fila; RLS sigue siendo quien decide qué ve cada usuario autenticado.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Tablas futuras del schema public (creadas por el owner, patrón estándar de las
-- migraciones de este proyecto) heredan los mismos grants sin necesidad de repetir esto.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
