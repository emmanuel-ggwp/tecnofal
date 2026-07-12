# Backlog — hallazgos no bloqueantes de la Fase 2

Cosas que los agentes del Grupo B encontraron y documentaron en sus Bitácoras, revisadas
por el coordinador y diferidas a propósito: no bloquean ningún criterio de cierre actual,
pero conviene resolverlas antes de dar la Fase 2 por definitiva. `plan-10-integracion.md`
debe revisar esta lista al cerrar.

## 1. `congelar_reparto_lote` sin guardia de re-ejecución (plan-04)

El principio de diseño nº... (§2.6 de la especificación) dice que el reparto de un lote es
**fijo e inmutable** una vez congelado. Hoy esa inmutabilidad la garantiza **solo la UI**
(oculta el botón "Congelar reparto" si ya existe un reparto) — la función SQL
`congelar_reparto_lote` en sí no rechaza una segunda llamada: si se invoca dos veces,
borra e reinserta `lote_reparto` sin error.

**Riesgo:** cualquier llamada directa al RPC (o un bug futuro en la UI que muestre el botón
quiovadamente) recalcularía un reparto que debía quedar congelado para siempre —
podría cambiar retroactivamente el `costo_asignado` de laptops que ya se vendieron.

**Fix propuesto:** agregar un guard al inicio de la función —
`if exists (select 1 from lote_reparto where lote_id = p_lote) then raise exception ...`.
Migración pequeña, sin riesgo de romper nada existente (nadie depende hoy de re-congelar).

**RESUELTO 2026-07-11** — migración `0024_guard_congelar_reparto.sql` (espejo Nhost
`1751900000024_guard_congelar_reparto/up.sql`): `create or replace function
congelar_reparto_lote` con un guard al inicio — `raise exception` (errcode `P0001`) si el
lote ya tiene `lote_reparto` (rama con laptops) o ya hay `lote_partes_encontradas.en_stock
= true` (rama solo-de-partes). El cuerpo restante queda idéntico al de `0001_schema.sql`
(ningún cálculo cambia). Validado por plan-10a en un contenedor Postgres 15 desechable con
la cadena completa `0001..0023` + `0024` (prelude Nhost con `auth.uid()` reemplazado por la
versión real de Supabase, `set_config('request.jwt.claims', …, false)` simulando un usuario
`authenticated` real): (a) flujo normal — primera llamada sobre un lote con 2 laptops y
`costo_lineas.subasta=100` — produce el mismo resultado que antes del guard (`lote_reparto`
con 2 filas, `proporcion=0.5`, `costo_asignado=50` cada una); (b) segunda llamada sobre el
mismo lote es rechazada con `El reparto del lote … ya fue congelado: es inmutable y no
puede recalcularse`. **Pendiente solo de que el coordinador/usuario la aplique** al
contenedor compartido `supabase_db_tecnofal` (plan-10a no tiene permiso para aplicarla
directamente — bloqueado por el clasificador de seguridad del entorno). Comando de una
sola línea (ejecutar desde la raíz de `tecnofal/`):
`docker exec -i supabase_db_tecnofal psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/0024_guard_congelar_reparto.sql`
Tras aplicarla no hace falta ningún cambio de código web — la UI ya oculta el botón cuando
hay reparto; el guard SQL es una segunda capa de defensa y no cambia el comportamiento
visible del camino feliz.

## 2. Duplicación parcial entre `lotes` y `costo_lineas` (plan-04)

`lotes.precio_subasta` y `lotes.envio_usa` son 2 valores crudos guardados directo en la
tabla `lotes`. Esos mismos 2 valores **también** existen como filas en `costo_lineas`
(tipo `subasta` y `envio_usa`), junto con el resto de la cadena de costos
(`impuesto_ebay`, `seguro`, `envio_vzla`, `revision`, `parte`) que solo vive ahí.
`lotes.costo_proyectado_total` sí es un total real (snapshot congelado, sin duplicar nada).

**Riesgo:** si algún día se registra un `monto_real` distinto para `subasta`/`envio_usa`
en `costo_lineas`, las columnas de `lotes` quedan desactualizadas — dos fuentes de verdad
para el mismo dato, con posibilidad de divergir.

