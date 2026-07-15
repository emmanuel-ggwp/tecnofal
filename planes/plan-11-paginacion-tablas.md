# Plan 11 — Paginación de tablas del panel web

**Transversal (post-Grupo B) · Requiere plan-00 (UI compartida) · Sin SQL nuevo · Sin cambios de RLS/RPC.**

## Objetivo

Agregar paginación a las tablas del panel web de forma **escalable y mantenible**: una sola
pieza reutilizable en `apps/web/src/ui/`, adoptada con ~1 línea por pantalla, sin tocar la
capa de datos ni el esquema. La paginación es **en cliente** (se corta el arreglo ya cargado),
lo cual preserva intactos los agregados y filtros que hoy se calculan sobre el set completo.
Se deja además la **costura** para migrar a paginación en servidor solo las 2–3 tablas que
puedan crecer sin límite, sin reescribir las 20 pantallas.

## Decisión de diseño (leer antes de codear)

**Por qué en cliente y no en servidor, hoy:**

- Escala real: un solo usuario por RLS (`user_id`), uso de escritorio, decenas a bajos
  cientos de filas por tabla. No hay millones de registros.
- Varias pantallas calculan **agregados sobre el set completo filtrado** que la paginación en
  servidor rompería: `ListadoVentas` suma ganancia bruta/neta de todas las ventas activas
  (`apps/web/src/app/(panel)/ventas/secciones/ListadoVentas.tsx`).
- Varias pantallas aplican **filtros secundarios derivados en cliente**, después del fetch,
  porque vienen de joins/vistas y no son prácticos en el `select`: `inventario` filtra
  `cpuGen`, `conDetalles`, `bateriaMin` sobre el resultado ya traído
  (`apps/web/src/data/inventario.ts:236-243`).
- Cortar en cliente mantiene **ambas cosas correctas**: los totales y los filtros siguen
  operando sobre el arreglo completo; la paginación solo decide qué rebanada se **pinta**.

**Por qué encapsularlo en `Tabla` y no repetirlo por página:**

- Hay **20 pantallas** que ya consumen el `Tabla` compartido (`apps/web/src/ui/Tabla.tsx`).
  Metiendo la paginación ahí (opt-in), cada pantalla la activa con un flag y no duplica lógica
  de estado, corte, ni controles. Una sola fuente de verdad para el comportamiento y la
  accesibilidad (labels en español, `data-testid` estables para e2e).

**La costura para escalar a servidor (no se implementa aquí, se deja lista):**

- Extraer `PaginacionControles` como componente **presentacional puro** (recibe `pagina`,
  `totalPaginas`, `total`, rango visible, `tamano`, y callbacks). Lo usan por igual la
  paginación en cliente (estado interno del `Tabla`) y una futura en servidor (estado en la
  página, que llama `listar*({ pagina, tamano })`).
- Documentar el contrato futuro del repositorio: `listar*(filtros, { pagina, tamano })` →
  `{ filas, total }`. Cuando una tabla cruce el umbral (ver "Umbral"), se cambia **solo su**
  `listar*()` y su página para pasar de estado interno a estado externo, reusando el mismo
  `PaginacionControles`. Ninguna otra pantalla se toca.

**Umbral para migrar una tabla a servidor (regla, no código):** cuando su `listar*()` supere
de forma sostenida ~1.000 filas por usuario, o cuando el fetch inicial se note lento (>300 ms
percibidos). Candidatas por orden de probabilidad: `listings` (scrapeadas de eBay, la que más
crece), luego `inventario` y `ventas`. Anotar en la Bitácora si alguna ya se acerca.

## Contexto esencial (esto es lo único que necesitas leer del repo)

- `apps/web/src/ui/Tabla.tsx` — componente presentacional actual. Props:
  `{ encabezados: string[], filas: React.ReactNode[][], vacio?: string, claves?: (string|number)[] }`.
  Renderiza `<thead>` + `<tbody>`; muestra `vacio` (colSpan) si `filas.length === 0`. **No tiene
  estado.** La paginación se añade aquí como opt-in, sin romper a los llamadores actuales.
