// src/shared/messaging.ts
export type RuntimeMessage =
  | { type: 'LISTS_CHANGED' }
  | { type: 'SETTINGS_CHANGED' }
  | { type: 'TOGGLE_OVERLAY' }
  | { type: 'LOAD_ALL' }
  | { type: 'VERDICTS_SYNCED' }
  | { type: 'AUTH_CHANGED' };

export function broadcast(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => { /* alıcı yoksa yut */ });
}

export function onMessage(handler: (msg: RuntimeMessage) => void): void {
  // Listener undefined döndürmeli (Promise döndürürse Chrome portu açık tutar).
  chrome.runtime.onMessage.addListener((msg) => { void handler(msg as RuntimeMessage); });
}
