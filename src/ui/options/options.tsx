import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DataProvider, createChromeBackend } from '../../data/data-provider';
import { DEFAULT_SETTINGS, type Settings, type Lists } from '../../core/models';
import '../ui-shared/theme.css';
import './options.css';

const dp = new DataProvider(createChromeBackend());

type Tab = 'sorting' | 'block' | 'white' | 'appearance';

function ListEditor({ items, onAdd, onRemove, onClear }: {
  items: string[]; onAdd: (h: string) => void; onRemove: (h: string) => void; onClear: () => void;
}) {
  const [val, setVal] = useState('');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase().replace(/^@/, '');
  const shown = items.filter(h => h.includes(needle));
  return (
    <div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input class="xcf-input" placeholder="@handle" value={val}
          onInput={(e) => setVal((e.target as HTMLInputElement).value)} />
        <button class="xcf-accent-btn" onClick={() => { if (val.trim()) { onAdd(val); setVal(''); } }}>Ekle</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
        <input class="xcf-input" placeholder="Ara…" value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)} />
        <button class="xcf-del" disabled={items.length === 0}
          onClick={() => { if (confirm('Tüm liste temizlensin mi?')) onClear(); }}>Tümünü temizle</button>
      </div>
      {shown.length === 0 && (
        <p style="color:var(--xcf-muted);">{items.length === 0 ? 'Liste boş.' : 'Eşleşme yok.'}</p>
      )}
      {shown.map(h => (
        <div class="xcf-list-item" key={h}>
          <span>@{h}</span>
          <button class="xcf-del" onClick={() => onRemove(h)}>Sil</button>
        </div>
      ))}
    </div>
  );
}

function ImportExport({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    const lists = await dp.getLists();
    const blob = new Blob([JSON.stringify(lists, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'x-filtresi-listeler.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Lists>;
      await dp.importLists(parsed);
      onImported();
    } catch {
      alert('Geçersiz JSON dosyası.');
    } finally {
      input.value = '';
    }
  };

  return (
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="xcf-accent-btn" style="background:var(--xcf-surface);" onClick={exportJson}>Dışa aktar (JSON)</button>
      <button class="xcf-accent-btn" style="background:var(--xcf-surface);" onClick={() => fileRef.current?.click()}>İçe aktar (JSON)</button>
      <input ref={fileRef} type="file" accept="application/json" style="display:none;" onChange={importJson} />
    </div>
  );
}

function Options() {
  const [tab, setTab] = useState<Tab>('sorting');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [lists, setLists] = useState<Lists>({ blocklist: [], whitelist: [] });

  useEffect(() => {
    dp.getSettings().then(setSettings);
    dp.getLists().then(setLists);
  }, []);

  const save = async (next: Settings) => { setSettings(next); await dp.setSettings(next); };
  const reloadLists = async () => setLists(await dp.getLists());

  return (
    <div class="xcf-page">
      <h2>X İçerik Filtresi — Ayarlar</h2>
      <div class="xcf-tabs">
        <button class={`xcf-tab ${tab === 'sorting' ? 'xcf-tab--active' : ''}`} onClick={() => setTab('sorting')}>Sıralama</button>
        <button class={`xcf-tab ${tab === 'block' ? 'xcf-tab--active' : ''}`} onClick={() => setTab('block')}>Engelleme</button>
        <button class={`xcf-tab ${tab === 'white' ? 'xcf-tab--active' : ''}`} onClick={() => setTab('white')}>Beyaz liste</button>
        <button class={`xcf-tab ${tab === 'appearance' ? 'xcf-tab--active' : ''}`} onClick={() => setTab('appearance')}>Görünüm</button>
      </div>

      {tab === 'sorting' && (
        <div>
          <div class="xcf-row">
            <span>Sıralı görünüm varsayılan açık</span>
            <input type="checkbox" checked={settings.overlayEnabledByDefault}
              onChange={(e) => save({ ...settings, overlayEnabledByDefault: (e.target as HTMLInputElement).checked })} />
          </div>
          <div class="xcf-row">
            <span>Eşitlik bozucu (tie-breaker)</span>
            <select class="xcf-input" style="flex:0 0 160px;" value={settings.tieBreaker}
              onChange={(e) => save({ ...settings, tieBreaker: (e.target as HTMLSelectElement).value as Settings['tieBreaker'] })}>
              <option value="reposts">Repost sayısı</option>
              <option value="replies">Yanıt sayısı</option>
            </select>
          </div>
          <div class="xcf-row">
            <span>Otomatik kaydırma gecikmesi (ms)</span>
            <input class="xcf-input" type="number" style="flex:0 0 120px;" value={settings.autoScrollDelayMs}
              onInput={(e) => save({ ...settings, autoScrollDelayMs: Number((e.target as HTMLInputElement).value) })} />
          </div>
        </div>
      )}

      {tab === 'block' && (
        <div>
          <ImportExport onImported={reloadLists} />
          <ListEditor items={lists.blocklist}
            onAdd={async (h) => { await dp.addToBlocklist(h); await reloadLists(); }}
            onRemove={async (h) => { await dp.removeFromBlocklist(h); await reloadLists(); }}
            onClear={async () => { await dp.clearBlocklist(); await reloadLists(); }} />
        </div>
      )}

      {tab === 'white' && (
        <div>
          <ImportExport onImported={reloadLists} />
          <ListEditor items={lists.whitelist}
            onAdd={async (h) => { await dp.addToWhitelist(h); await reloadLists(); }}
            onRemove={async (h) => { await dp.removeFromWhitelist(h); await reloadLists(); }}
            onClear={async () => { await dp.clearWhitelist(); await reloadLists(); }} />
        </div>
      )}

      {tab === 'appearance' && (
        <div>
          <div class="xcf-row">
            <span>Tema</span>
            <select class="xcf-input" style="flex:0 0 160px;" value={settings.theme}
              onChange={(e) => save({ ...settings, theme: (e.target as HTMLSelectElement).value as Settings['theme'] })}>
              <option value="dark">Koyu</option>
              <option value="light">Açık</option>
              <option value="system">Sistem</option>
            </select>
          </div>
          <div class="xcf-row">
            <span>Animasyonlar</span>
            <input type="checkbox" checked={settings.animationsEnabled}
              onChange={(e) => save({ ...settings, animationsEnabled: (e.target as HTMLInputElement).checked })} />
          </div>
        </div>
      )}
    </div>
  );
}

render(<Options />, document.getElementById('app')!);
