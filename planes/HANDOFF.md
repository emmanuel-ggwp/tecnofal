# Handoff — Fase 2 (Panel Web) — 2026-07-11

Documento de traspaso para continuar en una sesión nueva. Léelo completo antes de tocar
nada — resume todo lo que pasó hoy y exactamente qué falta. El **Grupo B está 100%
cerrado**; lo único que queda es el Grupo C (integración final), dividido en **3 planes
secuenciales** para no repetir el error de meter demasiado en un solo agente:

1. `plan-10a-backlog-bitacoras.md` — cierra las Bitácoras de 00–09 + decide el hallazgo #1
   del backlog (`congelar_reparto_lote` sin guardia).
2. `plan-10b-e2e-ciclo-completo.md` — escribe el e2e maestro del ciclo de vida completo
   (calculadora → lote → paquete → venta → garantía) con el invariante de ganancia.
3. `plan-10c-cohesion-verificacion.md` — cross-links, consistencia visual, estados
   vacíos/error, suite completa 2 veces, cierre de la Fase 2.

El `plan-10-integracion.md` original (monolítico) queda como referencia histórica de
dónde salió el contenido de estos 3 — no lo ejecutes directamente.

## Cómo retomar (primer mensaje sugerido a la sesión nueva)

> Lee `tecnofal/planes/HANDOFF.md` completo, luego ejecuta en orden `plan-10a`, `plan-10b`
> y `plan-10c` (cada uno solo tras confirmar que el anterior cerró).

---

## 1. Qué es esto (una línea de contexto)

TecnoFal: sistema de compra-venta de laptops. Fase 1 (extensión Chrome) ya existía y está
en producción. **Fase 2 = panel web** (Next.js + Supabase), construida hoy mediante los
planes en `tecnofal/planes/` (`plan-00` a `plan-10`), ejecutados por agentes en paralelo
coordinados por la sesión principal (yo). El README de esa carpeta (`planes/README.md`)
tiene las convenciones; léelo si necesitas más profundidad de la que da este handoff.

## 2. Estado: Grupo B (8 pantallas) — 100% COMPLETO

| Plan | Pantalla | Specs |
|---|---|---|
| 02 | Configuración | 6/6 ✅ |
| 03 | Inventario | 7/7 ✅ (19/19 en repeticiones) |
| 04 | Lotes/Paquetes | 4/4 ✅ |
| 05 | Partes | 6/6 ✅ |
| 06 | Ventas | 6/6 ✅ |
| 07 | Cuentas | 7/7 ✅ (tras refuerzo de hoy) |
| 08 | Calculadora | 8/8 ✅ (tras refuerzo de hoy) |
| 09 | Dashboard | 3/3 ✅ |

**Suite completa: 46/46 en verde — pero debe correrse en serie:**
```bash
cd tecnofal/apps/web && bunx playwright test --workers=1
```
Con los workers por defecto (varios .spec.ts en paralelo), 2 pruebas fallan de forma
reproducible por **contención contra el servidor `next dev`** (no es un bug de datos —
confirmado con 2 corridas paralelas idénticas en el fallo y 2 corridas seriales 100%
verdes). Está documentado en `planes/README.md`. Cada dominio individual sí corre bien
con los workers por defecto.

## 3. Lo que pasó hoy, en orden (para no repetir investigación)

1. **Incidente de la extensión**: sesión de Supabase vencida → RLS devolvió 0 filas sin
   error → el pull de sincronización vació la config local (precios/parámetros). Arreglado:
   `provider-supabase` ahora valida con `getUser()` antes de traer catálogo; el pull nunca
   reemplaza una sección local con una remota vacía; auto-recuperación si una sección queda
   vacía. Extensión recompilada con Supabase como backend activo
   (`apps/extension/.env`: `VITE_PROVIDER=supabase`). Tests nuevos en
   `packages/provider-local/src/local.test.ts` y `packages/provider-supabase/src/supabase.test.ts`.
2. **Bugs de migración 0011/0012** (enum usado en la misma transacción que lo crea + user_id
   faltante en insert) — corregidos ANTES de que el usuario hiciera `db push` a producción.
3. **Grupo A** (`plan-00` fundaciones web, `plan-01` SQL/RPCs 0013-0016): completado.
   Supabase local movido a puertos **553xx** (55321 API / 55322 DB / 55323 Studio) porque
   el proyecto "patriona" del usuario usa los 543xx por defecto.
