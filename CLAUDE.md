# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

TecnoFal: sistema para comprar laptops usadas en eBay y revenderlas. Monorepo (workspaces) con un motor de decisión compartido, una extensión Chrome MV3 (Fase 1, en producción) y un panel web Next.js (Fase 2). Backend: **Supabase es el activo/principal; Nhost es solo respaldo/espejo** — nunca deployar a Nhost ni tratarlo como default.

Todo el repo está en **español**: comentarios, commits, UI, nombres de dominio (`evaluacion`, `negocio`, `proveedor`). Las referencias `§N` en comentarios y docs apuntan a la especificación del proyecto (documento externo); consérvalas al editar.

## Comandos

Package manager: **bun** (`bun.lock` es el lockfile canónico; CI hace `bun install`). Los scripts se orquestan con `npm run` desde la raíz.

```bash
bun install                                  # instalar (raíz del monorepo)
npm run build                                # core + extensión (la extensión queda en apps/extension/dist)
npm run typecheck                            # todos los packages + extensión — NO incluye apps/web
cd apps/web && bunx tsc --noEmit             # typecheck de la web (aparte, así lo corre CI)
npm run lint                                 # regla §21 (ver Arquitectura)

# Unit tests (vitest)
npm run test -w @tecnofal/core
npm run test -w @tecnofal/provider-local
npm run test -w @tecnofal/core -- -t "nombre del test"   # un test individual

# E2E extensión (fixtures locales de eBay, sin red; requiere build previo)
npm run build && npx playwright install chromium
npm run test:e2e -w @tecnofal/extension

# Supabase local (Docker Desktop corriendo; puertos 553xx — conviven con "patriona" en 543xx)
npx supabase start                           # API 55321, DB 55322, Studio 55323
npx supabase db reset                        # re-aplica supabase/migrations
scripts/test-sql.sh                          # pruebas SQL de RPCs/vistas (rollback, no deja rastro)

# Panel web
cp apps/web/.env.local.example apps/web/.env.local   # claves demo del CLI, ya correctas
bun run --cwd apps/web dev                   # http://localhost:3000

# E2E web (Playwright, desde apps/web; requiere Supabase local arriba)
bunx playwright test e2e/inventario.spec.ts  # un dominio: workers por defecto OK
bunx playwright test --workers=1             # suite COMPLETA: SIEMPRE en serie
```

**Por qué `--workers=1` en la suite web completa:** varios specs en paralelo contienden contra el único servidor `next dev` (compila rutas bajo demanda) y 2 pruebas fallan de forma reproducible. No es bug de datos ni de RPCs. Aplica también a `--repeat-each` de un mismo spec.

## Arquitectura

```
packages/core               → motor de decisión + parser + tipos; define las interfaces
                              DataProvider/AuthProvider (negocio.ts). Cero dependencias de backend.
packages/provider-local     → IndexedDB/Dexie — la UI de la extensión SIEMPRE habla con este (§22)
packages/provider-supabase  → adaptador supabase-js (espejo activo/principal)
packages/provider-nhost     → adaptador GraphQL/Hasura (respaldo; no hay proyecto real en Nhost)
apps/extension              → Chrome MV3 (Vite + CRXJS + React 18); local-first
apps/web                    → Next.js App Router + Tailwind 4 + React 19; habla directo con Supabase
supabase/migrations         → esquema canónico: SQL + RLS + vistas + RPCs (nhost/ lo espeja)
planes/                     → planes de ejecución por dominio + bitácoras (ver abajo)
```

**Regla §21 (portabilidad de proveedor), reforzada por ESLint** (`no-restricted-imports`, es error de build): nada fuera de los adaptadores importa `@supabase/supabase-js` ni `@nhost/nhost-js`. Excepciones puntuales con `eslint-disable`: `apps/web/src/data/cliente.ts` (único punto de acceso de la web) y `apps/web/e2e/helpers/db.ts`.

