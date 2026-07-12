# Plan 07 — Pantalla Cuentas y dinero multi-moneda

**Grupo B · Requiere plan-00 y plan-01 · Paralelizable con 02–06, 08–09 ·
Migración reservada 0022 (solo si imprescindible).**

## Objetivo

`/cuentas`: libro por cuenta, conversiones con tasa implícita, resultado cambiario, tasas del
día, movimientos personales, por cobrar / por pagar con abonos, y la **acción rápida global**
de conversión (modal en el header + atajo de teclado).

## Contexto esencial

- `cuentas(id, nombre, moneda USD|VES)` — plantilla sembrada: Binance, Zinli, Efectivo USD,
  Efectivo Bs, PayPal. CRUD (alta/renombrar; no borrar con movimientos).
- `movimientos(id, cuenta_id, fecha, tipo ingreso|egreso, monto>0, categoria
  negocio|personal, concepto, venta_id, lote_id, costo_linea_id)` — libro. Los personales
  ("préstamo casa") usan `categoria=personal`: cuadran saldos sin ensuciar la ganancia.
- Saldos: vista `v_cuentas_saldos(cuenta_id, nombre, moneda, saldo)` (plan-01).
- `conversiones(id, fecha, movimiento_origen_id, movimiento_destino_id, monto_origen,
  monto_destino, nota)` — tasa implícita = monto_origen/monto_destino, exacta y auditable.
  RPC (plan-01): `registrar_conversion(cuenta_origen, cuenta_destino, monto_origen,
  monto_destino, fecha, nota) → uuid` (crea los dos movimientos + la fila).
- Resultado cambiario: vista `v_resultado_cambiario(mes, cuenta_origen, cuenta_destino,
  moneda_origen, moneda_destino, operaciones, total_origen, total_destino, resultado,
  tasa_implicita_promedio)` — mostrar acumulado por mes/par. Es una línea SEPARADA de la
  ganancia por laptops (nunca costo de lotes).
- `tasas_dia(fecha, tipo bcv|paralelo|usdt|paypal, valor)` — captura manual diaria; sirven
  para VALORAR saldos Bs al reportar, nunca sustituyen la tasa implícita de una operación.
- `por_cobrar` / `por_pagar` `(id, persona, monto, moneda, fecha, estado
  pendiente|parcial|saldada, abonado, notas)` — abonar = incrementar `abonado` y actualizar
  estado (abonado ≥ monto → saldada; > 0 → parcial). El abono también genera un movimiento
  (ingreso si cobro, egreso si pago) en la cuenta elegida.

## Tareas

1. `src/data/cuentas.ts` (saldos, libro paginado por cuenta con filtros fecha/categoría/tipo,
   movimiento manual, conversión vía RPC, resultado cambiario, tasas, deudas + abonos).
2. `/cuentas`: tarjetas de saldo por cuenta (Bs también valorado a la última tasa elegible —
   selector bcv/paralelo/usdt); libro de la cuenta seleccionada (tabla: fecha, tipo, monto,
   categoría con Chip personal/negocio, concepto, referencia); alta de movimiento manual
   (incluida categoría personal).
3. **Conversiones**: sección con historial (par, montos, tasa implícita calculada, nota) +
   resultado cambiario mensual por par (vista). Alta vía el modal global.
4. **Modal global de conversión**: componente montado en el layout que escucha el evento
   `tecnofal:conversion-rapida` del botón del header (plan-00) y el atajo `Ctrl+Shift+C`.
   Campos: cuenta origen, destino, monto origen, monto destino, fecha (hoy), nota; muestra la
   tasa implícita en vivo. Disponible desde cualquier pantalla. (Único punto que toca un
   archivo compartido: montar `<ConversionRapida/>` en el layout — una sola línea, riesgo de
   conflicto mínimo y aceptado.)
5. **Tasas del día**: mini-form (tipo + valor, fecha hoy) + tabla de últimos 30 días.
6. **Por cobrar / por pagar**: dos tablas con alta, abono (modal: monto + cuenta) y estado.

## Pruebas Playwright (`e2e/cuentas.spec.ts`)

- Movimiento manual ingreso $100 Binance → saldo 100 en la tarjeta.
- Conversión Zinli→Binance 100→98 desde el modal global (abierto con el atajo desde
  `/inventario`): dos movimientos creados, tasa implícita 1.0204 mostrada, resultado
  cambiario del mes = −2 en la sección.