**RESUELTO 2026-07-11** — migración `0023_sync_lote_costos.sql`: trigger
`trg_sync_lote_costos` en `costo_lineas` que mantiene `lotes.precio_subasta`/`envio_usa`
sincronizados automáticamente con `coalesce(monto_real, monto_estimado)` de la línea
correspondiente. Se descartó eliminar las columnas de `lotes` (opción original) porque la
auditoría mostró que las escriben/leen 8 archivos, incluidas pruebas de 4 pantallas ya
cerradas (inventario/partes/ventas/dashboard) que siembran un lote solo como FK — el
trigger resuelve el riesgo real (divergencia) sin ese blast radius. Validado en contenedor
desechable con los 3 caminos: `registrar_compra_lote`, costo_linea suelta, y actualización
posterior de `monto_real` (el escenario de divergencia en sí).

## 3. Abonos a `por_cobrar`/`por_pagar` no son atómicos (plan-07)

`abonar()` en `src/data/cuentas.ts` hace dos operaciones secuenciales desde el navegador
(no una transacción SQL): (1) `UPDATE` de `abonado`/`estado` en `por_cobrar`/`por_pagar`,
(2) `INSERT` del movimiento en la cuenta elegida. Si la conexión se corta entre esos dos
pasos, queda un estado a medias (la deuda bajó pero el dinero nunca entró a la cuenta, o
viceversa). Ventas y conversiones sí usan RPC transaccional (`registrar_venta`,
`registrar_conversion`); abonos no, porque no estaba en el plan original.

**Fix propuesto:** función `registrar_abono(p_tabla, p_id, p_monto, p_cuenta)` — mismo
patrón que las otras RPC, una sola transacción. Migración pequeña, candidata a `0022`
(el número que plan-07 tenía reservado y no usó).

**Prioridad baja:** el camino feliz funciona bien; el riesgo es solo ante una interrupción
de red a mitad de la operación, poco frecuente en el uso real (un solo usuario, escritorio).

## 4. Bucket de Storage `laptops` inexistente, sin políticas (plan-03)

Confirmado en vivo (2026-07-11): `storage.buckets` tiene 0 filas, `storage.objects`/
`storage.buckets` tienen 0 políticas RLS. Subir/ver fotos de laptop desde la ficha de
inventario **no funciona hoy** — el código de `apps/web/src/data/inventario.ts` que lo
intenta (`asegurarBucketFotos`, `subirFoto`, `eliminarFoto`) queda inoperante hasta que
exista una migración que: (a) cree el bucket `laptops` (privado, no público), (b) agregue
políticas a `storage.objects` que permitan a cada usuario autenticado subir/leer/borrar
solo dentro de una carpeta con su propio `user_id` (patrón estándar: política con
`(storage.foldername(name))[1] = auth.uid()::text`).

**No relevante por ahora** (explícito del usuario, 2026-07-11) — ninguna prueba actual
depende de fotos. Retomar cuando se priorice esa función.

## 5. Falta botón "Recalcular" en el panel de la extensión para listings ya evaluados (apps/extension)

`Panel.tsx` inicializa `deducciones`/`faltantes` con `ev?.deducciones ?? deduccionesSugeridas(...)`
y `ev?.faltantes ?? faltantesDe(...)` (líneas ~328-331): si el listing ya tiene una
`evaluacionManual` guardada, el panel reutiliza esos valores tal cual, sin importar si el
catálogo (modelos, detalles, precios) cambió después de guardarla.

**Riesgo:** cuando se actualiza una regla de negocio (ej. la migración `0024`/`0025` que subió
el default de "RAM soldada"/"SSD soldado" de $0 a $20, o cualquier cambio futuro de precios/
reglas), los listings ya evaluados quedan con datos congelados desactualizados — el usuario no
tiene forma de refrescarlos desde el panel, solo "Descartar" y re-evaluar desde cero (perdiendo
cualquier ajuste manual que hubiera hecho).

**Fix propuesto:** botón "Recalcular" junto a "Guardar"/"Descartar" que vuelva a correr
`faltantesDe`/`deduccionesSugeridas` sobre el `catalogo` actual y reemplace `faltantes`/
`deducciones` en el estado, preservando el resto de la evaluación (subasta, envío, método,
etc.) en vez de descartarla entera.

**Prioridad baja:** surge de una sesión de trabajo en `apps/extension` (2026-07-11, fix de
avisos bloqueantes duplicados / RAM-SSD soldada → deducción), no de un plan de Fase 2 — se
agrega aquí por ser el backlog existente del repo.
