# Plan 10c — Cross-links, consistencia y verificación final

**Grupo C · Requiere plan-10a y plan-10b cerrados · Tercera y última etapa de la
integración final, se ejecuta sola. Sin SQL nuevo.**

## Objetivo

Verificar que las 8 pantallas se sienten como UN sistema (no 8 features sueltas), pulir
inconsistencias visuales, confirmar que estados vacíos/de error no rompen nada, y cerrar
la Fase 2 con la suite completa en verde de forma reproducible. Esta es la última etapa —
al terminar, la Fase 2 (Panel Web) queda considerada completa.

## Contexto esencial

- Las 8 pantallas (Configuración, Inventario, Lotes/Paquetes, Partes, Ventas, Cuentas,
  Calculadora, Dashboard) ya están implementadas y cada una tiene su propia suite en
  verde. `plan-10a` cerró el backlog conocido; `plan-10b` agregó el e2e maestro del ciclo
  de vida completo.
- **Kit UI compartido** en `apps/web/src/ui/`: `Tabla`, `Modal`, `Boton`, `Campo`, `Chip`,
  `Dinero`, `FechaCorta`, `Semaforo`. La consistencia visual se logra usando estos
  componentes en todas partes, NO reinventando formato en cada pantalla — si encuentras
  una pantalla que formatea dinero/fecha a mano en vez de usar `<Dinero>`/`<FechaCorta>`,
  corrígelo.
- **CRÍTICO — cómo correr la suite completa**: `bunx playwright test --workers=1`
  (obligatorio). Con los workers por defecto (varios `.spec.ts` en paralelo), 2 pruebas
  fallan de forma reproducible por **contención contra el servidor `next dev`** (no es un
  bug de datos — diagnosticado y confirmado hoy con corridas seriales 100% verdes: 46/46).
  No pierdas tiempo re-diagnosticando esto si lo ves — ya está en `planes/README.md`.
- Selector de sidebar en tests: `page.getByRole('complementary', { name: 'Navegación
  principal' })`.
- `eslint-disable-next-line react-hooks/exhaustive-deps` NO funciona en este repo (plugin
  no registrado) — si lo encuentras en algún archivo, quítalo (no reemplaces por nada, o
  ajusta la dependencia si el efecto realmente lo necesita).
- Usuario e2e compartido (`e2e@tecnofal.test`) entre TODAS las specs — si escribes algo
  que lea `parametros`/`precios_ideales`/`ajustes_config`, usa `clienteAdmin()` en vez de
  valores hardcodeados (otra spec pudo haberlos mutado).

## Tareas

1. **Cross-links** — navega manualmente (o con un spec corto) y confirma/completa:
   - Laptop en cualquier tabla (Inventario, Ventas, Partes, Lotes) → enlaza a su ficha
     (`/inventario/[id]`).
   - Ficha de laptop → lote de origen enlaza a `/lotes/[id]`.
   - Venta → comprador enlaza a su historial.
   - Movimiento con referencia (venta_id/lote_id) → enlaza al recurso referenciado.
   - Chips de "laptops por estado" en el Dashboard → navegan a `/inventario?estado=X`
     con el filtro ya aplicado.
   Si algún link falta, agrégalo (cambio pequeño y localizado, no reestructures pantallas).
2. **Consistencia visual**: recorre las 8 pantallas y confirma — formato de dinero/fecha
   uniforme (vía el kit ui, no formateo manual), los mismos colores de `Chip` para el
   mismo estado en todas las pantallas donde aparezca (ej. "vendida" debe verse igual en
   Inventario y en Ventas), títulos de página consistentes, favicon presente.
3. **Estados vacíos y de error**: cada pantalla debe renderizar sin datos (usuario nuevo)
   sin crashear. Prueba también el caso de red caída: detén el contenedor
   `supabase_db_tecnofal` (`docker stop supabase_db_tecnofal`), recarga cada pantalla,
   confirma que muestra un mensaje de error legible (no una pantalla en blanco ni un
   crash de React) — luego **reinicia el contenedor** (`docker start supabase_db_tecnofal`)
   y confirma que todo vuelve a funcionar antes de seguir.
