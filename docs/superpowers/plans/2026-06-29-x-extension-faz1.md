# X Uzantısı Faz 1 — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X (Twitter) için yorumları beğeniye göre sıralayan (overlay) ve manuel engelleme/beyaz liste ile içerik gizleyen, bulutsuz, tek başına çalışan bir MV3 Chrome uzantısı kurmak.

**Architecture:** Saf mantık (`core/`) DOM'dan tamamen ayrı ve birim test edilir. X'e bağımlı her şey tek bir adaptör dosyasında (`content/adapters/x-selectors.ts`) izole edilir. İçerik script'i bir orchestrator üzerinden MutationObserver ile çalışır; sıralanmış yorumlar X'in yorum alanının üstüne kendi overlay'imizle çizilir. Depolama `data-provider.ts` arkasına soyutlanır (Faz 2 bulut buraya takılır).

**Tech Stack:** Manifest V3, TypeScript, Vite + @crxjs/vite-plugin, Preact (ayarlar/popup UI), Vitest + jsdom (testler), webextension-polyfill.

---

## Dosya Yapısı

```
package.json, tsconfig.json, vite.config.ts, manifest.config.ts, vitest.config.ts
src/
├─ shared/
│  └─ messaging.ts            # runtime mesaj tipleri + yardımcılar
├─ core/
│  ├─ models.ts               # tüm veri tipleri + DEFAULT_SETTINGS
│  ├─ sort-engine.ts          # sortReplies (saf)
│  └─ filter-engine.ts        # decideAction, normalizeHandle (saf)
├─ data/
│  └─ data-provider.ts        # StorageBackend arayüzü + DataProvider sınıfı
├─ content/
│  ├─ adapters/x-selectors.ts # X'e özgü seçiciler + parse fonksiyonları
│  ├─ collector.ts            # ReplyCollector (Map biriktirir)
│  ├─ overlay/overlay.ts      # sıralı liste overlay render
│  ├─ overlay/overlay.css     # overlay stilleri (koyu tema)
│  ├─ block-injector.ts       # gönderi yanına engelle butonu
│  ├─ auto-scroll.ts          # "tümünü yükle" kontrollü kaydırma
│  └─ orchestrator.ts         # MutationObserver akışı (içerik giriş noktası)
├─ background/
│  └─ service-worker.ts       # depolama değişiklik yayını
└─ ui/
   ├─ popup/popup.html, popup.tsx
   ├─ options/options.html, options.tsx, options.css
   └─ ui-shared/theme.css     # koyu tema değişkenleri
tests/
├─ core/sort-engine.test.ts
├─ core/filter-engine.test.ts
├─ data/data-provider.test.ts
└─ content/x-selectors.test.ts
```

---

## Task 1: Proje iskeleti

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.config.ts`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: package.json oluştur**

```json
{
  "name": "x-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "preact": "^10.22.0",
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.25",
    "@types/chrome": "^0.0.268",
    "@types/webextension-polyfill": "^0.12.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: tsconfig.json oluştur**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "tests", "manifest.config.ts", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: manifest.config.ts oluştur**

```ts
import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'X İçerik Filtresi',
  version: '0.1.0',
  description: 'Yorumları beğeniye göre sıralar, hesapları manuel filtreler.',
  permissions: ['storage'],
  host_permissions: ['https://x.com/*', 'https://twitter.com/*'],
  action: { default_popup: 'src/ui/popup/popup.html' },
  options_page: 'src/ui/options/options.html',
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['src/content/orchestrator.ts'],
      run_at: 'document_idle'
    }
  ]
});
```

- [ ] **Step 4: vite.config.ts oluştur**

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { outDir: 'dist', emptyOutDir: true }
});
```

- [ ] **Step 5: vitest.config.ts oluştur**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 6: .gitignore oluştur**

```
node_modules/
dist/
*.log
```

- [ ] **Step 7: Bağımlılıkları kur ve typecheck'i doğrula**

Run: `npm install && npm run typecheck`
Expected: Hata yok (henüz src boş, tsc başarılı çıkar).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: MV3 + Vite + Vitest proje iskeleti"
```

---

## Task 2: Çekirdek veri modelleri

**Files:**
- Create: `src/core/models.ts`

- [ ] **Step 1: models.ts oluştur**