4. **Incidente de GRANTs** (bloqueaba TODO el Grupo B): la migración 0002 nunca le dio
   `GRANT` de tabla a `authenticated`/`anon` — sin eso Postgres no llega a evaluar RLS.
   Encontrado independientemente por 3 agentes. Arreglado con `0017_grants_anon_authenticated.sql`
   + `0018_endurecer_grants.sql` (este último también le da GRANT a `service_role`, que
   tiene BYPASSRLS pero igual necesita el GRANT base, y retira el GRANT de `anon` por
   mínimo privilegio ya que esta app no lo necesita).
5. **Grupo B** (8 pantallas): ejecutado en 3 tandas de agentes en paralelo (02+03+08,
   luego 04+05+06, luego 07+09). Todas cerradas y verificadas.
6. **Post-cierre, a pedido del usuario — transaccionalidad**: auditoría de los 11 archivos
   `apps/web/src/data/*.ts` encontró **5 flujos con múltiples escrituras sin transacción**
   (riesgo de estado inconsistente si se corta a mitad de camino). Arreglado con
   `0022_transacciones_multi_paso.sql` (4 RPC nuevas: `instalar_parte`,
   `agregar_item_laptop_paquete`, `registrar_abono`, `registrar_compra_lote`) +
   `0023_sync_lote_costos.sql` (trigger que sincroniza `lotes.precio_subasta`/`envio_usa`
   con `costo_lineas`, resolviendo el hallazgo #2 del backlog sin el riesgo de eliminar
   columnas usadas en 8 archivos). Las 5 funciones TS ya llaman a las RPC nuevas.
7. **Auditoría de pruebas por agentes independientes**: 4 agentes (uno por archivo de
   spec afectado) revisaron si sus pruebas realmente cubrían las funciones críticas —
   los 4 encontraron huecos reales y los corrigieron (ver §5 abajo).
8. **Diagnóstico de flakiness**: las 2 fallas al correr todo en paralelo resultaron ser
   contención de `next dev`, no bugs — confirmado con corridas seriales.

## 4. Migraciones aplicadas (0001–0023, todas en la instancia local Y con espejo Nhost)

Todas están en `tecnofal/supabase/migrations/` y su espejo en
`tecnofal/nhost/migrations/default/`. Las últimas (más relevantes hoy):

| # | Qué hace |
|---|---|
| 0013–0016 | Vistas de dashboard + RPCs de ventas/paquetes/conversión (plan-01) |
| 0017 | GRANT tabla a `anon`+`authenticated` |
| 0018 | Retira GRANT de `anon`, se lo da a `service_role` |
| 0019–0021 | *(números reservados, no usados — ningún plan de pantallas necesitó SQL nuevo)* |
| 0022 | 4 RPC transaccionales: `instalar_parte`, `agregar_item_laptop_paquete`, `registrar_abono`, `registrar_compra_lote` |
| 0023 | Trigger `trg_sync_lote_costos` (sincroniza `lotes`↔`costo_lineas`) |

**Próximo número libre: `0024`.**

Instancia local: Docker, contenedor `supabase_db_tecnofal`, puertos 55321/55322/55323.
Para aplicar una migración nueva a mano (el harness de Claude bloquea automáticamente
cambios de acceso/datos en la BD compartida — SIEMPRE hay que pedirle al usuario que
corra el comando, o pedir autorización explícita):
```powershell
docker cp supabase/migrations/00XX_nombre.sql supabase_db_tecnofal:/00XX.sql
docker exec supabase_db_tecnofal psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /00XX.sql
```
**Antes de pedir que la apliquen**: validar en un contenedor Postgres desechable
(`docker run -d --name tf_validaN -e POSTGRES_PASSWORD=pw postgres:15`, aplicar
`nhost/migrations/default/1751900000000_compat_prelude/up.sql` + toda la cadena de
migraciones en orden, con `--single-transaction` por archivo). Para probar RLS de verdad
(no como superusuario) hay que reemplazar el `auth.uid()` del prelude (lee `hasura.user`,
formato Nhost) por la versión real de Supabase que lee `request.jwt.claims`:
```sql
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
```
Y usar `set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', **false**)`
— con `true` (local a la transacción) se pierde entre sentencias autocommit de psql.

## 5. `BACKLOG.md` — estado de los 4 hallazgos diferidos

Archivo: `tecnofal/planes/BACKLOG.md`. Resumen:

1. **`congelar_reparto_lote` sin guardia de re-ejecución** — PENDIENTE, diferido a
   propósito. El reparto de un lote debería ser inmutable pero la función SQL no lo
   impide (solo la UI oculta el botón). Fix propuesto ahí mismo (un `raise exception` si
   ya existe reparto). `plan-10` debe decidir si lo cierra.
