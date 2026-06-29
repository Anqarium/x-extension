// src/background/service-worker.ts
import type { RuntimeMessage } from '../shared/messaging';

// Depolama değişikliklerini açık X sekmelerindeki içerik script'lerine iletir.
// (chrome.runtime.sendMessage içerik script'lerine ULAŞMAZ; tabs.sendMessage gerekir.)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' && area !== 'local') return;
  const messages: RuntimeMessage[] = [];
  if ('lists' in changes) messages.push({ type: 'LISTS_CHANGED' });
  if ('settings' in changes) messages.push({ type: 'SETTINGS_CHANGED' });
  if (messages.length === 0) return;

  chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      for (const message of messages) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => { /* içerik script yoksa yut */ });
      }
    }
  });
});
