# Plan 01 — SQL para la web: vistas de dashboard + RPCs transaccionales

**Grupo A · Paralelizable con plan-00 · Migraciones reservadas: 0013–0016.**

## Objetivo

Agregar el SQL que la web necesita y que aún no existe: vistas agregadas para el Dashboard
y funciones RPC transaccionales para los flujos multi-tabla (vender, devolución por garantía,
recibir paquete, conversión). Así los planes de pantallas solo hacen `select` de vistas y
`rpc()` de funciones — sin transacciones desde el cliente.

## Contexto esencial — lo que YA existe (migración 0001, no duplicar)

- Vistas: `v_laptop_precio_sugerido(laptop_id, precio_base, precio_sugerido)` ·
  `v_laptop_costos(laptop_id, costo_lote, prorrateo_paquete, lineas_estimado, lineas_actual,
  partes_actual, costo_directo, costo_proyectado, costo_final)` ·
  `v_laptop_desviacion(laptop_id, tipo, estimado, real, desviacion)` ·
  `v_ventas_ganancia(venta_id, laptop_id, fecha, estado, garantia_hasta, precio_venta,
  costo_directo, costo_final, ganancia_bruta, ganancia_neta)` ·
  `v_resultado_cambiario(mes, cuenta_origen, cuenta_destino, …, resultado)` ·
  `paquete_costos(paquete_id, flete_real, seguro_real, revision_real, …)` ·
  `v_sugerencia_partes_completas(laptop_id, alias)`.
- Funciones: `prorratear_paquete(uuid)`, `congelar_reparto_lote(uuid)`,
  `prorratear_orden_partes(uuid)`, `recibir_orden_partes(uuid)`.
- Tablas relevantes (columnas clave):
  `ventas(id, laptop_id, comprador_id, fecha, precio_venta, moneda, monto_ves, tasa_implicita,
  estado activa|devuelta_garantia, garantia_hasta generada fecha+4m)` ·
  `movimientos(id, cuenta_id, fecha, tipo ingreso|egreso, monto>0, categoria negocio|personal,
  concepto, venta_id, lote_id, costo_linea_id)` ·
  `conversiones(id, fecha, movimiento_origen_id, movimiento_destino_id, monto_origen,
  monto_destino, nota)` · `cuentas(id, nombre, moneda USD|VES)` ·
  `laptops(estado: evaluando→comprada→en_transito→en_revision→falta_partes→lista_para_venta→
  reservada→vendida; para_repuestos desde cualquiera; paquete_id)` ·
  `paquetes(estado …→recibido, fecha_recibido)` · `costo_lineas(ambito, ambito_id, tipo,
  monto_estimado, monto_real, fecha_real, descripcion, movimiento_id)` ·
  `tasas_dia(fecha, tipo bcv|paralelo|usdt|paypal, valor)` · `por_cobrar/por_pagar(persona,
  monto, moneda, estado pendiente|parcial|saldada, abonado)`.
- Convención multi-usuario: trigger estampa `user_id`; RLS filtra. Las funciones nuevas deben
  ser `security invoker` (correr como el usuario) para que RLS aplique — igual que las existentes.

## Tareas

1. **0013_vistas_dashboard.sql**
   - `v_cuentas_saldos(cuenta_id, nombre, moneda, saldo)` = Σ ingresos − Σ egresos por cuenta.
   - `v_dashboard_totales`: una fila por usuario con — `total_invertido` (Σ `costo_proyectado`
     de laptops no vendidas ni repuesto, vía v_laptop_costos), `valor_inventario`
     (Σ `precio_sugerido` de laptops en_revision/falta_partes/lista_para_venta/reservada),
     `ganancia_bruta_acum` y `ganancia_neta_acum` (Σ de v_ventas_ganancia con estado='activa'),
     `por_cobrar_pendiente`, `por_pagar_pendiente` (monto−abonado donde estado≠'saldada').
   - `v_laptops_por_estado(estado, cantidad)`.
   - `v_garantias_vigentes(venta_id, laptop_id, alias, comprador, fecha, garantia_hasta,
     dias_restantes)` — ventas activas con garantia_hasta ≥ hoy.
2. **0014_rpc_ventas.sql**
   - `registrar_venta(p_laptop uuid, p_comprador uuid, p_precio numeric, p_moneda moneda_t,
     p_monto_ves numeric, p_tasa numeric, p_cuenta uuid, p_fecha date) returns uuid`:
     valida laptop en `lista_para_venta|reservada`; inserta venta; movimiento ingreso en la
     cuenta (monto = precio si USD, monto_ves si VES) con `venta_id`; laptop → `vendida`.
   - `devolver_garantia(p_venta uuid, p_cuenta uuid, p_monto_reembolso numeric)`:
     valida venta activa y dentro de garantía; venta → `devuelta_garantia`; movimiento egreso
     (reembolso, `venta_id`); laptop → `para_repuestos`.
