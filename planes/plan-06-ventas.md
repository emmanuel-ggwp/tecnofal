# Plan 06 — Pantalla Ventas, compradores y garantía

**Grupo B · Requiere plan-00 y plan-01 · Paralelizable con 02–05, 07–09 ·
Migración reservada 0021 (solo si imprescindible).**

## Objetivo

`/ventas`: registro de ventas con comprador, moneda y tasa; listado con ganancia bruta/neta;
garantías vigentes; flujo de devolución por garantía; CRUD de compradores.

## Contexto esencial

- `ventas(id, laptop_id, comprador_id, fecha, precio_venta USD-equivalente, moneda USD|VES,
  monto_ves, tasa_implicita, estado activa|devuelta_garantia, garantia_hasta GENERADA =
  fecha + 4 meses)`. Ganancias NUNCA guardadas: vista `v_ventas_ganancia(venta_id, laptop_id,
  fecha, estado, garantia_hasta, precio_venta, costo_directo, costo_final, ganancia_bruta,
  ganancia_neta)` — reflejan costos reales aunque lleguen después de la venta.
- Venta en Bs: el usuario ingresa `monto_ves` y `tasa` (de `tasas_dia` del día como sugerencia,
  editable) → `precio_venta = monto_ves / tasa_implicita`.
- `compradores(id, nombre, telefono, notas)` + historial (sus ventas).
- RPCs (plan-01): `registrar_venta(laptop, comprador, precio, moneda, monto_ves, tasa,
  cuenta, fecha) → uuid` — valida laptop `lista_para_venta|reservada`, crea venta +
  movimiento ingreso en la cuenta elegida + laptop → `vendida`.
  `devolver_garantia(venta, cuenta, monto_reembolso)` — valida vigencia, venta →
  `devuelta_garantia`, movimiento egreso reembolso, laptop → `para_repuestos`.
- `cuentas(id, nombre, moneda)` — para elegir dónde entra el dinero (sembradas por plantilla:
  Binance, Zinli, Efectivo USD, Efectivo Bs, PayPal).
- Vista `v_garantias_vigentes(venta_id, laptop_id, alias, comprador, fecha, garantia_hasta,
  dias_restantes)` (plan-01).

## Tareas

1. `src/data/ventas.ts` (listado con v_ventas_ganancia + joins alias/comprador, registrar
   vía RPC, devolución vía RPC, compradores CRUD, laptops vendibles, cuentas, tasa del día).
2. `/ventas`: tabla (fecha, alias+modelo, comprador, precio, moneda —si VES: monto Bs y
   tasa—, ganancia bruta, ganancia neta, estado, garantía hasta). Filtros por estado y rango
   de fechas. Totales del listado filtrado.
3. **Registrar venta** (modal): laptop por alias (solo lista_para_venta/reservada),
   comprador (buscar o crear inline), moneda USD (precio directo) o VES (monto Bs + tasa
   sugerida del día → muestra USD calculado), cuenta destino, fecha. Al confirmar: RPC.
4. **Garantías**: sección con v_garantias_vigentes (badge días restantes; <15 días en
   naranja). Acción "Devolución" (modal: cuenta origen del reembolso, monto default
   precio_venta) → RPC; feedback del nuevo estado de la laptop (para_repuestos).
5. **Compradores**: sub-vista o tab con CRUD y sus ventas históricas.

## Pruebas Playwright (`e2e/ventas.spec.ts`)

Sembrar vía helper: laptop `lista_para_venta` con lote_reparto costo_asignado 200 y
costo_linea parte real 25 (→ costo_directo 225); cuenta Efectivo USD.

- Vender a $400 USD comprador nuevo → aparece en tabla con ganancia bruta 175; laptop
  `vendida`; movimiento ingreso 400 en la cuenta.
- Venta en VES: monto 20 000 Bs, tasa 50 → precio_venta $400 mostrado antes de confirmar.
- La venta aparece en garantías vigentes con ~120 días restantes.
- Devolución: → venta `devuelta_garantia`, laptop `para_repuestos`, movimiento egreso 400,
  y la ganancia desaparece de los acumulados del listado (estado ≠ activa).
- Intentar vender una laptop `en_revision` → no aparece en el selector.

## Criterios de aceptación

Todo flujo transaccional vía RPC (nunca inserts multi-tabla desde el cliente); ganancias
solo desde la vista; specs pasan.

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md` + firmas en `supabase/migrations/0014_rpc_ventas.sql`.
- `apps/web/src/ui/`, `src/data/cliente.ts`, su stub.
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

- **2026-07-10 — COMPLETADO.** Implementado `src/data/ventas.ts` (listado con
  `v_ventas_ganancia` + joins alias/comprador, `registrar_venta`/`devolver_garantia` vía RPC,
  compradores CRUD, laptops vendibles, cuentas, tasa sugerida de `tasas_dia`); `/ventas` con
  tabs Ventas/Garantías/Compradores (`apps/web/src/app/(panel)/ventas/page.tsx` +
  `secciones/{ListadoVentas,RegistrarVentaModal,Garantias,DevolucionModal,Compradores}.tsx`);
  `e2e/ventas.spec.ts` (6 specs) — Playwright 6/6 en verde, corrido dos veces para confirmar
  que la limpieza en `afterAll` no deja basura. `tsc --noEmit` y `eslint` limpios.
- **No cuadraba — tono "naranja" en Chip:** el plan pide badge de garantía en naranja para
  <15 días, pero `apps/web/src/ui/Chip.tsx` (`TonoChip`) solo define
  verde/amarillo/rojo/azul/gris — no lo edité por ser kit compartido de plan-00 que consumen
  todos los planes B. Usé un `<span>` con clases Tailwind `bg-orange-100 text-orange-800`
  directamente en `secciones/Garantias.tsx` en vez de `<Chip>` para ese badge puntual.
- **No cuadraba — `eslint-disable-next-line react-hooks/exhaustive-deps`:** vi este patrón ya
  usado en archivos de otros planes en curso (`lotes/[id]/page.tsx`,
  `partes/ordenes/[id]/page.tsx`) y lo copié al principio en dos `useEffect`, pero
  `eslint.config.mjs` de la raíz solo registra la regla `no-restricted-imports` (sin plugin
  `react-hooks`) — el comentario hacía fallar `eslint` con "Definition for rule not found".
  Lo quité de mis dos archivos (`ListadoVentas.tsx`, `RegistrarVentaModal.tsx`) y ajusté el
  array de dependencias del segundo efecto en vez de suprimir el lint. No toqué los archivos
  de los otros planes (fuera de mi alcance) — si el plan-10 corre `eslint` sobre todo el
  repo, ese mismo patrón fallará también ahí.
