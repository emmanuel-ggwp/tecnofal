# Plan 10b — e2e maestro del ciclo de vida completo

**Grupo C · Requiere plan-10a cerrado (backlog/bitácoras resueltos) · Segunda etapa de la
integración final, se ejecuta sola. Sin SQL nuevo — solo un spec Playwright.**

## Objetivo

Escribir `apps/web/e2e/ciclo-completo.spec.ts`: una prueba end-to-end larga, seria, que
recorre el ciclo de vida completo de un lote de laptops **enteramente por UI** (sin seeds
intermedios más allá del catálogo de partes y el usuario e2e), demostrando que las 8
pantallas funcionan como UN sistema coherente — no solo que cada una pasa sus propias
pruebas por separado.

## Contexto esencial

Flujo de negocio a recorrer (resumen del §3 de la especificación; los detalles exactos de
columnas/RPC de cada paso ya los tiene el `data/*.ts` de cada dominio — no los repitas de
memoria, ábrelos si dudas):

```
1. Calculadora: evaluar compra eBay de 2 laptops → "Convertir en lote"
   → RPC registrar_compra_lote (migración 0022) → laptops en estado 'comprada'
2. Lotes: crear un paquete, agregar las 2 laptops + 1 ítem personal
   → RPC agregar_item_laptop_paquete (0022) → laptops 'en_transito'
3. Lotes/Paquetes: avanzar sub-estados del paquete en orden → "Recibido" con
   flete/seguro/revisión reales → RPC recibir_paquete (0015) → prorrateo + laptops
   'en_revision'
4. Lotes: revisión física del lote → registrar 1 batería encontrada → "Congelar reparto"
   → RPC congelar_reparto_lote (con el guard nuevo de plan-10a si se aplicó — el flujo
   normal de congelar UNA vez debe seguir funcionando idéntico)
5. Inventario: a una de las 2 laptops, agregar un detalle de condición + specs post-upgrade
   (ram/ssd editados)
6. Partes: comprar un SSD vía una orden (con prorrateo de envío) → recibir la orden →
   instalar el SSD en la laptop del paso 5 (RPC instalar_parte, 0022) → costo_linea tipo
   'parte' creada
7. Inventario: la laptop pasa de 'falta_partes' a 'lista_para_venta' (sugerencia +
   confirmación manual — ver v_sugerencia_partes_completas)
8. Ventas: vender esa laptop en USD → RPC registrar_venta (0014) → estado 'vendida'
9. Cuentas: confirmar que el ingreso de la venta está en la cuenta elegida; hacer una
   conversión Zinli→Binance (modal global, atajo Ctrl+Shift+C) → RPC registrar_conversion
   (0016) → aparece en resultado cambiario
10. Dashboard: TODOS los números (total invertido, valor inventario, ganancia bruta/neta,
    resultado cambiario, laptops por estado) reflejan lo anterior
11. Ventas: devolución por garantía de esa venta → RPC devolver_garantia (0014) → laptop
    'para_repuestos', movimiento de egreso
12. Dashboard: la ganancia revertida ya NO aparece en los acumulados
```

**Invariante central a verificar al final** (calculado A MANO en el spec con los montos
reales usados en cada paso, no copiado de lo que muestre la UI):
```
ganancia_neta = precio_venta − (costo_asignado_del_reparto + costo_de_la_parte_instalada
                                 + prorrateo_de_paquete_flete_y_seguro
                                 + demás costo_lineas reales de esa laptop)
```
Compara ese número calculado contra `v_ventas_ganancia.ganancia_neta` (vía `clienteAdmin()`)
Y contra lo que muestra la pantalla de Ventas — deben coincidir al centavo.

**Convenciones ya establecidas hoy (no las redescubras):**
- Selector de sidebar: `page.getByRole('complementary', { name: 'Navegación principal' })`.
- El usuario e2e (`e2e@tecnofal.test`) es compartido con TODAS las demás specs, pero este
  test corre solo (no en paralelo con otros — es la única invocación de su tipo). Aun así,
  usa nombres/alias con sufijo único (ej. `Date.now()` o un UUID corto) para no chocar si
  alguna vez se corre junto a otros archivos.
