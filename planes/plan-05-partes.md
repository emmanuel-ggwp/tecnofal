# Plan 05 — Pantalla Partes

**Grupo B · Requiere plan-00 (plan-01 no es necesario) · Paralelizable con 02–04, 06–09 ·
Migración reservada 0020 (solo si imprescindible).**

## Objetivo

`/partes`: catálogo de partes, stock a costo promedio, partes específicas y su asignación,
órdenes de compra de partes con prorrateo aterrizado, instalación de partes en laptops y
cosecha desde donantes.

## Contexto esencial

- `partes_catalogo(id, nombre unique, precio_referencia costo aterrizado estimado,
  valor_nominal para encontradas en lotes, volumen_pie3, peso_kg)` — CRUD.
- `partes_stock(parte_id pk, cantidad, costo_promedio)` — SOLO LECTURA en la web: lo
  actualiza el trigger `fn_partes_promedio` con cada insert en `partes_compras`.
- `partes_compras(parte_id, fecha, cantidad>0, costo_unitario)` — cada insert recalcula el
  promedio ponderado vía trigger. Ajustes manuales de stock = insert aquí (cantidad negativa
  NO permitida por check; para descontar está la instalación o una parte específica).
- `partes_especificas(id, parte_id, identificador, costo_real default 0 editable,
  laptop_asignada_id, origen compra|cosechada, cosechada_de_laptop_id)`.
- `laptop_partes(laptop_id, parte_id, parte_especifica_id nullable, costo_aplicado, fecha)` —
  registro del consumo. **Instalar una parte** (decisión de diseño de este plan, no existe
  mecanismo previo de descuento):
  - commodity: fila en `laptop_partes` con `costo_aplicado = partes_stock.costo_promedio`
    del momento + UPDATE directo `partes_stock.cantidad -= 1` (sin tocar `costo_promedio`;
    NO insertar en `partes_compras` — su check exige cantidad > 0 y recalcularía el promedio);
  - específica: `partes_especificas.laptop_asignada_id = laptop` y
    `costo_aplicado = costo_real`.
  En ambos casos crear además `costo_lineas` ámbito `laptop` tipo `parte` con
  `monto_real = costo_aplicado` y `descripcion` = nombre de la parte.
- **Cosecha de donante**: form que crea `partes_especificas` con origen `cosechada`,
  `cosechada_de_laptop_id` = donante, costo_real default 0 editable.
- **Órdenes de partes**: `ordenes_partes(id, fecha, origen, fuente, envio_usa, fees, notas)` +
  `orden_partes_items(orden_id, parte_id, cantidad, precio_unitario, prorrateo,
  prorrateo_manual, recibido)`. RPCs existentes: `prorratear_orden_partes(orden)` (por valor,
  respeta manuales) y `recibir_orden_partes(orden)` (entra a stock a costo ATERRIZADO =
  precio + prorrateo/cantidad). Prorrateo editable por ítem (marca `prorrateo_manual=true`).

## Tareas

1. `src/data/partes.ts` (catálogo, stock, específicas, órdenes, instalación, cosecha).
2. `/partes` con secciones: **Stock** (tabla: parte, cantidad, costo promedio, valor total;
   compra rápida inline → partes_compras), **Específicas** (tabla con identificador, costo,
   asignada a — link a laptop —, origen; alta y edición; asignar a laptop por alias),
   **Catálogo** (CRUD con precio_referencia y valor_nominal), **Órdenes** (listado + detalle:
   ítems, envio/fees, botón "Prorratear" con edición manual por ítem y re-prorrateo del resto,
   botón "Recibir" → stock aterrizado).
3. **Instalar en laptop**: modal desde Stock/Específicas — elegir laptop por alias (estados
   en_revision/falta_partes), confirmar costo aplicado; crea laptop_partes + costo_linea +
   descuenta stock (o asigna la específica).
4. **Cosechar**: modal — donante por alias (es_donante o para_repuestos), tipo de parte,
   identificador, costo (default 0).

## Pruebas Playwright (`e2e/partes.spec.ts`)

- Compra de 2 SSD a $20 y luego 2 a $30 → stock 4 @ $25 (promedio ponderado del trigger).
- Orden con 2 ítems (valores 100 y 300) + envío 40 → prorrateo 10/30; editar el primero a 25
  manual → re-prorratear deja 15 al otro; recibir → stock con costo aterrizado correcto.
- Instalar 1 SSD en laptop sembrada `falta_partes` → stock baja a 3, laptop_partes con
  costo 25, costo_linea tipo parte visible.
