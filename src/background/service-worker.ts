// src/background/service-worker.ts
import { broadcast } from '../shared/messaging';

// chrome.storage değişikliklerini açık sekmelere yayınlar.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' && area !== 'local') return;
  if ('lists' in changes) broadcast({ type: 'LISTS_CHANGED' });
  if ('settings' in changes) broadcast({ type: 'SETTINGS_CHANGED' });
});
