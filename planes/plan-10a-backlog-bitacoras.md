# Plan 10a — Cierre de bitácoras + hallazgo #1 del backlog

**Grupo C · Requiere el Grupo B mergeado (00–09) · Primera etapa de la integración final,
se ejecuta sola. Migración reservada: 0024 (solo si decides cerrar el hallazgo #1 con SQL).**

## Objetivo

Cerrar todos los cabos sueltos que quedaron documentados en las Bitácoras de los planes
00–09 y decidir qué hacer con el hallazgo #1 de `planes/BACKLOG.md` (`congelar_reparto_lote`
sin guardia de re-ejecución). Es la primera de 3 etapas secuenciales de la integración final
(10a → 10b → 10c); las otras dos (el e2e maestro y la verificación de cohesión) parten de
que esta etapa ya cerró el backlog conocido.

## Contexto esencial

- **Bitácoras de los planes 00–09**: cada archivo `planes/plan-0X-*.md` termina en una
  sección `## Bitácora` con dos tipos de entradas: (a) **pendientes** (sub-tareas sin
  terminar) y (b) **cosas que no cuadran** (hallazgos con su workaround). Todas están hoy
  marcadas como resueltas o con una decisión de diseño justificada — tu trabajo es
  **confirmar eso** (no asumirlo de las notas de una sesión anterior) releyendo cada una y
  verificando que la justificación siga siendo válida a la luz del código actual.