```ts
export interface ReplyData {
  id: string;            // yorumun kararlı kimliği (permalink'ten tweet id)
  handle: string;        // @ olmadan, küçük harf
  displayName: string;
  text: string;
  likes: number;
  reposts: number;
  replies: number;
  isVerified: boolean;
  permalink: string;     // yoruma giden tam url
  avatarUrl: string | null;
}

export type TieBreaker = 'reposts' | 'replies';

export type FilterAction = 'show' | 'collapse';

export interface Settings {
  overlayEnabledByDefault: boolean;
  tieBreaker: TieBreaker;
  autoScrollDelayMs: number;
  theme: 'dark' | 'light' | 'system';
  animationsEnabled: boolean;
}

export interface Lists {
  blocklist: string[];   // küçük harf handle'lar, @ yok
  whitelist: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  overlayEnabledByDefault: true,
  tieBreaker: 'reposts',
  autoScrollDelayMs: 800,
  theme: 'dark',
  animationsEnabled: true
};

export const DEFAULT_LISTS: Lists = {
  blocklist: [],
  whitelist: []
};
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS (hata yok).

- [ ] **Step 3: Commit**

```bash
git add src/core/models.ts
git commit -m "feat(core): veri modelleri ve varsayılanlar"
```

---

## Task 3: Sıralama motoru (TDD)

**Files:**
- Create: `src/core/sort-engine.ts`
- Test: `tests/core/sort-engine.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/core/sort-engine.test.ts
import { describe, it, expect } from 'vitest';
import { sortReplies } from '../../src/core/sort-engine';
import type { ReplyData } from '../../src/core/models';

function reply(p: Partial<ReplyData>): ReplyData {
  return {
    id: 'x', handle: 'a', displayName: 'A', text: 't',
    likes: 0, reposts: 0, replies: 0, isVerified: false,
    permalink: '', avatarUrl: null, ...p
  };
}

