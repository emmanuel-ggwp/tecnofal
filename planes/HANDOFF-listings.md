# Handoff — Feature "Listings" en el panel web — 2026-07-12 (actualizado 2026-07-13)

**Estado actual: pasos 1-6 de §3 completados.** Migración 0028 aplicada al
Supabase local, bug de `Date`→string arreglado (commit `f4ddc6f`), 4 archivos
de test preexistentes rotos reparados (ver detalle abajo), suite completa de
`apps/web` en verde (55/55) y typecheck raíz + `apps/web` limpios. Falta
únicamente **§3 paso 7: abrir el PR a `main`**.

Durante la verificación aparecieron 2 clases de problemas no descritos en la
versión original de este handoff, ya resueltos:
1. **Tests rotos por la Etapa 1** (`packages/provider-local/src/local.test.ts`,
   `packages/provider-nhost/src/nhost.test.ts`, `packages/provider-supabase/src/supabase.test.ts`):
   el fixture de listing no tenía `fechaFinSubasta`, campo que la Etapa 1 hizo
   obligatorio — rompía `tsc --noEmit` en los 3 providers. Se agregó el campo.
2. **Condiciones de carrera en `apps/web/e2e/listings.spec.ts`** (bug de test,
   no de producto): la fila placeholder "Cargando…" de `Tabla.tsx` también
   matchea `table tbody tr`, así que esperar "alguna fila visible" podía
   capturar el estado de carga antes de que llegaran los datos reales. Y
   `getByText(...)` sin escopar era ambiguo porque la tabla desktop y las
   tarjetas mobile coexisten en el DOM (CSS decide cuál se ve). Ambos
   arreglados escopando a `listings-desktop-tabla` / filtrando por texto.

Ver el commit `f4ddc6f` para el detalle completo.

Documento de traspaso para continuar en una sesión nueva. Rama:
**`feat/listings-panel-web`** (ya tiene 1 commit + trabajo sin commitear, ver §4).
Plan original completo (con el markup real de eBay verificado): `C:\Users\Joseph\.claude\plans\crea-un-plan-para-lazy-giraffe.md`
— este handoff resume lo esencial, no hace falta releer el plan completo para retomar.

## 1. Qué es esto

Pantalla nueva `/listings` en el panel web para monitorear listings de eBay: link
directo al listing real, puja máxima para ganancia decente (`precio_puja_decente`,
ya existía), y tiempo restante de la subasta (dato nuevo — no existía en ningún
lado antes de hoy). Requirió tocar 3 áreas: SQL (migración nueva), la extensión
Chrome (única que visita eBay real, tiene que capturar el countdown), y el panel
web (la pantalla en sí). Se ejecutó en 3 etapas con agentes en paralelo (2 y 3
corrieron simultáneamente, sin pisarse archivos).

**Selectores del DOM de eBay usados — confirmados contra eBay real** (el usuario
pegó el markup, no son suposición):
- Grilla de búsqueda: `.s-card__time-left` (+ fallback `.s-item__time-left`), texto
  tipo `"Quedan 13m"`.
- Listing individual: `[data-testid="ux-timer_timer"]` (+ fallback `.ux-timer__text`),
  texto tipo `"Finaliza en 12 min 31 s"`.

## 2. Estado por etapa

### Etapa 1/3 — Migración + `packages/core` — ✅ COMPLETA Y COMMITEADA
Commit `e936c80` en `feat/listings-panel-web`. Incluye:
- `supabase/migrations/0028_listings_fecha_fin_subasta.sql` — agrega
  `listings.fecha_fin_subasta timestamptz` (nullable) + índice
  `idx_listings_user_fecha_fin (user_id, fecha_fin_subasta)`. Validada en contenedor
  desechable con datos reales y RLS real (no superusuario) — **pero AÚN NO aplicada
  al Supabase local compartido `supabase_db_tecnofal`**. Es lo primero que hay que
  hacer al retomar:
  ```
  docker cp supabase/migrations/0028_listings_fecha_fin_subasta.sql supabase_db_tecnofal:/0028.sql && docker exec supabase_db_tecnofal psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /0028.sql
  ```
- `packages/core/src/tiempo.ts` (nuevo) — `parsearTiempoRestante()`/`formatearTiempoRestante()`,
  puras, 51/51 tests en verde, verificadas contra los 2 formatos reales exactos.
