-- Migración 0024: RAM/SSD soldada dejan de bloquear la puja — pasan a advertencia +
-- deducción automática de $20 en el panel (ver packages/core parser.ts/eval.ts).

-- (a) Modelos bloqueados ÚNICAMENTE por RAM soldada total: se desbloquean. El campo
-- ram_soldada sigue en 'total' y ahora dispara advertencia + deducción, no bloqueo.
-- No toca modelos bloqueados por otra razón real (ram_soldada <> 'total', ej. carcasa/bisagras).
update modelos
  set regla_compra = 'normal', motivo_regla = null
  where regla_compra = 'bloqueada' and ram_soldada = 'total';

-- (b) Dell XPS 13 9310 2-in-1: el motivo histórico decía "RAM y SSD soldados" pero el flag
-- ssd_soldado nunca se marcó — se corrige para que la deducción de SSD también aplique.
update modelos
  set ssd_soldado = true
  where marca = 'Dell' and modelo = 'XPS 13 9310 2-in-1';

-- (c) Default de deducción de "RAM soldada"/"SSD soldado": de $0 a $20 (todas las cuentas existentes)
update detalles_catalogo
  set deduccion_base = 20
  where nombre in ('RAM soldada', 'SSD soldado');

-- (d) Usuarios futuros: fn_seed_extra sembrará $20 en vez de $0
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
    (p_user, 'RAM soldada',    20, 'specs'),
    (p_user, 'SSD soldado',    20, 'specs')
  on conflict (user_id, nombre) do nothing;

  update detalles_catalogo
    set categoria = 'specs'
    where user_id = p_user and nombre in ('Tecla(s) faltante(s)', 'Carcasa marcada');
end $$;
