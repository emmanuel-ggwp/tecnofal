# Plan 00 — Fundaciones de la web (scaffold, auth, layout, Playwright)

**Grupo A · BLOQUEANTE para el grupo B · Paralelizable con plan-01.**

## Objetivo

Crear `apps/web` (Next.js App Router + TS + Tailwind) con: login contra Supabase local,
guardia de sesión, layout con navegación a las 8 pantallas (stubs), capa de datos base,
kit UI mínimo compartido, y la infraestructura de pruebas (Playwright + Supabase en Docker)
que usarán todos los demás planes.

## Contexto esencial

- Monorepo Bun workspaces: `packages/core` (`@tecnofal/core`), `packages/provider-supabase`,
  `apps/extension`. La web es un workspace nuevo `apps/web`.
- Backend: Supabase local (`supabase start` en `tecnofal/`; migraciones 0001–0012 ya aplican
  esquema completo + RLS + seeds). El trigger `fn_on_auth_user_created` siembra la plantilla
  de `parametros`, `precios_ideales`, `ajustes_config`, `detalles_catalogo`, `partes_catalogo`
  y `cuentas` al crear cada usuario.
- RLS: todas las tablas filtran `user_id = auth.uid()`; `modelos`, `tipos_aviso` y
  `modelo_avisos` son globales (SELECT para todo autenticado). El código web nunca maneja user_id.
- Auth: email+password (`signInWithPassword`). Sesión en el navegador (localStorage, patrón
  client-side); páginas `'use client'`.

## Tareas

1. **Scaffold** `apps/web`: Next.js (App Router, TS, sin src alias raro — usar `@/` → `src/`),
   Tailwind v4, `package.json` con workspace deps `@tecnofal/core`. Añadir al lint config raíz.
2. **Cliente Supabase** en `src/data/cliente.ts`: singleton browser con
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local.example` con los
   valores del CLI local). REGLA: es el ÚNICO archivo que importa `@supabase/supabase-js`;
   los repositorios `src/data/*.ts` lo consumen y exponen funciones tipadas por dominio.
3. **Auth**: página `/login` (email+password, error visible), `src/data/auth.ts`
   (signIn/signOut/getSession/onAuthStateChange), y guardia: layout raíz redirige a `/login`
   sin sesión (y de `/login` al dashboard con sesión).
4. **Layout + navegación**: sidebar con las 8 rutas — `/` Dashboard, `/inventario`,
   `/calculadora`, `/lotes`, `/partes`, `/ventas`, `/cuentas`, `/configuracion` — cada una con
   página stub (`<h1>` + texto "en construcción") para que los planes B solo reemplacen SU stub.
   Header con: búsqueda global por alias (input stub), botón "＋ Conversión" (slot que
   implementará plan-07 — dejar el botón emitiendo un evento `tecnofal:conversion-rapida`),
   email del usuario y logout.
5. **Kit UI** en `src/ui/`: `Tabla` (encabezados + filas + vacío), `Modal`, `Boton`, `Campo`
   (label+input), `Chip` (estado con color), `Dinero` (formato USD/VES), `FechaCorta`,
   `Semaforo` (usa `colorDeMargen` de `@tecnofal/core`). Pequeños y sin dependencias externas.
6. **Playwright**: `apps/web/playwright.config.ts` con `webServer` (levanta `next dev`),
   baseURL `http://localhost:3000`, `globalSetup` que: (a) crea el usuario
   `e2e@tecnofal.test` / `tecnofal-e2e` vía `auth.admin.createUser` (service_role,
   `email_confirm: true`) si no existe; (b) hace login por UI una vez y guarda
   `e2e/.auth/state.json` como `storageState`. Helper `e2e/helpers/db.ts`: cliente
   service_role + `comoUsuario()` que devuelve el user_id del usuario e2e para sembrar filas.
7. **Specs de humo** `e2e/fundaciones.spec.ts`: login inválido muestra error; login válido
   llega al dashboard; sin sesión `/inventario` redirige a `/login`; la sidebar navega a las
   8 rutas y cada stub renderiza; logout vuelve a `/login`.
8. **Scripts** en `apps/web/package.json`: `dev`, `build`, `test:e2e` (playwright),
   `db:reset` (`supabase db reset` desde la raíz). Documentar el arranque en
   `apps/web/README.md` (10 líneas: supabase start → bun dev → test).

## Fuera de alcance

Cualquier pantalla real (grupo B), SQL nuevo (plan-01), SSR/cookies de auth, i18n, dark mode.

## Archivos (todos nuevos; ninguno compartido con grupo B salvo los stubs que cada plan reemplaza)

`apps/web/**` completo + `tecnofal/package.json` (añadir workspace si hace falta) +
`eslint.config.mjs` (bloque para apps/web, incluida la regla "solo cliente.ts importa supabase-js").

## Criterios de aceptación

- `supabase start && bun install && bun run --cwd apps/web test:e2e` pasa en limpio.
- Un plan del grupo B puede: reemplazar su stub, crear `src/data/<dominio>.ts` y sus specs,
  sin tocar nada más.

## Contexto permitido (NO leer más que esto)

- Este plan + `planes/README.md`.
- `packages/core/src/index.ts` y `types.ts` (exports disponibles).
- `apps/extension/src/popup/main.tsx` (referencia de login existente, opcional).
- `supabase/config.toml` (puertos locales).
- NO leer: migraciones SQL completas, Panel.tsx, especificación, provider-nhost.

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

- **2026-07-10 — COMPLETADO.** El agente original murió por límite de sesión tras el
  scaffold (rutas, login, kit UI, data layer, helpers e2e); la sesión principal terminó:
  global-setup, auth.setup (proyecto `setup` con storageState), fundaciones.spec (7 specs),
  README. Suite Playwright 7/7 en verde.
- **No cuadraba — puertos locales:** esperaba Supabase local en 54321 → el proyecto
  "patriona" del usuario ocupa los 543xx → tecnofal se movió a **553xx**
  (supabase/config.toml; analytics desactivado, inbucket 55324). `.env.local(.example)`
  actualizados. Los planes B no deben asumir 54321.
- **Nota selectores:** el `aria-label="Navegación principal"` vive en el `<aside>` (rol
  `complementary`), no en el `<nav>` — las specs usan `getByRole('complementary', …)`.
