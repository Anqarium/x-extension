import { describe, it, expect, beforeEach } from 'vitest';
import { DataProvider, type StorageBackend } from '../../src/data/data-provider';
import { DEFAULT_SETTINGS } from '../../src/core/models';

class FakeStorage implements StorageBackend {
  store: Record<string, unknown> = {};
  async get(keys: string[]) {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in this.store) out[k] = this.store[k];
    return out;
  }
  async set(items: Record<string, unknown>) { Object.assign(this.store, items); }
}

describe('DataProvider', () => {
  let backend: FakeStorage;
  let dp: DataProvider;
  beforeEach(() => { backend = new FakeStorage(); dp = new DataProvider(backend); });

  it('depo boşken varsayılan ayarları döner', async () => {
    expect(await dp.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('ayarları kaydeder ve geri okur', async () => {
    await dp.setSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect((await dp.getSettings()).theme).toBe('light');
  });

  it('engelleme listesine ekler, normalize eder ve tekrarı engeller', async () => {
    await dp.addToBlocklist('@SpamBot');
    await dp.addToBlocklist('spambot');
    expect((await dp.getLists()).blocklist).toEqual(['spambot']);
  });

  it('engelleme listesinden siler', async () => {
    await dp.addToBlocklist('alice');
    await dp.removeFromBlocklist('alice');
    expect((await dp.getLists()).blocklist).toEqual([]);
  });

  it('beyaz listeye ekler', async () => {
    await dp.addToWhitelist('bob');
    expect((await dp.getLists()).whitelist).toEqual(['bob']);
  });
});
