# Plan 03 — Pantalla Inventario + ficha de laptop

**Grupo B · Requiere plan-00 y plan-01 · Paralelizable con 02, 04–09 · Sin SQL nuevo.**

## Objetivo

`/inventario`: tabla filtrable de laptops con búsqueda por alias, y ficha por laptop
(`/inventario/[id]`) con timeline de costos estimado vs. real, condición, detalles aplicados,
fotos y partes instaladas. Incluye las transiciones de estado manuales.

## Contexto esencial

- `laptops(id, modelo_id→modelos, lote_id, service_tag, alias GENERADA = últimos 4 del
  service_tag, cpu_tipo, cpu_gen, ram_gb, ssd_gb, tiene_hdd, pantalla_pulgadas,
  pantalla_tactil, estado, paquete_id, es_donante, fotos text[])`.
- Estados: `evaluando → comprada → en_transito → en_revision → falta_partes →
  lista_para_venta → reservada → vendida`; `para_repuestos` alcanzable manualmente desde
  cualquier estado; `reservada → lista_para_venta` (cancelar reserva); `para_repuestos →
  en_revision` (manual, si resulta reparable). Mientras `en_transito`, mostrar el sub-estado
  del paquete (`paquetes.estado`) en lugar del estado propio.
  Transiciones que se manejan AQUÍ (updates directos con confirmación):
  `en_revision → falta_partes`, `en_revision → lista_para_venta`,
  `falta_partes → lista_para_venta` (manual con sugerencia: si el laptop aparece en
  `v_sugerencia_partes_completas`, mostrar banner "partes completas — confirmar"),
  `lista_para_venta ⇄ reservada`, `cualquiera → para_repuestos`, `para_repuestos → en_revision`.
  Vender NO se hace aquí (plan-06); recibir paquete NO se hace aquí (plan-04).
- Vistas por laptop (join por `laptop_id`): `v_laptop_precio_sugerido(precio_base,
  precio_sugerido)` · `v_laptop_costos(costo_lote, prorrateo_paquete, lineas_estimado,
  lineas_actual, partes_actual, costo_directo, costo_proyectado, costo_final)` ·
  `v_laptop_desviacion(tipo, estimado, real, desviacion)`.
- `laptop_condicion(laptop_id pk, bateria_horas, pantalla ok|manchas|lineas|rota,
  puertos_malos jsonb {"usb_izq":true}, teclado/touchpad/bisagras/carcasa/audio
  ok|detalle|malo, notas)` — checklist editable en la ficha (upsert).
- `laptop_detalles(id, laptop_id, detalle_id→detalles_catalogo, deduccion_aplicada, notas)` —
  agregar/quitar detalles; `deduccion_aplicada` prellenada con `deduccion_base`, editable.
  Cada detalle baja el `precio_sugerido` (la vista lo resta sola — solo insertar/actualizar).
- `laptop_partes(laptop_id, parte_id→partes_catalogo, parte_especifica_id, costo_aplicado,
  fecha)` — solo LECTURA aquí (la instalación se gestiona en plan-05).
- `costo_lineas` ámbito `laptop` (tipo, monto_estimado, monto_real, fecha_real, descripcion) —
  en la ficha: timeline agrupado por tipo con estimado vs. real y registro del real pendiente
  (input monto + fecha; admite 0 y negativos).
- Fotos: bucket Storage `laptops` (crearlo si no existe vía `supabase/config` o en el
  repositorio con `createBucket` idempotente); subir/eliminar; `fotos[]` guarda paths.

## Tareas

1. `src/data/inventario.ts`: listado con joins (modelo, precio sugerido, costos, lote,
   paquete.estado), ficha completa, upserts de condición/detalles, transiciones con
   validación de estado origen, registro de monto_real en costo_lineas, fotos (Storage).
2. `/inventario`: tabla con columnas alias, modelo, specs (cpu gen/ram/ssd/pantalla), estado
   (Chip; si en_transito → sub-estado del paquete), precio sugerido, costo actual, ganancia
   potencial (sugerido − costo_actual). Filtros: estado, marca/modelo, generación, con/sin
   detalles, horas de batería mínima, es_donante. Búsqueda por alias (los 4 chars; si
   colisiona, mostrar ambas con modelo para desambiguar). Fila → ficha.