- Patrón uniforme de las páginas: `'use client'`, cargan todo con `listar*()` del repositorio
  del dominio, mapean cada fila a `React.ReactNode[]`, y pasan `filas` + `claves` (ids) a
  `Tabla`. Ejemplos de referencia (no editar más que lo indicado):
  `apps/web/src/app/(panel)/inventario/page.tsx`,
  `apps/web/src/app/(panel)/ventas/secciones/ListadoVentas.tsx`.
- Reglas del repo que aplican: UI en español; Tailwind; componentes compartidos viven en
  `apps/web/src/ui/`; **ningún componente importa `@supabase/supabase-js`** (la paginación en
  cliente ni toca datos, así que no hay riesgo). No reimplementar cálculos de negocio.
- e2e: la suite completa corre `--workers=1`; cada dominio individual corre con workers por
  defecto. Sembrar/limpiar los propios datos; el usuario e2e es compartido (ver
  `planes/README.md`).

## Piezas a crear

### 1. `apps/web/src/ui/PaginacionControles.tsx` (presentacional puro, reutilizable)

Props sugeridas:

```ts
interface PaginacionControlesProps {
  pagina: number;          // 1-based
  totalPaginas: number;
  total: number;           // total de filas (para "X–Y de Z")
  rangoDesde: number;      // 1-based, primera fila visible
  rangoHasta: number;      // última fila visible
  tamano: number;
  onPagina: (p: number) => void;
  onTamano: (t: number) => void;
  tamanos?: number[];      // default [10, 25, 50, 100]
}
```

- Muestra "Mostrando **{rangoDesde}–{rangoHasta}** de **{total}**", selector de tamaño de
  página, y botones ‹ Anterior / Siguiente › (deshabilitados en los extremos). Sin dependencias
  nuevas; solo Tailwind.
- `data-testid`: `paginacion`, `paginacion-anterior`, `paginacion-siguiente`,
  `paginacion-rango`, `paginacion-tamano`. Necesarios para los e2e.
- No renderiza nada útil si `totalPaginas <= 1` y `total <= min(tamanos)` → devolver `null`
  (o solo el rango) para no ensuciar tablas chicas. **Decidir**: mostrar siempre el rango pero
  ocultar los botones cuando hay una sola página (recomendado: informa sin estorbar).

### 2. `apps/web/src/ui/usePaginacionCliente.ts` (hook)

```ts
function usePaginacionCliente<T>(
  items: T[],
  opts?: { tamanoInicial?: number },
): {
  pagina: number;
  tamano: number;
  totalPaginas: number;
  visibles: T[];           // rebanada items.slice((pagina-1)*tamano, pagina*tamano)
  rangoDesde: number;
  rangoHasta: number;
  setPagina: (p: number) => void;
  setTamano: (t: number) => void;
}
```

- **Reset de página**: cuando cambia `items.length` (nuevos filtros, recarga) o `tamano`,
  volver a página 1 si la página actual quedaría fuera de rango. Clampear `pagina` a
  `[1, totalPaginas]` siempre (evita página vacía tras borrar filas).
- `total` = `items.length`. `tamanoInicial` default 25.

### 3. `apps/web/src/ui/Tabla.tsx` (extender, no romper)

Agregar prop opt-in `paginado`:

```ts
interface TablaProps {
  // ...igual que hoy...
  paginado?: boolean | { tamano?: number; tamanos?: number[] };
}
```

- Si `paginado` es falsy → comportamiento **idéntico al actual** (cero regresión en las
  pantallas que no lo activen).
- Si `paginado` → usar `usePaginacionCliente(filas, ...)`, cortar `filas` **y** `claves` con el
  mismo rango (mantener la correspondencia fila↔clave), y renderizar `PaginacionControles`
  debajo de la tabla dentro del contenedor con borde.
