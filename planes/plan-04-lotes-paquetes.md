# Plan 04 — Pantalla Lotes y Paquetes

**Grupo B · Requiere plan-00 y plan-01 · Paralelizable con 02–03, 05–09 ·
Migración reservada 0019 (solo si resulta imprescindible; intentar sin SQL nuevo).**

## Objetivo

`/lotes`: gestión de lotes (incluida alta de compra local) y de paquetes: creación, ítems
(laptops/partes/personales), sub-estados del courier, recepción con factura real y prorrateo
automático, revisión física del lote (partes encontradas) y congelación del reparto fijo.

## Contexto esencial

- `lotes(id, fecha_compra, origen ebay|local|otro, url_ebay, vendedor, precio_subasta,
  envio_usa, costo_proyectado_total snapshot congelado, metodo_estimado barco|avion_zoom)`.
- `costo_lineas` ámbito `lote`: tipos `subasta, envio_usa, impuesto_ebay, parte, seguro,
  envio_vzla, revision, flete_nacional, otro`; columnas `monto_estimado`
  (+`estimado_congelado_at`), `monto_real`, `fecha_real`, `descripcion` ("SSD 256GB × 2").
  Regla: NUNCA crear líneas en cero. El real se registra cuando ocurre (admite 0 y negativos).
- **Compra local** (§lotes spec): `origen='local'` → SIN url_ebay/envio_usa/impuesto/seguro/
  envio_vzla; líneas posibles: `subasta` (precio de compra), `flete_nacional`, `revision`.
  Sus laptops no llevan paquete: alta directa en estado `en_revision`.
- **Compra eBay**: normalmente la crea la extensión; aquí también alta manual (mismo shape):
  líneas estimadas congeladas + laptops en `comprada`.
- `paquetes(id, courier, guia, metodo, estado, volumen_estimado_pie3, peso_estimado_kg,
  flete_estimado, seguro_estimado, revision_estimada, fecha_recibido)`.
  Sub-estados: `generada → factura → aduana_usa → transito_internacional → aduana_venezuela →
  central_caracas → transito_nacional → listo_para_entregar → recibido` (manual en v1).
- `paquete_items(paquete_id, tipo laptop|parte|personal, ref_id nullable, descripcion,
  volumen_pie3, valor_declarado, flete_prorrateado, seguro_prorrateado)` — personales
  participan del prorrateo (su costo va a gastos personales, no a laptops).
- Al agregar una laptop a un paquete: `laptops.paquete_id = X` y estado → `en_transito`.
- RPCs (plan-01): `avanzar_paquete(id, estado)` valida secuencia;
  `recibir_paquete(id, flete_real, seguro_real, revision_real)` → estado recibido +
  fecha_recibido + líneas reales (0 permitido) + `prorratear_paquete` + laptops → `en_revision`.
- Vista `paquete_costos(paquete_id, flete_real, seguro_real, revision_real, …)`.
- **Revisión física del lote**: `lote_partes_encontradas(lote_id, parte_id→partes_catalogo,
  cantidad, valor_nominal_aplicado default = partes_catalogo.valor_nominal editable, en_stock)`.
  Al completar: RPC existente `congelar_reparto_lote(lote_id)` — mete las encontradas a stock
  a valor nominal y congela `lote_reparto(laptop_id, valor_esperado_al_comprar, proporcion,
  costo_asignado)` ponderado por precio sugerido. El reparto es FIJO e inmutable: la UI debe
  impedir re-congelar si ya existe reparto (mostrar el reparto en lectura).

## Tareas

1. `src/data/lotes.ts` y `src/data/paquetes.ts`.
2. `/lotes`: listado de lotes (fecha, origen, laptops, proyectado congelado vs. actual —
   Σ líneas con real donde exista), alta de **compra local** (form: precio, flete nacional,
   revisión, N laptops con specs mínimas) y alta manual eBay. Detalle de lote: líneas de
   costo (estimado/real, registrar real), laptops del lote, sección revisión física
   (partes encontradas + botón "Congelar reparto" con confirmación e irreversibilidad clara),
   vista del reparto congelado.
3. `/lotes` (tab Paquetes) o `/lotes/paquetes`: listado de paquetes con estado; crear paquete
   (courier, guía, método, estimados); detalle: ítems (agregar laptop por alias — solo
   `comprada` sin paquete —, parte, o personal con descripción/volumen/valor declarado),
   stepper de sub-estados (avanzar_paquete), botón **"Recibido"** con form de factura real
   (flete/seguro/revisión; 0 permitido) → `recibir_paquete` → mostrar prorrateo resultante
   por ítem (flete por volumen, seguro por valor declarado).
