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
# `supabase start` / `db reset` operan sobre la base compartida `postgres`: solo el mantenedor /
# arranque inicial. Los AGENTES no los usan (ver "Aislamiento de BD por agente" abajo).
npx supabase start                           # API 55321, DB 55322, Studio 55323 (arranque del stack)
scripts/test-sql.sh                          # pruebas SQL de RPCs/vistas (rollback, no deja rastro)
scripts/db-plantilla.sh                      # (re)construye el template `plantilla` (todas las migraciones)
scripts/db-agente.sh <tarea>                 # clona agente_<tarea> del template para tu trabajo aislado
scripts/db-agente.sh <tarea> --drop          # elimínala al terminar

# Panel web
cp apps/web/.env.local.example apps/web/.env.local   # claves demo del CLI, ya correctas
bun run --cwd apps/web dev                   # http://localhost:3000

# E2E web (Playwright, desde apps/web; requiere Supabase local arriba)
bunx playwright test e2e/inventario.spec.ts  # un dominio: workers por defecto OK
bunx playwright test --workers=1             # suite COMPLETA: SIEMPRE en serie
```

**Por qué `--workers=1` en la suite web completa:** varios specs en paralelo contienden contra el único servidor `next dev` (compila rutas bajo demanda) y 2 pruebas fallan de forma reproducible. No es bug de datos ni de RPCs. Aplica también a `--repeat-each` de un mismo spec.

## Aislamiento de BD por agente

**NUNCA trabajes sobre la base `postgres` del Supabase local** (contenedor `supabase_db_tecnofal`, puerto 55322): es el entorno compartido del que dependen otros agentes, la CI y el stack HTTP. Para **cualquier cambio de esquema o dato de prueba** clona tu propia base y usa SOLO esa:

```bash
scripts/db-agente.sh mi_tarea        # crea agente_mi_tarea (clon del template `plantilla`)
docker exec -i supabase_db_tecnofal psql -U postgres -d agente_mi_tarea -f mi_prueba.sql
scripts/db-agente.sh mi_tarea --drop # al terminar
```

- **`plantilla`** es el template canónico: se reconstruye con `scripts/db-plantilla.sh` desde el esquema base (schema `auth`, solo estructura) + `supabase/migrations/` en orden, **excluyendo la 0025** (no autorizada, igual que CI). Refleja las migraciones **del checkout actual**; si tu rama trae migraciones nuevas, reconstrúyelo (o apunta `MIGRATIONS_DIR=` a otra carpeta). Clonar es instantáneo (`CREATE DATABASE … TEMPLATE plantilla`).
- **Prohibido para agentes:** `supabase db reset` / `supabase migration up` (mutan `postgres`), `supabase start` y levantar contenedores Postgres nuevos. Si un cambio de esquema debe persistir, NO lo apliques a `postgres`: genera el archivo en `supabase/migrations/` y déjalo para revisión.
- **Alcance:** este aislamiento sirve para trabajo **SQL** (migraciones, RPCs, vistas — p. ej. `scripts/test-sql.sh`). **NO** para la suite e2e/web: PostgREST está fijado a la base `postgres` (`PGRST_DB_URI=…/postgres`), así que Playwright corre contra el stack compartido, no contra una base de agente.

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

- **Regla de push (hook `pre-push` versionado en `.githooks/`): NO se hace push sin que pasen TODOS los tests.** El hook corre typecheck + lint + unit (vitest: core, provider-local, provider-supabase) + e2e web (Playwright `--workers=1`) y **aborta el push** si algo falla. Activación una vez por clon: `git config core.hooksPath .githooks`. Requiere el Supabase local arriba (para el e2e). Excluye el e2e de la extensión (misma exclusión que CI, ver abajo). Bypass de emergencia `git push --no-verify` (rompe la regla, desaconsejado).
- Repo público `emmanuelmarcano/tecnofal` con branch protection en `main`: se mergea solo por PR con el check `full-suite` en verde (enforce_admins activo).
- `ci-fast.yml` (push a ramas ≠ main): typecheck + unit tests de core y provider-local.
- `ci-full.yml` (PR a main, check requerido): además build + suite Playwright completa de `apps/web` (`--workers=1`) contra un Supabase real en el runner. **Excluye a propósito** el e2e de la extensión (falla en Chromium headless del runner con extensiones cargadas — pendiente aparte, decisión del usuario) y la migración 0025.
- CI usa Node 22: `@supabase/supabase-js` (realtime) necesita WebSocket nativo que Node 20 no trae.

## Commits y push (para agentes)

- **Autoría:** los commits deben ir autorados por la identidad del proyecto —
  `user.name=emmanuelmarcano`, `user.email=emmanuel.marcano.gg@gmail.com` (el @gmail; es lo que
  GitHub y Vercel usan para atribuir el commit y el deploy). Verifícalo con `git config user.email`
  en cada worktree nuevo antes de commitear. Cierra los mensajes con el trailer
  `Co-Authored-By: Claude ...`. NO se firman con GPG (no está configurado; no lo actives).
- **Push SOLO desde la terminal** con el entorno de dev cargado (bun/docker/node en el PATH).
  NO desde GitHub Desktop u otro cliente GUI: corren los hooks con un PATH mínimo y el `pre-push`
  aborta con "command not found" (o, peor, subiría sin tests). Y hazlo desde un worktree que
  contenga `.githooks/pre-push`: si el checkout no trae el hook, git lo omite y subirías SIN correr
  la suite.
- **Requisito del push:** Supabase local arriba (el hook corre el e2e web). El `pre-push` corre
  typecheck + lint + unit + e2e y **aborta si algo falla** (ver "CI y flujo de trabajo"). ~5 min.
- **Transporte SSH multi-cuenta:** `origin` usa un alias de host, no `github.com` pelado:
  `git@github-ggwp:emmanuel-ggwp/tecnofal.git`. El push viaja por la clave SSH de la cuenta
  `emmanuel-ggwp` (dueña del repo), mientras la **autoría** sigue siendo el @gmail — que el
  auth-account (ggwp) sea distinto del author-email (marcano) es intencional y correcto. Los alias
  viven en `~/.ssh/config` (por máquina, NO versionado): `Host github-ggwp` →
  `IdentityFile ~/.ssh/id_ed25519_ggwp`, `IdentitiesOnly yes`.
- **Flujo típico:** `git config core.hooksPath .githooks` (una vez por clon) → commit con la
  identidad correcta → `git push` desde el worktree en la terminal → el hook corre la suite → sube
  por SSH.

## Sistema de planes (`planes/`)

El trabajo grande se ejecuta con planes autocontenidos por dominio (ver `planes/README.md`, que también fija las convenciones de código de la web). Regla clave al ejecutar un plan: **si algo no cuadra** (esquema ≠ plan, regla contradictoria, columna/vista/RPC faltante), no lo arregles en silencio — anótalo en la sección "Bitácora" del plan con qué esperabas, qué encontraste y qué decidiste hacer mientras tanto.
