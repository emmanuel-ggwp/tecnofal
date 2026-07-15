# Auditoría de duplicación — hallazgos consolidados (13 tablas Alta)

Fecha: 2026-07-15. Método: un subagente por tabla (ver `scripts/audit-duplicacion.md`),
7 vectores de BD + familias A–G (display/estado/sync/evento). Referencia del fix ya aplicado:
`supabase/migrations/0031_lotes_idempotencia.sql`.

## Conclusión de una línea

**El síntoma (filas/montos repetidos en el panel) es duplicación REAL en la BD, no de display.**
Todas las consultas/vistas se verificaron limpias (agregan con `group by`/`sum`, embeds N→1,
`Map` por id, estado UI reemplazado no acumulado, listeners con cleanup). El bug de `lotes`
NO era un caso aislado: **es un patrón sistémico** — casi ninguna tabla transaccional tiene
clave única natural, casi ningún path de escritura es idempotente, y varios handlers de UI
carecen de guard de reentrada. El fix 0031 nunca se portó a las demás tablas.

## El patrón común (raíz única)

Cada duplicado nace de la combinación de tres huecos, los mismos que 0031 cerró para `lotes`:
1. **Sin `unique` natural** en la tabla (solo PK `id uuid` aleatoria).
2. **Escritura no idempotente**: INSERT plano (o RPC sin chequeo de existencia / sin `FOR UPDATE`).
3. **Guard de UI débil**: `disabled={guardando}` sin `if (guardando) return`, con ventana de
   carrera intra-tick, y sin defensa server-side ante reintento tras falso error de red.

## Hallazgos por severidad

### 🔴 CRÍTICO — corrupción irreversible

| Tabla | Mecanismo | Ubicación |
|---|---|---|
| `partes_compras` | Doble-insert dispara `trg_partes_promedio` 2× → **corrompe costo_promedio ponderado Y crea cantidad fantasma** en `partes_stock`, sin forma de revertir. Detonantes: botón "Comprar" ([StockTab.tsx:37](apps/web/src/app/(panel)/partes/StockTab.tsx:37)) y "Recibir" ([ordenes/[id]/page.tsx:93](apps/web/src/app/(panel)/partes/ordenes/[id]/page.tsx:93)) sin guard; **`recibir_orden_partes` sin `FOR UPDATE`** ([0001:571](supabase/migrations/0001_schema.sql:571)) → race concurrente. | trigger [0001:190](supabase/migrations/0001_schema.sql:190) |

### 🟠 ALTA — duplicación real de dinero / costos / inventario

| Tabla | Mecanismo | Ubicación |
|---|---|---|
| `costo_lineas` | `registrarCostoRealLote` es **SELECT-then-INSERT no atómico** sin unique → dos líneas "real" del mismo (lote,tipo). **Es otra causa directa del síntoma $115.59/$118.91.** Las vistas que suman lo amplifican. | [lotes.ts:253](apps/web/src/data/lotes.ts:253) |
| `conversiones` | `registrar_conversion` no idempotente → retry duplica conversión completa (2 movimientos + 1 conversión). Extensión usa 3 inserts no atómicos (movimientos huérfanos). | [0016:41](supabase/migrations/0016_rpc_conversion.sql:41) |
| `movimientos` | Sin unique/idempotencia; `registrar_conversion` (alta) y `registrar_abono` (media) duplican asientos de caja. UI `enviarMovimiento`/`enviarAbono` sin guard. | [0001:302](supabase/migrations/0001_schema.sql:302), [cuentas/page.tsx:183](apps/web/src/app/(panel)/cuentas/page.tsx:183) |
| `por_cobrar` | `crearDeuda` insert plano + `registrar_abono` acumulativo no idempotente; botones "Crear"/"Confirmar abono" sin guard. (Nota: `registrar_venta` **no** crea por_cobrar; alta 100% manual.) | [cuentas.ts:299](apps/web/src/data/cuentas.ts:299) |
| `por_pagar` | Idéntico a `por_cobrar`: sin unique, insert plano, abono no idempotente, UI sin guard. | [cuentas.ts:295](apps/web/src/data/cuentas.ts:295) |
| `paquetes` | `crearPaquete` INSERT plano sin idempotencia/unique. **Mismo patrón exacto de `lotes`.** | [paquetes.ts:96](apps/web/src/data/paquetes.ts:96) |
| `paquete_items` | `agregarItemParte`/`agregarItemPersonal` inserts crudos sin barrera → duplican y **inflan el prorrateo de flete/seguro**. (laptop protegido indirect. por `laptops.paquete_id`.) | [paquetes.ts:186](apps/web/src/data/paquetes.ts:186) |
| `lote_partes_encontradas` | Sin `unique(lote_id,parte_id)`; `agregarParteEncontrada` insert crudo → **infla `v_nominales` en `congelar_reparto_lote`** y distorsiona el reparto. | [lotes.ts:307](apps/web/src/data/lotes.ts:307) |
| `partes_especificas` | Sin unique; `crearEspecifica`/`cosecharParte` inserts planos; alta en `EspecificasTab` sin guard `enviando`. | [partes.ts:235](apps/web/src/data/partes.ts:235) |
| `laptop_partes` | Commodity: `for update` protege stock pero **no** la doble-instalación → duplica fila + `costo_lineas('parte')`. (Específica sí protegida por `if laptop_asignada_id not null`.) | [0022:53](supabase/migrations/0022_transacciones_multi_paso.sql:53) |