4. **Suite completa, dos veces**: `cd apps/web && bunx playwright test --workers=1` dos
   veces seguidas. Debe dar el mismo resultado (idealmente 100% verde) ambas veces — si
   algo es flaky de verdad (no la contención ya conocida), diagnostícalo y arréglalo
   (esperas explícitas en vez de sleeps, selectores más específicos, etc.).
5. Actualiza `apps/web/README.md` con el flujo de desarrollo y prueba definitivo de la
   Fase 2 completa (arranque, cómo correr specs individuales vs. la suite completa con
   `--workers=1`, usuario e2e).
6. **Cierra la sección "## Hallazgos para la especificación"** más abajo en este mismo
   archivo — revisa si plan-10a o plan-10b dejaron algo ahí, y añade lo que encuentres tú.
   Si queda vacía al final, dilo explícitamente en tu reporte (no la borres).
7. Actualiza tu propia "## Bitácora" en este archivo.

## Fuera de alcance

Funcionalidad nueva, Android, scraping del courier, deploy (eso es v2 transversal / Fase 3
según la especificación). No relances el bucket de Storage (backlog #4, diferido).

## Criterios de aceptación

- Cross-links completos y verificados.
- Consistencia visual confirmada (o corregida) en las 8 pantallas.
- Estados vacíos/error no crashean ninguna pantalla.
- Suite completa (`--workers=1`) verde en 2 corridas seguidas.
- `apps/web/README.md` actualizado.
- Sección "Hallazgos para la especificación" resuelta o explícitamente confirmada vacía.

## Contexto permitido

- Este plan + `planes/README.md` + `planes/HANDOFF.md` + las Bitácoras de plan-10a y
  plan-10b (una vez existan).
- Las pantallas y repositorios que necesite tocar (leer selectivamente).
- NO leer: especificación completa, extensión, esquema SQL completo salvo firmas puntuales.

## Bitácora

Sección viva — el agente ejecutor la va llenando.

- **2026-07-11 — COMPLETADO, sin pendientes.** Las 7 tareas del plan se ejecutaron de punta
  a punta en esta sesión (no hizo falta retomar). Resumen por tarea:

  1. **Cross-links** — confirmados ya existentes: Inventario→ficha (`/inventario/[id]`),
     ficha→"Partes instaladas" (lectura), Lotes→ficha de laptop
     (`lotes/[id]/page.tsx:188`), Paquetes→ficha (ya en items de tipo laptop antes de mi
     cambio en algunos casos), EspecificasTab→ficha de laptop asignada. Agregados (faltaban
     de verdad):
     - Dashboard "Laptops por estado" → `/inventario?estado=X` YA enlazaba, pero
       `/inventario` **no leía el query param** — el filtro nunca se aplicaba realmente al
       llegar. Corregido en `apps/web/src/app/(panel)/inventario/page.tsx` (lee
       `window.location.search` en un `useEffect` de montaje).
     - Ficha de laptop (`inventario/[id]/page.tsx`) no enlazaba a su lote de origen.
       Agregado `loteId` a `LaptopFicha` (`apps/web/src/data/inventario.ts`,
       `obtenerFicha` ahora selecciona `lote_id`) + link "Ver lote de origen →" junto al
       Chip de estado.
     - Ventas (`ListadoVentas.tsx`): el alias de la laptop y el nombre del comprador eran
       texto plano. Ahora la laptop enlaza a `/inventario/[laptopId]` y el comprador
       enlaza a `/ventas?tab=compradores&compradorId=X` (la pestaña Compradores ya tenía
       "historial de ventas" al seleccionar uno — solo faltaba el enlace desde Ventas).
       `VentasPage` ahora lee `tab`/`compradorId` de la URL igual que Inventario.
     - Paquete → ítem laptop (`lotes/paquetes/[id]/page.tsx`): la fila de un ítem tipo
       `laptop` mostraba el alias como texto plano; ahora enlaza a `/inventario/[ref_id]`.
     - Movimiento con referencia (`cuentas/page.tsx`, columna "Referencia"): mostraba
       "Venta"/"Lote"/"Costo" como texto plano. Ahora "Lote" enlaza a `/lotes/[lote_id]`
       (existe ficha de lote); "Venta" enlaza a `/ventas` (no existe una ficha de venta
       individual en el sistema — es la pantalla donde vive el recurso, decisión de
       producto ya tomada en plan-06, no algo que yo debía inventar); "Costo"
       (`costo_linea_id`) queda sin link porque no hay pantalla que muestre una línea de
       costo aislada.
     Verificado en el navegador contra datos reales: el chip "Vendida" del Dashboard
     efectivamente pre-selecciona "Vendida" en el filtro de Inventario tras el fix.

  2. **Consistencia visual** — recorridas las 8 pantallas. Colores de Chip por estado
     confirmados consistentes donde el mismo concepto aparece en más de una pantalla
     (origen local/ebay, paquete recibido/no, orden recibida/pendiente). Formato de
     dinero/fecha: sin manual formatting fuera de `<Dinero>`/`<FechaCorta>` (los
     `toFixed()` encontrados son tasas/porcentajes, no montos — correctamente fuera del
     alcance de `<Dinero>`). Títulos de página: consistentes (`text-2xl font-bold` en las
     8). **Favicon: NO existía ninguno** (`apps/web/src/app` no tenía `favicon.ico` ni
     `icon.*`, `public/` no existe) — agregado `apps/web/src/app/icon.svg` (favicon
     file-based de Next.js, cuadrado oscuro con "TF"), confirmado servido en
     `next build` (`/icon.svg` aparece en la tabla de rutas) y en `next dev`
     (`GET /icon.svg 200`).
     **Tono "naranja" de `TonoChip`** (hallazgo de plan-10a): agregado a
     `apps/web/src/ui/Chip.tsx` (`naranja: 'bg-orange-100 text-orange-800'`) + un prop
     `testId` nuevo (para no perder el `data-testid="dias-restantes"` que ya usaba
     `ventas.spec.ts`). Migrado `apps/web/src/app/(panel)/ventas/secciones/Garantias.tsx`
     de un `<span>` con Tailwind suelto a `<Chip tono={... ? 'naranja' : 'gris'}>` —
     queda dentro del sistema de componentes, ya no es la única excepción.

  3. **Estados vacíos y de error** — las 8 pantallas se recorrieron dos veces: (a) contra
     un usuario e2e con datos en su mayoría vacíos (0 laptops, 0 ventas — la suite de
     plan-10b limpia bien tras de sí) y (b) con `docker stop supabase_db_tecnofal` +
     recarga de cada pantalla. Ninguna crasheó (nunca pantalla en blanco ni error de
     React) en ninguno de los dos escenarios. **Encontré una excepción real en (b):
     Cuentas (`cuentas/page.tsx`) no tenía NINGÚN manejo de errores** — todas sus cargas
     (`listarCuentas`/`recargarSaldos`/`recargarConversiones`/`recargarTasas`/
     `recargarDeudas`/`recargarLibro`) eran `await` sueltos sin try/catch; con la BD
     caída, la pantalla no crasheaba pero tampoco mostraba ningún mensaje — se quedaba
     con los saldos/tablas vacíos en silencio (falla silenciosa, no cumplía "mensaje de
     error legible"). Corregido: agregado estado `error` + try/catch en el efecto de
     carga inicial y en `recargarLibro`, con un banner rojo igual al patrón ya usado en
     el resto de pantallas. Verificado en el navegador: ahora muestra "Error al cargar
     los datos de cuentas" con la BD caída. Reinicié el contenedor
     (`docker start supabase_db_tecnofal`) y confirmé que las 8 pantallas (spot-check en
     Dashboard y Cuentas, las más pesadas en llamadas) volvieron a cargar datos reales
     normalmente ANTES de correr la suite completa.

  4. **Suite completa `--workers=1`, dos veces** — primera corrida: 47/47 verde. Segunda
     corrida: **1 falla real** (no la contención ya documentada) en
     `ciclo-completo.spec.ts`, Etapa 9 — `page.keyboard.press('Control+Shift+C')` disparado
     justo después de esperar que la sidebar sea visible, pero el listener del atajo lo
     registra `<ConversionRapida/>` (montada en el layout) en un `useEffect` que puede no
     haber corrido todavía (la visibilidad del sidebar no implica hidratación completa de
     TODOS los efectos del layout). El mismo patrón exacto ya vivía en `cuentas.spec.ts`
     con un comentario que reconocía el riesgo sin resolverlo del todo — ahí no falló en
     mis corridas, pero comparte la causa raíz. Corregido en AMBOS specs
     (`ciclo-completo.spec.ts` y `cuentas.spec.ts`): en vez de un solo intento, un
     `expect(async () => { press + expect visible con timeout corto }).toPass({ timeout:
     15000 })` que reintenta el keypress hasta que el modal aparece. Repetí la suite
     completa DOS VECES MÁS tras el fix: **47/47 verde ambas veces**, sin volver a ver
     esa falla ni ninguna otra.

  5. **`apps/web/README.md` actualizado** — sección "Pruebas" reescrita con el flujo
     definitivo: cómo correr un spec individual vs. la suite completa, por qué
     `--workers=1` es obligatorio para la suite completa (y también al repetir un spec
     largo con `--repeat-each`), y las notas operativas de usuario e2e compartido /
     limpieza por spec.

  6. **"Hallazgos para la especificación"** — revisadas las 6 entradas heredadas de
     plan-10a (4) y plan-10b (2): siguen ahí, no las borré, una de ellas (tono naranja) la
     cerré con código (ver punto 2 arriba) pero dejé la entrada tal cual para que quede
     registro de qué se hizo. Agregué 2 entradas propias (ver más abajo) sobre problemas
     de tooling/build descubiertos al ejecutar `next build` como parte de mi verificación
     (duplicación de `@types/react` en el monorepo rompiendo `<Suspense>`; comentarios
     `eslint-disable` para reglas no registradas más allá de `react-hooks/exhaustive-deps`).
     La sección NO queda vacía — son 8 entradas en total (6 heredadas + 2 mías), todas
     documentadas para reportar al usuario al cerrar la Fase 2.

  7. Esta misma entrada de Bitácora.

  **Hallazgo operativo NO incluido en "Hallazgos para la especificación"** (es basura de
  datos de pruebas anteriores, no un problema de esquema/spec): encontré residuos reales en
  la base compartida `supabase_db_tecnofal` de corridas de desarrollo previas de plan-10b
  (antes de su fix de orden de limpieza) — 9 `paquetes` con courier `'E2E Courier'` sin
  ningún `paquete_items` ni laptop asociada, 6 partes de stock `E2EBateria...` con cantidad
  1 cada una, y 2 `ordenes_partes` con fuente `E2E-...` sin ítems. Confirmé por SQL que
  ninguno tiene relaciones activas (0 items, 0 laptops) — son inofensivos para cualquier
  invariante o el Dashboard, y las 2 corridas completas de la suite (punto 4) pasaron
  igual con ellos presentes. NO los borré yo mismo (regla del plan: nunca aplicar cambios
  directos a la base compartida). Si el coordinador quiere limpiarlos, el comando es:
  ```
  docker exec supabase_db_tecnofal psql -U postgres -d postgres -c "delete from paquetes where courier='E2E Courier'; delete from partes_catalogo where nombre like 'E2EBateria%'; delete from ordenes_partes where fuente like 'E2E-%';"
  ```
  (no es bloqueante — la Fase 2 puede cerrarse sin esto).

  No me quedé sin contexto en ningún momento — plan cerrado de punta a punta en esta misma
  sesión.

## Hallazgos para la especificación

Hallazgos de las bitácoras de 10a/10b/10c (y propios) que impliquen corregir la
especificación o los planes — para reportarlos al usuario al cerrar la Fase 2.

- **[plan-10a, 2026-07-11] plan-02 describía mal el esquema real de `modelo_avisos`/
  `tipos_aviso`.** La sección "Contexto esencial" de `plan-02-configuracion.md` documentaba
  `modelo_avisos(id, modelo_id fk, tipo_clave fk, severidad, motivo, origen, autor,
  creado_at)` y `tipos_aviso(clave pk, nombre)`; la tabla real usa `tipo_aviso_id` (uuid FK
  a `tipos_aviso.id`, no `tipo_clave` de texto), no tiene columna `autor` (usa `user_id`
  estampado por trigger) y la fecha es `created_at`, no `creado_at`. El agente de plan-02 lo
  detectó por introspección en runtime y corrigió su propio código
  (`apps/web/src/data/configuracion.ts`, `secciones/Modelos.tsx`) para usar las columnas
  reales — no requiere ningún cambio de código adicional, solo dejar constancia de que la
  abreviatura del esquema embebida en `plan-02-configuracion.md` no coincide con la base y
  no debería reusarse como referencia si algún plan futuro vuelve a tocar `modelo_avisos`.

- **[plan-10a, 2026-07-11] Kit UI compartido (`apps/web/src/ui/Chip.tsx`) no cubre el tono
  "naranja" que plan-06 necesita.** `plan-06-ventas.md` pide un badge naranja para
  garantías con <15 días restantes, pero `TonoChip` (creado por plan-00) solo define
  verde/amarillo/rojo/azul/gris. El agente de plan-06 no editó el kit compartido (fuera de
  su alcance) y usó un `<span>` con clases Tailwind sueltas en `Garantias.tsx` en vez de
  `<Chip>` para ese caso puntual — funciona, pero rompe la regla de "un solo componente de
  color por estado" que plan-10c debe verificar en el paso de consistencia visual. Vale la
  pena que un plan futuro (o plan-10c mismo) añada el tono `naranja` a `TonoChip` y migre
  ese badge a usarlo, para que quede dentro del sistema en vez de ser la única excepción.

- **[plan-10a, 2026-07-11] `v_resultado_cambiario` no está descrita con precisión en el
  contexto de plan-07.** El plan menciona `cuenta_origen`/`cuenta_destino` junto a
  `moneda_origen`/`moneda_destino` sin aclarar que en realidad son el **nombre** de la
  cuenta (`cuentas.nombre`, ya resuelto vía JOIN dentro de la vista), no su `uuid` — y no
  documenta que `resultado` viene `NULL` cuando `moneda_origen <> moneda_destino` (la vista
  solo calcula resultado cambiario para conversiones dentro de la MISMA moneda). El agente
  de plan-07 lo confirmó por introspección (`pg_get_viewdef`) y lo compensó de forma
  defensiva en la UI (`nombreCuentaPara` en `cuentas/page.tsx`) sin tocar SQL. No bloquea
  nada hoy, pero si algún plan futuro reutiliza esa vista asumiendo uuids o un `resultado`
  siempre no-nulo, va a fallar en silencio — vale la pena documentarlo donde viva la
  definición canónica de las vistas de dashboard/cuentas.

- **[plan-10a, 2026-07-11] `packages/core` no genera exactamente lo que `plan-08-calculadora.md`
  describe para compras de origen `local`.** El plan pide que el modo local produzca una
  línea de costo `flete_nacional` y que las laptops nazcan en estado `en_revision`; los
  helpers reales del motor (`cadenaCostos`/`lineasDeCompra`/`filasLaptops` en
  `packages/core`) no distinguen `origen: 'local'` — generan una línea `envio_vzla` (en vez
  de `flete_nacional`) y siempre fijan `estado: 'comprada'` sin importar el origen. Los
  montos numéricos ya son correctos para local (no es un bug de fórmula), pero la
  categorización de tipo/estado no coincide con lo que la especificación y el plan
  describen. El agente de plan-08 no tocó `packages/core` (fuera de su alcance) — lo
  remapea en la capa de datos de la web (`apps/web/src/data/calculadora.ts::crearLote`).
  Esto es una discrepancia real entre el motor compartido (usado también por
  `apps/extension`) y lo que el plan/especificación describen para el modo local; alguien
  con contexto de `packages/core` debería decidir si el motor se corrige (afectaría también
  a la extensión) o si la especificación se ajusta para reflejar el comportamiento actual.

- **[plan-10b, 2026-07-11] Ninguna pantalla de la web permite fijar/editar `service_tag`
  de una laptop creada por Calculadora → "Convertir en lote", y eso hace inalcanzable por
  UI el buscador "por alias" de `InstalarModal`/`CosecharModal`.** `apps/web/src/app/(panel)
  /calculadora/page.tsx` nunca pide `service_tag` (a diferencia de las altas manuales en
  `/lotes`), así que `alias` (columna generada `right(service_tag,4)`) queda `null` para
  esas laptops de por vida — no hay ningún campo editable en `/inventario/[id]/page.tsx`
  (el "Service tag" ahí es solo de lectura) ni en ningún otro lugar de la app para
  corregirlo después. `InstalarModal.tsx`/`CosecharModal` filtran/etiquetan por
  `alias` (`listarLaptopsInstalables`/`listarLaptopsDonantes` devuelven `alias ?? ''`), así
  que CUALQUIER laptop comprada en lote vía Calculadora que necesite instalar una parte o
  ser cosechada como donante aparece con una fila de texto vacío en ese modal — si hay más
  de una laptop así en el mismo estado simultáneamente (situación normal: un lote de varias
  laptops que llegan juntas a `falta_partes`), son indistinguibles entre sí y un usuario
  real podría instalar una parte en la laptop equivocada por error de click, no solo un
  problema de pruebas. El e2e de plan-10b (`apps/web/e2e/ciclo-completo.spec.ts`, Etapa 6)
  lo bordeó con UN parche de metadata documentado (`admin.from('laptops').update({
  service_tag })` inmediatamente después de crear el lote, simulando el "etiquetado físico"
  que ocurriría en la vida real) para poder seguir el resto del flujo por UI — no es una
  solución de producto. Vale la pena que un plan futuro agregue un campo editable de
  `service_tag` en la ficha de inventario (o en el alta de lote), y considere que
  `InstalarModal`/`CosecharModal` deberían mostrar un identificador alterno (ej. `id`
  corto o specs) cuando `alias` es null/vacío en vez de una fila en blanco.

- **[plan-10b, 2026-07-11] El costo real de "revisión" registrado al recibir un paquete
  (`recibir_paquete`, migración 0015) nunca entra al costo de ninguna laptop ni al
  dashboard.** `prorratear_paquete()` (0001_schema.sql) solo redistribuye `envio_vzla`
  (flete) y `seguro` entre `paquete_items` — el tipo `'revision'` se guarda en
  `costo_lineas` (ámbito `paquete`) y se expone de solo lectura en la vista
  `paquete_costos`, pero `v_laptop_costos` (que arma `costo_directo`/`costo_final` por
  laptop) solo lee `flete_prorrateado`/`seguro_prorrateado` de `paquete_items`, nunca
  `revision`; y `v_dashboard_totales.total_invertido` tampoco lo alcanza por ninguna otra
  vía. En la práctica: un usuario que pague una revisión real de inspección/testing al
  recibir un paquete (el propio flujo de recibir_paquete la pide como dato "real", igual
  que flete/seguro) ve ese gasto reflejado en `paquete_costos` pero JAMÁS reduce ninguna
  ganancia reportada — ni por laptop ni en el Dashboard. El e2e de plan-10b
  (`ciclo-completo.spec.ts`, Etapa 3) usa una revisión real de $8 a propósito para
  documentar esto: el invariante de ganancia (Etapa 8) NO la incluye porque el sistema
  mismo no la incluye — coincide con `v_ventas_ganancia`, así que no es un bug de la
  fórmula del invariante, es un vacío real de contabilidad en el esquema. `plan-01-sql-rpc`
  y `plan-04-lotes-paquetes` (dueños de `prorratear_paquete`/`recibir_paquete`) deberían
  decidir si `revision` debe prorratearse también (como flete/seguro) o si es
  deliberadamente un costo "no asignado a inventario" — hoy no está documentado ninguna de
  las dos cosas, solo el código.

- **[plan-10c, 2026-07-11] El monorepo tiene DOS versiones de `@types/react` instaladas
  (`18.3.31` en la raíz, `19.2.17` fijada solo para `@tecnofal/web`) — cualquier componente
  genérico sensible a la identidad exacta del tipo `ReactNode` (ej. `<Suspense>`) revienta
  `next build` con un error de tipos ("Suspense cannot be used as a JSX component") aunque
  `apps/web/node_modules/@types/react` resuelva correctamente a 19.2.17.** Lo disparó al
  intentar usar `useSearchParams()` + `<Suspense>` (patrón estándar de Next.js) para que
  `/inventario` y `/ventas` lean filtros desde la URL (cross-links del Dashboard/Ventas,
  tarea 1 de este plan) — nadie en el proyecto había usado `<Suspense>` explícitamente
  antes de hoy, así que el problema estaba latente sin manifestarse. Lo evadí SIN tocar
  dependencias/lockfile (fuera de mi alcance): en vez de `useSearchParams()` +
  `<Suspense>`, ambas páginas leen `window.location.search` dentro de un `useEffect` en el
  cliente (ver `apps/web/src/app/(panel)/inventario/page.tsx` y `.../ventas/page.tsx`) —
  funciona igual para el usuario pero es un patrón menos idiomático de Next.js. Cualquier
  plan futuro que quiera usar `<Suspense>`, `useSearchParams()` con streaming real, u otro
  API de React sensible a la identidad de tipos debería primero resolver la duplicación de
  `@types/react` en la raíz del monorepo (probablemente viene de `apps/extension`, que
  sigue en React 18) — hoy no está documentado en ningún lado, solo se descubre corriendo
  `next build` (que ESTE plan corrió porque construyó parte de su verificación sobre él;
  `next dev`, que es lo que usan los specs de Playwright, NO lo detecta).

- **[plan-10c, 2026-07-11] El problema de comentarios `eslint-disable-next-line` para reglas
  no registradas (documentado en `planes/README.md` solo para
  `react-hooks/exhaustive-deps`) es más amplio: también rompe `next build` con
  `@next/next/no-img-element`.** `eslint.config.mjs` no registra el plugin de Next.js
  (`@next/next`) ni el de `react-hooks` — CUALQUIER `eslint-disable(-next-line)` que
  nombre una regla de un plugin no registrado hace que ESLint (flat config) reporte un
  error de "regla desconocida" en vez de silenciar nada, y `next build` (que corre lint
  como parte del build) falla duro por eso. Encontrado en
  `apps/web/src/app/(panel)/inventario/[id]/page.tsx` (comentario sobre un `<img>`, ya
  quitado — no hacía falta reemplazarlo por nada porque la regla que pretendía silenciar
  ni siquiera está cargada). `bunx playwright test`/`next dev` NO lo detectan (no corren
  lint), así que este tipo de comentario puede colarse sin que ninguna spec lo note; solo
  `next build` lo revienta. Vale la pena que la nota de `planes/README.md` sobre
  `eslint-disable-next-line` se generalice a "cualquier regla de un plugin no registrado en
  `eslint.config.mjs`" en vez de mencionar solo `react-hooks/exhaustive-deps`, y que algún
  plan futuro considere correr `next build` (no solo `next dev` + Playwright) como parte de
  la verificación estándar, ya que es el único paso que atrapa esta clase de error hoy.

- **[hallazgo #6, 2026-07-11] RESUELTO — prorrateo de "revisión" ahora entra a
  `v_laptop_costos`/`v_ventas_ganancia`.** Migración `supabase/migrations/0026_prorratear_revision.sql`
  (espejo Nhost `nhost/migrations/default/1751900000025_prorratear_revision/up.sql`):
  agrega `paquete_items.revision_prorrateado`, hace que `prorratear_paquete()` reparta
  también `costo_lineas.tipo='revision'` (ámbito paquete) por `volumen_pie3` — misma base
  que flete, no `valor_declarado` (base de seguro) — y que `v_laptop_costos.prorrateo_paquete`/
  `costo_final` sumen ese nuevo campo. `v_dashboard_totales.total_invertido` NO se tocó
  (sigue en `costo_proyectado`, decisión de diseño previa y ajena a este bug).
  **Desviación de numeración respecto al draft del encargo**: se pidió usar
  `0025_prorratear_revision.sql`, pero para cuando ejecuté esto `supabase/migrations/0025_ram_ssd_soldada_deduccion.sql`
  ya existía (otro trabajo del mismo día) — usé **`0026`** en su lugar. El espejo Nhost
  `1751900000025_prorratear_revision` sí seguía libre (el `_ram_ssd_soldada_deduccion` de
  Nhost quedó con timestamp `1751900000024`, duplicando sufijo con `_guard_congelar_reparto`)
  y se usó tal cual el draft pedía. Validado de punta a punta en contenedor Postgres 15
  desechable (`tf_valida6`, ya eliminado): cadena completa `compat_prelude` + `0001..0026`
  aplicada limpia (con stub mínimo de `auth.users` + `auth.uid()` real de Supabase leyendo
  `request.jwt.claims`, protocolo ya documentado en `planes/HANDOFF.md`). Datos de prueba ad
  hoc (propios, no del spec): paquete con 2 laptops (L1 vol=2/valor=100, L2 vol=4/valor=200)
  y `recibir_paquete(flete=90, seguro=30, revision=60)` → L1 (2/6 del volumen total) queda
  con `flete_prorrateado=30`, `seguro_prorrateado=10` (valor 100/300), `revision_prorrateado=20`;
  L2 (4/6) con `60`/`20`/`40`; `v_laptop_costos.prorrateo_paquete`/`costo_final` de L1 dieron
  `60` (=30+10+20) y de L2 `120` (=60+20+40), coincidiendo con la suma esperada. Con
  `revision_real=0` en un paquete aparte (1 laptop, vol=3/valor=150, flete=45/seguro=15):
  `flete_prorrateado=45`, `seguro_prorrateado=15` — exactamente los mismos números que daría
  la función sin el fix (no hay regresión para paquetes sin costo de revisión), con
  `revision_prorrateado=0`. También confirmé que una venta de prueba sobre L1 en
  `v_ventas_ganancia` da `ganancia_neta = precio_venta - 60`, es decir, ya descuenta la
  revisión prorrateada. Los números reales del spec (`ciclo-completo.spec.ts`, 2 laptops
  vol=2/valor=200 cada una + 1 ítem personal vol=1/valor=100, `revision_real=8`) no se
  ejecutaron en el contenedor desechable — se derivaron a mano (2/5 · 8 = 3.2 para la laptop
  A) y quedan pendientes de confirmación real corriendo el spec contra Supabase una vez
  aplicada la migración. Actualizado en el mismo cambio:
  `apps/web/e2e/ciclo-completo.spec.ts` (Etapa 3 lee y verifica `revision_prorrateado` de la
  laptop A — `2/5 * 8 = 3.2` — y el invariante de ganancia de la Etapa 8 ahora suma
  `revisionProrrateadoA` a `costoFinalA`); `apps/web/e2e/lotes.spec.ts` y
  `apps/web/e2e/dashboard.spec.ts` no necesitaron cambios (ambos usan `revision_real=0` o no
  involucran paquetes, así que el fix no altera sus números). También se agregó
  `revision_prorrateado` a `apps/web/src/data/paquetes.ts` (`PaqueteItem`,
  `listarItemsPaquete`) y una columna "Revisión prorrateada" a la tabla de ítems en
  `apps/web/src/app/(panel)/lotes/paquetes/[id]/page.tsx` — el desglose por ítem de
  flete/seguro ya se mostraba ahí; dejar revisión fuera habría sido una inconsistencia
  visual nueva. La migración NO se aplicó al contenedor compartido `supabase_db_tecnofal`
  (confirmado por introspección: `paquete_items.revision_prorrateado` no existe ahí) — los
  specs no se pudieron correr contra el entorno real en esta sesión; falta que el
  coordinador aplique la migración y luego se corra
  `bunx playwright test e2e/ciclo-completo.spec.ts e2e/cuentas.spec.ts e2e/lotes.spec.ts`.
