# Plan 10 — Integración final: e2e del ciclo completo + cohesión

> **SUPERSEDIDO (2026-07-11)** — este plan resultó demasiado grande para un solo agente y
> se dividió en 3 planes secuenciales: `plan-10a-backlog-bitacoras.md`,
> `plan-10b-e2e-ciclo-completo.md`, `plan-10c-cohesion-verificacion.md`. Este archivo queda
> como referencia histórica de dónde salió el contenido — **no lo ejecutes directamente**,
> ejecuta los 3 planes `10a`/`10b`/`10c` en orden.

**Grupo C · Requiere TODOS los planes anteriores mergeados · Se ejecuta solo (sin paralelo).**

## Objetivo

Verificar que las pantallas funcionan como UN sistema: e2e del ciclo de vida completo de una
laptop a través de la UI (sin seeds intermedios), cross-links entre pantallas, consistencia
visual, y cierre de cabos sueltos que los planes B dejaron anotados en sus bitácoras.

## Contexto esencial

Flujo de negocio completo (§3 de la especificación, resumido):

```
Calculadora: evaluar compra eBay (2 laptops) → Convertir en lote   [laptops: comprada]
Lotes: crear paquete, agregar las 2 laptops + ítem personal        [en_transito]
Lotes: avanzar sub-estados → Recibido (flete/seguro/revisión real) [en_revision + prorrateo]
Lotes: revisión física → 1 batería encontrada → congelar reparto   [lote_reparto fijo]
Inventario: detalles/condición a una laptop; specs post-upgrade
Partes: comprar SSD (orden con prorrateo) → recibir → instalar     [costo_linea parte]
Inventario: falta_partes → lista_para_venta (sugerencia + confirmación manual)
Ventas: vender en USD → ganancia bruta/neta correctas              [vendida]
Cuentas: el ingreso está en la cuenta; conversión Zinli→Binance    [resultado cambiario]
Dashboard: TODOS los números cuadran con lo anterior
Ventas: devolución por garantía                                     [para_repuestos, egreso]
Dashboard: la ganancia revertida ya no aparece
```

Invariante central a asertar al final: `ganancia_neta = precio_venta − (costo_asignado del
reparto + partes instaladas + prorrateos de paquete + demás líneas reales)` — calcular el
valor esperado A MANO en la spec con los montos usados y compararlo con lo que muestra la UI.

## Tareas

1. **Bitácoras**: leer la sección "Bitácora" al final de cada plan 00–09. Traen dos tipos de
   entradas y ambos se procesan aquí: (a) **pendientes** — completarlos; (b) **cosas que no
   cuadran** (esquema/regla/cálculo que no coincidía con el plan, workarounds anotados) —
   investigar cada una, corregir la causa raíz (o el workaround temporal) y, si el hallazgo
   revela un error de la especificación o de los planes, anotarlo en la sección "Hallazgos
   para la especificación" al final de ESTE plan para reportarlo al usuario. Nada de la
   bitácora se cierra sin resolución o justificación escrita.
2. **e2e maestro** `e2e/ciclo-completo.spec.ts`: el flujo de arriba, TODO por UI (única
   siembra permitida: catálogo de partes con precios y el usuario e2e). Spec serial larga
   con `test.step` por etapa para diagnóstico claro.
3. **Cross-links**: verificar (y completar si falta) — laptop en cualquier tabla → ficha;
   lote en ficha de laptop → detalle de lote; venta → comprador; movimiento con referencia →
   venta/lote; chips del dashboard → inventario filtrado.
4. **Consistencia**: formato Dinero/fecha uniforme (kit ui), estados con los mismos colores
   de Chip en todas las pantallas, títulos de página, favicon, estados de carga.
5. **Estados vacíos y errores**: cada pantalla renderiza sin datos y muestra errores de red
   de forma no destructiva (probar con supabase detenido → mensaje, no crash).
6. **Suite completa**: `bunx playwright test` (todas las specs de todos los planes) en verde
   sobre `supabase db reset` limpio. Arreglar flakiness (esperas explícitas, no sleeps).
7. Actualizar `apps/web/README.md` con el flujo de desarrollo y prueba definitivo.

## Fuera de alcance

Funcionalidad nueva, Android, scraping del courier, deploy (esos son v2 transversal / Fase 3).

## Criterios de aceptación

- Suite completa verde en un reset limpio, dos corridas seguidas (sin flakiness).
- El invariante de ganancia cuadra al centavo en la spec maestra.
- Ningún pendiente de bitácora sin resolver o sin justificar por escrito.

## Contexto permitido

- Este plan + `planes/README.md` + las bitácoras de los planes 00–09.
- Las pantallas y repositorios que necesite tocar (leer selectivamente, empezando por el
  archivo del dominio implicado — no releer todo apps/web de una vez).
- NO leer: especificación completa, extensión, migraciones más allá de firmas puntuales.

## Hallazgos para la especificación

El agente ejecutor lista aquí los hallazgos de bitácoras (y propios) que implican corregir
la especificación o los planes — para reportarlos al usuario al cerrar la Fase 2.

- (vacía)
