import { DEFAULT_SETTINGS, DEFAULT_LISTS, type Settings, type Lists } from '../core/models';
import { normalizeHandle } from '../core/filter-engine';

export interface StorageBackend {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const SETTINGS_KEY = 'settings';
const LISTS_KEY = 'lists';

export class DataProvider {
  constructor(private backend: StorageBackend) {}

  async getSettings(): Promise<Settings> {
    const raw = await this.backend.get([SETTINGS_KEY]);
    return { ...DEFAULT_SETTINGS, ...(raw[SETTINGS_KEY] as Partial<Settings> | undefined) };
  }

  async setSettings(settings: Settings): Promise<void> {
    await this.backend.set({ [SETTINGS_KEY]: settings });
  }

  async getLists(): Promise<Lists> {
    const raw = await this.backend.get([LISTS_KEY]);
    const stored = raw[LISTS_KEY] as Partial<Lists> | undefined;
    return {
      blocklist: stored?.blocklist ? [...stored.blocklist] : [...DEFAULT_LISTS.blocklist],
      whitelist: stored?.whitelist ? [...stored.whitelist] : [...DEFAULT_LISTS.whitelist],
    };
  }

  private async setLists(lists: Lists): Promise<void> {
    await this.backend.set({ [LISTS_KEY]: lists });
  }

  async addToBlocklist(handle: string): Promise<void> {
    const lists = await this.getLists();
    const h = normalizeHandle(handle);
    if (!lists.blocklist.includes(h)) lists.blocklist.push(h);
    await this.setLists(lists);
  }

  async removeFromBlocklist(handle: string): Promise<void> {
    const lists = await this.getLists();
    lists.blocklist = lists.blocklist.filter(b => b !== normalizeHandle(handle));
    await this.setLists(lists);
  }

  async addToWhitelist(handle: string): Promise<void> {
    const lists = await this.getLists();
    const h = normalizeHandle(handle);
    if (!lists.whitelist.includes(h)) lists.whitelist.push(h);
    await this.setLists(lists);
  }

  async removeFromWhitelist(handle: string): Promise<void> {
    const lists = await this.getLists();
    lists.whitelist = lists.whitelist.filter(w => w !== normalizeHandle(handle));
    await this.setLists(lists);
  }
}

// Gerçek chrome.storage.sync arkalığı; kota dolarsa local'a düşer.
export function createChromeBackend(): StorageBackend {
  return {
    async get(keys) {
      try { return await chrome.storage.sync.get(keys); }
      catch { return await chrome.storage.local.get(keys); }
    },
    async set(items) {
      try { await chrome.storage.sync.set(items); }
      catch { await chrome.storage.local.set(items); }
    }
  };
}
