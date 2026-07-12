// Genera nhost/metadata a partir del esquema real (§21b).
// Uso: DATABASE_URL=postgres://... node scripts/gen-metadata-hasura.mjs
// Regla (§8/§21): role user → user_id = X-Hasura-User-Id en todo; `modelos` global.
// Las vistas NO se trackean (sin user_id, RLS dormida → las consultas de vistas
// son de la fase web vía funciones/API, no del role user).
import pkg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirTablas = path.join(raiz, 'nhost/metadata/databases/default/tables');
const c = new pkg.Client(process.env.DATABASE_URL);
await c.connect();

const { rows: tablas } = await c.query(`
  select t.tablename as tabla,
    array_agg(col.column_name::text order by col.ordinal_position) as columnas,
    array_agg(col.column_name::text order by col.ordinal_position)
      filter (where col.is_generated = 'NEVER' and col.column_name <> 'user_id') as escribibles
  from pg_tables t
  join information_schema.columns col on col.table_schema = 'public' and col.table_name = t.tablename
  where t.schemaname = 'public'
  group by t.tablename order by t.tablename
`);
await c.end();

fs.rmSync(path.join(raiz, 'nhost/metadata'), { recursive: true, force: true });
fs.mkdirSync(dirTablas, { recursive: true });

const yamlLista = (cols) => cols.map((x) => `        - ${x}`).join('\n');
const FILTRO = `        user_id:\n          _eq: X-Hasura-User-Id`;

for (const t of tablas) {
  const global = ['modelos','tipos_aviso','modelo_avisos'].includes(t.tabla);
  const filtro = global ? '{}' : `\n${FILTRO}`;
  const y = [
    `table:`,
    `  name: ${t.tabla}`,
    `  schema: public`,
    `insert_permissions:`,
    `  - role: user`,
    `    permission:`,
    `      check: ${global ? '{}' : `\n${FILTRO.replace(/        /g, '        ')}`}`,
    global ? null : `      set:\n        user_id: x-hasura-User-Id`,
    `      columns:`,
    yamlLista(t.escribibles ?? []),
    `select_permissions:`,
    `  - role: user`,
    `    permission:`,
    `      columns:`,
    yamlLista(t.columnas),
    `      filter: ${filtro}`,
    `update_permissions:`,
    `  - role: user`,
    `    permission:`,
    `      columns:`,
    yamlLista(t.escribibles ?? []),
    `      filter: ${filtro}`,
    `      check: ${filtro}`,
    ...(global ? [] : [
      `delete_permissions:`,
      `  - role: user`,
      `    permission:`,
      `      filter: ${filtro}`,
    ]),
  ].filter((x) => x != null).join('\n') + '\n';
  fs.writeFileSync(path.join(dirTablas, `public_${t.tabla}.yaml`), y);
}

fs.writeFileSync(
  path.join(dirTablas, 'tables.yaml'),
  tablas.map((t) => `- "!include public_${t.tabla}.yaml"`).join('\n') + '\n',
);
fs.writeFileSync(path.join(raiz, 'nhost/metadata/version.yaml'), 'version: 3\n');
fs.mkdirSync(path.join(raiz, 'nhost/metadata/databases'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'nhost/metadata/databases/databases.yaml'), `- name: default
  kind: postgres
  configuration:
    connection_info:
      database_url:
        from_env: HASURA_GRAPHQL_DATABASE_URL
      isolation_level: read-committed
      use_prepared_statements: false
  tables: "!include default/tables/tables.yaml"
`);
console.log(`metadata generada: ${tablas.length} tablas (modelos global, resto user_id = X-Hasura-User-Id)`);
