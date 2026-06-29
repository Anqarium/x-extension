# X Uzantısı Faz 2 — Plan B: Uzantı Entegrasyonu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faz 1 uzantısını Faz 2 buluttaki topluluk verdiktleriyle entegre etmek: OAuth giriş, kategori rapor menüsü, verdikt senkronu (periyodik + talep üzerine, TTL'li cache) ve kullanıcı seçimli verdikt-farkında filtreleme.

**Architecture:** Karar mantığı saf TS'te kalır ve Vitest ile test edilir (`decideFilter`, `VerdictCache`, satır eşleme). Bulut çağrıları bağımlılıksız `fetch` ile üç Edge Function'a yapılır (supabase-js bundle'a girmez). Kimlik `chrome.identity.launchWebAuthFlow` + Supabase OAuth ile alınır; oturum `chrome.storage.local`'da tutulur. Filtreleme önceliği: beyaz liste > kullanıcı engelleme > bulut verdikti > dokunma. Bulut yapılandırılmamışsa (URL/anahtar boş) topluluk özellikleri sessizce devre dışı kalır; Faz 1 yerel işlevsellik aynen çalışır.

**Tech Stack:** TypeScript, Preact (UI), Vite/crxjs (MV3), Vitest, `chrome.identity`/`chrome.alarms`/`chrome.storage`, `fetch`.

---

## Önemli sınırlar

- **Saf mantık (Tasks 1-3, ve Task 4'teki satır eşleme)** Vitest ile otomatik doğrulanır.
- **Bulut I/O, OAuth, DOM, UI, background (Tasks 4-11)** tip denetimi + `npm run build` ile doğrulanır; **canlı doğrulama (gerçek giriş, rapor, senkron) kullanıcı tarafından**, Faz 2 backend Supabase'de canlıyken yapılır (`docs/BACKEND.md`).
- **Kullanıcı yapılandırması:** `src/data/cloud-config.ts` içindeki `url` + `anonKey` kullanıcının Supabase projesinden gelir (anon anahtar herkese açıktır, commit edilebilir). Boşken `cloudConfigured()` false döner ve topluluk özellikleri devre dışı kalır — bu kod yer tutucusu değil, dağıtım yapılandırmasıdır.

---

## Dosya Yapısı

```
src/core/models.ts                    # MODIFY: Category, Verdict, CommunityFilterSettings, FilterDecision; DEFAULT_SETTINGS.community
src/core/filter-engine.ts             # MODIFY: decideFilter() ekle (verdikt-farkında, saf)
src/data/cloud-config.ts              # CREATE: CLOUD url/anonKey + cloudConfigured + functionUrl
src/data/verdict-mapper.ts            # CREATE: mapVerdictRow (saf, sunucu satırı → Verdict)
src/data/verdict-cache.ts             # CREATE: VerdictCache (TTL, missing, serialize)
src/data/cloud-provider.ts            # CREATE: fetchVerdicts/fetchFlaggedList/submitReport
src/data/auth.ts                      # CREATE: OAuth (launchWebAuthFlow) + oturum yönetimi
src/content/report-menu.ts            # CREATE: kategori rapor menüsü (block-injector yanında)
src/content/community-apply.ts        # CREATE: applyDecision (badge/collapse/remove + autoblock)
src/content/collapse.ts               # MODIFY: collapse mekaniğini dışa aktar (collapseArticle/restoreArticle)
src/content/orchestrator.ts           # MODIFY: verdikt çek + decideFilter + applyDecision
src/background/service-worker.ts      # MODIFY: chrome.alarms ile flagged-list senkronu
src/shared/messaging.ts               # MODIFY: yeni mesaj tipleri (REPORT, AUTH_CHANGED, VERDICTS_SYNCED)
src/ui/options/options.tsx            # MODIFY: "Topluluk filtresi" sekmesi + giriş
src/ui/popup/popup.tsx                # MODIFY: giriş durumu/butonu
manifest.config.ts                    # MODIFY: "identity", "alarms" izinleri
tests/core/filter-engine.community.test.ts   # CREATE
tests/data/verdict-cache.test.ts             # CREATE
tests/data/verdict-mapper.test.ts            # CREATE
docs/BACKEND.md                       # MODIFY: uzantı tarafı kurulum notu (cloud-config + redirect URL)
```

---

## Task 1: Modeller — Category, Verdict, topluluk ayarları, FilterDecision

**Files:**
- Modify: `src/core/models.ts`

- [ ] **Step 1: `src/core/models.ts` sonuna ekle**

Mevcut içeriği KORU, dosyanın sonuna şunları ekle:
```ts
export type Category =
  | 'bot' | 'spam' | 'crypto' | 'fake_giveaway' | 'ads' | 'ai_bot' | 'harassment';

export const CATEGORIES: Category[] =
  ['bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment'];

export const CATEGORY_LABELS: Record<Category, string> = {
  bot: 'Bot',
  spam: 'Spam',
  crypto: 'Kripto Dolandırıcılığı',
  fake_giveaway: 'Sahte Çekiliş',
  ads: 'Sürekli Reklam',
  ai_bot: 'Yapay Zekâ Botu',
  harassment: 'Taciz',
};

export type AccountState = 'clean' | 'suspicious' | 'flagged';

export interface Verdict {
  handle: string;
  state: AccountState;
  topCategory: Category | null;
  maxScore: number;
}

export type SuspiciousAction = 'off' | 'badge' | 'collapse';
export type FlaggedAction = 'warn' | 'collapse' | 'remove' | 'autoblock';

export interface CommunityFilterSettings {
  enabled: boolean;
  suspiciousAction: SuspiciousAction;
  flaggedAction: FlaggedAction;
  enabledCategories: Category[];
}

export const DEFAULT_COMMUNITY: CommunityFilterSettings = {
  enabled: true,
  suspiciousAction: 'badge',
  flaggedAction: 'collapse',
  enabledCategories: ['bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment'],
};

// Verdikt-farkında filtre kararı
export interface FilterDecision {
  action: 'show' | 'collapse' | 'badge' | 'remove';
  autoblock: boolean;
  reason: 'whitelist' | 'blocklist' | 'community' | 'none';
  category: Category | null;
}
```

- [ ] **Step 2: Aynı dosyada `Settings` arayüzüne `community` alanı ekle**

`Settings` arayüzünün içine (mevcut alanların yanına) ekle:
```ts
  community: CommunityFilterSettings;
```

- [ ] **Step 3: `DEFAULT_SETTINGS`'e community varsayılanını ekle**

`DEFAULT_SETTINGS` nesnesine (son alandan sonra) ekle:
```ts
  community: DEFAULT_COMMUNITY,
```
Not: `DEFAULT_COMMUNITY` yukarıda tanımlandığı için `DEFAULT_SETTINGS`'ten önce gelmelidir. Eğer `DEFAULT_SETTINGS` dosyada `DEFAULT_COMMUNITY`'den ÖNCE tanımlıysa, `DEFAULT_COMMUNITY` ve ilgili tipleri `DEFAULT_SETTINGS`'ten önceye taşı. (JS const hoisting yapmaz; sıralama önemli.)

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: PASS. (DataProvider varsayılan birleştirmesi `{...DEFAULT_SETTINGS, ...stored}` olduğu için eski kullanıcıların ayarına `community` otomatik eklenir.)

- [ ] **Step 5: Commit**

```bash
git add src/core/models.ts
git commit -m "feat(core): topluluk verdikt tipleri ve filtre ayarları"
```

---

## Task 2: filter-engine — decideFilter (TDD)

**Files:**
- Modify: `src/core/filter-engine.ts`
- Test: `tests/core/filter-engine.community.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/core/filter-engine.community.test.ts
import { describe, it, expect } from 'vitest';
import { decideFilter } from '../../src/core/filter-engine';
import { DEFAULT_COMMUNITY, type Lists, type Verdict, type CommunityFilterSettings } from '../../src/core/models';

const lists = (p: Partial<Lists>): Lists => ({ blocklist: [], whitelist: [], ...p });
const community = (p: Partial<CommunityFilterSettings>): CommunityFilterSettings => ({ ...DEFAULT_COMMUNITY, ...p });
const verdict = (p: Partial<Verdict>): Verdict => ({ handle: 'x', state: 'clean', topCategory: null, maxScore: 0, ...p });

describe('decideFilter', () => {
  it('beyaz liste her şeyi ezer (flagged olsa bile show)', () => {
    const d = decideFilter('bob', lists({ whitelist: ['bob'], blocklist: ['bob'] }),
      verdict({ state: 'flagged', topCategory: 'spam' }), community({}));
    expect(d.action).toBe('show');
    expect(d.reason).toBe('whitelist');
  });

  it('kullanıcı engellemesi bulut verdiktinden önce gelir', () => {
    const d = decideFilter('bob', lists({ blocklist: ['bob'] }),
      verdict({ state: 'flagged', topCategory: 'spam' }), community({}));
    expect(d.action).toBe('collapse');
    expect(d.reason).toBe('blocklist');
  });

  it('flagged + flaggedAction=collapse → collapse (community)', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'crypto' }), community({ flaggedAction: 'collapse' }));
    expect(d.action).toBe('collapse');
    expect(d.reason).toBe('community');
    expect(d.category).toBe('crypto');
  });

  it('flagged + flaggedAction=autoblock → collapse + autoblock bayrağı', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'crypto' }), community({ flaggedAction: 'autoblock' }));
    expect(d.action).toBe('collapse');
    expect(d.autoblock).toBe(true);
  });

  it('flagged + flaggedAction=warn → badge', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'bot' }), community({ flaggedAction: 'warn' }));
    expect(d.action).toBe('badge');
  });

  it('suspicious + suspiciousAction=off → show', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'suspicious', topCategory: 'ads' }), community({ suspiciousAction: 'off' }));
    expect(d.action).toBe('show');
  });

  it('kategori kapalıysa community kararı uygulanmaz', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'ads' }),
      community({ enabledCategories: ['bot'] }));
    expect(d.action).toBe('show');
    expect(d.reason).toBe('none');
  });

  it('community kapalıysa verdikt yok sayılır', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'bot' }), community({ enabled: false }));
    expect(d.action).toBe('show');
  });

  it('verdikt yoksa show', () => {
    const d = decideFilter('eve', lists({}), null, community({}));
    expect(d.action).toBe('show');
    expect(d.reason).toBe('none');
  });

  it('clean verdikt → show', () => {
    const d = decideFilter('eve', lists({}), verdict({ state: 'clean' }), community({}));
    expect(d.action).toBe('show');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- filter-engine.community`
Expected: FAIL (decideFilter yok).

- [ ] **Step 3: `src/core/filter-engine.ts` sonuna ekle**

Mevcut `normalizeHandle` ve `decideAction`'ı KORU. Dosyanın başındaki importa `Verdict`, `CommunityFilterSettings`, `FilterDecision`, `Category` tiplerini ekle ve sonuna şunu ekle:
```ts
import type {
  Verdict, CommunityFilterSettings, FilterDecision,
} from './models';

export function decideFilter(
  handle: string,
  lists: Lists,
  verdict: Verdict | null,
  community: CommunityFilterSettings
): FilterDecision {
  const h = normalizeHandle(handle);

  if (lists.whitelist.some((w) => normalizeHandle(w) === h)) {
    return { action: 'show', autoblock: false, reason: 'whitelist', category: null };
  }
  if (lists.blocklist.some((b) => normalizeHandle(b) === h)) {
    return { action: 'collapse', autoblock: false, reason: 'blocklist', category: null };
  }

  if (
    community.enabled &&
    verdict &&
    verdict.state !== 'clean' &&
    verdict.topCategory !== null &&
    community.enabledCategories.includes(verdict.topCategory)
  ) {
    if (verdict.state === 'flagged') {
      switch (community.flaggedAction) {
        case 'warn':
          return { action: 'badge', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'collapse':
          return { action: 'collapse', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'remove':
          return { action: 'remove', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'autoblock':
          return { action: 'collapse', autoblock: true, reason: 'community', category: verdict.topCategory };
      }
    }
    if (verdict.state === 'suspicious') {
      switch (community.suspiciousAction) {
        case 'off':
          return { action: 'show', autoblock: false, reason: 'none', category: null };
        case 'badge':
          return { action: 'badge', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'collapse':
          return { action: 'collapse', autoblock: false, reason: 'community', category: verdict.topCategory };
      }
    }
  }

  return { action: 'show', autoblock: false, reason: 'none', category: null };
}
```
Not: Eğer dosyada zaten `import type { Lists, FilterAction } from './models';` varsa, yeni tipleri o satıra ekleyebilir veya ayrı bir `import type` satırı kullanabilirsin (ikisi de geçerli).

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- filter-engine.community`
Expected: PASS (tüm testler). Ayrıca `npm test -- filter-engine` ile Faz 1 filter testlerinin hâlâ geçtiğini doğrula.

- [ ] **Step 5: Commit**

```bash
git add src/core/filter-engine.ts tests/core/filter-engine.community.test.ts
git commit -m "feat(core): verdikt-farkında decideFilter (öncelik + davranış eşleme)"
```

---

## Task 3: VerdictCache (TDD)

**Files:**
- Create: `src/data/verdict-cache.ts`
- Test: `tests/data/verdict-cache.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/data/verdict-cache.test.ts
import { describe, it, expect } from 'vitest';
import { VerdictCache } from '../../src/data/verdict-cache';
import type { Verdict } from '../../src/core/models';

const v = (handle: string, state: Verdict['state'] = 'flagged'): Verdict =>
  ({ handle, state, topCategory: 'spam', maxScore: 5 });

describe('VerdictCache', () => {
  it('set sonrası taze veriyi döner', () => {
    let now = 1000;
    const c = new VerdictCache(10_000, () => now);
    c.set(v('alice'));
    expect(c.get('alice')?.state).toBe('flagged');
  });

  it('TTL dolunca null döner', () => {
    let now = 1000;
    const c = new VerdictCache(10_000, () => now);
    c.set(v('alice'));
    now = 1000 + 10_001;
    expect(c.get('alice')).toBeNull();
  });

  it('handle normalize edilir (@ ve büyük harf)', () => {
    let now = 0;
    const c = new VerdictCache(10_000, () => now);
    c.set(v('Alice'));
    expect(c.get('@alice')?.handle).toBe('alice');
  });

  it('missing() cache\'te olmayan veya süresi dolmuş handle\'ları döner', () => {
    let now = 0;
    const c = new VerdictCache(10_000, () => now);
    c.setMany([v('a'), v('b')]);
    now = 10_001;
    c.set(v('c'));
    expect(c.missing(['a', 'b', 'c', 'd']).sort()).toEqual(['a', 'b', 'd']);
  });

  it('serialize/load round-trip', () => {
    let now = 5;
    const c = new VerdictCache(10_000, () => now);
    c.setMany([v('a'), v('b')]);
    const data = c.toJSON();
    const c2 = new VerdictCache(10_000, () => now);
    c2.loadFrom(data);
    expect(c2.get('a')?.state).toBe('flagged');
    expect(c2.get('b')?.state).toBe('flagged');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- verdict-cache`
Expected: FAIL.

- [ ] **Step 3: `src/data/verdict-cache.ts` oluştur**

```ts
import type { Verdict } from '../core/models';
import { normalizeHandle } from '../core/filter-engine';

interface Entry {
  verdict: Verdict;
  fetchedAt: number;
}

// Verdiktleri TTL ile yerel olarak önbelleğe alır; handle anahtarları normalize.
export class VerdictCache {
  private map = new Map<string, Entry>();

  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  private fresh(entry: Entry | undefined): entry is Entry {
    return !!entry && this.now() - entry.fetchedAt <= this.ttlMs;
  }

  get(handle: string): Verdict | null {
    const entry = this.map.get(normalizeHandle(handle));
    return this.fresh(entry) ? entry.verdict : null;
  }

  set(verdict: Verdict): void {
    const handle = normalizeHandle(verdict.handle);
    this.map.set(handle, { verdict: { ...verdict, handle }, fetchedAt: this.now() });
  }

  setMany(verdicts: Verdict[]): void {
    for (const v of verdicts) this.set(v);
  }

  // Cache'te olmayan VEYA süresi dolmuş handle'ları döner (taze sorgu için).
  missing(handles: string[]): string[] {
    const out: string[] = [];
    for (const h of handles) {
      const norm = normalizeHandle(h);
      if (!norm) continue;
      if (!this.fresh(this.map.get(norm))) out.push(norm);
    }
    return out;
  }

  toJSON(): Record<string, Entry> {
    return Object.fromEntries(this.map.entries());
  }

  loadFrom(data: Record<string, Entry> | undefined | null): void {
    if (!data) return;
    for (const [handle, entry] of Object.entries(data)) {
      if (entry && entry.verdict) this.map.set(handle, entry);
    }
  }
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- verdict-cache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/verdict-cache.ts tests/data/verdict-cache.test.ts
git commit -m "feat(data): TTL'li yerel verdikt önbelleği"
```

---

## Task 4: cloud-config + verdict-mapper (TDD eşleme)

**Files:**
- Create: `src/data/cloud-config.ts`, `src/data/verdict-mapper.ts`
- Test: `tests/data/verdict-mapper.test.ts`

- [ ] **Step 1: `src/data/cloud-config.ts` oluştur**

```ts
// Kullanıcı kendi Supabase projesini oluşturduktan sonra burayı doldurur.
// anonKey herkese açıktır (publishable), commit edilebilir. Boşken topluluk
// özellikleri devre dışı kalır; Faz 1 yerel işlevsellik etkilenmez.
export const CLOUD = {
  url: '',       // örn. https://abcdefgh.supabase.co
  anonKey: '',   // public anon key
};

export function cloudConfigured(): boolean {
  return CLOUD.url.length > 0 && CLOUD.anonKey.length > 0;
}

export function functionUrl(name: string): string {
  return `${CLOUD.url}/functions/v1/${name}`;
}
```

- [ ] **Step 2: Başarısız testi yaz**

```ts
// tests/data/verdict-mapper.test.ts
import { describe, it, expect } from 'vitest';
import { mapVerdictRow } from '../../src/data/verdict-mapper';

describe('mapVerdictRow', () => {
  it('sunucu satırını Verdict\'e çevirir', () => {
    const v = mapVerdictRow({
      target_handle: 'Spammer', top_category: 'crypto', max_score: 7.5, state: 'flagged',
    });
    expect(v).toEqual({ handle: 'spammer', state: 'flagged', topCategory: 'crypto', maxScore: 7.5 });
  });

  it('eksik/temiz alanlarda güvenli varsayılanlar', () => {
    const v = mapVerdictRow({ target_handle: 'a', top_category: null, max_score: null, state: 'clean' });
    expect(v).toEqual({ handle: 'a', state: 'clean', topCategory: null, maxScore: 0 });
  });

  it('geçersiz state clean\'e düşer', () => {
    const v = mapVerdictRow({ target_handle: 'a', top_category: null, max_score: 0, state: 'garbage' });
    expect(v.state).toBe('clean');
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- verdict-mapper`
Expected: FAIL.

- [ ] **Step 4: `src/data/verdict-mapper.ts` oluştur**

```ts
import type { Verdict, AccountState, Category } from '../core/models';
import { normalizeHandle } from '../core/filter-engine';
import { CATEGORIES } from '../core/models';

const STATES: AccountState[] = ['clean', 'suspicious', 'flagged'];

export interface VerdictRow {
  target_handle: string;
  top_category: string | null;
  max_score: number | null;
  state: string;
}

export function mapVerdictRow(row: VerdictRow): Verdict {
  const state = (STATES as string[]).includes(row.state) ? (row.state as AccountState) : 'clean';
  const topCategory =
    row.top_category && (CATEGORIES as string[]).includes(row.top_category)
      ? (row.top_category as Category)
      : null;
  return {
    handle: normalizeHandle(row.target_handle),
    state,
    topCategory,
    maxScore: typeof row.max_score === 'number' ? row.max_score : 0,
  };
}
```

- [ ] **Step 5: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- verdict-mapper`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/cloud-config.ts src/data/verdict-mapper.ts tests/data/verdict-mapper.test.ts
git commit -m "feat(data): bulut yapılandırması ve verdikt satır eşleyici"
```

---

## Task 5: cloud-provider (Edge Function fetch sarmalayıcıları)

**Files:**
- Create: `src/data/cloud-provider.ts`

> Doğrulama: tip denetimi + build; canlı çağrı kullanıcı tarafından.

- [ ] **Step 1: `src/data/cloud-provider.ts` oluştur**

```ts
import type { Verdict, Category } from '../core/models';
import { CLOUD, cloudConfigured, functionUrl } from './cloud-config';
import { mapVerdictRow, type VerdictRow } from './verdict-mapper';

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: CLOUD.anonKey,
    Authorization: `Bearer ${CLOUD.anonKey}`,
    ...extra,
  };
}

// Toplu verdikt (anon). Yapılandırılmamışsa boş döner.
export async function fetchVerdicts(handles: string[]): Promise<Verdict[]> {
  if (!cloudConfigured() || handles.length === 0) return [];
  try {
    const res = await fetch(functionUrl('get_verdicts'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ handles }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { verdicts?: VerdictRow[] };
    return (data.verdicts ?? []).map(mapVerdictRow);
  } catch {
    return [];
  }
}

// flagged listesi (anon, artımlı).
export async function fetchFlaggedList(since: string | null): Promise<Verdict[]> {
  if (!cloudConfigured()) return [];
  try {
    const url = new URL(functionUrl('get_flagged_list'));
    if (since) url.searchParams.set('updated_since', since);
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) return [];
    const data = (await res.json()) as { flagged?: VerdictRow[] };
    return (data.flagged ?? []).map(mapVerdictRow);
  } catch {
    return [];
  }
}

export interface SubmitResult {
  ok: boolean;
  verdict?: Verdict | null;
  error?: string;
}

// Rapor gönder (giriş gerekli; accessToken kullanıcı JWT'si).
export async function submitReport(
  handle: string,
  category: Category,
  accessToken: string
): Promise<SubmitResult> {
  if (!cloudConfigured()) return { ok: false, error: 'cloud_not_configured' };
  try {
    const res = await fetch(functionUrl('submit_report'), {
      method: 'POST',
      headers: headers({ Authorization: `Bearer ${accessToken}` }),
      body: JSON.stringify({ target_handle: handle, category }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean; verdict?: VerdictRow | null; error?: string;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `http_${res.status}` };
    return { ok: true, verdict: data.verdict ? mapVerdictRow(data.verdict) : null };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/data/cloud-provider.ts
git commit -m "feat(data): Edge Function fetch sarmalayıcıları (verdikt/rapor)"
```

---

## Task 6: auth — OAuth giriş ve oturum

**Files:**
- Create: `src/data/auth.ts`
- Modify: `manifest.config.ts` ("identity" izni)

> Doğrulama: tip denetimi + build; canlı OAuth kullanıcı tarafından.

- [ ] **Step 1: `manifest.config.ts`'te `permissions` dizisine ekle**

Mevcut `permissions: ['storage']` satırını şununla değiştir:
```ts
  permissions: ['storage', 'identity', 'alarms'],
```

- [ ] **Step 2: `src/data/auth.ts` oluştur**

```ts
import { CLOUD, cloudConfigured } from './cloud-config';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

const SESSION_KEY = 'cloud_session';

export type Provider = 'google' | 'twitter';

function redirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

// Supabase OAuth akışı: launchWebAuthFlow ile authorize URL açılır,
// dönen fragment'tan access/refresh token alınır.
export async function signIn(provider: Provider): Promise<Session> {
  if (!cloudConfigured()) throw new Error('cloud_not_configured');
  const authUrl =
    `${CLOUD.url}/auth/v1/authorize?provider=${provider}` +
    `&redirect_to=${encodeURIComponent(redirectUrl())}`;

  const redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  if (!redirect) throw new Error('auth_cancelled');

  const fragment = new URL(redirect).hash.replace(/^#/, '');
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = Number(params.get('expires_in') ?? '3600');
  if (!accessToken || !refreshToken) throw new Error('no_token');

  const session: Session = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

async function readSession(): Promise<Session | null> {
  const raw = await chrome.storage.local.get([SESSION_KEY]);
  return (raw[SESSION_KEY] as Session | undefined) ?? null;
}

async function refresh(session: Session): Promise<Session | null> {
  try {
    const res = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLOUD.anonKey },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    const next: Session = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    await chrome.storage.local.set({ [SESSION_KEY]: next });
    return next;
  } catch {
    return null;
  }
}

// Geçerli (gerekirse yenilenmiş) oturum; yoksa null.
export async function getValidSession(): Promise<Session | null> {
  const session = await readSession();
  if (!session) return null;
  if (Date.now() < session.expiresAt - 60_000) return session;
  return refresh(session);
}

export async function isSignedIn(): Promise<boolean> {
  return (await getValidSession()) !== null;
}

export async function signOut(): Promise<void> {
  await chrome.storage.local.remove([SESSION_KEY]);
}
```

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/auth.ts manifest.config.ts
git commit -m "feat(data): Supabase OAuth giriş ve oturum yönetimi"
```

---

## Task 7: Mesajlaşma tiplerini genişlet

**Files:**
- Modify: `src/shared/messaging.ts`

- [ ] **Step 1: `RuntimeMessage` birleşimini genişlet**

Mevcut `RuntimeMessage` union'ına yeni varyantlar ekle (mevcutları KORU):
```ts
export type RuntimeMessage =
  | { type: 'LISTS_CHANGED' }
  | { type: 'SETTINGS_CHANGED' }
  | { type: 'TOGGLE_OVERLAY' }
  | { type: 'LOAD_ALL' }
  | { type: 'VERDICTS_SYNCED' }
  | { type: 'AUTH_CHANGED' };
```
`broadcast` ve `onMessage` aynı kalır.

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/messaging.ts
git commit -m "feat(shared): VERDICTS_SYNCED ve AUTH_CHANGED mesaj tipleri"
```

---

## Task 8: collapse.ts — mekaniği dışa aktar

**Files:**
- Modify: `src/content/collapse.ts`

> Mevcut `applyCollapse(article, lists)` davranışı ve testi (`tests/content/collapse.test.ts`) KORUNMALI. Sadece yeniden kullanım için mekaniği ayrı fonksiyonlara çıkarıyoruz.

- [ ] **Step 1: `src/content/collapse.ts`'i şu şekilde güncelle**

Dosyanın tamamını şununla değiştir (mevcut `applyCollapse`/`restore` davranışı korunur, ayrıca `collapseArticle`/`restoreArticle` dışa aktarılır):
```ts
import { getHandleFromArticle } from './adapters/x-selectors';
import { decideAction } from '../core/filter-engine';
import type { Lists } from '../core/models';

const COLLAPSED = 'data-xcf-collapsed';
const BAR = 'data-xcf-bar';
const HIDDEN = 'data-xcf-prev-display';

// Bir article'ı içeriğini silmeden gizler ve etiketli bir çubuk ekler.
export function collapseArticle(article: HTMLElement, label: string, marker: string): void {
  if (article.getAttribute(COLLAPSED)) return;
  article.setAttribute(COLLAPSED, marker);

  for (const child of Array.from(article.children)) {
    const el = child as HTMLElement;
    el.setAttribute(HIDDEN, el.style.display);
    el.style.display = 'none';
  }

  const bar = document.createElement('div');
  bar.setAttribute(BAR, '1');
  bar.style.cssText =
    'padding:12px 16px;color:#71767b;font-size:14px;display:flex;justify-content:space-between;align-items:center;';

  const span = document.createElement('span');
  span.textContent = label;
  bar.appendChild(span);

  const showBtn = document.createElement('button');
  showBtn.textContent = 'Göster';
  showBtn.style.cssText =
    'background:transparent;border:1px solid #536471;color:#e7e9ea;border-radius:9999px;padding:4px 12px;cursor:pointer;';
  showBtn.addEventListener('click', () => restoreArticle(article));
  bar.appendChild(showBtn);

  article.appendChild(bar);
}

export function restoreArticle(article: HTMLElement): void {
  article.removeAttribute(COLLAPSED);
  for (const child of Array.from(article.children)) {
    const el = child as HTMLElement;
    if (el.hasAttribute(BAR)) { el.remove(); continue; }
    if (el.hasAttribute(HIDDEN)) {
      el.style.display = el.getAttribute(HIDDEN) ?? '';
      el.removeAttribute(HIDDEN);
    }
  }
}

export function isCollapsed(article: HTMLElement): boolean {
  return article.hasAttribute(COLLAPSED);
}

export function collapsedMarker(article: HTMLElement): string | null {
  return article.getAttribute(COLLAPSED);
}

// Faz 1 davranışı: manuel engelleme listesine göre collapse / geri aç.
export function applyCollapse(article: HTMLElement, lists: Lists): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;
  const action = decideAction(handle, lists);
  if (action !== 'collapse') {
    if (article.getAttribute(COLLAPSED) === handle) restoreArticle(article);
    return;
  }
  collapseArticle(article, `@${handle} engellendi`, handle);
}
```

- [ ] **Step 2: Faz 1 collapse testinin hâlâ geçtiğini doğrula**

Run: `npm test -- collapse`
Expected: PASS (mevcut `tests/content/collapse.test.ts` — gizleme/geri açma davranışı korunur).

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/content/collapse.ts
git commit -m "refactor(content): collapse mekaniğini yeniden kullanım için dışa aktar"
```

---

## Task 9: community-apply — kararı DOM'a uygula (badge/collapse/remove)

**Files:**
- Create: `src/content/community-apply.ts`

- [ ] **Step 1: `src/content/community-apply.ts` oluştur**

```ts
import type { FilterDecision } from '../core/models';
import { CATEGORY_LABELS } from '../core/models';
import { collapseArticle, restoreArticle, isCollapsed } from './collapse';

const BADGE = 'data-xcf-badge';
const REMOVED = 'data-xcf-removed';
const PREV_DISPLAY = 'data-xcf-removed-prev';

function clearBadge(article: HTMLElement): void {
  const existing = article.querySelector(`[${BADGE}]`);
  if (existing) existing.remove();
}

function addBadge(article: HTMLElement, decision: FilterDecision): void {
  if (article.querySelector(`[${BADGE}]`)) return;
  const label = decision.category ? CATEGORY_LABELS[decision.category] : 'Topluluk uyarısı';
  const badge = document.createElement('div');
  badge.setAttribute(BADGE, '1');
  badge.textContent = `⚠ Topluluk: ${label}`;
  badge.style.cssText =
    'margin:4px 16px;padding:2px 10px;border:1px solid #f4a261;color:#f4a261;' +
    'border-radius:9999px;font-size:12px;display:inline-block;';
  article.prepend(badge);
}

function removeArticle(article: HTMLElement): void {
  if (article.getAttribute(REMOVED)) return;
  article.setAttribute(REMOVED, '1');
  article.setAttribute(PREV_DISPLAY, article.style.display);
  article.style.display = 'none';
}

function unremove(article: HTMLElement): void {
  if (!article.getAttribute(REMOVED)) return;
  article.style.display = article.getAttribute(PREV_DISPLAY) ?? '';
  article.removeAttribute(REMOVED);
  article.removeAttribute(PREV_DISPLAY);
}

// Topluluk kararını idempotent uygular. handle, collapse marker'ı olarak kullanılır.
export function applyDecision(article: HTMLElement, handle: string, decision: FilterDecision): void {
  // Önce diğer durumlardan temizle (karar değişmiş olabilir)
  if (decision.action !== 'badge') clearBadge(article);
  if (decision.action !== 'remove') unremove(article);

  switch (decision.action) {
    case 'show':
      if (isCollapsed(article)) restoreArticle(article);
      return;
    case 'collapse': {
      const label = decision.reason === 'blocklist'
        ? `@${handle} engellendi`
        : `@${handle} — topluluk filtresi`;
      collapseArticle(article, label, handle);
      return;
    }
    case 'badge':
      if (isCollapsed(article)) restoreArticle(article);
      addBadge(article, decision);
      return;
    case 'remove':
      removeArticle(article);
      return;
  }
}
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/community-apply.ts
git commit -m "feat(content): topluluk kararını DOM'a uygulayan applyDecision"
```

---

## Task 10: report-menu — kategori rapor menüsü

**Files:**
- Create: `src/content/report-menu.ts`

- [ ] **Step 1: `src/content/report-menu.ts` oluştur**

```ts
import { getHandleFromArticle, findActionBar } from './adapters/x-selectors';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../core/models';

const MARK = 'data-xcf-report-injected';

export interface ReportMenuCallbacks {
  isSignedIn: () => boolean;
  onReport: (handle: string, category: Category) => void;
  onNeedLogin: () => void;
}

function buildMenu(handle: string, cb: ReportMenuCallbacks): HTMLElement {
  const menu = document.createElement('div');
  menu.style.cssText =
    'position:absolute;z-index:99999;background:#15181c;border:1px solid #2f3336;' +
    'border-radius:12px;padding:6px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.5);';

  if (!cb.isSignedIn()) {
    const item = document.createElement('button');
    item.textContent = 'Rapor vermek için giriş yap';
    item.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:#1d9bf0;padding:8px 12px;cursor:pointer;';
    item.addEventListener('click', () => { cb.onNeedLogin(); menu.remove(); });
    menu.appendChild(item);
    return menu;
  }

  for (const cat of CATEGORIES) {
    const item = document.createElement('button');
    item.textContent = CATEGORY_LABELS[cat];
    item.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:#e7e9ea;padding:8px 12px;cursor:pointer;border-radius:8px;';
    item.addEventListener('mouseenter', () => { item.style.background = '#1d2127'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', () => { cb.onReport(handle, cat); menu.remove(); });
    menu.appendChild(item);
  }
  return menu;
}

// Her gönderiye "Rapor et" butonu ekler; tıklanınca kategori menüsü açar.
export function injectReportButton(article: HTMLElement, cb: ReportMenuCallbacks): void {
  if (article.hasAttribute(MARK)) return;
  const bar = findActionBar(article);
  const handle = getHandleFromArticle(article);
  if (!bar || !handle) return;

  article.setAttribute(MARK, '1');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = `@${handle} hesabını raporla`;
  btn.textContent = '🚩';
  btn.style.cssText = 'background:transparent;border:none;cursor:pointer;color:#71767b;font-size:15px;padding:0 8px;';

  let open: HTMLElement | null = null;
  const close = () => { open?.remove(); open = null; document.removeEventListener('click', onDocClick, true); };
  const onDocClick = (e: MouseEvent) => { if (open && !open.contains(e.target as Node) && e.target !== btn) close(); };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) { close(); return; }
    const menu = buildMenu(handle, cb);
    document.body.appendChild(menu);
    const rect = btn.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    open = menu;
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  });

  bar.appendChild(btn);
}
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/report-menu.ts
git commit -m "feat(content): kategori rapor menüsü enjektörü"
```

---

## Task 11: background — alarm tabanlı flagged-list senkronu

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: `src/background/service-worker.ts`'i güncelle**

Dosyanın tamamını şununla değiştir (mevcut storage→tabs yayını KORUNUR, üstüne alarm senkronu eklenir):
```ts
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

  const cache = (stored[CACHE_KEY] as Record<string, { verdict: unknown; fetchedAt: number }> | undefined) ?? {};
  const now = Date.now();
  let newest = since;
  for (const v of flagged) {
    cache[v.handle] = { verdict: v, fetchedAt: now };
  }
  // En yeni updated_at'i bir sonraki artımlı senkron için sakla (sunucu döndürmüyorsa now kullan)
  newest = new Date(now).toISOString();

  await chrome.storage.local.set({ [CACHE_KEY]: cache, [SINCE_KEY]: newest });
  chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'VERDICTS_SYNCED' }).catch(() => {});
    }
  });
}
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat(background): alarm tabanlı flagged-list senkronu"
```

---

## Task 12: orchestrator — verdikt çek + decideFilter + applyDecision

**Files:**
- Modify: `src/content/orchestrator.ts`

> Bu, içerik script'inin entegrasyon noktası. Faz 1 sıralama/overlay/manuel engelleme davranışı korunur; üstüne verdikt-farkında filtreleme eklenir.

- [ ] **Step 1: `src/content/orchestrator.ts`'i güncelle**

Aşağıdaki tam içerikle değiştir:
```ts
import { DataProvider, createChromeBackend } from '../data/data-provider';
import { ReplyCollector } from './collector';
import { SortedOverlay } from './overlay/overlay';
import { injectBlockButton } from './block-injector';
import { injectReportButton } from './report-menu';
import { applyDecision } from './community-apply';
import { loadAllReplies } from './auto-scroll';
import { sortReplies } from '../core/sort-engine';
import { decideFilter } from '../core/filter-engine';
import { findReplyArticles, getHandleFromArticle } from './adapters/x-selectors';
import { onMessage } from '../shared/messaging';
import { VerdictCache } from '../data/verdict-cache';
import { fetchVerdicts, submitReport } from '../data/cloud-provider';
import { getValidSession } from '../data/auth';
import { cloudConfigured } from '../data/cloud-config';
import type { Settings, Lists, Category } from '../core/models';

const VERDICT_TTL_MS = 24 * 60 * 60 * 1000;

const dp = new DataProvider(createChromeBackend());
const collector = new ReplyCollector();
const verdicts = new VerdictCache(VERDICT_TTL_MS);

let settings: Settings;
let lists: Lists;
let overlay: SortedOverlay | null = null;
let overlayVisible = false;
let loadingAll = false;
let observer: MutationObserver;
let scheduled = false;
let lastSig = '';
let signedIn = false;
const pendingHandles = new Set<string>();
let fetchTimer: number | undefined;

function isThreadPage(): boolean {
  return /\/status\/\d+/.test(location.pathname);
}

function refreshOverlay(force = false): void {
  if (!overlay || !overlayVisible) return;
  const sorted = sortReplies(collector.all(), settings.tieBreaker);
  const sig = sorted.map((r) => `${r.id}:${r.likes}`).join(',') + `|${loadingAll}`;
  if (!force && sig === lastSig) return;
  lastSig = sig;
  overlay.render(sorted, loadingAll);
}

function mountOverlayIfNeeded(): void {
  if (!isThreadPage() || !overlayVisible) return;
  const firstArticle = document.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!firstArticle) return;
  if (!overlay) {
    overlay = new SortedOverlay(settings.animationsEnabled, {
      onLoadAll: () => { void doLoadAll(); },
      onClose: () => toggleOverlay(false),
    });
  }
  overlay.mountBefore(firstArticle);
}

function toggleOverlay(show: boolean): void {
  overlayVisible = show;
  if (!show) { overlay?.unmount(); return; }
  mountOverlayIfNeeded();
  refreshOverlay(true);
}

async function doLoadAll(): Promise<void> {
  if (loadingAll) return;
  loadingAll = true;
  refreshOverlay(true);
  await loadAllReplies({ delayMs: settings.autoScrollDelayMs, onStep: () => collector.ingestFrom(document) });
  loadingAll = false;
  refreshOverlay(true);
}

// Görünen handle'lardan eksik verdiktleri toplayıp debounce ile toplu çeker.
function queueVerdictFetch(handle: string): void {
  if (!cloudConfigured() || !settings.community.enabled) return;
  if (verdicts.missing([handle]).length === 0) return;
  pendingHandles.add(handle);
  if (fetchTimer !== undefined) return;
  fetchTimer = setTimeout(() => { void flushVerdictFetch(); }, 500) as unknown as number;
}

async function flushVerdictFetch(): Promise<void> {
  fetchTimer = undefined;
  const handles = verdicts.missing([...pendingHandles]);
  pendingHandles.clear();
  if (handles.length === 0) return;
  const fetched = await fetchVerdicts(handles);
  verdicts.setMany(fetched);
  // Çekilenler için ayrıca eksik kalanları (sunucuda kaydı olmayanlar) "clean" say.
  for (const h of handles) {
    if (!fetched.some((v) => v.handle === h)) {
      verdicts.set({ handle: h, state: 'clean', topCategory: null, maxScore: 0 });
    }
  }
  scanAndApply();
}

function applyToArticle(article: HTMLElement): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;
  const verdict = verdicts.get(handle);
  if (verdict === null) queueVerdictFetch(handle);
  const decision = decideFilter(handle, lists, verdict, settings.community);
  if (decision.autoblock) {
    void dp.addToBlocklist(handle);
  }
  applyDecision(article, handle, decision);
}

function processArticles(): void {
  collector.ingestFrom(document);
  for (const article of findReplyArticles(document)) {
    injectBlockButton(article, {
      onBlock: async (handle) => {
        await dp.addToBlocklist(handle);
        lists = await dp.getLists();
        scanAndApply();
      },
    });
    injectReportButton(article, {
      isSignedIn: () => signedIn,
      onReport: (handle, category) => { void doReport(handle, category); },
      onNeedLogin: () => { void chrome.runtime.openOptionsPage(); },
    });
    applyToArticle(article);
  }
  if (overlayVisible) { mountOverlayIfNeeded(); refreshOverlay(); }
}

function scanAndApply(): void {
  for (const article of findReplyArticles(document)) applyToArticle(article);
}

async function doReport(handle: string, category: Category): Promise<void> {
  const session = await getValidSession();
  if (!session) { void chrome.runtime.openOptionsPage(); return; }
  const result = await submitReport(handle, category, session.accessToken);
  if (result.ok && result.verdict) {
    verdicts.set(result.verdict);
    scanAndApply();
  }
}

function scheduleProcess(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    observer.disconnect();
    try { processArticles(); }
    finally { observer.observe(document.body, { childList: true, subtree: true }); }
  });
}

async function loadVerdictCacheFromStorage(): Promise<void> {
  const raw = await chrome.storage.local.get(['verdict_cache']);
  verdicts.loadFrom(raw['verdict_cache'] as Record<string, never> | undefined);
}

async function init(): Promise<void> {
  settings = await dp.getSettings();
  lists = await dp.getLists();
  signedIn = (await getValidSession()) !== null;
  await loadVerdictCacheFromStorage();
  overlayVisible = settings.overlayEnabledByDefault && isThreadPage();

  observer = new MutationObserver(scheduleProcess);
  observer.observe(document.body, { childList: true, subtree: true });

  onMessage(async (msg) => {
    if (msg.type === 'LISTS_CHANGED') { lists = await dp.getLists(); scanAndApply(); }
    if (msg.type === 'SETTINGS_CHANGED') { settings = await dp.getSettings(); refreshOverlay(true); scanAndApply(); }
    if (msg.type === 'TOGGLE_OVERLAY') { toggleOverlay(!overlayVisible); }
    if (msg.type === 'LOAD_ALL') { void doLoadAll(); }
    if (msg.type === 'AUTH_CHANGED') { signedIn = (await getValidSession()) !== null; }
    if (msg.type === 'VERDICTS_SYNCED') { await loadVerdictCacheFromStorage(); scanAndApply(); }
  });

  processArticles();
}

void init();
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Tüm testlerin geçtiğini doğrula**

Run: `npm test`
Expected: PASS (Faz 1 + Faz 2A trust-core + yeni Plan B testleri).

- [ ] **Step 4: Commit**

```bash
git add src/content/orchestrator.ts
git commit -m "feat(content): verdikt-farkında orchestrator (çek + decideFilter + applyDecision)"
```

---

## Task 13: Ayarlar — "Topluluk filtresi" sekmesi + giriş

**Files:**
- Modify: `src/ui/options/options.tsx`

- [ ] **Step 1: `src/ui/options/options.tsx`'e topluluk sekmesi ekle**

Mevcut dosyada şu değişiklikleri yap:

(a) Importlara ekle:
```tsx
import { CATEGORIES, CATEGORY_LABELS, type Category, type CommunityFilterSettings } from '../../core/models';
import { signIn, signOut, isSignedIn } from '../../data/auth';
import { cloudConfigured } from '../../data/cloud-config';
```

(b) `Tab` tipini genişlet:
```tsx
type Tab = 'sorting' | 'block' | 'white' | 'community' | 'appearance';
```

(c) Sekme düğmeleri satırına (diğer `xcf-tab` butonlarının yanına) ekle:
```tsx
        <button class={`xcf-tab ${tab === 'community' ? 'xcf-tab--active' : ''}`} onClick={() => setTab('community')}>Topluluk filtresi</button>
```

(d) `Options` bileşeninin içinde, `lists` state'inden sonra giriş durumu state'i ve yardımcılar ekle:
```tsx
  const [authed, setAuthed] = useState(false);
  useEffect(() => { isSignedIn().then(setAuthed); }, []);
  const saveCommunity = async (next: CommunityFilterSettings) => {
    await save({ ...settings, community: next });
  };
  const toggleCategory = (cat: Category) => {
    const set = new Set(settings.community.enabledCategories);
    if (set.has(cat)) set.delete(cat); else set.add(cat);
    void saveCommunity({ ...settings.community, enabledCategories: [...set] });
  };
```

(e) `appearance` sekmesi bloğundan ÖNCE, topluluk sekmesi bloğunu ekle:
```tsx
      {tab === 'community' && (
        <div>
          {!cloudConfigured() && (
            <p style="color:#f4a261;">Bulut yapılandırılmadı (src/data/cloud-config.ts). Topluluk özellikleri devre dışı.</p>
          )}
          <div class="xcf-row">
            <span>Giriş durumu</span>
            {authed ? (
              <button class="xcf-del" onClick={async () => { await signOut(); setAuthed(false); }}>Çıkış yap</button>
            ) : (
              <span style="display:flex;gap:8px;">
                <button class="xcf-accent-btn" disabled={!cloudConfigured()}
                  onClick={async () => { try { await signIn('google'); setAuthed(true); } catch {} }}>Google ile giriş</button>
                <button class="xcf-accent-btn" disabled={!cloudConfigured()}
                  onClick={async () => { try { await signIn('twitter'); setAuthed(true); } catch {} }}>X ile giriş</button>
              </span>
            )}
          </div>
          <div class="xcf-row">
            <span>Topluluk filtresi açık</span>
            <input type="checkbox" checked={settings.community.enabled}
              onChange={(e) => saveCommunity({ ...settings.community, enabled: (e.target as HTMLInputElement).checked })} />
          </div>
          <div class="xcf-row">
            <span>Şüpheli hesap eylemi</span>
            <select class="xcf-input" style="flex:0 0 180px;" value={settings.community.suspiciousAction}
              onChange={(e) => saveCommunity({ ...settings.community, suspiciousAction: (e.target as HTMLSelectElement).value as CommunityFilterSettings['suspiciousAction'] })}>
              <option value="off">Kapalı</option>
              <option value="badge">Uyarı rozeti</option>
              <option value="collapse">Gizle</option>
            </select>
          </div>
          <div class="xcf-row">
            <span>İşaretli (flagged) hesap eylemi</span>
            <select class="xcf-input" style="flex:0 0 180px;" value={settings.community.flaggedAction}
              onChange={(e) => saveCommunity({ ...settings.community, flaggedAction: (e.target as HTMLSelectElement).value as CommunityFilterSettings['flaggedAction'] })}>
              <option value="warn">Uyarı rozeti</option>
              <option value="collapse">Gizle</option>
              <option value="remove">Tamamen kaldır</option>
              <option value="autoblock">Otomatik engelle</option>
            </select>
          </div>
          <div style="padding:12px 0;">
            <div style="margin-bottom:8px;">Uygulanacak kategoriler</div>
            {CATEGORIES.map((cat) => (
              <label key={cat} style="display:flex;align-items:center;gap:8px;padding:4px 0;">
                <input type="checkbox" checked={settings.community.enabledCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)} />
                <span>{CATEGORY_LABELS[cat]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 2: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/options/options.tsx
git commit -m "feat(ui): Topluluk filtresi ayar sekmesi ve giriş"
```

---

## Task 14: Popup — giriş durumu + build + doğrulama + dokümanlar

**Files:**
- Modify: `src/ui/popup/popup.tsx`, `docs/BACKEND.md`, `README.md`

- [ ] **Step 1: `src/ui/popup/popup.tsx`'e giriş durumu satırı ekle**

(a) Importlara ekle:
```tsx
import { isSignedIn } from '../../data/auth';
```
(b) `Popup` bileşeninde `blocked` state'inin yanına ekle:
```tsx
  const [authed, setAuthed] = useState(false);
  useEffect(() => { isSignedIn().then(setAuthed); }, []);
```
(c) "Engellenen hesap" paragrafının altına ekle:
```tsx
      <p style="color:var(--xcf-muted);margin:0 0 12px;">Topluluk girişi: {authed ? 'Açık' : 'Kapalı'}</p>
```

- [ ] **Step 2: `docs/BACKEND.md` sonuna uzantı kurulum notu ekle**

```markdown

## Uzantı tarafı bağlama (Plan B)
1. Supabase projenizi oluşturup deploy ettikten sonra `src/data/cloud-config.ts`
   içine projenizin `url` (https://<ref>.supabase.co) ve **anon** anahtarını yazın.
2. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs'e
   uzantının redirect URL'sini ekleyin: `https://<EXTENSION_ID>.chromiumapp.org/`
   (Extension ID'yi `chrome://extensions` sayfasında görebilirsiniz.)
3. Authentication → Providers'tan Google ve/veya Twitter (X) sağlayıcılarını
   etkinleştirin.
4. `npm run build` → `dist/`'i Chrome'a yükleyin. Ayarlar → "Topluluk filtresi"
   sekmesinden giriş yapıp raporlama ve filtrelemeyi test edin.
```

- [ ] **Step 3: `README.md` özellikler bölümünü güncelle**

`README.md` içindeki özellik listesine bir madde ekle:
```markdown
- **Topluluk filtresi (Faz 2):** OAuth giriş, hesapları 7 kategoride raporlama,
  bulut güven verdiktlerine göre kullanıcı seçimli filtreleme (rozet/gizle/kaldır/
  otomatik engelle), periyodik + talep üzerine verdikt senkronu. Bulut
  yapılandırması için `docs/BACKEND.md`'ye bakın.
```

- [ ] **Step 4: Tüm kontroller**

Run: `npm test && npm run typecheck && npm run typecheck:functions && npm run build`
Expected: Tüm testler PASS; üç kontrol de temiz; `dist/` üretildi.

- [ ] **Step 5: Manuel doğrulama kontrol listesi (kullanıcı, bulut canlıyken)**

- [ ] `src/data/cloud-config.ts` doldurulup `npm run build` sonrası uzantı yüklenir.
- [ ] Ayarlar → Topluluk filtresi → Google/X ile giriş başarılı; popup "Topluluk girişi: Açık" gösterir.
- [ ] Bir gönderide 🚩 menüsünden kategori seçilince rapor gönderilir (ağ sekmesinde 200).
- [ ] `flagged` bir hesabın içeriği seçilen eyleme göre (rozet/gizle/kaldır) işlenir.
- [ ] Beyaz liste ve manuel engelleme, bulut verdiktinden önceliklidir.
- [ ] Kategori kapatılınca o kategorideki verdikt uygulanmaz.
- [ ] 6 saatlik alarm veya yeniden yükleme sonrası flagged-list senkronu cache'i günceller.

- [ ] **Step 6: Commit**

```bash
git add src/ui/popup/popup.tsx docs/BACKEND.md README.md
git commit -m "feat(ui): popup giriş durumu; uzantı bağlama dokümanları"
```

---

## Öz-Denetim Notları (plan yazarı)

- **Spec §7 kapsamı:**
  - §7.1 Kimlik/giriş → Task 6 (auth), Task 13/14 (UI giriş).
  - §7.2 Rapor arayüzü → Task 10 (report-menu), Task 12 (doReport).
  - §7.3 Verdikt teslimi (hibrit) → Task 11 (alarm/flagged-list), Task 12 (talep üzerine fetchVerdicts + TTL cache).
  - §7.4 Filtre entegrasyonu (öncelik) → Task 2 (decideFilter), Task 9 (applyDecision), Task 12 (uygulama).
  - §7.5 Davranış ayarları → Task 1 (model), Task 13 (sekme: durum→eylem, kategori aç/kapa, güvenli varsayılanlar).
  - §7.6 Modüller → cloud-provider (T5), verdict-cache (T3), report-menu (T10), background sync (T11), filter-engine (T2), options (T13).
- **Tip tutarlılığı:** `Verdict`, `Category`, `CommunityFilterSettings`, `FilterDecision` Task 1'de tanımlandı; `decideFilter`, `VerdictCache`, `mapVerdictRow`, `fetchVerdicts/fetchFlaggedList/submitReport`, `getValidSession/signIn/signOut/isSignedIn`, `injectReportButton`, `applyDecision`, `collapseArticle/restoreArticle/isCollapsed` imzaları tüm kullanım yerleriyle eşleşir.
- **Geriye dönük uyumluluk:** Faz 1 `applyCollapse` ve testi korunur (Task 8); `decideAction` saf hâliyle durur; `DEFAULT_SETTINGS` birleştirmesi eski kullanıcılara `community` ekler.
- **Yer tutucu yok:** `cloud-config.ts`'teki boş `url`/`anonKey` kod yer tutucusu değil, kullanıcı dağıtım yapılandırmasıdır; `cloudConfigured()` ile zarif şekilde devre dışı kalır.
- **Sınır:** Bulut I/O, OAuth, DOM, UI tip denetimi + build ile; canlı doğrulama kullanıcı tarafından (Task 14 Step 5).
```