### 🟡 MEDIA — protegido hoy pero frágil

| Tabla | Mecanismo | Ubicación |
|---|---|---|
| `ventas` | Duplicación prevenida **solo** por la máquina de estados de `laptops` (`for update` + guard de estado), no por constraint. Sin `unique` parcial; modal sin `if(guardando)return` (puede duplicar un **comprador nuevo**). Fan-out de display latente vía `lote_reparto` si una laptop estuviera en >1 lote. | [0014:27](supabase/migrations/0014_rpc_ventas.sql:27) |

### 🟢 CERRADO

| Tabla | Estado |
|---|---|
| `lotes` / `laptops` | Cerrado por 0031 (RPC idempotente + lock `syncEnCurso` + clave `local:UUID` + guards web). Residuales menores: `provider-nhost.comprar()` sin idempotencia (mitigado: respaldo) y alta web multi-pestaña (claves distintas). |

## Patrones transversales

- **Vector 6 (UI doble-submit) es sistémico.** Handlers sin `if (busy) return` como backstop
  (solo `disabled` con race intra-tick): `cuentas/page.tsx` (enviarMovimiento/enviarAbono/enviarDeuda),
  `StockTab`, `ordenes/[id]/page.tsx`, `EspecificasTab`, `InstalarModal`, `lotes/[id]` (agregarParte),
  `paquetes`. Los modales de venta/conversión/instalar-específica sí lo tienen — inconsistente.
- **Vectores 3/4/5 (sync) NO aplican** fuera de `lotes`/`laptops`: el resto son tablas web-only;
  la extensión no las escribe. El único residual de sync es `provider-nhost`.
- **Display (familia A) limpio en todas.** Ninguna vista/consulta multiplica filas. Riesgo latente
  único: `v_laptop_costos`/`v_ventas_ganancia` si `lote_reparto` tuviera >1 fila por laptop.

## Fix de raíz recomendado (una estrategia, no parches por tabla)

Portar el patrón 0031 a todas las tablas transaccionales, en tres capas:

1. **BD — clave natural / idempotencia + `unique`** (migración nueva, replicando 0027/0031):
   - `partes_compras`, `paquetes`, `conversiones`, `movimientos`, `por_cobrar`, `por_pagar`,
     `partes_especificas`: columna `idempotency_key` + índice único parcial `(user_id, idempotency_key)`.
   - `lote_partes_encontradas`: `unique(lote_id, parte_id)`.
   - `paquete_items`: `unique(paquete_id, ref_id) where tipo='laptop'` + idempotencia para parte/personal.
   - `laptop_partes`: decidir semántica commodity (¿única por laptop?) → unique parcial o idempotencia.
   - `ventas`: `unique(user_id, laptop_id) where estado='activa'`.
   - `costo_lineas`: `unique(user_id, ambito, ambito_id, tipo) where tipo <> 'parte'`.
2. **RPC / capa de datos idempotente**: `registrar_conversion`, `registrar_abono`, `registrar_venta`,
   `agregar_item_laptop_paquete`, `instalar_parte` (commodity), `recibir_orden_partes` (+`FOR UPDATE`)
   aceptan clave de idempotencia y hacen `on conflict do nothing`/early-return. Convertir a RPC/upsert
   idempotente los inserts crudos del cliente: `crearPaquete`, `agregarParteEncontrada`,
   `registrarCostoRealLote`, `crearEspecifica`/`cosecharParte`, `registrarCompraStock`,
   `agregarItemParte`/`agregarItemPersonal`, `crearDeuda`.
3. **UI — `if (busy) return`** en todos los handlers listados en "Vector 6", + `client_request_id`
   por submit (patrón `useRef` de 0031) donde aplique.

Prioridad sugerida: (1) `partes_compras` (crítico, corrupción irreversible) → (2) dinero:
`conversiones`/`movimientos`/`por_cobrar`/`por_pagar` → (3) costos/inventario: `costo_lineas`,
`paquetes`, `paquete_items`, `lote_partes_encontradas`, `partes_especificas`, `laptop_partes` →
(4) `ventas` (formalizar constraint) → (5) residual `provider-nhost`.