3. **0015_rpc_paquetes.sql**
   - `recibir_paquete(p_paquete uuid, p_flete_real numeric, p_seguro_real numeric,
     p_revision_real numeric)`: paquete → `recibido` + `fecha_recibido = now()`; upsert de
     `costo_lineas` ámbito paquete tipos envio_vzla/seguro/revision con `monto_real`
     (0 permitido — "a veces no cobran la revisión"); llama `prorratear_paquete`;
     laptops del paquete `en_transito` → `en_revision`.
   - `avanzar_paquete(p_paquete uuid, p_estado paquete_estado_t)`: valida que el nuevo estado
     sea el siguiente en la secuencia del courier (o igual/retroceso de 1 para corregir).
4. **0016_rpc_conversion.sql**
   - `registrar_conversion(p_cuenta_origen uuid, p_cuenta_destino uuid, p_monto_origen numeric,
     p_monto_destino numeric, p_fecha date, p_nota text) returns uuid`: crea los DOS
     movimientos (egreso origen / ingreso destino, categoria negocio) + fila `conversiones`
     enlazándolos. (La extensión hoy lo hace en 3 inserts desde el cliente; la web usa este RPC.)
5. **Espejo Nhost**: duplicar cada archivo en `nhost/migrations/default/175190000001N_*/up.sql`
   (misma numeración relativa) para mantener la paridad §7b. Sin metadata Hasura nueva
   (vistas/funciones no la requieren para la web Supabase).
6. **Pruebas SQL** (sin Playwright — este plan no depende de plan-00):
   `supabase/tests/plan01.sql` ejecutable con `supabase db reset && psql -f` (o `supabase test db`
   si hay pgTAP): crea usuario de prueba con `auth.admin`-equivalente (insert en auth.users),
   siembra lote→laptop→venta y verifica: saldo de cuenta, transición de estados, doble
   movimiento de conversión con tasa implícita exacta, y que `devolver_garantia` fuera de
   plazo falla.

## Fuera de alcance

Pantallas web, cambios a vistas/funciones existentes (solo añadir), scraping, Edge Functions.

## Criterios de aceptación

- `supabase db reset` aplica 0001–0016 sin errores; pruebas SQL pasan.
- Cada RPC es `security invoker`, valida estados y es atómica (una transacción por llamada).

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md`.
- `supabase/migrations/0001_schema.sql` (referencia obligada), `0002_rls.sql`, `0003_seeds.sql`.
- NO leer: apps/, packages/, especificación completa, migraciones nhost (solo copiar al final).

## Bitácora

Sección viva — el agente ejecutor la va llenando; el plan-10 la revisa completa.
Anota aquí, con fecha, dos tipos de entradas:

1. **Pendientes**: sub-tareas que quedaron sin terminar (por contexto, por bloqueo, etc.)
   y su estado exacto (commit, qué falta).
2. **Cosas que no cuadran**: cualquier hallazgo donde la realidad no coincide con este plan
   o con el sistema — esquema/vista/RPC que no existe o difiere de lo descrito, regla de
   negocio contradictoria, cálculo que no cierra, caso sin cubrir, dato semilla sospechoso.
   Formato: *qué esperaba → qué encontré → qué hice mientras tanto (workaround/omisión)*.
   No lo arregles en silencio si está fuera de tu alcance: regístralo aquí.

- **2026-07-10 — COMPLETADO.** El agente original murió por límite de sesión tras escribir
  las migraciones 0013–0016 (revisadas: limpias, security invoker, apply-safe); la sesión
  principal terminó: espejo Nhost (1751900000013–16), pruebas `supabase/tests/plan01.sql`
  (rollback, sin rastro; runner `scripts/test-sql.sh`) — PLAN01-OK contra el stack local.
- **No cuadraba — 0011 rota para push:** el enum 'specs' se usaba en la misma transacción
  que lo creaba (55P04) y el insert de detalles no traía user_id / usaba on conflict
  equivocado. Corregido antes de este plan: 0011 = solo ALTER TYPE; datos por-usuario al
  inicio de la 0012 + fn_seed_extra actualizado. Ya empujado a producción por el usuario.
- **Nota:** el smoke de conversión también se validó en un Postgres desechable aplicando
  0001→0016 una transacción por archivo (idéntico a `db push`).
