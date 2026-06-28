import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'X İçerik Filtresi',
  version: '0.1.0',
  description: 'Yorumları beğeniye göre sıralar, hesapları manuel filtreler.',
  permissions: ['storage'],
  host_permissions: ['https://x.com/*', 'https://twitter.com/*'],
  action: { default_popup: 'src/ui/popup/popup.html' },
  options_page: 'src/ui/options/options.html',
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['src/content/orchestrator.ts'],
      run_at: 'document_idle'
    }
  ]
});
