import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DataProvider, createChromeBackend } from '../../data/data-provider';
import { DEFAULT_SETTINGS, type Settings, type Lists } from '../../core/models';
import '../ui-shared/theme.css';
import './options.css';

const dp = new DataProvider(createChromeBackend());

type Tab = 'sorting' | 'block' | 'white' | 'appearance';

function ListEditor({ items, onAdd, onRemove }: {
  items: string[]; onAdd: (h: string) => void; onRemove: (h: string) => void;
}) {
  const [val, setVal] = useState('');
  return (
    <div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input class="xcf-input" placeholder="@handle" value={val}
          onInput={(e) => setVal((e.target as HTMLInputElement).value)} />
        <button class="xcf-accent-btn" onClick={() => { if (val.trim()) { onAdd(val); setVal(''); } }}>Ekle</button>
      </div>
      {items.length === 0 && <p style="color:var(--xcf-muted);">Liste boş.</p>}
      {items.map(h => (
        <div class="xcf-list-item" key={h}>
          <span>@{h}</span>
          <button class="xcf-del" onClick={() => onRemove(h)}>Sil</button>
        </div>
      ))}
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
        <ListEditor items={lists.blocklist}
          onAdd={async (h) => { await dp.addToBlocklist(h); await reloadLists(); }}
          onRemove={async (h) => { await dp.removeFromBlocklist(h); await reloadLists(); }} />
      )}

      {tab === 'white' && (
        <ListEditor items={lists.whitelist}
          onAdd={async (h) => { await dp.addToWhitelist(h); await reloadLists(); }}
          onRemove={async (h) => { await dp.removeFromWhitelist(h); await reloadLists(); }} />
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