- `packages/core/src/negocio.ts` — `ListingGuardar`/`EstadoVisto` ahora exigen
  `fechaFinSubasta: Date | null`.
- Fila agregada a `nhost/BACKLOG.md` (no se espejó a Nhost, política vigente).

### Etapa 3/3 — Pantalla `/listings` en `apps/web` — ✅ COMPLETA, SIN COMMITEAR
Todas las tareas del plan están implementadas y `bunx tsc --noEmit` (desde `apps/web`)
está **limpio**. Sin commitear todavía (ver §4 para el estado exacto de archivos).
- `apps/web/src/data/listings.ts` (nuevo) — `listarListings()` con filtro/orden por
  defecto exactos del plan (oculta finalizadas + comprado/descartado, nulls nunca
  ocultos por el toggle de finalizadas, orden `fecha_fin_subasta ASC NULLS LAST`).
- `apps/web/src/ui/Semaforo.tsx` — extendido a unión `{margen,parametros} | {tono}`
  sin romper al único consumidor previo (`calculadora/page.tsx`).
- `apps/web/src/app/(panel)/listings/{page.tsx,ListingCard.tsx,TiempoRestante.tsx}`
  (nuevos) — tabla en desktop (`hidden sm:block`) + tarjetas en mobile (`sm:hidden`,
  sin scroll horizontal forzado), polling de 5 min + botón "↻ Refrescar ahora",
  filtros con checkboxes, filas/tarjetas completas como link a eBay.
- `apps/web/src/app/(panel)/layout.tsx` — entrada de nav agregada.
- `apps/web/src/data/calculadora.ts` — `fechaFinSubasta: null` agregado en los 2
  sitios que construían `ListingGuardar` (la calculadora nunca visita eBay).
- `apps/web/e2e/listings.spec.ts` (nuevo) — 7 casos cubriendo todo el plan.

**Bloqueado únicamente por la migración 0028 sin aplicar** (§1): con eso aplicado,
`bunx playwright test e2e/listings.spec.ts` y `bunx playwright test e2e/calculadora.spec.ts`
deberían pasar sin más cambios — la única falla real hoy en ambos specs es
`PGRST204: Could not find the 'fecha_fin_subasta' column`, 100% atribuible a la
migración pendiente (confirmado explícitamente por el agente, no es un bug de código).

### Etapa 2/3 — Captura en la extensión — ⚠️ CASI COMPLETA, 1 BUG REAL SIN ARREGLAR
`npm run typecheck -w @tecnofal/extension` está limpio y `npm run build` funciona.
6 de 7 tareas completas y verificadas. Sin commitear (ver §4).

**Lo que SÍ funciona** (verificado con test e2e real):
- `content/listing.tsx::fechaFinDePagina()` — parsea el countdown de la página de
  listing individual y lo guarda en `marcarVisto()`. Test e2e pasa.
- `content/Panel.tsx` — el fix crítico está implementado: cualquier acción del panel
  (guardar/comprar/descartar) preserva `fechaFinSubasta` en vez de borrarla a `null`.
- `checkListings` en los 3 providers (`provider-supabase`, `provider-local`,
  `provider-nhost` — este último no estaba en el plan original pero hacía falta
  para el typecheck, se le puso `fechaFinSubasta: null` fijo porque Nhost es
  respaldo y su esquema Hasura no tiene la columna nueva) ya devuelven el campo.
- `background/index.ts` — nuevo case `listings:actualizarTiempo` agregado sin tocar
  el resto del archivo (que tiene trabajo reciente de otra sesión, sync de config).
- `packages/provider-local/src/index.ts::actualizarTiempoListing()` — nuevo método,
  solo actualiza listings ya existentes, marca `dirty` para el sync de 5 min.
- Fixtures (`tests/fixtures/{search,listing}.html`) y 2 tests e2e nuevos agregados.

**El bug real, sin arreglar — LEE ESTO ANTES DE SEGUIR:**
`chrome.runtime.sendMessage` **no preserva objetos `Date`** — llegan como string ISO
al otro lado del mensaje (content script ↔ background). Esto significa que
`EstadoVisto.fechaFinSubasta`/`ListingGuardar.fechaFinSubasta`, tipados `Date | null`,
en runtime pueden ser en realidad un `string` en cualquier punto que haya cruzado un
mensaje — el tipo miente. Efecto concreto confirmado: en `content/search.ts`, la
función `tiempoDiverge()` llama `guardado.getTime()` asumiendo `Date`, explota con
`TypeError: guardado.getTime is not a function`, el error queda absorbido en
silencio por el `catch` de `flushCola()` — no crashea la página, pero la
actualización de tiempo desde la grilla de búsqueda **nunca se dispara**. El test
e2e que lo cubre falla (`Received: 0` en vez de la diferencia esperada).