2. **Duplicación `lotes`↔`costo_lineas`** — **RESUELTO** con `0023` (trigger de sync).
3. **Abonos no atómicos** — **RESUELTO** con `0022` (`registrar_abono`).
4. **Bucket de Storage sin políticas** — diferido explícitamente por el usuario ("no
   relevante por ahora"). Fotos de laptop no funcionan; ninguna prueba depende de esto.

## 6. Gotchas para cualquier agente que trabaje aquí

- **Selector de sidebar en tests**: `page.getByRole('complementary', { name: 'Navegación
  principal' })` — el aria-label vive en el `<aside>`, no en el `<nav>`.
- **Usuario e2e compartido**: TODAS las specs corren contra el mismo usuario
  (`e2e@tecnofal.test`). Si tu prueba lee `parametros`/`precios_ideales`/`ajustes_config`,
  NO asumas valores semilla — cárgalos vía `clienteAdmin()` porque otra spec pudo haberlos
  mutado (pasó de verdad hoy: plan-02 mutó `ganancia_minima`, rompiendo una aserción
  hardcodeada de plan-08).
- **`eslint-disable-next-line react-hooks/exhaustive-deps` NO FUNCIONA aquí** — el plugin
  no está registrado en `eslint.config.mjs`; ese comentario rompe el lint en vez de
  silenciarlo. Si un `useEffect` necesita omitir una dependencia, ajústala, no la silencies.
- **Suite completa → `--workers=1`** (ver §2).
- **Cualquier cambio de GRANT/RLS a la base compartida requiere que el USUARIO lo aplique**
  — el clasificador de seguridad de Claude Code bloquea automáticamente estos cambios
  incluso cuando parecen benignos (ya pasó 3 veces hoy con distintos agentes). Escribe la
  migración, valídala en un contenedor desechable, y dale al usuario el comando exacto de
  una sola línea (los saltos de línea se pierden a veces al pegar en PowerShell — preferir
  una sola línea o advertir de esto).
- **Espejo Nhost**: cada migración nueva en `supabase/migrations/000X_nombre.sql` necesita
  su copia en `nhost/migrations/default/175190000000X_nombre/up.sql` (mismo contenido).
- **No hacer `git add`/`commit`** salvo que el usuario lo pida explícitamente — el repo
  tiene trabajo previo en el working tree que no hay que mezclar.

## 7. Entorno para arrancar

```powershell
# Docker Desktop debe estar corriendo
cd tecnofal
npx supabase status   # debería mostrar 55321/55322/55323 activos; si no: npx supabase start
bun install            # si hace falta
cd apps/web
bun run dev            # http://localhost:3000
```
`.env.local` de `apps/web` ya existe con las claves demo del CLI (correctas y estables).
Usuario e2e: `e2e@tecnofal.test` / `tecnofal-e2e` (lo crea el `globalSetup` de Playwright
si no existe).

## 8. TU ROL en esta sesión nueva: coordinador, no ejecutor

No hagas el trabajo de `plan-10a`/`10b`/`10c` tú mismo inline. Tu trabajo es:
1. Leer este handoff completo (ya lo estás haciendo).
2. Lanzar `plan-10a` como un `Agent` en background, con un prompt que le dé el contexto
   de este handoff + su propio archivo de plan (igual que se hizo todo el día: dale el
   contexto ya resuelto para que no lo re-investigue, y las reglas de "Bitácora"/backlog
   del `planes/README.md`).
3. Esperar su notificación, revisar su reporte (y si escribió una migración nueva, seguir
   el protocolo de aplicación de §4 — dale el comando exacto al usuario, no lo apliques tú).
4. Solo cuando `10a` cierre en verde: lanzar `plan-10b` de la misma forma.
5. Solo cuando `10b` cierre: lanzar `plan-10c`.
6. Al cerrar `10c`, la Fase 2 (Panel Web) queda completa — repórtaselo al usuario.

Si algún agente se queda sin sesión a mitad de camino, retómalo con `SendMessage` (no
relances uno nuevo desde cero) usando su propia Bitácora como fuente de qué falta —
exactamente como se hizo hoy con los agentes de Inventario y Calculadora.

## 9. Los 3 planes de la integración final (Grupo C)

1. **`plan-10a-backlog-bitacoras.md`** — cierra las Bitácoras de 00–09 + el hallazgo #1
   del backlog (`congelar_reparto_lote`).
   ⚠️ **YA EXISTE UN BORRADOR SIN APLICAR** para esto: `supabase/migrations/
   0024_guard_congelar_reparto.sql` (con su espejo Nhost en
   `nhost/migrations/default/1751900000024_guard_congelar_reparto/`). Lo escribió un
   agente anterior de hoy, el contenido se ve correcto (agrega el `raise exception` si
   el lote ya tiene reparto, sin tocar el resto de la lógica) pero **nadie lo validó en
   un contenedor desechable ni lo aplicó a `supabase_db_tecnofal` todavía**. `plan-10a`
   debe: leerlo, validarlo (protocolo de §4), y si está bien, usarlo tal cual (no
   reescribir uno nuevo) — solo falta la validación y pedirle al usuario que lo aplique.
   - **NO relacionado, NO tocar sin autorización explícita del usuario**: también existe
     `nhost/migrations/default/1751900000024_ram_ssd_soldada_deduccion/up.sql` — un
     archivo que **cambia una regla de negocio real** (desbloquea a advertencia+deducción
     los modelos hoy bloqueados solo por RAM soldada total). Esto NO fue pedido como
     parte de la integración final, **no tiene contraparte en `supabase/migrations/`**
     (o sea, nunca se aplicó ni se aplicará vía el flujo normal), y su origen es incierto
     (el usuario indicó que no lo generó el agente de plan-10, sin más detalle). El
     usuario decidió explícitamente (2026-07-11) dejarlo tal cual, sin borrar ni aplicar.
     **Ignóralo** — no lo apliques, no lo actives, no lo uses como base de nada. Si hace
     falta un archivo `0024` nuevo para otra cosa, usa `0025` en adelante para evitar el
     choque de numeración con estos dos.

2. **`plan-10b-e2e-ciclo-completo.md`** — escribe `ciclo-completo.spec.ts`: las 12 etapas
   del flujo de negocio completo por UI (calculadora → lote → paquete → recepción →
   revisión física → partes → venta → garantía) + el invariante de ganancia calculado a
   mano. Necesita que `10a` haya cerrado primero (el guard de `congelar_reparto_lote`
   no debería romper el flujo normal, pero hay que confirmarlo con `10a` ya aplicado).

3. **`plan-10c-cohesion-verificacion.md`** — cross-links entre pantallas, consistencia
   visual (kit `ui/`), estados vacíos/error, suite completa `--workers=1` dos veces,
   actualiza `apps/web/README.md`, cierra la sección "Hallazgos para la especificación".

## 10. Firmas exactas de las 4 RPC de la migración 0022 (por si `plan-10b` las necesita)

Confirmadas en vivo contra `supabase_db_tecnofal` al momento de este handoff:

```
instalar_parte(p_laptop_id uuid, p_parte_id uuid, p_especifica_id uuid)
  -- p_parte_id para commodity (descuenta stock); p_especifica_id para específica.
  -- Solo uno de los dos, el otro null. returns void.

agregar_item_laptop_paquete(p_paquete_id uuid, p_laptop_id uuid,
                             p_volumen_pie3 numeric, p_valor_declarado numeric)
  -- returns uuid (id del paquete_items creado). Rechaza si la laptop ya tiene paquete_id.

registrar_abono(p_tabla text, p_id uuid, p_monto_abono numeric,
                p_cuenta_id uuid, p_fecha date)
  -- p_tabla ∈ {'por_cobrar','por_pagar'}. returns text (nuevo estado: pendiente/parcial/saldada).

registrar_compra_lote(p_lote jsonb, p_lineas jsonb, p_laptops jsonb)
  -- p_lote: {fecha_compra, origen, url_ebay?, vendedor?, precio_subasta, envio_usa?,
  --          costo_proyectado_total?, metodo_estimado?}
  -- p_lineas: [{tipo, monto_estimado, monto_real?, fecha_real?, estimado_congelado_at?, descripcion?}]
  -- p_laptops: [{modelo_id?, cpu_tipo?, cpu_gen?, ram_gb?, ssd_gb?, tiene_hdd?,
  --              pantalla_pulgadas?, pantalla_tactil?, service_tag?, estado?}]
  -- returns uuid (id del lote creado).
```
Las funciones TS que ya las usan (referencia de cómo se arman los jsonb en la práctica):
`apps/web/src/data/partes.ts` (`instalarParteCommodity`/`instalarParteEspecifica`),
`apps/web/src/data/paquetes.ts` (`agregarItemLaptop`), `apps/web/src/data/cuentas.ts`
(`abonar`), `apps/web/src/data/lotes.ts` + `apps/web/src/data/calculadora.ts`
(`crearLoteLocal`/`crearLoteEbay`/`crearLote`).