- Cosechar batería de donante → específica origen cosechada costo 0; asignarla a otra laptop.

## Criterios de aceptación

Stock siempre cuadra (trigger + descuentos); costo aterrizado correcto; specs pasan.

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md`.
- `apps/web/src/ui/`, `src/data/cliente.ts`, su stub.
- Firmas de `prorratear_orden_partes` / `recibir_orden_partes` en
  `supabase/migrations/0001_schema.sql` líneas 552–582 (solo ese rango).
- NO leer: el resto del esquema, extensión, especificación.

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

- **2026-07-10 — COMPLETADO.** Implementado `src/data/partes.ts`, `/partes` (tabs Stock,
  Específicas, Catálogo, Órdenes) + `/partes/ordenes/[id]` (detalle), modal de instalación
  compartido (Stock/Específicas) y modal de cosecha. `e2e/partes.spec.ts`: 5/5 en verde,
  estable en 3 corridas consecutivas (`bunx playwright test e2e/partes.spec.ts`).
- **No cuadraba — `ordenes_partes.origen` es NOT NULL.** Esperaba poder dejarlo opcional
  (el plan no especifica nullability). Al insertar con `origen: null` desde el form
  (campo vacío) Postgres rechazó con `23502 null value in column "origen"`. Hice el campo
  "Origen" obligatorio en el form de alta de orden (`OrdenesTab.tsx`, botón "Crear orden"
  deshabilitado sin valor) y en el tipo `OrdenPartesInput.origen: string` (antes
  `string | null` opcional) en `src/data/partes.ts`. `fuente` sí acepta null (confirmado).
- **No cuadraba — `partes_stock` no tiene fila para una parte recién creada en el catálogo.**
  Esperaba (leyendo "SOLO LECTURA... lo actualiza el trigger con cada insert en
  partes_compras") que quizás existiera una fila inicial en 0; confirmé con una parte de
  prueba que `select * from partes_stock where parte_id = X` no devuelve nada hasta la
  primera compra (el trigger hace upsert en el primer insert de `partes_compras`, no antes).
  Mi primer diseño de `listarStock()` partía de `partes_stock` (inner join), así que una
  parte del catálogo sin compras nunca aparecía en la pestaña Stock — sin fila no había forma
  de comprar la primera vez. Corregido: `listarStock()` ahora parte de `partes_catalogo` con
  embed reverso `partes_stock ( cantidad, costo_promedio )` (PostgREST lo resuelve como
  objeto o null, uno-a-uno vía la PK compartida) y trata cantidad/costo_promedio ausentes
  como 0. Confirmado con un script puntual contra el stack local antes y después del fix.
- **Hallazgo de entorno de pruebas (no es del esquema, pero afecta a cualquier plan con specs
  multi-test en un mismo archivo):** Playwright, en esta configuración
  (`fullyParallel: false`, `retries: 0`), reinicia el proceso worker tras cualquier test que
  falla dentro del mismo archivo — el siguiente test corre en un worker nuevo con el módulo
  re-importado desde cero, por lo que `beforeAll` se re-ejecuta con valores nuevos (confirmé
  imprimiendo `process.pid` y un sufijo `Date.now()` en `beforeAll`: pid y sufijo cambiaron
  entre tests tras un fallo). Efecto práctico: un test NO puede depender de forma fiable de
  mutaciones hechas por otro `test()` anterior en el mismo archivo — a veces comparten worker
  (mismos ids) y a veces no (ids nuevos), de forma no determinista según si el test previo
  falló. Mi test de "instalar" originalmente reusaba la parte/stock creados por el test de
  "compra"; lo hice autocontenido (parte y compras propias sembradas por admin dentro del
  mismo test) para que el resultado sea determinista sin importar el reparto de workers.
  Dejo esto anotado porque cualquier otro plan que encadene specs con estado compartido
  entre `test()` del mismo archivo puede toparse con el mismo flake.
- **Detalle menor de accesibilidad:** envolver un `<select>` crudo en
  `<label>Texto<select>...</select></label>` (sin `htmlFor`/`id` explícitos) produjo un
  nombre accesible contaminado con el texto de las `<option>` (Chromium concatena texto del
  subárbol), lo que hizo que `getByLabel('Parte')` de Playwright resolviera a más de un
  elemento. Cambiado a la misma convención que `Campo` (label con `htmlFor` + `id` explícito)
  en los tres selects crudos que agregué (`ordenes/[id]/page.tsx`, `EspecificasTab.tsx`,
  `CosecharModal.tsx`).