- **Cuidado**: hoy `Tabla` recibe `filas` ya renderizadas. Cortar dentro de `Tabla` está bien y
  es lo más simple para adoptar en 1 línea. El `vacio` sigue evaluándose sobre el total
  (`filas.length === 0`), no sobre la rebanada.

## Adopción por pantalla

Regla: activar `paginado` en las tablas que **crecen**; dejar las acotadas/config como están
(opt-in barato, se puede activar luego). Clasificación inicial (el ejecutor **verifica el
volumen real** antes de decidir; si algo no cuadra → Bitácora):

**Activar `paginado` (tablas que crecen):**

- `inventario/page.tsx` — laptops.
- `listings/page.tsx` — listings (la que más crece; principal candidata a servidor a futuro).
- `ventas/secciones/ListadoVentas.tsx` — ventas. **Verificar** que los totales de ganancia
  siguen sobre el set completo (deben, se calculan de `ventas`, no de la rebanada).
- `ventas/secciones/Compradores.tsx` y `Garantias.tsx` — moderadas.
- `lotes/page.tsx` y `lotes/paquetes/page.tsx` — lotes/paquetes.
- `partes/StockTab.tsx`, `EspecificasTab.tsx`, `OrdenesTab.tsx` — inventario de partes/órdenes.
- `cuentas/page.tsx` — movimientos de cuenta (crecen con el tiempo).

**Dejar sin paginar por ahora (acotadas o efímeras) — justificar en la Bitácora si se cambia:**

- `configuracion/secciones/Parametros.tsx`, `Ajustes.tsx` — set fijo y pequeño.
- `inventario/[id]/page.tsx`, `lotes/[id]/page.tsx`, `lotes/paquetes/[id]/page.tsx`,
  `partes/ordenes/[id]/page.tsx`, `partes/CatalogoTab.tsx` — sub-tablas de detalle acotadas.
- `page.tsx` (dashboard) — listas resumen top-N ya limitadas.
- `calculadora/page.tsx` — resultados efímeros de una evaluación.

Adopción concreta = añadir `paginado` a la llamada existente, p. ej. en `inventario/page.tsx`:

```tsx
<Tabla
  encabezados={[...]}
  filas={filas}
  claves={laptops.map((l) => l.id)}
  vacio={cargando ? 'Cargando…' : 'Sin laptops que coincidan con los filtros'}
  paginado   // ← única línea nueva
/>
```

## Pruebas Playwright

Extender specs **existentes** por dominio (no crear un spec nuevo monolítico), en al menos 2
tablas con volumen: `inventario` y una de `ventas`/`partes`.

- Sembrar > 1 página de filas (p. ej. 30 laptops con tamaño 25) vía helper `e2e/helpers/db.ts`.
- Verificar: se muestran 25 filas; `paginacion-rango` dice "1–25 de 30"; "Siguiente" pasa a la
  página 2 con las 5 restantes; "Anterior" vuelve; cambiar tamaño a 50 muestra las 30 en una
  página y oculta/deshabilita "Siguiente".
- Verificar que un **filtro** que reduce el set resetea a página 1 (no queda en una página
  fuera de rango) y que en `ListadoVentas` los **totales de ganancia no cambian** al paginar.
- Correr el dominio individual con workers por defecto; y confirmar la suite completa con
  `bunx playwright test --workers=1` antes de cerrar.

## Criterios de cierre

1. `bunx tsc --noEmit` en `apps/web` sin errores; `npm run lint` verde (sin imports prohibidos).
2. Tablas marcadas `paginado` cortan correctamente y sus controles funcionan; las no marcadas
   se comportan idéntico a antes (cero regresión visual/funcional).
3. Agregados (ganancia bruta/neta en ventas) y filtros secundarios (inventario) intactos.
4. e2e del/los dominio(s) tocados en verde; suite completa `--workers=1` en verde.
5. `PaginacionControles` es presentacional puro (sin datos) y quedó documentada la costura para
   migrar una tabla a servidor sin tocar las demás.