**No es solo un bug de este archivo** — cualquier `Date` en `EstadoVisto`/`ListingGuardar`
que cruce `chrome.runtime.sendMessage` en cualquier dirección se degrada así. Si un
string llegara a `listingAFila()` en `packages/core/negocio.ts` (que hace
`l.fechaFinSubasta.toISOString()`), **crashearía** ahí también — no confirmado que
esto haya pasado en la práctica todavía, pero el riesgo es real.

**Fix ya decidido, no implementado** (agregar un helper `aFecha(v: Date | string | null | undefined): Date | null`
que normalice a `Date` real o `null`, en 2 puntos de defensa):
1. `packages/provider-local/src/index.ts` — dentro de `guardarListing()` y
   `actualizarTiempoListing()`, normalizar `fechaFinSubasta` ANTES de
   `this.db.listings.put(...)` (protege el path de sync hacia `listingAFila()`).
2. `apps/extension/src/content/search.ts` — normalizar `visto.fechaFinSubasta`
   dentro de (o antes de llamar) `tiempoDiverge()` (protege la comparación en la
   grilla, porque aunque Dexie guarde `Date` reales, al volver a salir por
   `listings:check` hacia el content script se vuelve a degradar a string).

Deliberadamente NO se tocó `packages/core` para este fix (mantiene los 51/51 tests
de la Etapa 1 intactos) — la normalización debe vivir en los bordes de mensajería,
no en el tipo de dominio.

## 3. Al retomar, en orden

1. Aplica la migración 0028 (comando en §2, Etapa 1) — desbloquea TODO lo demás.
2. Implementa el fix de `aFecha()` descrito arriba (2 archivos, ambos ya
   identificados con precisión).
3. Re-corre `npm run test:e2e -w @tecnofal/extension` — el test "búsqueda: countdown
   divergente..." debería pasar. Los otros 2 fallos de ese archivo son preexistentes
   (no relacionados, confirmados iguales en el baseline antes de este trabajo — el
   panel renderiza "S_decente" no "S_max", motivo de otra sesión).
4. Re-corre `bunx playwright test e2e/listings.spec.ts` y
   `bunx playwright test e2e/calculadora.spec.ts` desde `apps/web` — deberían pasar
   ahora que la migración está aplicada.
5. Revisa/commitea el trabajo (ver §4 para la lista exacta de archivos).
6. Corre la suite completa de `apps/web` (`--workers=1`) y el typecheck raíz
   (`npm run typecheck`) como verificación final de que nada se rompió.
7. Abre PR a `main` (branch protection activa, requiere el check `full-suite` de
   `CI Full` en verde) — recuerda que CI corre el suite completo de Playwright
   automáticamente contra un Supabase levantado en el runner, así que la migración
   0028 debe estar en `supabase/migrations/` (ya lo está, commiteada en Etapa 1).

## 4. Archivos con cambios sin commitear ahora mismo

```
 M apps/extension/src/background/index.ts
 M apps/extension/src/content/Panel.tsx
 M apps/extension/src/content/listing.tsx
 M apps/extension/src/content/search.ts
 M apps/extension/src/lib/mensajes.ts
 M apps/extension/tests/extension.spec.ts
 M apps/extension/tests/fixtures/listing.html
 M apps/extension/tests/fixtures/search.html
 M apps/web/src/app/(panel)/layout.tsx
 M apps/web/src/data/calculadora.ts
 M apps/web/src/ui/Semaforo.tsx
 M packages/provider-local/src/index.ts
 M packages/provider-nhost/src/index.ts
 M packages/provider-supabase/src/index.ts
?? apps/web/e2e/listings.spec.ts
?? apps/web/src/app/(panel)/listings/
?? apps/web/src/data/listings.ts
```
Estos cambios están guardados en disco pero commiteados como WIP en un solo commit
(ver mensaje del commit) para no perderlos entre sesiones — **no están divididos
por etapa**, así que al revisar el diff antes del PR final, sepáralos mentalmente
usando este handoff como guía de qué pertenece a la Etapa 2 vs. la Etapa 3.