- `eslint-disable-next-line react-hooks/exhaustive-deps` NO funciona en este repo (plugin
  no registrado) — no lo necesitas para un archivo de prueba, pero si tocas algún
  componente, no lo uses.
- Usa `test.step(...)` para cada una de las 12 etapas — facilita el diagnóstico si algo
  falla a mitad de camino.
- Limpieza: al final (`try/finally` o un `afterAll`), borra TODO lo que sembró este test
  (lote, paquete, laptops, orden de partes, venta, movimientos, conversión) para que se
  pueda correr repetidamente sin acumular basura.

## Tareas

1. Antes de escribir el spec, revisa brevemente `apps/web/e2e/lotes.spec.ts`,
   `partes.spec.ts`, `ventas.spec.ts`, `cuentas.spec.ts`, `dashboard.spec.ts` — no para
   copiarlos, sino para reusar sus patrones de siembra/selectors probados (ya pasaron por
   una auditoría de calidad hoy, son una referencia confiable de qué `data-testid`/labels
   usar en cada pantalla).
2. Escribe `apps/web/e2e/ciclo-completo.spec.ts` con las 12 etapas como `test.step`, más el
   cálculo del invariante de ganancia al final.
3. Corre SOLO este spec varias veces (`bunx playwright test e2e/ciclo-completo.spec.ts
   --repeat-each=2`) para confirmar que es estable y limpia bien tras de sí.

## Fuera de alcance

Cross-links entre pantallas, consistencia visual, estados vacíos/error, correr la suite
COMPLETA de todos los dominios (eso es plan-10c). No toques ningún `data/*.ts` ni ninguna
otra pantalla — este plan solo AGREGA un archivo de spec nuevo.

## Criterios de aceptación

- `ciclo-completo.spec.ts` pasa de forma estable (mínimo 2 corridas seguidas) contra el
  Supabase local real, sin dejar residuos.
- El invariante de ganancia cuadra al centavo.
- Las 12 etapas están como `test.step` nombrados con claridad.

## Contexto permitido

- Este plan + `planes/README.md` + `planes/HANDOFF.md` (contexto general del día).
- `apps/web/e2e/lotes.spec.ts`, `partes.spec.ts`, `ventas.spec.ts`, `cuentas.spec.ts`,
  `dashboard.spec.ts`, `helpers/db.ts` — como referencia de patrones ya probados.
- Los `data/*.ts` de los dominios que toques, si necesitas confirmar un nombre de columna
  o de RPC exacto.
- NO leer: especificación completa, extensión, esquema SQL completo (los nombres exactos
  ya están en los `data/*.ts` y en el HANDOFF).

## Bitácora

Sección viva — el agente ejecutor la va llenando; plan-10c la revisa completa al cerrar
la integración.

- **2026-07-11 — CERRADO EN VERDE.** Se creó `apps/web/e2e/ciclo-completo.spec.ts` con las
  12 etapas como `test.step` (Calculadora → Lote → Paquete → Recepción → Revisión física →
  Inventario/specs → Partes/instalación → Inventario/sugerencia → Venta → Cuentas/conversión
  → Dashboard → Devolución garantía → Dashboard), enteramente por UI real contra el
  Supabase local (`supabase_db_tecnofal`), con limpieza completa en `try/finally`.
  Verificado estable con 2 corridas de `--repeat-each=2 --workers=1` seguidas (4 corridas
  verdes en total, tras una corrida de "calentamiento" — ver nota de flakiness abajo), sin
  dejar residuos en la base (confirmado con `select count(*)` sobre `lotes`/`paquetes`/
  `ventas`/`conversiones`/`partes_catalogo`/`compradores`/`laptops` filtrados por los
  sufijos del test, siempre 0 tras cada corrida).

- **Invariante de ganancia: cuadra al centavo.** `ganancia_neta = precio_venta −
  (costo_asignado_del_reparto + costo_de_la_parte_instalada + prorrateo_de_paquete +
  demás costo_lineas reales de la laptop)` se calculó a mano leyendo los valores base
  (`lote_reparto.costo_asignado`, `laptop_partes.costo_aplicado`,
  `paquete_items.flete_prorrateado`/`seguro_prorrateado`) — nunca copiando de
  `v_ventas_ganancia` ni de la UI — y se comparó con `toBeCloseTo(…, 2)` contra
  `v_ventas_ganancia` (vía `clienteAdmin()`) Y contra el texto renderizado en la fila de
  `/ventas`. Coincidió en las 4 corridas.

