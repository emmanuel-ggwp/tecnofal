-- TecnoFal — Migración 0002: multi-usuario — trigger user_id + RLS por usuario (§2.10)
-- El user_id NUNCA se maneja en código cliente: viaja en el JWT, lo estampa este trigger
-- BEFORE INSERT y lo filtra RLS. La anon key viaja dentro del .crx y es extraíble:
-- sin sesión no se lee ni escribe nada.

-- Estampa user_id = auth.uid(); permite valor explícito solo cuando no hay sesión
-- (p. ej. la función de onboarding security definer que siembra plantillas).
create function fn_set_user_id() returns trigger language plpgsql as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'lotes','paquetes','paquete_items','laptops','laptop_condicion','laptop_detalles',
    'partes_catalogo','partes_stock','partes_compras','partes_especificas','laptop_partes',
    'costo_lineas','lote_reparto','compradores','ventas','cuentas','movimientos',
    'conversiones','tasas_dia','por_cobrar','por_pagar','listings',
    'precios_ideales','ajustes_config','detalles_catalogo','parametros',
    'ordenes_partes','orden_partes_items','lote_partes_encontradas'
  ] loop
    execute format('create trigger trg_user_id before insert on public.%I for each row execute function fn_set_user_id()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy usuario_propio on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- EXCEPCIÓN: `modelos` es global/compartida — SELECT para todo autenticado;
-- INSERT/UPDATE permitidos (el conocimiento crece para todos); DELETE no (sin política).
alter table modelos enable row level security;
create policy modelos_select on modelos for select to authenticated using (true);
create policy modelos_insert on modelos for insert to authenticated with check (true);
create policy modelos_update on modelos for update to authenticated using (true) with check (true);

-- Las vistas se crearon con security_invoker = true → heredan el filtro por usuario.
-- anon: sin políticas → sin acceso a nada.
