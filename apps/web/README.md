# TecnoFal — Panel web (Fase 2)

Next.js (App Router) + Tailwind + Supabase local. Los datos SIEMPRE pasan por los
repositorios de `src/data/` (solo `cliente.ts` importa supabase-js).

## Arranque

```bash
# desde tecnofal/ (Docker Desktop corriendo)
npx supabase start          # local en puertos 553xx (conviven con "patriona" en 543xx)
bun install
cp apps/web/.env.local.example apps/web/.env.local   # claves demo del CLI, ya correctas
bun run --cwd apps/web dev  # http://localhost:3000
```

## Pruebas

Playwright vive en `apps/web/e2e/`. El `global-setup` crea el usuario e2e (o inicia sesión
si ya existe) vía la API admin y guarda `storageState` — no hace falta loguearse a mano.

```bash
cd apps/web

# Un dominio individual (rápido, workers por defecto está bien: un solo archivo, sin
# contención entre specs):
bunx playwright test e2e/inventario.spec.ts
bunx playwright test e2e/ciclo-completo.spec.ts   # e2e maestro del ciclo de vida completo

# Suite COMPLETA (los 12 archivos .spec.ts a la vez) — SIEMPRE en serie:
bunx playwright test --workers=1
```

**Por qué `--workers=1` en la suite completa:** con los workers por defecto (varios
`.spec.ts` corriendo en paralelo), algunas pruebas fallan de forma reproducible por
contención contra el único servidor `next dev` en modo desarrollo (compila rutas bajo
demanda; con 4+ specs navegando a la vez, algunas esperas no alcanzan). No es un bug de
datos ni de las RPC — confirmado con corridas seriales 100% verdes repetidamente. Esto
también aplica si repites un solo spec largo con `--repeat-each`: usa `--workers=1`
también en ese caso (las repeticiones compiten entre sí igual que specs distintos).

Otras notas operativas:
- Usuario e2e compartido: `e2e@tecnofal.test` / `tecnofal-e2e` — TODAS las specs corren
  contra el mismo usuario. Si tu prueba lee `parametros`/`precios_ideales`/`ajustes_config`/
  `detalles_catalogo`, carga el valor real vía `clienteAdmin()` en vez de asumir el default
  sembrado (otra spec pudo haberlo mutado).
- Cada spec siembra y limpia sus propios datos (`e2e/helpers/db.ts`, cliente service_role).
  No dependas de datos dejados por otra spec.
- Reset limpio de la base local: `bun run --cwd apps/web db:reset`.

```bash
scripts/test-sql.sh   # pruebas SQL del plan-01 (RPCs y vistas, con rollback), desde tecnofal/
```