4. Cross-links: laptop → su ficha (ruta de plan-03; el link puede existir aunque la ficha
   sea stub aún).

## Pruebas Playwright (`e2e/lotes.spec.ts`)

Sembrar catálogo de partes básico vía helper (batería con valor_nominal 3).

- Alta de compra local con 1 laptop → lote con líneas subasta+flete_nacional, laptop
  `en_revision`, sin líneas en cero.
- Crear paquete, agregar 2 laptops + 1 ítem personal; avanzar estados en orden (fuera de
  orden = rechazado); "Recibido" con flete 100 / seguro 10 / revisión 0 → laptops
  `en_revision`, prorrateo visible y suma de prorrateos = total (flete por volumen).
- Lote eBay con 2 laptops + 1 batería encontrada (nominal 3) → congelar reparto →
  `lote_reparto` con 2 filas cuya suma = costo lote − 3; segundo intento de congelar bloqueado.

## Criterios de aceptación

Flujos completos sin tocar Studio; RPCs usados para todo lo transaccional; specs pasan.

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md` + firmas RPC en `supabase/migrations/0015_rpc_paquetes.sql`.
- `apps/web/src/ui/`, `src/data/cliente.ts`, su stub.
- NO leer: 0001_schema.sql completo (extracto arriba), extensión, especificación.

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

- **2026-07-10 — COMPLETADO.** `src/data/lotes.ts` y `src/data/paquetes.ts` creados; páginas
  `/lotes` (listado + alta local + alta eBay manual), `/lotes/[id]` (líneas de costo, laptops,
  revisión física, congelar/ver reparto), `/lotes/paquetes` (listado + alta) y
  `/lotes/paquetes/[id]` (ítems, stepper de sub-estados, "Recibido" + prorrateo) reemplazan el
  stub. Spec `e2e/lotes.spec.ts` (3 tests) — **4/4 en verde** (setup + 3 specs) vía
  `bunx playwright test e2e/lotes.spec.ts`. No se tocó SQL nuevo (0019 no hizo falta).
- **No cuadraba — `lotes.envio_usa`/`lotes.precio_subasta` duplican `costo_lineas`:** esperaba
  que `envio_usa`/precio de subasta vivieran solo como líneas de `costo_lineas` (ámbito lote);
  encontré que `lotes` también tiene sus propias columnas `envio_usa` (not null default 0) y
  `precio_subasta` (not null) — pero `congelar_reparto_lote` SOLO suma desde `costo_lineas`
  (tipos `subasta,envio_usa,impuesto_ebay,flete_nacional`), nunca lee esas columnas de `lotes`.
  Qué hice: poblé ambas fuentes al crear un lote (columna `lotes.precio_subasta`/`envio_usa` +
  su línea espejo en `costo_lineas`) para que la UI y el reparto cuadren; `lotes.envio_usa` en
  la compra local se deja en su default 0 (no aplica). El plan-10 debería confirmar si esa
  duplicación de columnas es intencional (¿denormalización para otra pantalla?) o un remanente
  de una versión anterior del esquema.
- **No cuadraba — `congelar_reparto_lote` no es realmente inmutable a nivel de BD:** el plan
  dice "el reparto es FIJO e inmutable: la UI debe impedir re-congelar". Inspeccioné el cuerpo
  de la función (`\sf congelar_reparto_lote`) y NO tiene guardia contra doble ejecución: si se
  llama dos veces, borra (`delete from lote_reparto where lote_id=...`) y vuelve a insertar sin
  error. La inmutabilidad depende 100% de que la UI oculte el botón "Congelar reparto" cuando
  ya existe reparto (lo implementé así: `yaTieneReparto()` antes de mostrar el botón). Un script
  o llamada directa al RPC fuera de la UI podría re-congelar y pisar el reparto ya usado en
  otros cálculos. Lo dejo anotado por si plan-10 quiere añadir el guard a nivel de RPC (`raise
  exception` si ya hay filas en `lote_reparto`).
- **Nota — eslint-disable inválido:** inicialmente usé
  `// eslint-disable-next-line react-hooks/exhaustive-deps` en los `useEffect` de los detalles
  de lote/paquete (patrón copiado por inercia); el coordinador avisó que `eslint.config.mjs` no
  registra el plugin `react-hooks`, así que esa directiva cuenta como "unused directive" y
  rompe el lint. La quité de ambos archivos (`lotes/[id]/page.tsx`,
  `lotes/paquetes/[id]/page.tsx`); `bunx eslint` quedó limpio sobre todos los archivos del plan.
