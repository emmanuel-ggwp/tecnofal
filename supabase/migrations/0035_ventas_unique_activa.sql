-- ventas: constraint formal de "una sola venta activa por laptop" (auditoría, fase 4).
--
-- Hoy la duplicación de ventas está prevenida SOLO por la máquina de estados de laptops
-- (registrar_venta exige estado in lista_para_venta|reservada y deja la laptop 'vendida').
-- Es frágil: cualquier flujo futuro que regrese una laptop a vendible reabriría la puerta.
-- Este unique parcial lo formaliza como invariante de BD (defensa en profundidad).

-- Dedup defensivo (no debería haber duplicados dado el guard de estado, pero por si acaso):
-- conserva la venta activa de menor id por laptop.
delete from ventas a using ventas b
where a.estado = 'activa' and b.estado = 'activa'
  and a.user_id = b.user_id and a.laptop_id = b.laptop_id and a.id > b.id;

create unique index ventas_laptop_activa_uidx
  on ventas (user_id, laptop_id) where estado = 'activa';
