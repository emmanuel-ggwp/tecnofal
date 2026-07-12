-- Migración 0011: añade el valor 'specs' al enum detalle_categoria_t — y NADA más.
-- Un valor nuevo de enum no puede USARSE en la misma transacción que lo crea
-- (error 55P04 "unsafe use of new value") y el CLI envuelve cada migración en una
-- transacción. Los datos que usan 'specs' corren al inicio de la 0012, cuando este
-- ALTER ya está commiteado.
alter type detalle_categoria_t add value if not exists 'specs';
