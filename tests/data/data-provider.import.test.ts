import { describe, it, expect, beforeEach } from 'vitest';
import { DataProvider, type StorageBackend } from '../../src/data/data-provider';

class FakeStorage implements StorageBackend {
  store: Record<string, unknown> = {};
  async get(keys: string[]) {
    const o: Record<string, unknown> = {};
    for (const k of keys) if (k in this.store) o[k] = this.store[k];
    return o;
  }
  async set(items: Record<string, unknown>) { Object.assign(this.store, items); }
}

describe('DataProvider import/clear', () => {
  let dp: DataProvider;
  beforeEach(() => { dp = new DataProvider(new FakeStorage()); });

  it('clearBlocklist listeyi boşaltır', async () => {
    await dp.addToBlocklist('a');
    await dp.clearBlocklist();
    expect((await dp.getLists()).blocklist).toEqual([]);
  });

  it('importLists normalize eder, tekrarı eler ve geçersizleri atar', async () => {
    await dp.importLists({ blocklist: ['@A', 'a', 'B', ''], whitelist: ['@C'] });
    const l = await dp.getLists();
    expect(l.blocklist).toEqual(['a', 'b']);
    expect(l.whitelist).toEqual(['c']);
  });

  it('importLists eksik alanları boş kabul eder', async () => {
    await dp.importLists({ blocklist: ['x'] });
    expect((await dp.getLists()).whitelist).toEqual([]);
  });
});
