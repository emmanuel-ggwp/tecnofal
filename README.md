# TecnoFal — Fase 1: Supabase + Extensión Chrome

Monorepo (npm workspaces):

```
tecnofal/
├── supabase/
│   ├── config.toml              # Supabase local (Docker)
│   └── migrations/
│       ├── 0001_schema.sql      # esquema completo + vistas + funciones
│       ├── 0002_rls.sql         # trigger user_id + RLS por usuario
│       └── 0003_seeds.sql       # modelos globales + plantilla por usuario
├── packages/core/               # motor de decisión + parser (compartido)
└── apps/extension/              # extensión Chrome MV3 (Vite + React + CRXJS)
```

## Requisitos

Node 20+, Docker Desktop (para Supabase local) y la CLI de Supabase (`npm i -g supabase`).

## 1. Base de datos

**Local (Docker):**

```bash
cd tecnofal
supabase start          # levanta Postgres+Auth+Studio; imprime API URL y anon key
supabase db reset       # aplica las 3 migraciones + seeds
```

Studio: http://127.0.0.1:54323 · Crea tu usuario en Authentication → Add user (email+password).
Al crearse el usuario, un trigger siembra automáticamente su plantilla (parámetros, precios ideales, ajustes, detalles, partes, cuentas).

**Pendiente de cargar en Studio** (varían en el tiempo, sin semilla): `tarifa_barco_por_pie3` y `tarifa_avion_zoom_por_kg` en `parametros`.

**Cloud:** crea el proyecto en supabase.com y aplica las migraciones en orden (SQL Editor o `supabase db push`).

## 2. Extensión

```bash
cd tecnofal
npm install
cd apps/extension
cp .env.example .env     # pega la URL y anon key que imprimió `supabase start`
cd ../..
npm run build
```

Chrome → `chrome://extensions` → Modo desarrollador → "Cargar descomprimida" → `tecnofal/apps/extension/dist`.
Inicia sesión desde el popup. Sin sesión funciona en **modo degradado** (semáforo con valores semilla; no guarda ni marca "ya visto").

## 3. Tests

```bash
npm test -w @tecnofal/core                      # 12 unit tests (parser + motor §4)
npm run build && npx playwright install chromium
npm run test:e2e -w @tecnofal/extension         # e2e con fixtures de eBay (sin red real)
```

> Los e2e cargan la extensión compilada en Chromium e interceptan ebay.com con fixtures locales.

## Qué hace la extensión (Fase 1)

- **Búsquedas eBay:** badge 🟢/🟡/🔴 por listing (parser con niveles de confianza, escenario pesimista) + ✓ "ya visto".
- **Página del listing:** panel con specs corregibles, partes faltantes, deducciones, método de envío; salidas: costo total, margen, **S_decente / S_max** y semáforo. Botones Guardar / Descartar / **Comprada** (crea lote + laptops + estimado congelado).
- **Popup:** login + **conversión rápida entre cuentas** (§13 — el resultado cambiario vive solo en `conversiones`).

## Notas de diseño

- El reparto fijo del lote se congela **al completar la revisión física**: `select congelar_reparto_lote('<lote_id>')` (descuenta partes encontradas a valor nominal).
- Órdenes de partes: `prorratear_orden_partes()` (por valor, editable) y `recibir_orden_partes()` (entra a stock a costo **aterrizado**).
- Prorrateo de paquete: `prorratear_paquete()` — flete por volumen, seguro por **valor declarado**.
- Los selectores del DOM de eBay cambian con frecuencia; `search.ts` y `listing.tsx` usan varios fallbacks, y todo es corregible a mano en el panel.
- Migraciones validadas contra PostgreSQL 15 real (esquema, RLS, triggers, plantillas por usuario, vistas y funciones).
