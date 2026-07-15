# Auditoría de duplicación por tabla — prompt de fan-out multi-subagente

Objetivo: lanzar **un subagente por tabla** para cazar, en TODA la app, los mismos
vectores de duplicación que produjeron el bug de `lotes` (ver
`supabase/migrations/0031_lotes_idempotencia.sql`). Cada subagente recibe SOLO el
contexto de su tabla y devuelve hallazgos estructurados.

Cómo usarlo:
1. Elige el conjunto de tablas (todas, o solo las de prioridad **Alta**).
2. Por cada tabla, instancia la **plantilla de prompt** de abajo rellenando los
   `{{placeholders}}` con la fila correspondiente de la **matriz de tablas**.
3. Lanza los subagentes en paralelo (tipo `general-purpose`), idealmente en tandas
   de ~6-8. Cada uno devuelve JSON; consolida al final por severidad.

---

> **IMPORTANTE:** los 7 vectores de abajo son el **checklist mínimo obligatorio** (vienen del
> bug de `lotes`), pero **NO son la lista completa**. Cada subagente debe además hacer
> **descubrimiento abierto** de cualquier otra fuente de duplicación (ver la sección "Otras
> fuentes"). El caso de `lotes` fue duplicación real en la BD; hay familias enteras de
> duplicación que ni tocan un INSERT (joins que multiplican filas, merges local+remoto,
> subscripciones dobles, estado de UI acumulado sin dedup). Repórtalas igual.

## Los 7 vectores conocidos (checklist obligatorio — va DENTRO de cada prompt)

Derivados del caso real de `lotes`. Cada subagente debe evaluar los 7 para SU tabla:

1. **Falta de constraint natural** — ¿la tabla tiene un `unique`/índice único por
   clave de negocio, o solo la PK (`id uuid default gen_random_uuid()`)? Sin él, la BD
   acepta dos filas idénticas. Confirmar en `supabase/migrations/*.sql`.
2. **INSERT vs UPSERT / idempotencia** — el path de escritura, ¿hace `.insert()` puro o
   `.upsert(..., { onConflict })`? ¿Recibe/usa alguna clave de idempotencia? ¿El RPC (si
   aplica) chequea existencia antes de insertar?
3. **Sync/retry sin lock (extensión)** — ¿la escritura se dispara desde el loop
   `sincronizar()` de `apps/extension/src/background/index.ts`? Ese loop es *at-least-once*:
   ¿hay marca de "ya sincronizado" fiable, o puede reprocesar la misma fila? ¿Hay lock de
   reentrancia (`syncEnCurso`)?
4. **Crash entre escritura remota y marca local (MV3)** — si la escritura remota tiene
   éxito pero el service worker muere antes de marcar el pendiente como sincronizado, ¿se
   re-empuja y duplica? ¿Viaja una clave de idempotencia estable al servidor?
5. **id generado en cliente** — ¿el id de la fila se genera con `crypto.randomUUID()` en el
   cliente (extensión/web) de forma que cada llamada crea fila nueva aunque el contenido sea
   idéntico?
6. **UI doble-submit / doble-acción / multi-pestaña** — los handlers que escriben, ¿tienen
   guard de reentrada (`if (busy) return`) y botón `disabled`? ¿Dos pestañas o dos paneles
   del mismo ítem pueden escribir en paralelo sin dedup compartido?
7. **RPC no idempotente + retry manual** — si la escritura pasa por un RPC que commitea y la
   respuesta se pierde (timeout post-commit), el usuario reintenta a mano → ¿segundo registro?

Además, considerar **triggers** (`create trigger`/`returns trigger`) que inserten o propaguen
filas hacia la tabla, y **seeds** (`0003_seeds.sql`, `fn_seed_usuario`) que puedan reintroducir
filas en `db reset`.

## Otras fuentes de duplicación (investigación ABIERTA — obligatoria, no exhaustiva)

Los 7 vectores cubren duplicados **escritos en la BD**. Pero el síntoma reportado (filas
repetidas en el panel) también puede nacer sin ningún INSERT de más. Cada subagente debe
investigar activamente, para SU tabla, al menos estas familias — y cualquier otra que descubra:

- **A. Duplicación en lectura / display (¡alta probabilidad!)** — una consulta que hace `join`
  1→N sin agrupar/deduplicar devuelve la MISMA fila base repetida una vez por hijo. Buscar en
  `apps/web/src/data/*.ts` y vistas SQL (`create view`) `select` con joins a tablas hijas
  (`costo_lineas`, `laptops`, `lote_reparto`, `paquete_items`, `laptop_partes`…) sin `distinct`
  / sin agregación. El panel mostraría duplicados aunque la BD esté limpia.
- **B. Merge local + remoto sin dedup (local-first)** — la extensión vive en IndexedDB y espeja
  a Supabase. Si un registro existe local (id `local:…`) y remoto (uuid) y la UI los concatena
  sin fundir por clave natural, se ve doble. Revisar `provider-local` + capa de pull/aplicar
  (`aplicarConfigRemota`, `checkListings`, mezclas de listas) y cómo la UI combina ambas fuentes.
- **C. Estado de UI acumulado** — `setLista([...lista, ...nuevos])` en un `useEffect`/handler que
  corre más de una vez (deps mal puestas, `useEffect` sin cleanup, React 19 StrictMode montando
  dos veces en dev, paginación con rangos solapados). Buscar `[...`, `.concat(`, `.push(` sobre
  estado de listas en `apps/web/src/app/**/*.tsx` y componentes de la extensión.
- **D. Subscripciones / listeners registrados varias veces** — `supabase.channel(...).on(...)` o
  `.onAuthStateChange` o `chrome.runtime.onMessage.addListener` montados en cada render sin
  desuscribir → cada evento se procesa N veces (y puede escribir N veces). Buscar suscripciones
  sin cleanup/`removeListener`.
- **E. Realtime / echo optimista** — update optimista que agrega a la lista y LUEGO un refetch o
  un evento realtime que vuelve a agregar la misma fila.
- **F. Mensajería MV3 duplicada** — un mensaje `chrome.runtime`/`sendMessage` que se emite dos
  veces (p. ej. handler montado doble, reintento) y cada uno dispara una escritura.
- **G. Import/upsert de config que concatena** — merges de catálogo/config que hacen append en
  vez de reemplazar por clave (§ push aditivo) y acumulan entradas repetidas.

Para cada familia que aplique, reportar como hallazgo con `vector: "otro"` y nombrar el
mecanismo. Si descubres un mecanismo fuera de esta lista, repórtalo igual — la lista es abierta.

## Dónde buscar (el "cómo" — recetas de búsqueda, van DENTRO de cada prompt)

- **Escritura server directa (extensión)**: `packages/provider-supabase/src/index.ts` →
  `grep "from('{{tabla}}')"` y sus `.insert/.upsert`; `packages/provider-nhost/src/index.ts`
  → mutaciones GraphQL `insert_{{tabla}}`.
- **Escritura local (extensión)**: `packages/provider-local/src/index.ts` → store Dexie de la
  tabla (`this.db.{{store}}.add/.put/.bulkAdd`) y su definición en `this.version(N).stores({...})`
  (¿índice único?).
- **Escritura web**: `apps/web/src/data/{{dominio}}.ts` → `.from('{{tabla}}').insert/upsert` o
  `.rpc('{{rpc}}', ...)`.
- **RPCs que insertan**: `supabase/migrations/*.sql` → `grep "insert into {{tabla}}"`; leer el
  RPC completo, ver si es idempotente.
- **Constraints y triggers**: `grep -iE "unique|create.*index|create trigger" supabase/migrations/*.sql`
  filtrando por `{{tabla}}`.
- **Callers UI**: `apps/web/src/app/**/*.tsx` y `apps/extension/src/{content,popup,background}/**`
  → handlers que llaman a las funciones de escritura; verificar guards de reentrada y `disabled`.
- **Loop de sync**: `apps/extension/src/background/index.ts` → `sincronizar()`.
- **Lectura/display (familia A)**: `apps/web/src/data/{{dominio}}.ts` → `.select(` con joins a
  tablas hijas sin `distinct`/agregación; vistas SQL `create view ... join`. ¿La consulta que
  ALIMENTA la tabla del panel puede devolver la misma fila base repetida?
- **Merge local+remoto (familia B)**: `packages/provider-local/src/index.ts` + puntos de pull
  (`aplicarConfigRemota`, `checkListings`) y dónde la UI combina fuentes local/remota.
- **Estado UI (familia C)**: en los `.tsx` que muestran `{{tabla}}`, buscar `[...`, `.concat(`,
  `.push(` sobre estado de listas, y `useEffect` con deps sospechosas o sin cleanup.
- **Subscripciones/listeners (familia D)**: `grep -rE "\.channel\(|onAuthStateChange|addListener"`
  en `apps/web/src` y `apps/extension/src` → ¿se desuscriben? ¿se montan en cada render?

---

## Matriz de tablas (rellena los placeholders de la plantilla)

Prioridad = riesgo de duplicación (Alta = transaccional/inventario sin clave natural obvia).

| Tabla | Prioridad | Dominio web | RPC(s) relevantes | Constraint conocido |
|---|---|---|---|---|
| `lotes` | (ya arreglada — usar como referencia) | lotes, calculadora | registrar_compra_lote | `unique(user_id, idempotency_key)` parcial (0031) |
| `laptops` | **Alta** | lotes, inventario, calculadora | registrar_compra_lote | ninguno (solo PK) |
| `costo_lineas` | **Alta** | lotes, paquetes, ventas | registrar_compra_lote, prorratear_paquete, instalar_parte | ninguno (solo PK) |
| `ventas` | **Alta** | ventas | registrar_venta, devolver_garantia | verificar |
| `movimientos` | **Alta** | cuentas, ventas | registrar_venta, registrar_conversion, registrar_abono, ajuste | verificar |
| `conversiones` | **Alta** | cuentas | registrar_conversion | verificar |
| `paquetes` | **Alta** | paquetes | avanzar_paquete, recibir_paquete, prorratear_paquete | verificar |
| `paquete_items` | **Alta** | paquetes | agregar_item_laptop_paquete | verificar |
| `partes_compras` | **Alta** | partes | recibir_orden_partes | trigger `fn_partes_promedio` recalcula stock — un doble-insert corrompe el promedio |
| `laptop_partes` | **Alta** | partes, inventario | instalar_parte | verificar |
| `partes_especificas` | **Alta** | partes | instalar_parte, recibir_orden_partes | verificar |
| `lote_partes_encontradas` | **Alta** | lotes | (insert directo `agregarParteEncontrada`) | verificar — insert crudo sin guard aparente |
| `por_cobrar` | **Alta** | ventas, cuentas | registrar_venta | verificar |
| `por_pagar` | **Alta** | cuentas | registrar_abono | verificar |
| `ordenes_partes` | Media | partes | recibir_orden_partes, prorratear_orden_partes | verificar |
| `orden_partes_items` | Media | partes | recibir_orden_partes | verificar |
| `lote_reparto` | Media | lotes | congelar_reparto_lote | PK `(lote_id, laptop_id)` + guard 0024 |
| `laptop_condicion` | Media | inventario | — | PK `laptop_id` (upsert seguro — verificar) |
| `laptop_detalles` | Media | inventario | — | verificar |
| `listings` | Media | listings | (provider `guardarListing`) | `unique(user_id, ebay_item_id)` |
| `compradores` | Media | ventas | — | `unique(user_id, nombre)` |
| `cuentas` | Media | cuentas, configuracion | — | `unique(user_id, nombre)` |
| `modelo_avisos` | Media | configuracion | (provider `publicarAvisos`) | verificar |
| `tipos_aviso` | Baja | configuracion | (provider `publicarAvisos`) | `clave unique` |
| `modelos` | Baja | configuracion | (provider `resolverModeloId` upsert) | `unique(marca, modelo)` |
| `partes_catalogo` | Baja | partes | — | `unique(user_id, nombre)` |
| `partes_stock` | Baja | partes | trigger fn_partes_promedio | PK `parte_id` |
| `parametros` | Baja | configuracion | (provider `guardarConfig`) | PK `(user_id, clave)` |
| `ajustes_config` | Baja | configuracion | guardarConfig | verificar `unique(user_id, nombre)` |
| `detalles_catalogo` | Baja | configuracion | guardarConfig | verificar |
| `precios_ideales` | Baja | configuracion | guardarConfig | `unique(...)` (0027) |
| `tasas_dia` | Baja | cuentas | registrar_conversion | verificar |
| `por_cobrar`/`por_pagar` | (ver arriba) | | | |

---

## Plantilla de prompt (una instancia por tabla)

> Repo: `C:\Users\Joseph\Documents\laptops_venta\tecnofal` (TecnoFal, monorepo:
> `packages/core`, `packages/provider-{supabase,nhost,local}`, `apps/extension` (Chrome MV3,
> local-first con sync cada 5 min), `apps/web` (Next.js). Backend Supabase; esquema en
> `supabase/migrations/`. Todo en español.
>
> Contexto: acabamos de arreglar un bug de duplicación en la tabla `lotes` (ver
> `supabase/migrations/0031_lotes_idempotencia.sql` y `packages/provider-supabase/src/index.ts`
> función `comprar`). Tu tarea es auditar **exclusivamente la tabla `{{tabla}}`** buscando
> CUALQUIER fuente de duplicación en cualquier parte de la app — no solo el patrón de `lotes`.
> NO audites otras tablas. El objetivo es doble: (a) duplicados escritos de más en la BD, y
> (b) duplicados que se VEN en el panel sin que la BD tenga filas de más (joins que multiplican,
> merges local+remoto, estado de UI acumulado, subscripciones dobles). Investiga ambos.
>
> **Pistas de arranque para `{{tabla}}`**: dominio web probable `apps/web/src/data/{{dominio}}.ts`;
> RPC(s) relevantes: `{{rpc}}`; constraint conocido: `{{constraint}}`.
>
> **Evalúa los 7 vectores de duplicación** (para CADA uno, di si aplica y por qué):
> 1. Falta de `unique`/índice único por clave de negocio (solo PK `id` aleatorio → la BD acepta
>    filas idénticas). Confirma en `supabase/migrations/*.sql`.
> 2. INSERT puro vs UPSERT/idempotencia en el path de escritura. ¿El RPC chequea existencia?
> 3. Escritura disparada desde el loop `sincronizar()` de `apps/extension/src/background/index.ts`
>    (at-least-once): ¿marca fiable de "ya sincronizado"? ¿lock de reentrancia?
> 4. Crash MV3 entre escritura remota exitosa y marca local de sincronizado → re-push. ¿Viaja
>    una clave de idempotencia estable al servidor?
> 5. id generado en cliente con `crypto.randomUUID()` (cada llamada = fila nueva).
> 6. UI doble-submit/doble-acción/multi-pestaña sin guard de reentrada (`if (busy) return`) ni
>    `disabled`.
> 7. RPC no idempotente + reintento manual del usuario tras un falso error de red.
> Además revisa **triggers** que inserten/propaguen hacia `{{tabla}}` y **seeds** que la
> reintroduzcan en `db reset`.
>
> **Y OBLIGATORIAMENTE investiga fuentes de duplicación fuera de los 7 vectores** (lista abierta,
> reporta con `vector: "otro"` + nombre del mecanismo):
> - **A. Lectura/display**: ¿la consulta o vista SQL que alimenta el panel para `{{tabla}}` hace
>   un `join` 1→N sin `distinct`/agregación y devuelve la misma fila base repetida? (el panel se
>   vería duplicado aunque la BD esté limpia — sospecha principal cuando el síntoma es visual).
> - **B. Merge local+remoto**: en la extensión (local-first), ¿un registro local (`local:…`) y su
>   espejo remoto (uuid) se muestran ambos sin fundirse por clave natural?
> - **C. Estado de UI acumulado**: `setLista([...lista, ...nuevos])`/`.concat`/`.push` en un
>   `useEffect`/handler que corre más de una vez (deps mal puestas, sin cleanup, StrictMode,
>   paginación solapada).
> - **D. Subscripciones/listeners** (`.channel().on`, `onAuthStateChange`, `chrome.runtime.onMessage`)
>   montados sin desuscribir → cada evento procesado/escrito N veces.
> - **E/F/G**: echo optimista + refetch; mensajería MV3 doble; import/merge de config que concatena.
> - Cualquier otro mecanismo que descubras.
>
> **Cómo buscar** (usa Grep/Read, cita file:line exactos):
> - `packages/provider-supabase/src/index.ts` → `from('{{tabla}}')` + `.insert/.upsert`.
> - `packages/provider-nhost/src/index.ts` → `insert_{{tabla}}` (GraphQL).
> - `packages/provider-local/src/index.ts` → store Dexie de la tabla + su índice en `.stores({...})`.
> - `apps/web/src/data/{{dominio}}.ts` (y otros data/*.ts si aplica) → `.from('{{tabla}}')` o `.rpc(...)`.
> - `supabase/migrations/*.sql` → `insert into {{tabla}}`, `unique`, `create trigger`, y `create view … join`. Lee los RPCs completos.
> - `apps/web/src/data/{{dominio}}.ts` → `.select(` con joins a tablas hijas sin `distinct`/agregación (familia A).
> - `apps/web/src/app/**/*.tsx` y `apps/extension/src/**` → handlers y escrituras (guards); `[...`, `.concat(`, `.push(` sobre estado de listas (familia C); `.channel(`, `onAuthStateChange`, `addListener` sin cleanup (familia D).
> - `packages/provider-local/src/index.ts` y puntos de pull → merge local+remoto (familia B).
>
> **Devuelve SOLO un JSON** con esta forma (sin texto extra):
> ```json
> {
>   "tabla": "{{tabla}}",
>   "tiene_constraint_natural": true|false,
>   "constraint": "cita exacta o null",
>   "paths_de_escritura": [{ "ubicacion": "file:line", "tipo": "insert|upsert|rpc|trigger", "idempotente": true|false }],
>   "hallazgos": [
>     {
>       "vector": "1-7 | otro",
>       "mecanismo": "si es 'otro', nombra la fuente (ej. 'join 1→N sin distinct', 'merge local+remoto', 'listener sin cleanup')",
>       "clase": "bd | display | ui-estado | sync-merge | evento",
>       "severidad": "alta|media|baja",
>       "ubicacion": "file:line",
>       "descripcion": "qué permite el duplicado (fila real en BD, o duplicado solo visual)",
>       "reproduccion": "pasos concretos que producirían el duplicado",
>       "recomendacion": "fix propuesto (constraint / upsert / idempotency key / guard / distinct / dedup por clave / cleanup de subscripción)"
>     }
>   ],
>   "veredicto": "1-2 frases: ¿la tabla es vulnerable a duplicación (en BD y/o en display) y por qué?"
> }
> ```
> Investiga TANTO los 7 vectores de BD COMO las familias A–G de display/estado/sync/evento. Si no
> encuentras nada, devuelve `hallazgos: []` y dilo en el veredicto. Cita SIEMPRE código real
> (file:line); no especules sin abrir los archivos.

---

## Consolidación (tras recoger los JSON)

Ordena todos los `hallazgos` por severidad. Agrupa por `clase` (bd / display / ui-estado /
sync-merge / evento) y por `vector`/`mecanismo` para ver patrones sistémicos — p. ej. "varios
RPCs comparten falta de idempotencia" (fix único tipo 0031) vs. "varias vistas hacen join 1→N
sin agregar" (fix distinto: `distinct`/agregación en las consultas). Prioriza el fix de raíz que
cubra varios a la vez, no parches por tabla. Ojo: si el síntoma es **visual** (filas repetidas en
el panel) pero la BD está limpia, la causa más probable es la **clase `display`** (familia A), no
un INSERT de más — no asumas que todo duplicado visible es una fila duplicada real.
