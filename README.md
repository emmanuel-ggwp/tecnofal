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

## 1. Backend (§21: Supabase es el activo/principal; Nhost es respaldo)

**Supabase (activo):** `supabase start` (Docker) desde `tecnofal/` aplica
`supabase/migrations` + RLS ya incluida. Crea tu usuario vía Supabase Auth (Studio o
`supabase db`); el trigger siembra su plantilla.

**Nhost (respaldo/espejo):** ver `nhost/README.md` — mismo esquema espejado
(`nhost/migrations` + `nhost/metadata`), mantenido por si algún día se necesita migrar
de proveedor. No es el backend real hoy; no hay proyecto en app.nhost.io. Runbook de
referencia (histórico): `MIGRACION.md`.

**Pendiente de cargar** (sin semilla): `tarifa_barco_por_pie3` y `tarifa_avion_zoom_por_kg`.

## 2. Extensión

```bash
cd tecnofal
npm install
cd apps/extension
cp .env.example .env     # VITE_PROVIDER=supabase + url/key (o nhost + subdomain/region)
cd ../..
npm run build
```

Chrome → `chrome://extensions` → Modo desarrollador → "Cargar descomprimida" → `tecnofal/apps/extension/dist`.
**§22 LOCAL-FIRST:** la extensión funciona COMPLETA sin backend — todo (evaluaciones,
compras en cola, configuración) vive en IndexedDB con seeds empaquetados. La sesión
(popup) solo activa el ESPEJO remoto: un job cada 5 min empuja pendientes y trae config.
Indicador en popup: ✓ sincronizado / ⟳ N pendientes / ⚡ solo local.
Configuración editable en ⚙ Opciones (precios, ajustes, deducciones, parámetros, modelos/reglas)
+ exportar/importar JSON — reemplaza a Supabase Studio en Fase 1.
Límites del modo local: sin multi-dispositivo, Android no ve estos datos, desinstalar sin
exportar pierde lo local (mitigado por export JSON y por el sync).

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

## Arquitectura de proveedores (§21)

```
packages/core                → lógica de negocio + interfaces DataProvider/AuthProvider
packages/provider-local      → §22 IndexedDB/Dexie — la UI SIEMPRE habla con este
packages/provider-supabase   → adaptador supabase-js (espejo activo/principal)
packages/provider-nhost      → adaptador GraphQL/Hasura + nhost-js (espejo de respaldo)
apps/extension               → local-first; espejo por VITE_PROVIDER + sync cada 5 min
```

Regla de lint (`npm run lint`): importar nhost-js/supabase-js fuera de los
adaptadores es error de build.
