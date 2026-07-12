import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'TecnoFal — Evaluador eBay',
  version: '0.1.0',
  description: 'Semáforo, S_decente/S_max y evaluación de laptops directamente en eBay',
  permissions: ['storage', 'alarms'],
  host_permissions: ['https://*.ebay.com/*'],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  action: { default_popup: 'src/popup/index.html', default_title: 'TecnoFal' },
  options_ui: { page: 'src/opciones/index.html', open_in_tab: true },
  content_scripts: [
    {
      matches: ['https://www.ebay.com/sch/*', 'https://www.ebay.com/b/*'],
      js: ['src/content/search.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://www.ebay.com/itm/*'],
      js: ['src/content/listing.tsx'],
      run_at: 'document_idle',
    },
  ],
});