- **`planes/BACKLOG.md`** — 4 hallazgos:
  1. `congelar_reparto_lote` (función SQL en `supabase/migrations/0001_schema.sql`, sección
     "§2.6 Reparto de lotes") no rechaza una segunda ejecución — borra e reinserta
     `lote_reparto` sin error. La inmutabilidad del reparto (principio de diseño: "el
     reparto queda fijo e inmutable") hoy la garantiza SOLO la UI (oculta el botón si ya
     existe reparto). **Esta es tu tarea principal**: decide si lo cierras con una
     migración que agregue el guard SQL, o si lo dejas diferido con justificación escrita
     más sólida que "no es urgente".
  2. Duplicación `lotes`↔`costo_lineas` — **ya resuelto** (migración `0023`, trigger de
     sincronización). No lo toques, solo confirma que el trigger sigue aplicado:
     `docker exec supabase_db_tecnofal psql -U postgres -d postgres -c "select tgname from
     pg_trigger where tgname='trg_sync_lote_costos';"` debe devolver 1 fila.
  3. Abonos no atómicos — **ya resuelto** (migración `0022`, RPC `registrar_abono`). Solo
     confirma: `select proname from pg_proc where proname='registrar_abono';` → 1 fila.
  4. Bucket de Storage sin políticas — diferido explícitamente por el usuario ("no
     relevante por ahora"). No lo toques.
- **Migraciones ya aplicadas**: 0001–0018, 0022, 0023 (0019–0021 reservados sin usar).
  Supabase local en Docker: 55321 (API) / 55322 (DB) / 55323 (Studio), contenedor
  `supabase_db_tecnofal`. Próximo número libre para SQL nuevo: **0024**.
- **Protocolo de migraciones** (ya establecido hoy, síguelo al pie de la letra): escribe la
  migración → valídala en un contenedor Postgres desechable (`docker run -d --name
  tf_validaN -e POSTGRES_PASSWORD=pw postgres:15`; copia `nhost/migrations/default/
  1751900000000_compat_prelude/up.sql` + toda la cadena de `supabase/migrations/*.sql` en
  orden, aplicando cada una con `--single-transaction`) → para probar RLS de verdad (no
  como superusuario), reemplaza el `auth.uid()` del prelude por la versión real de
  Supabase:
  ```sql
  create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  ```
  y usa `set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', **false**)`
  (con `true` se pierde entre sentencias autocommit de `psql`). Limpia el contenedor
  desechable al terminar (`docker rm -f tf_validaN`).
  **NUNCA apliques la migración directamente al contenedor compartido `supabase_db_tecnofal`
  — el clasificador de seguridad del entorno lo bloqueará.** Cuando esté validada, escribe
  el comando exacto de una sola línea (sin saltos de línea, para que no se rompa al pegar
  en PowerShell) y repórtalo al final para que el coordinador/usuario lo aplique. NO
  intentes rodear el bloqueo.
- Espejo Nhost: cada migración nueva en `supabase/migrations/000X_nombre.sql` necesita su
  copia en `nhost/migrations/default/175190000000X_nombre/up.sql`.

## Tareas

1. **Relee las 10 Bitácoras** (planes 00–09) una por una. Para cada entrada de tipo
   "pendiente" o "no cuadra": confirma que sigue resuelta/vigente. Si encuentras algo que
   ya NO aplica o que quedó mal cerrado, corrígelo (código o la nota de la bitácora misma)
   y dilo en tu reporte final.
2. **Hallazgo #1 del backlog**: decide y ejecuta.
   - Si decides cerrarlo con SQL: escribe `0024_guard_reparto_lote.sql` — agrega al inicio
     de `congelar_reparto_lote` un `if exists (select 1 from lote_reparto where lote_id =
     p_lote) then raise exception 'El reparto de este lote ya fue congelado — es
     inmutable' ; end if;` (usa `create or replace function`, no hace falta recrear toda
     la función completa si sabes el cuerpo exacto — pero si no lo tienes ya, léelo de
     `supabase/migrations/0001_schema.sql`, sección "congelar_reparto_lote", solo esa
     función). Valida en contenedor desechable que: (a) el flujo normal de congelar sigue
     funcionando igual, (b) un segundo intento ahora es rechazado con el mensaje claro.
   - Si decides diferirlo: escribe en `planes/BACKLOG.md` una justificación más completa
     que la actual (por qué el riesgo es aceptable a corto plazo, qué lo activaría, y una
     fecha o disparador para revisitarlo).
3. **Actualiza `planes/BACKLOG.md`** reflejando el resultado del punto 2.
4. Si alguna revisión de bitácora revela un error real de la especificación o de los
   planes (no solo del código), anótalo en la sección "## Hallazgos para la especificación"
   de `planes/plan-10c-cohesion-verificacion.md` (créala si no existe todavía con solo esa
   sección — plan-10c la completará después).
5. Actualiza tu propia sección "## Bitácora" en este archivo con lo que hiciste.

## Fuera de alcance

El e2e maestro del ciclo completo (plan-10b), cross-links/consistencia visual/suite
completa (plan-10c). No implementes el bucket de Storage (backlog #4, diferido).

## Criterios de aceptación

- Las 10 Bitácoras (00–09) confirmadas sin pendientes reales sin resolver o sin
  justificación escrita.
- `BACKLOG.md` con el hallazgo #1 explícitamente cerrado (migración aplicada, con tu
  confirmación de que el coordinador la corrió) o diferido con justificación sólida.
- Si escribiste migración: validada en contenedor desechable, comando de aplicación
  entregado al coordinador, espejo Nhost creado.

## Contexto permitido

- Este plan + `planes/README.md` + `planes/BACKLOG.md` + las Bitácoras de los planes 00–09
  (la sección `## Bitácora` de cada uno — no hace falta releer el resto de esos planes).
- `supabase/migrations/0001_schema.sql` — SOLO la función `congelar_reparto_lote` (búscala
  por nombre, no leas el archivo completo).
- Los archivos de código puntuales que una bitácora específica te indique revisar.
- NO leer: especificación completa, extensión, otras migraciones más allá de sus firmas.

## Bitácora

Sección viva — el agente ejecutor la va llenando; plan-10c la revisa completa al cerrar
la integración.

- **2026-07-11 — COMPLETADO.** Releídas las 10 Bitácoras (planes 00-09): todas terminan en
  "COMPLETADO"/"RESUELTO"/"Sin pendientes", sin bloqueos reales abiertos. Confirmado en vivo
  contra `supabase_db_tecnofal` que los dos hallazgos del backlog ya cerrados por sesiones
  previas siguen aplicados: `select tgname from pg_trigger where tgname=
  'trg_sync_lote_costos'` → 1 fila (hallazgo #2); `select proname from pg_proc where
  proname='registrar_abono'` → 1 fila (hallazgo #3). No se tocó nada de esas dos.
- **Hallazgo #1 (`congelar_reparto_lote`) — CERRADO con SQL, migración validada.** El borrador
  `supabase/migrations/0024_guard_congelar_reparto.sql` (+ espejo Nhost
  `1751900000024_guard_congelar_reparto/up.sql`) ya existía y coincide exactamente con lo que
  pedía el plan: `create or replace function congelar_reparto_lote` con un guard al inicio
  (`raise exception` con errcode `P0001` si ya hay `lote_reparto` o
  `lote_partes_encontradas.en_stock=true` para el lote) y el resto del cuerpo carácter por
  carácter idéntico al original de `0001_schema.sql` (lo comparé línea a línea antes de
  validar). Lo usé TAL CUAL, no reescribí nada. Validación en contenedor Postgres 15
  desechable (`tf_valida1`, ya eliminado con `docker rm -f`):
  1. Apliqué la cadena completa `nhost/.../1751900000000_compat_prelude/up.sql` +
     `0001..0023` de `supabase/migrations/` con `--single-transaction` cada una (todas
     limpias, un solo NOTICE benigno esperado en 009 por columna ya existente). Antes del
     prelude no existe `auth.users` en un Postgres vainilla (GoTrue lo crea en Supabase
     real) — agregué un stub mínimo (`create table if not exists auth.users(id uuid pk,
     email text)`) SOLO dentro del contenedor desechable, nunca como migración real.
  2. Reemplacé `auth.uid()` del prelude por la versión real de Supabase (la del protocolo
     del plan) y apliqué `0024` encima — limpio, sin errores.
  3. Sembré un lote local con 2 laptops y una línea `costo_lineas` (`subasta=100`,
     `monto_real=100`), como usuario `authenticated` real vía
     `set_config('request.jwt.claims', '{"sub":...,"role":"authenticated"}', false)` +
     `set role authenticated` (RLS real, no superusuario).
  4. **(a) Flujo normal:** primera llamada a `congelar_reparto_lote(lote)` → éxito,
     `lote_reparto` queda con 2 filas, `proporcion=0.5` y `costo_asignado=50` cada una
     (idéntico a lo que daría la función sin el guard, para el mismo input).
  5. **(b) Segundo intento:** misma llamada otra vez → rechazada:
     `ERROR: El reparto del lote 222...222 ya fue congelado: es inmutable y no puede
     recalcularse` (contexto: `PL/pgSQL function congelar_reparto_lote(uuid) line 14 at
     RAISE`).
  Actualicé `planes/BACKLOG.md` (hallazgo #1 → RESUELTO, con el resumen de la validación y
  el comando de aplicación) y añadí 4 entradas a la sección "## Hallazgos para la
  especificación" de `plan-10c-cohesion-verificacion.md` (desajustes reales entre plan y
  base/código, no solo bugs: esquema de `modelo_avisos` en plan-02, tono "naranja" de Chip
  que falta en el kit compartido para plan-06, columnas de `v_resultado_cambiario` mal
  documentadas en plan-07, y `packages/core` no distingue origen `local` como pide
  plan-08). No encontré ningún pendiente real sin resolver en ninguna de las 10 bitácoras —
  todo lo que decía "no cuadraba" ya tenía su cierre (RESUELTO) o su justificación de
  decisión de diseño explícita.
- **NO toqué** `nhost/migrations/default/1751900000024_ram_ssd_soldada_deduccion/up.sql` en
  ningún momento (ni lo leí) — usé `0025` como próximo número libre si hubiera hecho falta
  otra migración nueva (no hizo falta: el guard de reparto reutilizó el 0024 ya reservado
  para él).
- **Pendiente para el coordinador:** aplicar `0024_guard_congelar_reparto.sql` al contenedor
  compartido `supabase_db_tecnofal` (yo no tengo permiso — bloqueado por el clasificador de
  seguridad). Comando de una sola línea, ejecutar desde la raíz de `tecnofal/`:
  `docker exec -i supabase_db_tecnofal psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/migrations/0024_guard_congelar_reparto.sql`
  Tras aplicarla, no hace falta re-correr ninguna suite de Playwright del Grupo B (el guard
  no cambia el comportamiento del camino feliz que ya cubren esas specs) — pero si plan-10b
  quiere un test explícito de "segundo intento rechazado" para el e2e maestro, este es el
  mensaje de error exacto a esperar: `El reparto del lote %s ya fue congelado: es inmutable
  y no puede recalcularse`.
- No me quedé sin contexto — plan cerrado de punta a punta en esta misma sesión.