**Extensión (local-first, §22):** funciona completa sin backend — todo vive en IndexedDB con seeds empaquetados. La sesión solo activa el espejo remoto (sync cada 5 min, elegido por `VITE_PROVIDER` en `apps/extension/.env` vía `src/proveedor.ts`). Content scripts: `search.ts` (badges en búsquedas de eBay) y `listing.tsx`/`Panel.tsx` (panel de evaluación en el listing). El protocolo de mensajes MV3 vive en `src/lib/mensajes.ts` — los mensajes deben ser JSON-serializables (Date no viaja; usar string).

**Push de config local→Supabase: aditivo, NUNCA borra** (solo upsert por clave natural, cero DELETE — decisión explícita del usuario tras un incidente de barrido de datos). La tabla `modelos` está **excluida del push** a propósito (es global/compartida; el conocimiento de modelos se comparte solo por el canal de avisos §23). Solo suben las 5 tablas por-usuario: `parametros`, `precios_ideales`, `ajustes_config`, `detalles_catalogo`, `partes_catalogo`.

**Panel web:** páginas client-side; los datos SIEMPRE pasan por los repositorios `apps/web/src/data/<dominio>.ts` — ningún componente toca supabase-js. Componentes compartidos en `src/ui/`. Reglas duras:
- Cálculos de negocio: importar de `@tecnofal/core` (`evaluar`, `precioBasePara`, `colorDeMargen`…) — **nunca** reimplementarlos.
- Valores derivados (precio sugerido, costos, ganancias) se **leen de las vistas SQL** (`v_laptop_precio_sugerido`, `v_laptop_costos`, `v_ventas_ganancia`…) — nunca se calculan ni se guardan desde la web.
- RLS filtra por `user_id` automáticamente; el código web **jamás envía `user_id`**.

**Migraciones** (`supabase/migrations/`): numeración incremental; los huecos 0019–0021 son rangos que quedaron reservados por planes, no errores. `0025_ram_ssd_soldada_deduccion.sql` es una migración **no autorizada que NO se aplica** ni en producción ni en CI (CI la mueve fuera antes de `supabase start`) — no tocarla ni borrarla. Nunca commitear migraciones sin validarlas contra un Postgres real primero.

## Tests e2e de la web — convenciones

- `global-setup` crea el usuario e2e (`e2e@tecnofal.test`) vía API admin y guarda `storageState`; no hay login manual.
- **Todas las specs comparten ese usuario.** Si tu spec lee `parametros`/`precios_ideales`/`ajustes_config`/`detalles_catalogo`, carga el valor real vía `clienteAdmin()` (helper `e2e/helpers/db.ts`, service_role) en vez de hardcodear los defaults del core — otra spec pudo haberlos mutado.
- Cada spec siembra y limpia sus propios datos; nunca depender de datos de otra spec.

## CI y flujo de trabajo

- Repo público `emmanuelmarcano/tecnofal` con branch protection en `main`: se mergea solo por PR con el check `full-suite` en verde (enforce_admins activo).
- `ci-fast.yml` (push a ramas ≠ main): typecheck + unit tests de core y provider-local.
- `ci-full.yml` (PR a main, check requerido): además build + suite Playwright completa de `apps/web` (`--workers=1`) contra un Supabase real en el runner. **Excluye a propósito** el e2e de la extensión (falla en Chromium headless del runner con extensiones cargadas — pendiente aparte, decisión del usuario) y la migración 0025.
- CI usa Node 22: `@supabase/supabase-js` (realtime) necesita WebSocket nativo que Node 20 no trae.

## Sistema de planes (`planes/`)

El trabajo grande se ejecuta con planes autocontenidos por dominio (ver `planes/README.md`, que también fija las convenciones de código de la web). Regla clave al ejecutar un plan: **si algo no cuadra** (esquema ≠ plan, regla contradictoria, columna/vista/RPC faltante), no lo arregles en silencio — anótalo en la sección "Bitácora" del plan con qué esperabas, qué encontraste y qué decidiste hacer mientras tanto.
