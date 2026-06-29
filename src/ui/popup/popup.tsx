import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DataProvider, createChromeBackend } from '../../data/data-provider';
import { isSignedIn } from '../../data/auth';
import '../ui-shared/theme.css';

const dp = new DataProvider(createChromeBackend());

function sendToActiveTab(type: 'TOGGLE_OVERLAY' | 'LOAD_ALL') {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type }).catch(() => {});
  });
}

function Popup() {
  const [blocked, setBlocked] = useState(0);
  useEffect(() => { dp.getLists().then(l => setBlocked(l.blocklist.length)); }, []);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { isSignedIn().then(setAuthed); }, []);

  return (
    <div style="width:260px;padding:16px;">
      <h3 style="margin:0 0 12px;">X İçerik Filtresi</h3>
      <p style="color:var(--xcf-muted);margin:0 0 12px;">Engellenen hesap: {blocked}</p>
      <p style="color:var(--xcf-muted);margin:0 0 12px;">Topluluk girişi: {authed ? 'Açık' : 'Kapalı'}</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="xcf-accent-btn" onClick={() => sendToActiveTab('TOGGLE_OVERLAY')}>
          Sıralı görünümü aç/kapat
        </button>
        <button class="xcf-accent-btn" onClick={() => sendToActiveTab('LOAD_ALL')}>
          Tümünü yükle ve tam sırala
        </button>
        <button class="xcf-accent-btn" style="background:var(--xcf-surface);"
          onClick={() => chrome.runtime.openOptionsPage()}>
          Ayarlar
        </button>
      </div>
    </div>
  );
}

render(<Popup />, document.getElementById('app')!);