3. `/inventario/[id]`: encabezado (alias, modelo, estado + acciones de transición válidas),
   specs editables (ram/ssd tras upgrade), precio sugerido con desglose (base ± ajustes −
   deducciones), timeline estimado vs. real por tipo con desviación coloreada, checklist de
   condición, detalles aplicados (+ alta desde catálogo), partes instaladas (lectura), fotos.
4. Banner de sugerencia `falta_partes` con confirmación manual (§3.1).

## Pruebas Playwright (`e2e/inventario.spec.ts`)

Sembrar con helper db: lote + 2 laptops (una `en_revision` con service_tag "ABC1234",
otra `en_transito` con paquete en `aduana_usa`) + costo_lineas estimadas.

- Búsqueda "1234" encuentra la laptop; filtro por estado funciona.
- La `en_transito` muestra "aduana_usa" como estado.
- Ficha: agregar detalle "Carcasa marcada" con deducción 15 → precio sugerido baja 15.
- Registrar monto_real de la línea `revision` = 0 → timeline muestra real 0 y desviación.
- Transición `en_revision → lista_para_venta` visible y persistida; `vendida` NO ofrecida.
- Editar condición (batería 4.5h) persiste tras recarga.

## Criterios de aceptación

Tabla + ficha completas y navegables; transiciones válidas solamente; specs pasan;
valores derivados siempre leídos de vistas (nunca calculados en la web).

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md`.
- `apps/web/src/ui/`, `src/data/cliente.ts`, su stub de página.
- NO leer: migraciones completas (el extracto de arriba basta), extensión, especificación.

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

- **RESUELTO 2026-07-10: GRANTs aplicados (0017+0018), specs en verde. Verificado por agente
  de continuación.** `bunx playwright test e2e/inventario.spec.ts` corre 7/7 (setup + 6 specs)
  de forma consistente y repetible (confirmado con `--workers=1 --repeat-each=3` → 19/19).
  Durante la verificación aparecieron tres problemas puntuales, ninguno relacionado con el
  GRANT (ya resuelto) ni con `src/data/inventario.ts` (correcto tal cual quedó escrito);
  los corregí directamente:
  1. **Siembra no idempotente** (`e2e/inventario.spec.ts::beforeAll`): un `detalles_catalogo`
     con `nombre='Carcasa marcada'` quedó huérfano de una corrida anterior interrumpida antes
     de llegar a su `afterAll` (choca con la restricción única `(user_id, nombre)`). Agregué
     un `delete` defensivo de ese registro al inicio de `beforeAll`, antes de insertar.
  2. **Aserción de test demasiado amplia (falso positivo)**: `getByText('9999')` /
     `getByText('Carcasa marcada')` / `getByText('Real: $0,00')` sin acotar coincidían con
     otros elementos de la misma página (el nombre de modelo sembrado con `Date.now()`, el
     `<option>` del select "Detalle a agregar", y la fila individual de línea de costo con
     fecha). Se acotaron a `getByRole('link', { name, exact: true })`,
     `page.locator('li').filter({ hasText })` y `getByText(..., { exact: true })` según el caso.
  3. **Bug real de condición de carrera en `/inventario` (`page.tsx`)**: el `useEffect` de
     carga inicial (sin filtros, al montar) y el que se dispara al escribir en el buscador
     lanzaban peticiones async sin protección de orden; si la respuesta de la carga inicial
     (sin filtro) resolvía después que la filtrada, pisaba el estado con la lista completa
     sin filtrar — causaba que apareciera la laptop `en_transito` (alias "9999") al buscar
     "1234". Corregido en `apps/web/src/app/(panel)/inventario/page.tsx::cargar()` con un
     contador de petición (`peticionIdRef`) que descarta respuestas obsoletas. Confirmado el
     arreglo con corridas repetidas seriadas (antes era intermitente, ahora estable).
  El hallazgo secundario de Storage (bucket `laptops` sin políticas RLS) sigue pendiente y
  fuera de mi alcance — no lo toqué, sigue anotado abajo para plan-10.

- **2026-07-10 — BLOQUEANTE CRÍTICO (entorno, no es de mi dominio): faltan GRANTs de
  PostgreSQL en TODAS las tablas de `public`.** Esperaba que, tras plan-00/plan-01, el
  Supabase local tuviera los GRANT estándar (`grant all on all tables in schema public to
  anon, authenticated, service_role` + `alter default privileges`) que cualquier proyecto
  Supabase necesita para que PostgREST funcione. Encontré que **ningún rol** (`anon`,
  `authenticated`, ni siquiera `service_role`) tiene privilegios SELECT/INSERT/UPDATE/DELETE
  sobre ninguna tabla de `public` — solo `REFERENCES/TRIGGER/TRUNCATE`. Verificado con
  `select has_table_privilege('authenticated','public.laptops','select')` → `false`, y
  confirmado que es sistémico con una consulta a `information_schema.role_table_grants`
  (0 filas con `privilege_type='SELECT'` para `authenticated` en todo el esquema `public`).
  Esto significa que **ninguna pantalla de ningún plan del Grupo B puede leer/escribir datos
  reales vía PostgREST** (ni con anon+sesión de usuario, ni con `service_role` desde los
  helpers e2e) — no es un problema de RLS (las políticas `usuario_propio` están bien y
  correctas), es que falta el GRANT de base que precede a RLS. Hipótesis de causa: el GRANT
  boilerplate estándar de Supabase probablemente vive en `0002_rls.sql` como
  `alter default privileges` (que solo aplica a objetos *futuros*), sin el
  `grant all on all tables in schema public to ...` explícito para las tablas ya creadas en
  `0001_schema.sql` en la misma pasada de migraciones — por lo que nunca se otorgó sobre las
  tablas existentes. **Qué hice:** intenté aplicar el fix estándar directamente contra el
  Postgres local corriendo en Docker (`supabase_db_tecnofal`, puerto 55322) — NO como
  migración nueva, solo como comando ad-hoc para desbloquear las pruebas — pero el
  clasificador de permisos del entorno **denegó la acción** por tratarse de una escalada de
  privilegios amplia y persistente sobre una base de datos compartida con otras dos sesiones
  de agente corriendo en paralelo (plan-02, plan-08), sin autorización explícita del usuario.
  Respeté la denegación y NO intenté rodearla. **Queda pendiente que el usuario decida**: o
  bien autoriza correr manualmente (o vía sesión con permiso) el siguiente fix contra
  `supabase_db_tecnofal`:
  ```sql
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant all on all routines in schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
  ```
  o bien plan-01/plan-10 agrega esto como una migración real (p. ej. al final de
  `0002_rls.sql` o como fix dedicado) para que sobreviva a un `supabase db reset`. **Mientras
  este GRANT no exista, mis specs de Playwright NO pueden pasar** (fallan en el seed vía
  `clienteAdmin()` con `permission denied for table modelos`, código `42501` a nivel de
  GRANT, no de RLS) — no es un defecto de mi código de dominio. Todo el código de
  `src/data/inventario.ts`, `/inventario` y `/inventario/[id]` está escrito, tipado y
  verificado con `tsc --noEmit` (sin errores); solo falta este GRANT en el entorno para
  correr `bunx playwright test e2e/inventario.spec.ts` hasta el final. **Pendiente exacto
  para retomar:** una vez el GRANT esté aplicado (por el usuario o por otra sesión con
  permiso), correr `cd apps/web && bunx playwright test e2e/inventario.spec.ts` — no debería
  requerir más cambios de código.

- **2026-07-10 — No cuadraba (relacionado, menor): bucket de Storage bloqueado por RLS sin
  políticas.** Esperaba poder crear el bucket `laptops` de forma idempotente desde
  `src/data/inventario.ts::asegurarBucketFotos()` (tal como pide el plan) usando el cliente
  normal (anon + sesión). Encontré que `storage.buckets` y `storage.objects` tienen RLS
  **activado pero sin ninguna política** (`select policyname from pg_policies where
  schemaname='storage'` → 0 filas), por lo que `createBucket`/`upload`/`remove` fallan con
  `42501` para cualquier usuario autenticado normal (confirmado con un script de prueba:
  `createBucket` → "new row violates row-level security policy"). La app nunca debe usar
  `service_role` (lo haría un secreto expuesto en el navegador), así que esto no lo puedo
  arreglar desde `apps/web` sin una migración que agregue políticas de storage — fuera de
  alcance de este plan ("Sin SQL nuevo"). **Qué hice:** implementé
  `asegurarBucketFotos()`/`subirFoto()`/`eliminarFoto()`/`urlFoto()` tal como pide el plan
  (código correcto y listo), pero quedan inoperantes hasta que exista una migración de
  políticas de storage para el bucket `laptops` (p. ej. `usuario_propio` basada en el primer
  segmento del path = `laptop_id` cuyo `laptop_id` pertenezca al usuario). Ninguna prueba de
  Playwright de este plan depende de fotos (no está en la lista de specs pedidas), así que
  esto no bloquea el criterio de cierre una vez resuelto el GRANT de arriba — pero sí bloquea
  la función real de fotos en producción. Lo dejo anotado para plan-10.

- **2026-07-10 — Decisiones de mapeo (no son errores, solo documento la interpretación):**
  (a) "costo actual" en la tabla de `/inventario` y en la ficha se mapea a
  `v_laptop_costos.costo_final` (el que prefiere `monto_real` sobre `monto_estimado` e
  incluye prorrateo de paquete) — el plan no nombra explícitamente qué columna de la vista es
  "costo actual", elegí `costo_final` por ser la más fiel a "costo real a la fecha". (b) El
  desglose "Ajustes (specs/pantalla)" en la ficha se calcula como
  `precio_sugerido - precio_base + deducciones_totales` — es aritmética de presentación sobre
  valores YA provistos por `v_laptop_precio_sugerido` (no reimplementa el motor de negocio;
  la vista sigue siendo la única fuente de `precio_base`/`precio_sugerido`). (c) La
  transición `cualquiera → para_repuestos` se implementó literalmente desde los 9 estados
  (incluye `vendida → para_repuestos`), tal como dice el plan ("alcanzable manualmente desde
  cualquier estado"); no hay validación de negocio adicional que lo excluya explícitamente en
  el contexto del plan.

- **Estado del código (todo escrito y compilando, ver arriba el bloqueo de specs):**
  - `apps/web/src/data/inventario.ts` (nuevo) — listado con joins reales (modelo, paquete,
    condición, detalles) + fusión client-side con las 4 vistas SQL; ficha completa; upserts
    de condición/detalles; transición de estado con guardia optimista
    (`.eq('estado', desde)`); registro de `monto_real`; fotos (Storage, ver bloqueo arriba).
  - `apps/web/src/app/(panel)/inventario/page.tsx` (reemplaza el stub) — tabla + filtros
    (estado, marca/modelo, generación, con/sin detalles, batería mínima, es_donante,
    búsqueda por alias) + fila→ficha vía `next/link`.
  - `apps/web/src/app/(panel)/inventario/[id]/page.tsx` (nuevo) — encabezado con
    transiciones + confirmación (Modal), specs editables, desglose de precio sugerido,
    timeline costos con desviación coloreada (vista `v_laptop_desviacion`) + registro de
    real por línea, checklist de condición, detalles aplicados (alta/baja), partes
    instaladas (lectura), fotos.
  - `apps/web/e2e/inventario.spec.ts` (nuevo) — siembra propia vía `clienteAdmin()`/
    `comoUsuario()` (lote, modelo, paquete, 2 laptops, línea de costo, detalle de catálogo);
    6 tests cubriendo todos los puntos de "Pruebas Playwright" del plan. **No corren en
    verde todavía** por el bloqueo de GRANTs de arriba.