describe('sortReplies', () => {
  it('beğeniye göre azalan sıralar', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 5 }), reply({ id: 'b', likes: 50 }), reply({ id: 'c', likes: 10 })],
      'reposts'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('mavi tik sıralamayı etkilemez; en çok beğenilen mavi tikli en üstte', () => {
    const out = sortReplies(
      [reply({ id: 'plain', likes: 10, isVerified: false }),
       reply({ id: 'verified', likes: 99, isVerified: true })],
      'reposts'
    );
    expect(out[0].id).toBe('verified');
  });

  it('eşit beğenide tie-breaker reposts kullanır', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 10, reposts: 1 }), reply({ id: 'b', likes: 10, reposts: 9 })],
      'reposts'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('eşit beğenide tie-breaker replies seçilebilir', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 10, replies: 2 }), reply({ id: 'b', likes: 10, replies: 8 })],
      'replies'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('girdiyi mutasyona uğratmaz', () => {
    const input = [reply({ id: 'a', likes: 1 }), reply({ id: 'b', likes: 2 })];
    const copy = [...input];
    sortReplies(input, 'reposts');
    expect(input).toEqual(copy);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- sort-engine`
Expected: FAIL ("sortReplies is not a function" / modül bulunamadı).

- [ ] **Step 3: Minimal implementasyonu yaz**

```ts
// src/core/sort-engine.ts
import type { ReplyData, TieBreaker } from './models';

export function sortReplies(replies: ReplyData[], tieBreaker: TieBreaker): ReplyData[] {
  return [...replies].sort((a, b) => {
    if (b.likes !== a.likes) return b.likes - a.likes;
    const tb = b[tieBreaker] - a[tieBreaker];
    if (tb !== 0) return tb;
    // ikincil tie-breaker: diğer etkileşim alanı
    const other: TieBreaker = tieBreaker === 'reposts' ? 'replies' : 'reposts';
    return b[other] - a[other];
  });
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- sort-engine`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/core/sort-engine.ts tests/core/sort-engine.test.ts
git commit -m "feat(core): beğeniye göre yorum sıralama motoru"
```

---

## Task 4: Filtreleme motoru (TDD)

**Files:**
- Create: `src/core/filter-engine.ts`
- Test: `tests/core/filter-engine.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/core/filter-engine.test.ts
import { describe, it, expect } from 'vitest';
import { decideAction, normalizeHandle } from '../../src/core/filter-engine';
import type { Lists } from '../../src/core/models';

const lists = (p: Partial<Lists>): Lists => ({ blocklist: [], whitelist: [], ...p });

describe('normalizeHandle', () => {
  it('@ işaretini ve büyük harfi temizler', () => {
    expect(normalizeHandle('@SpamBot')).toBe('spambot');
    expect(normalizeHandle('  User  ')).toBe('user');
  });
});

describe('decideAction', () => {
  it('engelleme listesindeki hesabı collapse eder', () => {
    expect(decideAction('spambot', lists({ blocklist: ['spambot'] }))).toBe('collapse');
  });

  it('listede olmayan hesaba dokunmaz (show)', () => {
    expect(decideAction('alice', lists({}))).toBe('show');
  });

  it('beyaz liste engelleme listesini ezer', () => {
    expect(decideAction('bob', lists({ blocklist: ['bob'], whitelist: ['bob'] }))).toBe('show');
  });

  it('handle karşılaştırması büyük/küçük harf duyarsız', () => {
    expect(decideAction('@SpamBot', lists({ blocklist: ['spambot'] }))).toBe('collapse');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- filter-engine`
Expected: FAIL (modül/fonksiyon yok).

- [ ] **Step 3: Minimal implementasyonu yaz**

```ts
// src/core/filter-engine.ts
import type { Lists, FilterAction } from './models';

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

export function decideAction(handle: string, lists: Lists): FilterAction {
  const h = normalizeHandle(handle);
  if (lists.whitelist.some(w => normalizeHandle(w) === h)) return 'show';
  if (lists.blocklist.some(b => normalizeHandle(b) === h)) return 'collapse';
  return 'show';
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- filter-engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/filter-engine.ts tests/core/filter-engine.test.ts
git commit -m "feat(core): engelleme/beyaz liste filtre motoru"
```

---

## Task 5: Depolama sağlayıcı (TDD)

**Files:**
- Create: `src/data/data-provider.ts`
- Test: `tests/data/data-provider.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/data/data-provider.test.ts
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- data-provider`
Expected: FAIL.

- [ ] **Step 3: Minimal implementasyonu yaz**

```ts
// src/data/data-provider.ts
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
    return { ...DEFAULT_LISTS, ...(raw[LISTS_KEY] as Partial<Lists> | undefined) };
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
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- data-provider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/data-provider.ts tests/data/data-provider.test.ts
git commit -m "feat(data): chrome.storage soyutlamalı depolama sağlayıcı"
```

---

## Task 6: X seçici adaptörü (TDD — parse fonksiyonları)

**Files:**
- Create: `src/content/adapters/x-selectors.ts`
- Test: `tests/content/x-selectors.test.ts`

> Not: Seçiciler X değiştikçe güncellenir; testler `parseCount` ve fixture tabanlı `parseReply` mantığını sabitler.

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/content/x-selectors.test.ts
import { describe, it, expect } from 'vitest';
import { parseCount, parseReply } from '../../src/content/adapters/x-selectors';

describe('parseCount', () => {
  it('boş/yok değeri 0 yapar', () => {
    expect(parseCount('')).toBe(0);
    expect(parseCount(null)).toBe(0);
  });
  it('düz sayıları okur', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('57')).toBe(57);
  });
  it('K ve M soneklerini açar', () => {
    expect(parseCount('1.2K')).toBe(1200);
    expect(parseCount('3M')).toBe(3000000);
  });
});

describe('parseReply', () => {
  it('bir yorum article düğümünden veri çıkarır', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <span>Alice</span>
          <a href="/alice"><span>@alice</span></a>
        </div>
        <svg data-testid="icon-verified"></svg>
        <div data-testid="tweetText">Merhaba dünya</div>
        <a href="/alice/status/12345"><time></time></a>
        <button data-testid="like" aria-label="42 Beğeni"></button>
        <button data-testid="retweet" aria-label="5 repost"></button>
        <button data-testid="reply" aria-label="3 yanıt"></button>
      </article>`;
    const article = document.querySelector('article')!;
    const r = parseReply(article as HTMLElement)!;
    expect(r.handle).toBe('alice');
    expect(r.displayName).toBe('Alice');
    expect(r.text).toBe('Merhaba dünya');
    expect(r.likes).toBe(42);
    expect(r.reposts).toBe(5);
    expect(r.replies).toBe(3);
    expect(r.isVerified).toBe(true);
    expect(r.id).toBe('12345');
    expect(r.permalink).toContain('/alice/status/12345');
  });

  it('zorunlu alan yoksa null döner (sayfayı bozmamak için)', () => {
    document.body.innerHTML = `<article data-testid="tweet"></article>`;
    const article = document.querySelector('article')!;
    expect(parseReply(article as HTMLElement)).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- x-selectors`
Expected: FAIL.

- [ ] **Step 3: Minimal implementasyonu yaz**

```ts
// src/content/adapters/x-selectors.ts
import type { ReplyData } from '../../core/models';

// --- X'e özgü seçiciler: X arayüzü değişirse YALNIZCA burası güncellenir ---
export const SEL = {
  article: 'article[data-testid="tweet"]',
  userName: '[data-testid="User-Name"]',
  verified: '[data-testid="icon-verified"]',
  tweetText: '[data-testid="tweetText"]',
  like: '[data-testid="like"]',
  retweet: '[data-testid="retweet"]',
  reply: '[data-testid="reply"]',
  timeLink: 'a:has(time)',
  avatarImg: '[data-testid="Tweet-User-Avatar"] img'
} as const;

export function parseCount(text: string | null): number {
  if (!text) return 0;
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return Math.round(n * 1_000);
  if (suffix === 'M') return Math.round(n * 1_000_000);
  return Math.round(n);
}

function countFrom(article: HTMLElement, selector: string): number {
  const btn = article.querySelector(selector);
  if (!btn) return 0;
  const label = btn.getAttribute('aria-label');
  return parseCount(label);
}

export function findReplyArticles(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SEL.article));
}

export function getHandleFromArticle(article: HTMLElement): string | null {
  const userName = article.querySelector(SEL.userName);
  if (!userName) return null;
  const handleLink = Array.from(userName.querySelectorAll('a'))
    .map(a => a.textContent || '')
    .find(t => t.startsWith('@'));
  if (!handleLink) return null;
  return handleLink.replace(/^@/, '').trim().toLowerCase();
}

export function findActionBar(article: HTMLElement): HTMLElement | null {
  const like = article.querySelector(SEL.like);
  return (like?.parentElement?.parentElement as HTMLElement) ?? null;
}

export function parseReply(article: HTMLElement): ReplyData | null {
  const handle = getHandleFromArticle(article);
  const userName = article.querySelector(SEL.userName);
  const displayName = userName?.querySelector('span')?.textContent?.trim() ?? '';
  const timeLink = article.querySelector<HTMLAnchorElement>(SEL.timeLink);
  const permalink = timeLink?.getAttribute('href') ?? '';
  const idMatch = permalink.match(/status\/(\d+)/);

  if (!handle || !idMatch) return null; // zorunlu alanlar yoksa atla, sayfayı bozma

  return {
    id: idMatch[1],
    handle,
    displayName,
    text: article.querySelector(SEL.tweetText)?.textContent?.trim() ?? '',
    likes: countFrom(article, SEL.like),
    reposts: countFrom(article, SEL.retweet),
    replies: countFrom(article, SEL.reply),
    isVerified: !!article.querySelector(SEL.verified),
    permalink: permalink.startsWith('http') ? permalink : `https://x.com${permalink}`,
    avatarUrl: article.querySelector<HTMLImageElement>(SEL.avatarImg)?.src ?? null
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- x-selectors`
Expected: PASS. (Not: `a:has(time)` jsdom'da desteklenir; desteklenmezse fixture'da time'ın ebeveyn `<a>`'sı zaten eşleşir.)

- [ ] **Step 5: Commit**

```bash
git add src/content/adapters/x-selectors.ts tests/content/x-selectors.test.ts
git commit -m "feat(content): X seçici adaptörü ve yorum parse mantığı"
```

---

## Task 7: Yorum toplayıcı (ReplyCollector)

**Files:**
- Create: `src/content/collector.ts`

- [ ] **Step 1: collector.ts oluştur**

```ts
// src/content/collector.ts
import type { ReplyData } from '../core/models';
import { findReplyArticles, parseReply } from './adapters/x-selectors';

// Görünen yorumları kararlı id ile biriktirir; kaydırmada kaybolmaz.
export class ReplyCollector {
  private byId = new Map<string, ReplyData>();

  ingestFrom(root: ParentNode): void {
    for (const article of findReplyArticles(root)) {
      const reply = parseReply(article);
      if (reply) this.byId.set(reply.id, reply);
    }
  }

  all(): ReplyData[] {
    return Array.from(this.byId.values());
  }

  count(): number {
    return this.byId.size;
  }

  clear(): void {
    this.byId.clear();
  }
}
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/collector.ts
git commit -m "feat(content): görünen yorumları biriktiren ReplyCollector"
```

---

## Task 8: Overlay render

**Files:**
- Create: `src/content/overlay/overlay.ts`, `src/content/overlay/overlay.css`

- [ ] **Step 1: overlay.css oluştur**

```css
/* src/content/overlay/overlay.css */
.xcf-overlay {
  border: 1px solid rgb(47, 51, 54);
  border-radius: 16px;
  margin: 8px 0;
  background: #15181c;
  color: #e7e9ea;
  font-family: -apple-system, system-ui, sans-serif;
  overflow: hidden;
}
.xcf-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgb(47, 51, 54);
  font-weight: 700;
}
.xcf-overlay__actions { display: flex; gap: 8px; }
.xcf-btn {
  background: #1d9bf0; color: #fff; border: none;
  border-radius: 9999px; padding: 6px 14px; font-weight: 700; cursor: pointer;
}
.xcf-btn--ghost { background: transparent; color: #1d9bf0; border: 1px solid #1d9bf0; }
.xcf-card {
  display: flex; gap: 10px; padding: 12px 16px;
  border-bottom: 1px solid rgb(47, 51, 54);
}
.xcf-card__avatar { width: 40px; height: 40px; border-radius: 9999px; flex: 0 0 auto; background:#333; }
.xcf-card__body { flex: 1 1 auto; min-width: 0; }
.xcf-card__name { font-weight: 700; }
.xcf-card__handle { color: #71767b; margin-left: 4px; }
.xcf-card__text { margin: 4px 0; white-space: pre-wrap; word-break: break-word; }
.xcf-card__likes { color: #71767b; font-size: 13px; }
.xcf-card__open { color: #1d9bf0; text-decoration: none; font-size: 13px; margin-left: 12px; }
.xcf-anim .xcf-card { transition: background 0.15s ease; }
.xcf-anim .xcf-card:hover { background: #1a1e23; }
```

- [ ] **Step 2: overlay.ts oluştur**

```ts
// src/content/overlay/overlay.ts
import type { ReplyData } from '../../core/models';
import overlayCss from './overlay.css?inline';

const STYLE_ID = 'xcf-overlay-style';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = overlayCss;
  document.head.appendChild(style);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export interface OverlayCallbacks {
  onLoadAll: () => void;
  onClose: () => void;
}

export class SortedOverlay {
  private root: HTMLElement;

  constructor(private animations: boolean, private cb: OverlayCallbacks) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'xcf-overlay' + (animations ? ' xcf-anim' : '');
  }

  mountBefore(anchor: HTMLElement): void {
    if (this.root.isConnected) return;
    anchor.parentElement?.insertBefore(this.root, anchor);
  }

  unmount(): void {
    this.root.remove();
  }

  render(replies: ReplyData[], loading: boolean): void {
    const header = `
      <div class="xcf-overlay__header">
        <span>Beğeniye göre sıralı yorumlar (${replies.length})</span>
        <div class="xcf-overlay__actions">
          <button class="xcf-btn" data-act="loadall" ${loading ? 'disabled' : ''}>
            ${loading ? 'Yükleniyor…' : 'Tümünü yükle ve tam sırala'}
          </button>
          <button class="xcf-btn xcf-btn--ghost" data-act="close">Kapat</button>
        </div>
      </div>`;

    const cards = replies.map(r => `
      <div class="xcf-card">
        <div class="xcf-card__avatar" style="${r.avatarUrl ? `background-image:url(${escapeHtml(r.avatarUrl)});background-size:cover` : ''}"></div>
        <div class="xcf-card__body">
          <div>
            <span class="xcf-card__name">${escapeHtml(r.displayName)}</span>
            <span class="xcf-card__handle">@${escapeHtml(r.handle)}</span>
            <a class="xcf-card__open" href="${escapeHtml(r.permalink)}" target="_blank" rel="noopener">X'te aç</a>
          </div>
          <div class="xcf-card__text">${escapeHtml(r.text)}</div>
          <div class="xcf-card__likes">❤ ${formatCount(r.likes)} · 🔁 ${formatCount(r.reposts)} · 💬 ${formatCount(r.replies)}</div>
        </div>
      </div>`).join('');

    this.root.innerHTML = header + cards;
    this.root.querySelector('[data-act="loadall"]')?.addEventListener('click', () => this.cb.onLoadAll());
    this.root.querySelector('[data-act="close"]')?.addEventListener('click', () => this.cb.onClose());
  }
}
```

- [ ] **Step 3: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS. (Not: `?inline` ve `.css` importları için Vite tipleri; gerekirse `src/vite-env.d.ts` ile `/// <reference types="vite/client" />` ekleyin — bir sonraki adımda.)

- [ ] **Step 4: vite-env.d.ts ekle**

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: typecheck tekrar**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/overlay/ src/vite-env.d.ts
git commit -m "feat(content): sıralı yorum overlay render bileşeni"
```

---

## Task 9: Otomatik kaydırma (tümünü yükle)

**Files:**
- Create: `src/content/auto-scroll.ts`

- [ ] **Step 1: auto-scroll.ts oluştur**

```ts
// src/content/auto-scroll.ts
// Kontrollü, throttle'lı kaydırma ile tüm yorumları yükletir.
// Yeni içerik gelmeyi durdurana kadar (veya max adım) kaydırır.

export interface AutoScrollOptions {
  delayMs: number;
  maxSteps?: number;
  onStep?: () => void; // her adımda collector ingest tetiklemek için
}

export async function loadAllReplies(opts: AutoScrollOptions): Promise<void> {
  const { delayMs, maxSteps = 100, onStep } = opts;
  let lastHeight = -1;
  let stableCount = 0;

  for (let step = 0; step < maxSteps; step++) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(res => setTimeout(res, delayMs));
    onStep?.();

    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) {
      stableCount++;
      if (stableCount >= 2) break; // iki tur boyunca büyüme yoksa bitti say
    } else {
      stableCount = 0;
      lastHeight = height;
    }
  }
}
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/auto-scroll.ts
git commit -m "feat(content): tüm yorumları yükleyen kontrollü otomatik kaydırma"
```

---

## Task 10: Engelle butonu enjektörü

**Files:**
- Create: `src/content/block-injector.ts`

- [ ] **Step 1: block-injector.ts oluştur**

```ts
// src/content/block-injector.ts
import { getHandleFromArticle, findActionBar } from './adapters/x-selectors';

const BTN_CLASS = 'xcf-block-btn';
const MARK = 'data-xcf-injected';

export interface BlockInjectorCallbacks {
  onBlock: (handle: string) => void;
}

// Her yorum/gönderiye tek-tık engelle butonu ekler.
export function injectBlockButton(article: HTMLElement, cb: BlockInjectorCallbacks): void {
  if (article.hasAttribute(MARK)) return;
  const bar = findActionBar(article);
  const handle = getHandleFromArticle(article);
  if (!bar || !handle) return;

  article.setAttribute(MARK, '1');
  const btn = document.createElement('button');
  btn.className = BTN_CLASS;
  btn.type = 'button';
  btn.title = `@${handle} hesabını engelle`;
  btn.textContent = '🚫';
  btn.style.cssText =
    'background:transparent;border:none;cursor:pointer;color:#71767b;font-size:15px;padding:0 8px;';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onBlock(handle);
  });
  bar.appendChild(btn);
}
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/block-injector.ts
git commit -m "feat(content): satır içi engelle butonu enjektörü"
```

---

## Task 11: Collapse uygulayıcı

**Files:**
- Create: `src/content/collapse.ts`

- [ ] **Step 1: collapse.ts oluştur**

```ts
// src/content/collapse.ts
import { getHandleFromArticle } from './adapters/x-selectors';
import { decideAction } from '../core/filter-engine';
import type { Lists } from '../core/models';

const COLLAPSED = 'data-xcf-collapsed';

// Engellenen hesabın article'ını yerinde küçük bir çubuğa indirger.
export function applyCollapse(article: HTMLElement, lists: Lists): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;

  const action = decideAction(handle, lists);

  if (action !== 'collapse') {
    // beyaz listeye alınmış olabilir -> daha önce gizlendiyse geri aç
    if (article.getAttribute(COLLAPSED) === handle) restore(article);
    return;
  }
  if (article.getAttribute(COLLAPSED)) return; // zaten gizli

  const original = article.innerHTML;
  article.setAttribute(COLLAPSED, handle);
  (article as HTMLElement & { _xcfOriginal?: string })._xcfOriginal = original;

  const bar = document.createElement('div');
  bar.style.cssText =
    'padding:12px 16px;color:#71767b;font-size:14px;display:flex;justify-content:space-between;align-items:center;';
  bar.innerHTML = `<span>@${handle} engellendi</span>`;
  const showBtn = document.createElement('button');
  showBtn.textContent = 'Göster';
  showBtn.style.cssText = 'background:transparent;border:1px solid #536471;color:#e7e9ea;border-radius:9999px;padding:4px 12px;cursor:pointer;';
  showBtn.addEventListener('click', () => restore(article));
  bar.appendChild(showBtn);

  article.innerHTML = '';
  article.appendChild(bar);
}

function restore(article: HTMLElement): void {
  const el = article as HTMLElement & { _xcfOriginal?: string };
  if (el._xcfOriginal != null) {
    article.innerHTML = el._xcfOriginal;
    article.removeAttribute(COLLAPSED);
    delete el._xcfOriginal;
  }
}
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/collapse.ts
git commit -m "feat(content): engellenen hesapları collapse eden uygulayıcı"
```

---

## Task 12: Mesajlaşma yardımcıları

**Files:**
- Create: `src/shared/messaging.ts`

- [ ] **Step 1: messaging.ts oluştur**

```ts
// src/shared/messaging.ts
export type RuntimeMessage =
  | { type: 'LISTS_CHANGED' }
  | { type: 'SETTINGS_CHANGED' }
  | { type: 'TOGGLE_OVERLAY' }
  | { type: 'LOAD_ALL' };

export function broadcast(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => { /* alıcı yoksa yut */ });
}

export function onMessage(handler: (msg: RuntimeMessage) => void): void {
  chrome.runtime.onMessage.addListener((msg) => { handler(msg as RuntimeMessage); });
}
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/messaging.ts
git commit -m "feat(shared): runtime mesajlaşma tipleri ve yardımcıları"
```

---

## Task 13: Background service worker

**Files:**
- Create: `src/background/service-worker.ts`

- [ ] **Step 1: service-worker.ts oluştur**

```ts
// src/background/service-worker.ts
import { broadcast } from '../shared/messaging';

// chrome.storage değişikliklerini açık sekmelere yayınlar.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' && area !== 'local') return;
  if ('lists' in changes) broadcast({ type: 'LISTS_CHANGED' });
  if ('settings' in changes) broadcast({ type: 'SETTINGS_CHANGED' });
});
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat(background): depolama değişikliklerini yayınlayan service worker"
```

---

## Task 14: Orchestrator (içerik giriş noktası)

**Files:**
- Create: `src/content/orchestrator.ts`

- [ ] **Step 1: orchestrator.ts oluştur**

```ts
// src/content/orchestrator.ts
import { DataProvider, createChromeBackend } from '../data/data-provider';
import { ReplyCollector } from './collector';
import { SortedOverlay } from './overlay/overlay';
import { injectBlockButton } from './block-injector';
import { applyCollapse } from './collapse';
import { loadAllReplies } from './auto-scroll';
import { sortReplies } from '../core/sort-engine';
import { findReplyArticles } from './adapters/x-selectors';
import { onMessage, broadcast } from '../shared/messaging';
import type { Settings, Lists } from '../core/models';