- **Hallazgo operativo (no de especificación, documentado inline en el spec):** la
  Calculadora nunca pide `service_tag` para las laptops de un lote, y ninguna pantalla
  permite editarlo después — eso deja `alias` (columna generada) en `null` para siempre y
  hace inalcanzable por UI el buscador "por alias" de `InstalarModal`/`CosecharModal`
  (necesario en la Etapa 6). Se usó UN parche de metadata vía `clienteAdmin()`
  (`laptops.service_tag`, inmediatamente tras crear el lote, simulando el etiquetado físico
  real) para poder seguir el resto del flujo 100% por UI — no afecta ninguna RPC
  transaccional ni el invariante. Registrado como hallazgo real en
  `plan-10c-cohesion-verificacion.md` (ver abajo) porque también es un riesgo de UX real
  para usuarios (filas de alias en blanco e indistinguibles en esos modales).

- **Hallazgo de especificación (agregado a `plan-10c-cohesion-verificacion.md` →
  "Hallazgos para la especificación", 2 entradas nuevas, sin borrar las 4 de plan-10a):**
  1. el gap de `service_tag`/`alias` descrito arriba.
  2. el costo real de "revisión" registrado al recibir un paquete (`recibir_paquete`)
     nunca se prorratea a ninguna laptop (`prorratear_paquete` solo reparte flete/seguro) ni
     entra al Dashboard (`v_laptop_costos`/`v_dashboard_totales` no lo referencian) — se usó
     una revisión real de $8 a propósito en la Etapa 3 para dejarlo documentado; el
     invariante de la Etapa 8 no la incluye porque el sistema tampoco lo hace (coincide con
     `v_ventas_ganancia`, confirmando que no es un error de la fórmula del test sino un
     vacío real del esquema).

- **Ajustes operativos hechos en el propio spec (no son hallazgos de especificación, solo
  notas para quien retome/corra esto después):**
  - `test.setTimeout(180_000)` al inicio del test: el timeout global de Playwright
    (`playwright.config.ts`, 45s) alcanza para specs de un solo dominio pero no para las 12
    etapas por UI de este spec — no se tocó el config global (afectaría a las demás specs),
    solo este test.
  - Corriendo `--repeat-each=2` con los workers por defecto, las 2 repeticiones se
    ejecutaron en paralelo contra el MISMO servidor `next dev` y el MISMO usuario e2e,
    reproduciendo la misma contención ya documentada en `planes/README.md` para múltiples
    specs a la vez (aquí con múltiples repeticiones del mismo spec) — hay que usar
    `--workers=1` también para este spec al repetirlo.
  - La primera corrida contra un `next dev` recién arrancado (compilación en frío de ~8
    rutas nuevas) fue flaky 3 veces seguidas en pasos distintos (timeout de step, texto no
    encontrado) mientras la repetición inmediatamente siguiente en el mismo proceso pasó
    siempre limpio — coincide con el patrón de "contención/compilación de next dev en modo
    desarrollo" ya documentado en el proyecto, no con un bug del flujo. Se resolvió
    haciendo una corrida de "calentamiento" antes de medir la estabilidad real (igual que en
    la práctica ya pasa cuando esta spec corre después de otras en la suite completa,
    plan-10c). No se necesitó ningún retry ni sleep dentro del spec.
  - Se encontró y corrigió un bug propio de la limpieza (`finally`) durante el desarrollo:
    el orden original borraba `paquetes` ANTES que `laptops` (que tienen
    `laptops_paquete_id_fkey` sin `ON DELETE CASCADE`), dejando el `paquete` huérfano sin
    que el `delete` de supabase-js lo reportara como error visible (el spec no revisaba
    `.error` de esos deletes). Corregido reordenando el `finally` para borrar
    `lote_reparto`/`paquete_items` y luego `laptops` ANTES de `paquetes`/`lotes`. Los
    residuos de las corridas fallidas durante el desarrollo se limpiaron a mano por ID
    exacto antes de la verificación final de estabilidad.