## Bitácora

### 2026-07-15 — Auditoría de las 20 tablas antes/durante la implementación

La clasificación inicial de este plan se hizo por conocimiento de dominio, no leyendo las 20
pantallas. Auditoría posterior (lectura de cada componente que se iba a tocar) — hallazgos:

- **`cuentas` / movimientos YA paginaba en servidor** (`apps/web/src/app/(panel)/cuentas/page.tsx`,
  ~líneas 332-375: `libro.filas` + `libro.total`, `POR_PAGINA`, estado `pagina`/`setPagina`,
  controles ‹Anterior/Siguiente›). El plan la listaba como "activar paginado" — **era incorrecto**:
  aplicarlo habría metido doble paginación. **Decisión:** NO se toca esa tabla; su paginación
  server-side existente es justamente la costura que este plan describe para el futuro (validación
  en vivo de que el patrón funciona). Las otras tablas de `cuentas` (conversiones, tasas) sí
  crecen y no paginaban → se activó `paginado` en ellas; la de "resultado cambiario por mes" se
  dejó sin paginar (agregada por mes, crecimiento lento).
- **Tablas acotadas-pequeñas** con `paginado` activado por barrido pero de bajo valor real:
  `StockTab` (una fila por *tipo* de parte commodity), `Garantias` (solo garantías vigentes),
  `Compradores` (una fila por comprador). No paginaban ni pre-cortaban; activarlas es inocuo.
- **Ningún otro componente pre-corta filas** antes de pasarlas a `Tabla` ni rompe agregados al
  paginar en cliente: los totales de `ListadoVentas` se calculan con `useMemo` sobre el array
  completo (`ventas`), no sobre la rebanada — verificado. Los filtros derivados de `inventario`
  (`cpuGen`, `conDetalles`, `bateriaMin`) también operan sobre el set completo antes del corte.

**Ajuste de diseño a raíz de la auditoría:** `Tabla` ahora solo renderiza `PaginacionControles`
cuando `totalPaginas > 1`. Así activar `paginado` en tablas acotadas no mete ruido (el control
no aparece si todo cabe en una página), lo que hace segura la adopción amplia aunque la
clasificación de volumen no sea perfecta.

**Verificación en runtime (2026-07-15, Supabase local `supabase_db_tecnofal` ya corriendo):**

- Typecheck `apps/web` (`bunx tsc --noEmit`): exit 0. Lint monorepo (regla §21): limpio.
- Spec nuevo `e2e/paginacion.spec.ts` (siembra 30 laptops en un modelo único y filtra por él
  para aislar el conteo): 2/2 en verde — corta en 25, "1–25 de 30" → "26–30", ‹Anterior/
  Siguiente› con estados correctos, tamaño 50 colapsa a 1 página sin ocultar el control
  (30 > 10), y un filtro que reduce a 1 fila reencuadra a la página 1.
- `e2e/inventario.spec.ts` (regresión con `paginado` ya activo): 8/8 en verde.
- Suite completa `--workers=1`: **56/57 en verde**. El único fallo es `calculadora.spec.ts`
  ("guardar evaluación") por un desajuste **ajeno a este plan**: el Supabase local no tiene la
  columna `listings.cantidad_ofertas` (migraciones `0029`/`0030` no aplicadas al contenedor —
  verificado con `information_schema.columns`). No lo toca la paginación (no cambia columnas ni
  la calculadora). Reaplicar esas migraciones al contenedor compartido queda fuera de alcance.

**Decisión de UX corregida en implementación:** la regla de mostrar el control se cambió de
`totalPaginas > 1` a `total > min(tamaños)`. Con la primera, subir el tamaño hasta que todo
cupiera en una página ocultaba el control y dejaba al usuario atascado sin poder volver a bajarlo.
