import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA111UZ4xJPC17IFl1JfTQ1BTddxaoW0byWi4vcaobGntu3JhfhRtl+9gN5KT3Vtvi4bBGmy3tJcKQ3SdxyO7tD2wqdv4WvNvfHaWtgM4LLkjMi7oYW2YFEbDv0CK6d0QiE/f6kQkv82LLPuQBy5VSi9C/s0wSgRruRYKSf74OVmEQvPq00xLjKynJVXMo16KCtljCfbhl564UhcJwazEBvrENoV1GbBc3HkpPqaughoQM1nYKXlp1nxHKpVRGBXpvtB8bmbZqh4u99LuSkKttkfOTzYPk8hUP1zNH4Yywd1jqMEla6xXwcxWRpzl7tp7/CM23ny9hlLDvv2gtalKGNwIDAQAB',
  name: 'X İçerik Filtresi',
  version: '0.1.0',
  description: 'Yorumları beğeniye göre sıralar, hesapları manuel filtreler.',
  permissions: ['storage', 'identity', 'alarms'],
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