const dp = new DataProvider(createChromeBackend());
const collector = new ReplyCollector();

let settings: Settings;
let lists: Lists;
let overlay: SortedOverlay | null = null;
let overlayVisible = false;
let loadingAll = false;

function isThreadPage(): boolean {
  return /\/status\/\d+/.test(location.pathname);
}

function refreshOverlay(): void {
  if (!overlay || !overlayVisible) return;
  const sorted = sortReplies(collector.all(), settings.tieBreaker);
  overlay.render(sorted, loadingAll);
}

function mountOverlayIfNeeded(): void {
  if (!isThreadPage() || !overlayVisible) return;
  const firstArticle = document.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!firstArticle) return;
  if (!overlay) {
    overlay = new SortedOverlay(settings.animationsEnabled, {
      onLoadAll: () => { void doLoadAll(); },
      onClose: () => toggleOverlay(false)
    });
  }
  overlay.mountBefore(firstArticle);
  refreshOverlay();
}

function toggleOverlay(show: boolean): void {
  overlayVisible = show;
  if (!show) { overlay?.unmount(); return; }
  mountOverlayIfNeeded();
}

async function doLoadAll(): Promise<void> {
  if (loadingAll) return;
  loadingAll = true;
  refreshOverlay();
  await loadAllReplies({
    delayMs: settings.autoScrollDelayMs,
    onStep: () => collector.ingestFrom(document)
  });
  loadingAll = false;
  refreshOverlay();
}