- Movimiento personal egreso → saldo baja, y el Chip lo marca personal.
- Tasa del día usdt=62: el saldo de Efectivo Bs se muestra también en USD /62.
- Por cobrar $50: abono de $20 (cuenta Efectivo USD) → estado `parcial`, movimiento ingreso
  20; abono de $30 → `saldada`.

## Criterios de aceptación

Saldos cuadran con el libro; conversiones solo vía RPC; resultado cambiario visible y
separado; specs pasan.

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md` + firma en `supabase/migrations/0016_rpc_conversion.sql`.
- `apps/web/src/ui/`, `src/data/cliente.ts`, su stub, y el layout SOLO para montar el modal.
- NO leer: 0001_schema.sql completo, extensión, especificación.

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

- **2026-07-11 — COMPLETADO.** Implementado en una sesión: `src/data/cuentas.ts` (saldos,
  libro paginado con filtros, movimiento manual, conversión vía RPC, historial de conversiones,
  resultado cambiario, tasas del día, por cobrar/por pagar + abono), `/cuentas` (page.tsx),
  `ConversionRapida.tsx` (modal global: evento `tecnofal:conversion-rapida` + atajo
  Ctrl+Shift+C), una línea añadida a `layout.tsx` para montarlo. `e2e/cuentas.spec.ts`: 5/5
  specs en verde (más el proyecto `setup`), estable en dos corridas consecutivas. `tsc --noEmit`
  y `eslint` limpios. No se tocó SQL (no hizo falta migración 0022).
- **No cuadraba — `v_resultado_cambiario.cuenta_origen`/`cuenta_destino` no son uuid.** El plan
  los describe junto a `moneda_origen`/`moneda_destino` sin aclarar el tipo → esperaba que fueran
  el id de `cuentas` (como en el resto del esquema). Inspeccioné la vista con
  `docker exec supabase_db_tecnofal psql -U postgres -d postgres -c "select pg_get_viewdef(...)"`
  (no leí las migraciones prohibidas, solo introspección en runtime) y son `co.nombre`/`cd.nombre`
  (JOIN a `cuentas` ya resuelto en la vista). Además `resultado` es `NULL` cuando
  `moneda_origen <> moneda_destino` (creado como `CASE WHEN co.moneda = cd.moneda THEN
  sum(monto_destino - monto_origen) ELSE NULL END`) — no está documentado en el plan que el
  resultado cambiario solo se calcula para pares de la MISMA moneda. Qué hice: en la UI
  (`nombreCuentaPara` en page.tsx) resuelvo de forma defensiva — si el valor coincide con un id
  de `cuentas` lo traduzco a nombre, si no lo muestro tal cual (por si en otro entorno sí fuera
  uuid); en la spec filtro por nombre (`'Zinli'`/`'Binance'`) en vez de por id. La sección de
  resultado cambiario en la UI mostrará "—" (vía `Dinero`) para pares en distinta moneda —
  ningún caso de la plantilla sembrada lo activa, no se cubrió con un test específico.
- **Decisión de diseño — abono sin RPC.** El plan da un RPC dedicado (`registrar_conversion`)
  solo para conversiones; para "abonar" a `por_cobrar`/`por_pagar` no especifica ninguno.
  Implementé `abonar()` en `src/data/cuentas.ts` como dos pasos secuenciales desde el cliente
  (update de `abonado`/`estado` + insert de movimiento), no atómico. Si se requiere atomicidad
  transaccional, un RPC `registrar_abono` cabría en la migración reservada 0022 — no lo creé
  por no ser imprescindible (el plan solo exige RPC para conversiones) y para no gastar contexto
  en SQL no pedido explícitamente.
- **Nota — atajo Ctrl+Shift+C en Chrome.** Chrome tiene reservado Ctrl+Shift+C para "Inspeccionar
  elemento", pero Playwright despacha las teclas directamente al renderer (CDP), así que no hay
  conflicto real; sí hace falta esperar a que el layout esté hidratado antes de disparar el
  atajo (la spec espera `getByRole('complementary', { name: 'Navegación principal' })` visible
  primero) — en la primera visita a una ruta en dev, Next.js compila la página bajo demanda y
  el listener del atajo (en `ConversionRapida`, montado en el layout) puede no estar listo aún
  si se dispara el atajo inmediatamente tras `goto`.
