# Planes de ejecución — Fase 2: Panel Web (Next.js)

Serie de planes autocontenidos para construir la web de TecnoFal (§7 de la especificación).
Cada plan está dimensionado para ejecutarse en **una sesión de agente sin superar ~70% del contexto**:
lleva embebido el contexto que necesita (esquema, reglas de negocio, convenciones) y prohíbe
exploraciones amplias del monorepo.

## Grafo de dependencias y paralelización

```
GRUPO A (paralelos entre sí, primero):
  plan-00-fundaciones      ← scaffold web + auth + layout + Playwright + Supabase local
  plan-01-sql-rpc          ← migraciones 0013+: vistas de dashboard + RPCs transaccionales

GRUPO B (paralelos entre sí, tras A):
  plan-02-configuracion    plan-03-inventario     plan-04-lotes-paquetes
  plan-05-partes           plan-06-ventas         plan-07-cuentas
  plan-08-calculadora      plan-09-dashboard

GRUPO C (al final, solo):
  plan-10-integracion      ← e2e del ciclo de vida completo + cross-links + pulido
```

- Los planes del grupo B **no comparten archivos**: cada uno toca solo su ruta
  `apps/web/src/app/<dominio>/`, su repositorio `apps/web/src/data/<dominio>.ts` y sus specs
  `apps/web/e2e/<dominio>.spec.ts`. Se pueden ejecutar en worktrees/sesiones simultáneas y
  mergear sin conflictos.
- La navegación, el layout, la guardia de auth y los componentes compartidos los crea el plan-00
  **de una vez con todas las rutas stub**, para que ningún plan del grupo B edite archivos compartidos.
- Rangos de migraciones SQL reservados (para no chocar): plan-01 → `0013–0016` ·
  plan-04 → `0017` · plan-05 → `0018` · plan-06 → `0019` · plan-07 → `0020` · resto: sin SQL nuevo.

## Entorno local (igual para todos los planes)

- **Backend:** Supabase local en Docker — `supabase start` desde `tecnofal/` (las migraciones
  `supabase/migrations/0001–0012` ya existen y se aplican con `supabase db reset`).
  URL `http://127.0.0.1:54321`; anon key y service_role key las imprime `supabase start`
  (son las claves demo estándar del CLI, estables entre reinicios).
- **Web:** `apps/web` (Next.js App Router + TypeScript), `bun install` en la raíz del monorepo,
  `bun run --cwd apps/web dev` → http://localhost:3000.
- **Pruebas:** Playwright (`apps/web/e2e/`). `bunx playwright test` con `webServer` configurado
  (plan-00). El `global-setup` crea el usuario de prueba vía la API admin (service_role) —
  el trigger `fn_on_auth_user_created` siembra su plantilla de parámetros/precios/ajustes/detalles —
  e inicia sesión una vez guardando `storageState`.
- **Datos de prueba:** cada spec siembra lo suyo vía el helper `e2e/helpers/db.ts` (cliente
  supabase-js con service_role) y limpia al terminar. Nunca depender de datos de otra spec.
- **Cuidado con la config compartida:** todas las specs corren contra el MISMO usuario e2e.
  Si tu spec asume valores semilla de `parametros`/`precios_ideales`/`ajustes_config`/
  `detalles_catalogo` (ej. `ganancia_minima = 0.50`), otra spec que edite esa config para
  probar persistencia (plan-02 lo hace) puede dejarla mutada y tu prueba sale flaky. Carga
  la config REAL del usuario vía `clienteAdmin()` en vez de hardcodear `PARAMETROS_DEFAULT`/
  `PRECIOS_IDEALES_SEMILLA` del core al comparar resultados (hallazgo real de plan-08, 2026-07-10).
- **La suite COMPLETA (todos los .spec.ts a la vez) corre en serie: `bunx playwright test
  --workers=1`.** Con los workers por defecto (varios archivos en paralelo), 2 pruebas
  (`cuentas.spec.ts` conversión Zinli→Binance, `partes.spec.ts` navegación a detalle de
  orden) fallan de forma reproducible por contención contra un único servidor `next dev`
  en modo desarrollo (compila rutas bajo demanda; con 4+ specs navegando a la vez, algunas
  esperas de 5s no alcanzan) — confirmado 2026-07-11: mismas 2 pruebas fallan en 2 corridas
  paralelas y pasan las 46/46 en 2 corridas seriales. NO es un bug de datos ni de las RPC
  (la verificación contra BD ya había pasado antes de que fallara la comprobación en UI).
  Cada dominio individual (`bunx playwright test e2e/<dominio>.spec.ts`) sí puede correr con
  los workers por defecto sin problema — la contención solo aparece al juntar varios a la vez.

## Convenciones de código (resumen; el detalle vive en plan-00)

- Páginas client-side (`'use client'`); datos SIEMPRE a través de repositorios en
  `apps/web/src/data/*.ts` — **ningún componente importa `@supabase/supabase-js` directamente**
  (espíritu §7b: portabilidad de proveedor).
- Cálculos de negocio: importar de `@tecnofal/core` (motor §4, `precioBasePara`, `evaluar`,
  `colorDeMargen`…) — **nunca** reimplementarlos en la web.
- Valores derivados (precio sugerido, costos, ganancias) se **leen de las vistas SQL**
  (`v_laptop_precio_sugerido`, `v_laptop_costos`, `v_ventas_ganancia`…) — nunca se calculan
  ni se guardan en columnas desde la web (principio nº 6).
- Multi-usuario: RLS filtra por `user_id` automáticamente; el código web jamás envía `user_id`.
- UI: Tailwind CSS; componentes compartidos en `apps/web/src/ui/` (creados por plan-00; los
  planes B los consumen, no los editan). Idioma de la UI: español.

## Regla de presupuesto de contexto (para el agente ejecutor)

1. Lee SOLO: tu plan + este README + los archivos listados en "Contexto permitido" de tu plan.
2. NO explores `node_modules`, no listes el monorepo completo, no leas la especificación entera
   ni otros planes: tu plan ya contiene los extractos del esquema y las reglas que necesitas.
3. Si a mitad de trabajo superas ~60% del contexto, termina la sub-tarea en curso, deja el
   estado en un commit y anota lo pendiente al final del plan (sección "Bitácora") para retomarlo
   en una sesión nueva.
4. **Si algo no cuadra, va a la Bitácora.** Cuando encuentres algo que parece estar mal o
   incompleto — el esquema no coincide con lo que el plan describe, una regla de negocio se
   contradice, falta una columna/vista/RPC que el plan asume, un cálculo no cierra, o detectas
   un caso que ningún plan cubre — NO lo arregles en silencio ni lo rodees con un workaround
   sin dejar rastro: anótalo en la Bitácora de tu plan (qué esperabas, qué encontraste, qué
   decidiste hacer mientras tanto). El plan-10 revisa todas las bitácoras y resuelve o escala.
5. Verifica con Playwright ANTES de dar por cerrado el plan: `bunx playwright test e2e/<dominio>`.