function processArticles(): void {
  collector.ingestFrom(document);
  for (const article of findReplyArticles(document)) {
    injectBlockButton(article, {
      onBlock: async (handle) => {
        await dp.addToBlocklist(handle);
        lists = await dp.getLists();
        broadcast({ type: 'LISTS_CHANGED' });
        scanAndCollapse();
      }
    });
    applyCollapse(article, lists);
  }
  if (overlayVisible) { mountOverlayIfNeeded(); refreshOverlay(); }
}

function scanAndCollapse(): void {
  for (const article of findReplyArticles(document)) applyCollapse(article, lists);
}

async function init(): Promise<void> {
  settings = await dp.getSettings();
  lists = await dp.getLists();
  overlayVisible = settings.overlayEnabledByDefault && isThreadPage();

  const observer = new MutationObserver(() => {
    // X'in re-render'ında sürekli çalışmamak için bir sonraki frame'e ertele
    requestAnimationFrame(processArticles);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  onMessage(async (msg) => {
    if (msg.type === 'LISTS_CHANGED') { lists = await dp.getLists(); scanAndCollapse(); }
    if (msg.type === 'SETTINGS_CHANGED') { settings = await dp.getSettings(); }
    if (msg.type === 'TOGGLE_OVERLAY') { toggleOverlay(!overlayVisible); }
    if (msg.type === 'LOAD_ALL') { void doLoadAll(); }
  });

  processArticles();
}

void init();
```

- [ ] **Step 2: typecheck doğrula**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build doğrula**

Run: `npm run build`
Expected: `dist/` üretilir, hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/content/orchestrator.ts
git commit -m "feat(content): MutationObserver akışını yöneten orchestrator"
```

---

## Task 15: Popup UI (Preact)

**Files:**
- Create: `src/ui/ui-shared/theme.css`, `src/ui/popup/popup.html`, `src/ui/popup/popup.tsx`

- [ ] **Step 1: theme.css oluştur**

```css
/* src/ui/ui-shared/theme.css */
:root {
  --xcf-bg: #15181c;
  --xcf-surface: #1d2127;
  --xcf-text: #e7e9ea;
  --xcf-muted: #71767b;
  --xcf-accent: #1d9bf0;
  --xcf-border: #2f3336;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--xcf-bg); color: var(--xcf-text);
  font-family: -apple-system, system-ui, sans-serif;
}
.xcf-accent-btn {
  background: var(--xcf-accent); color: #fff; border: none;
  border-radius: 9999px; padding: 8px 16px; font-weight: 700; cursor: pointer;
  transition: opacity .15s ease;
}
.xcf-accent-btn:hover { opacity: .9; }
```

- [ ] **Step 2: popup.html oluştur**

```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>X İçerik Filtresi</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./popup.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: popup.tsx oluştur**

```tsx
// src/ui/popup/popup.tsx
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DataProvider, createChromeBackend } from '../../data/data-provider';
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

  return (
    <div style="width:260px;padding:16px;">
      <h3 style="margin:0 0 12px;">X İçerik Filtresi</h3>
      <p style="color:var(--xcf-muted);margin:0 0 12px;">Engellenen hesap: {blocked}</p>
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
```

- [ ] **Step 4: build doğrula**

Run: `npm run build`
Expected: PASS, popup `dist/`'e dahil.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ui-shared/theme.css src/ui/popup/
git commit -m "feat(ui): popup arayüzü (overlay aç/kapat, tam sırala, ayarlar)"
```

---

## Task 16: Ayarlar sayfası (Preact, sekmeli)

**Files:**
- Create: `src/ui/options/options.html`, `src/ui/options/options.tsx`, `src/ui/options/options.css`

- [ ] **Step 1: options.css oluştur**

```css
/* src/ui/options/options.css */
.xcf-page { max-width: 720px; margin: 0 auto; padding: 24px; }
.xcf-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--xcf-border); margin-bottom: 20px; }
.xcf-tab {
  background: transparent; border: none; color: var(--xcf-muted);
  padding: 12px 16px; cursor: pointer; font-weight: 700; border-bottom: 2px solid transparent;
}
.xcf-tab--active { color: var(--xcf-text); border-bottom-color: var(--xcf-accent); }
.xcf-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--xcf-border); }
.xcf-list-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--xcf-surface); border-radius: 8px; margin-bottom: 6px; }
.xcf-input { background: var(--xcf-surface); border: 1px solid var(--xcf-border); color: var(--xcf-text); border-radius: 8px; padding: 8px 12px; flex: 1; }
.xcf-del { background: transparent; border: none; color: #f4212e; cursor: pointer; }
```

- [ ] **Step 2: options.html oluştur**

```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>X İçerik Filtresi — Ayarlar</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./options.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: options.tsx oluştur**

```tsx
// src/ui/options/options.tsx
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
```

- [ ] **Step 4: build doğrula**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/options/
git commit -m "feat(ui): sekmeli ayarlar sayfası (sıralama, listeler, görünüm)"
```

---

## Task 17: Tüm testler + build + manuel doğrulama

**Files:** yok (doğrulama görevi)

- [ ] **Step 1: Tüm birim testleri çalıştır**

Run: `npm test`
Expected: Tüm testler PASS (sort-engine, filter-engine, data-provider, x-selectors).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: Hata yok, `dist/` üretildi.

- [ ] **Step 3: Uzantıyı Chrome'a yükle (manuel)**

1. `chrome://extensions` aç → Geliştirici modu açık.
2. "Paketlenmemiş öğe yükle" → `dist/` klasörünü seç.
3. x.com'da bir tweet detay sayfası aç.

- [ ] **Step 4: Manuel doğrulama kontrol listesi**

Aşağıdakileri elle doğrula:
- [ ] Yorum bölgesinin üstünde sıralı overlay görünüyor; en çok beğenilen üstte.
- [ ] Mavi tikli ama az beğenili yorum üste çıkmıyor; en çok beğenilen (mavi tikli olsa da) üstte.
- [ ] "Tümünü yükle ve tam sırala" sayfayı kaydırıp daha fazla yorum topluyor ve listeyi büyütüyor.
- [ ] Her gönderi/yorumda 🚫 butonu var; tıklayınca o hesap collapse oluyor.
- [ ] Collapse çubuğundaki "Göster" içeriği geri açıyor.
- [ ] Ayarlar → Engelleme listesine elle handle eklenince ilgili içerik (yenilemeden) collapse oluyor.
- [ ] Beyaz listeye eklenen hesap, engelleme listesinde olsa bile gösteriliyor.
- [ ] Ayarlar paneli koyu tema, sekmeler ve animasyonlarla düzgün çalışıyor.
- [ ] Popup'tan overlay aç/kapat ve tam sırala çalışıyor.

- [ ] **Step 5: README güncelle ve commit**

`README.md` içine kurulum/geliştirme notları ekle (npm install, npm run build, dist'i yükle) ve commit et.

```bash
git add README.md
git commit -m "docs: kurulum ve geliştirme notları"
```

---

## Öz-Denetim Notları (plan yazarı)

- **Spec kapsamı:** Sıralama (Task 3, 8, 9, 14), manuel engelleme + inline buton (Task 10, 14), collapse (Task 11), beyaz liste önceliği (Task 4, 16), ayarlar paneli + koyu tema (Task 15, 16), depolama soyutlaması/gelecek-uyumluluk (Task 5), X seçici izolasyonu (Task 6), test stratejisi (Task 3-6, 17). Tüm spec gereksinimleri karşılanıyor.
- **Tip tutarlılığı:** `ReplyData`, `Settings`, `Lists`, `FilterAction`, `TieBreaker` Task 2'de tanımlandı; sonraki tasklarda aynı imzalarla kullanıldı. `decideAction`, `normalizeHandle`, `sortReplies`, `parseReply`, `getHandleFromArticle`, `findActionBar`, `findReplyArticles` çağrıları tanımlarıyla eşleşiyor.
- **Yer tutucu yok:** Her kod adımı tam içerik içeriyor.
