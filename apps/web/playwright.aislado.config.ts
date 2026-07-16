// Config para correr el e2e web contra un STACK AISLADO por agente (ver scripts/agente-stack-up.sh
// y CLAUDE.md §"E2E aislado por agente"). Reusa la config base pero apunta a un `next dev` externo
// —que el agente arranca aparte en AISLADO_WEB_PORT contra la SUPABASE_URL del stack aislado— en
// vez de gestionar el server ella misma. Solo se usa con --config=playwright.aislado.config.ts.
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = process.env.AISLADO_WEB_PORT || '3100';
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: URL },
  webServer: {
    // El server ya está arriba (lo arranca el agente); reuseExistingServer lo detecta y no corre el command.
    command: `echo "reusando next dev externo en ${PORT}"`,
    url: URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
