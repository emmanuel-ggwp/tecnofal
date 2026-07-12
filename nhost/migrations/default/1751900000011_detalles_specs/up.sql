-- Migración 0011: añade el valor 'specs' al enum — y NADA más (55P04: un valor nuevo
-- de enum no puede usarse en la misma transacción que lo crea). Datos en la 0012.
alter type detalle_categoria_t add value if not exists 'specs';
