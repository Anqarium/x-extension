import type { RuntimeMessage } from '../shared/messaging';
import { fetchFlaggedList } from '../data/cloud-provider';
import { cloudConfigured } from '../data/cloud-config';

const SYNC_ALARM = 'xcf-verdict-sync';
const CACHE_KEY = 'verdict_cache';
const SINCE_KEY = 'verdict_sync_since';

// Depolama değişikliklerini açık X sekmelerine ilet (Faz 1/2A davranışı).
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
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
});

// Periyodik flagged-list senkronu kur.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 360 }); // 6 saat
});
chrome.runtime.onStartup?.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void syncFlagged();
});

async function syncFlagged(): Promise<void> {
  if (!cloudConfigured()) return;
  const stored = await chrome.storage.local.get([CACHE_KEY, SINCE_KEY]);
  const since = (stored[SINCE_KEY] as string | undefined) ?? null;
  const flagged = await fetchFlaggedList(since);
  if (flagged.length === 0) return;

  const cache =
    (stored[CACHE_KEY] as Record<string, { verdict: unknown; fetchedAt: number }> | undefined) ?? {};
  const now = Date.now();
  for (const v of flagged) {
    cache[v.handle] = { verdict: v, fetchedAt: now };
  }
  const newest = new Date(now).toISOString();

  await chrome.storage.local.set({ [CACHE_KEY]: cache, [SINCE_KEY]: newest });
  chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'VERDICTS_SYNCED' }).catch(() => {});
    }
  });
}
