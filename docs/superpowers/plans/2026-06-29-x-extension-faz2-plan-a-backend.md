# X Uzantısı Faz 2 — Plan A: Backend & Güven Motoru

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase üzerinde topluluk raporlama, kategori bazlı hesap güven puanı ve konsensüs uyumlu raporlayan itibarı sağlayan, güven matematiği saf TypeScript'te tamamen test edilen bir backend kurmak.

**Architecture:** Güven/itibar matematiği saf TypeScript (`supabase/functions/_shared/trust-core/`) olarak yazılır ve Vitest ile TDD edilir. Supabase Edge Functions (Deno) bu saf çekirdeği import edip yalnızca DB I/O + auth yapar. Postgres şema + RLS + kısıtlar migration'larla tanımlanır. Edge Functions ve RLS, kullanıcı tarafından çalıştırılan yerel Supabase yığını (`supabase start`) ile doğrulanır.

**Tech Stack:** Supabase (Postgres + Auth + Edge Functions/Deno), TypeScript, Vitest (trust-core testleri), Supabase CLI.

---

## Önemli not: ortam ve sınırlar

- **`trust-core/` (Tasks 1-6)** tamamen Vitest ile otomatik doğrulanır — sistemin kalbi burada ve subagent'lar tarafından tam test edilebilir.
- **Supabase tarafı (Tasks 7-11)** — migration SQL ve Edge Function (Deno) kodu yazılır; otomatik doğrulama `tsconfig.functions` tip denetimi + (varsa) `deno check` ile sınırlıdır. **Canlı bütünleşme doğrulaması (RLS, uçtan uca uç noktalar) kullanıcı tarafından `supabase start` ile yapılır** — bu adımlar Task 11'de net listelenir. Bu, backend işinin doğası gereğidir (Faz 1'deki "Chrome'a yükle" manuel adımı gibi).
- Deno import'ları `.ts` uzantısı gerektirir; bu yüzden `trust-core` dosyaları birbirini `.ts` uzantısıyla import eder. Vitest (Vite/esbuild) bunu çalışma anında çözer; ana uzantı `tsconfig`'i `supabase/`'i hariç tutar.

---

## Dosya Yapısı

```
tsconfig.json                                  # MODIFY: supabase + tests/trust-core hariç tut
tsconfig.functions.json                        # CREATE: trust-core + testleri için tip denetimi
package.json                                    # MODIFY: typecheck:functions script'i
.env.example                                    # CREATE: Edge Function gizli anahtar şablonu
docs/BACKEND.md                                 # CREATE: Supabase kurulum + doğrulama rehberi
supabase/config.toml                            # CREATE: minimal Supabase yapılandırması
supabase/migrations/0001_init.sql               # CREATE: şema, enum, kısıt, indeks, RLS, trigger
supabase/functions/_shared/trust-core/
  ├─ types.ts                                   # Category, AccountState, ReportInput, CategoryAggregate, AccountVerdict
  ├─ config.ts                                  # TrustConfig + DEFAULT_CONFIG
  ├─ util.ts                                    # normalizeHandle
  ├─ scoring.ts                                 # decay, categoryScore
  ├─ verdict.ts                                 # categoryState, computeVerdict
  ├─ reputation.ts                              # reputationFromConsensus, classifyConsensus, tallyReputation
  └─ index.ts                                   # barrel
supabase/functions/_shared/http.ts             # json() yardımcı + CORS
supabase/functions/submit_report/index.ts      # Auth'lu rapor + verdikt yeniden hesaplama
supabase/functions/get_verdicts/index.ts       # Toplu verdikt okuma (anon)
supabase/functions/get_flagged_list/index.ts   # flagged liste (anon, artımlı)
supabase/functions/recompute_reputations/index.ts # cron: itibar yeniden hesaplama
tests/trust-core/
  ├─ util.test.ts
  ├─ scoring.test.ts
  ├─ verdict.test.ts
  └─ reputation.test.ts
```

---

## Task 1: Yapılandırma — tsconfig bölmesi + Supabase iskeleti

**Files:**
- Modify: `tsconfig.json`
- Create: `tsconfig.functions.json`, `package.json` (script), `supabase/config.toml`, `.env.example`

- [ ] **Step 1: `tsconfig.json`'a exclude ekle**

Mevcut `tsconfig.json` içindeki `"include"` dizisinden SONRA, kök objeye şu alanı ekle (varsa birleştir):
```json
  "exclude": ["node_modules", "dist", "supabase", "tests/trust-core"]
```
Bu, ana uzantı tip denetiminin (`npm run typecheck`) Deno/.ts-uzantılı dosyalara dokunmamasını sağlar.

- [ ] **Step 2: `tsconfig.functions.json` oluştur**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["supabase/functions/_shared/trust-core", "tests/trust-core"]
}
```
Not: Bu yalnızca saf `trust-core` + testlerini denetler (Deno URL import'lu Edge Function'ları DEĞİL; onlar `deno check`/Supabase ile doğrulanır).

- [ ] **Step 3: `package.json`'a script ekle**

`"scripts"` objesine ekle:
```json
    "typecheck:functions": "tsc -p tsconfig.functions.json"
```

- [ ] **Step 4: `supabase/config.toml` oluştur**

```toml
project_id = "x-extension"

[api]
enabled = true
port = 54321
schemas = ["public"]
extra_search_path = ["public"]
max_rows = 1000

[db]
port = 54322
major_version = 15

[auth]
enabled = true
site_url = "http://localhost"

[functions.submit_report]
verify_jwt = false

[functions.get_verdicts]
verify_jwt = false

[functions.get_flagged_list]
verify_jwt = false

[functions.recompute_reputations]
verify_jwt = false
```
(JWT doğrulamasını fonksiyon içinde elle yapacağız; `submit_report` Authorization başlığını kendi kontrol eder.)

- [ ] **Step 5: `.env.example` oluştur**

```
# Edge Functions için gerekli ortam değişkenleri (Supabase otomatik sağlar:
# SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
# Yerel geliştirme için `supabase start` çıktısındaki değerleri kullanın.
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 6: Mevcut testlerin hâlâ geçtiğini ve typecheck'in temiz olduğunu doğrula**

Run: `npm test && npm run typecheck`
Expected: Faz 1 testleri (26) PASS; typecheck hatasız (supabase hariç tutulduğu için).

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsconfig.functions.json package.json supabase/config.toml .env.example
git commit -m "chore(backend): Supabase iskeleti ve tsconfig bölmesi"
```

---

## Task 2: trust-core tipleri + yapılandırma

**Files:**
- Create: `supabase/functions/_shared/trust-core/types.ts`, `supabase/functions/_shared/trust-core/config.ts`

- [ ] **Step 1: `types.ts` oluştur**

```ts
export type Category =
  | 'bot' | 'spam' | 'crypto' | 'fake_giveaway' | 'ads' | 'ai_bot' | 'harassment';

export const CATEGORIES: Category[] =
  ['bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment'];

export type AccountState = 'clean' | 'suspicious' | 'flagged';

// Tek bir raporun ağırlıklı puana katkısı için gereken girdiler.
export interface ReportInput {
  reporterReputation: number;
  ageDays: number;
}

export interface CategoryAggregate {
  category: Category;
  weightedScore: number;
  reporterCount: number;
}

export interface AccountVerdict {
  state: AccountState;
  topCategory: Category | null;
  maxScore: number;
  categories: CategoryAggregate[];
}

// Bir raporlayanın tek bir raporunun konsensüs bağlamı (itibar hesabı için).
export interface ReporterReportContext {
  categoryState: AccountState;
  categoryReporterCount: number;
}
```

- [ ] **Step 2: `config.ts` oluştur**

```ts
export interface TrustConfig {
  halfLifeDays: number;
  suspiciousScore: number;
  suspiciousReporters: number;
  flaggedScore: number;
  flaggedReporters: number;
  disagreementMinReporters: number;
  repAlpha: number;
  repBeta: number;
  repMax: number;
  baselineReputation: number;
  dailyReportLimit: number;
}

export const DEFAULT_CONFIG: TrustConfig = {
  halfLifeDays: 180,
  suspiciousScore: 2.0,
  suspiciousReporters: 2,
  flaggedScore: 5.0,
  flaggedReporters: 3,
  disagreementMinReporters: 3,
  repAlpha: 1,
  repBeta: 2,
  repMax: 3.0,
  baselineReputation: 1.0,
  dailyReportLimit: 50,
};
```

- [ ] **Step 3: typecheck:functions doğrula**

Run: `npm run typecheck:functions`
Expected: PASS (henüz test yok; sadece tip denetimi).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/trust-core/types.ts supabase/functions/_shared/trust-core/config.ts
git commit -m "feat(trust-core): tipler ve varsayılan güven yapılandırması"
```

---

## Task 3: trust-core — normalizeHandle (TDD)

**Files:**
- Create: `supabase/functions/_shared/trust-core/util.ts`
- Test: `tests/trust-core/util.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/trust-core/util.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeHandle } from '../../supabase/functions/_shared/trust-core/util.ts';

describe('normalizeHandle', () => {
  it('@ ve büyük harfi temizler, boşluğu kırpar', () => {
    expect(normalizeHandle('@SpamBot')).toBe('spambot');
    expect(normalizeHandle('  User  ')).toBe('user');
  });
  it('boş/geçersiz girdi boş string döner', () => {
    expect(normalizeHandle('')).toBe('');
    expect(normalizeHandle('   ')).toBe('');
    expect(normalizeHandle(null as unknown as string)).toBe('');
    expect(normalizeHandle(undefined as unknown as string)).toBe('');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- trust-core/util`
Expected: FAIL (modül yok).

- [ ] **Step 3: `util.ts` oluştur**

```ts
export function normalizeHandle(handle: string): string {
  if (!handle) return '';
  return handle.trim().replace(/^@/, '').toLowerCase();
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- trust-core/util`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/trust-core/util.ts tests/trust-core/util.test.ts
git commit -m "feat(trust-core): handle normalizasyonu"
```

---

## Task 4: trust-core — puanlama (decay + categoryScore) (TDD)

**Files:**
- Create: `supabase/functions/_shared/trust-core/scoring.ts`
- Test: `tests/trust-core/scoring.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/trust-core/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { decay, categoryScore } from '../../supabase/functions/_shared/trust-core/scoring.ts';
import { DEFAULT_CONFIG } from '../../supabase/functions/_shared/trust-core/config.ts';

describe('decay', () => {
  it('0 yaşta 1.0 döner', () => {
    expect(decay(0, 180)).toBe(1);
    expect(decay(-5, 180)).toBe(1);
  });
  it('yarı ömürde 0.5 döner', () => {
    expect(decay(180, 180)).toBeCloseTo(0.5, 5);
  });
  it('iki yarı ömürde 0.25 döner', () => {
    expect(decay(360, 180)).toBeCloseTo(0.25, 5);
  });
});

describe('categoryScore', () => {
  it('itibar ağırlıklarını taze raporlarda toplar', () => {
    const score = categoryScore([
      { reporterReputation: 1.0, ageDays: 0 },
      { reporterReputation: 2.0, ageDays: 0 },
    ]);
    expect(score).toBeCloseTo(3.0, 5);
  });
  it('eski raporları sönümler', () => {
    const score = categoryScore(
      [{ reporterReputation: 2.0, ageDays: 180 }],
      DEFAULT_CONFIG
    );
    expect(score).toBeCloseTo(1.0, 5); // 2.0 * 0.5
  });
  it('boş listede 0 döner', () => {
    expect(categoryScore([])).toBe(0);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- trust-core/scoring`
Expected: FAIL.

- [ ] **Step 3: `scoring.ts` oluştur**

```ts
import type { ReportInput } from './types.ts';
import { DEFAULT_CONFIG, type TrustConfig } from './config.ts';

export function decay(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function categoryScore(
  reports: ReportInput[],
  config: TrustConfig = DEFAULT_CONFIG
): number {
  return reports.reduce(
    (sum, r) => sum + r.reporterReputation * decay(r.ageDays, config.halfLifeDays),
    0
  );
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- trust-core/scoring`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/trust-core/scoring.ts tests/trust-core/scoring.test.ts
git commit -m "feat(trust-core): zaman sönümlü ağırlıklı kategori puanı"
```

---

## Task 5: trust-core — verdikt (categoryState + computeVerdict) (TDD)

**Files:**
- Create: `supabase/functions/_shared/trust-core/verdict.ts`
- Test: `tests/trust-core/verdict.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/trust-core/verdict.test.ts
import { describe, it, expect } from 'vitest';
import { categoryState, computeVerdict } from '../../supabase/functions/_shared/trust-core/verdict.ts';
import type { CategoryAggregate } from '../../supabase/functions/_shared/trust-core/types.ts';

describe('categoryState', () => {
  it('eşik altı temiz', () => {
    expect(categoryState(1.5, 5)).toBe('clean');
  });
  it('puan ve min-raporlayan sağlanınca suspicious', () => {
    expect(categoryState(2.0, 2)).toBe('suspicious');
  });
  it('puan yeterli ama raporlayan az ise temiz (tek kişi tırmandıramaz)', () => {
    expect(categoryState(99, 1)).toBe('clean');
  });
  it('puan ve raporlayan yeterince yüksekse flagged', () => {
    expect(categoryState(5.0, 3)).toBe('flagged');
  });
  it('flagged puanı var ama raporlayan < 3 ise yalnızca suspicious', () => {
    expect(categoryState(10, 2)).toBe('suspicious');
  });
});

describe('computeVerdict', () => {
  it('hiç toplam yoksa temiz, top kategori yok', () => {
    const v = computeVerdict([]);
    expect(v.state).toBe('clean');
    expect(v.topCategory).toBeNull();
  });
  it('en yüksek duruma sahip kategoriyi top seçer (durum > puan)', () => {
    const aggs: CategoryAggregate[] = [
      { category: 'ads', weightedScore: 4.0, reporterCount: 5 },      // suspicious
      { category: 'crypto', weightedScore: 6.0, reporterCount: 3 },   // flagged
    ];
    const v = computeVerdict(aggs);
    expect(v.state).toBe('flagged');
    expect(v.topCategory).toBe('crypto');
    expect(v.maxScore).toBeCloseTo(6.0, 5);
  });
  it('tüm kategoriler temizse top kategori null kalır', () => {
    const aggs: CategoryAggregate[] = [
      { category: 'ads', weightedScore: 1.0, reporterCount: 1 },
    ];
    const v = computeVerdict(aggs);
    expect(v.state).toBe('clean');
    expect(v.topCategory).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- trust-core/verdict`
Expected: FAIL.

- [ ] **Step 3: `verdict.ts` oluştur**

```ts
import type { AccountState, CategoryAggregate, AccountVerdict } from './types.ts';
import { DEFAULT_CONFIG, type TrustConfig } from './config.ts';

export function categoryState(
  weightedScore: number,
  reporterCount: number,
  config: TrustConfig = DEFAULT_CONFIG
): AccountState {
  if (weightedScore >= config.flaggedScore && reporterCount >= config.flaggedReporters) {
    return 'flagged';
  }
  if (weightedScore >= config.suspiciousScore && reporterCount >= config.suspiciousReporters) {
    return 'suspicious';
  }
  return 'clean';
}

const STATE_RANK: Record<AccountState, number> = { clean: 0, suspicious: 1, flagged: 2 };

export function computeVerdict(
  aggregates: CategoryAggregate[],
  config: TrustConfig = DEFAULT_CONFIG
): AccountVerdict {
  let top: CategoryAggregate | null = null;
  let bestRank = -1;
  for (const agg of aggregates) {
    const st = categoryState(agg.weightedScore, agg.reporterCount, config);
    // Önce duruma (flagged > suspicious > clean), sonra puana göre sırala.
    const rank = STATE_RANK[st] * 1_000_000 + agg.weightedScore;
    if (rank > bestRank) {
      bestRank = rank;
      top = agg;
    }
  }
  const state = top ? categoryState(top.weightedScore, top.reporterCount, config) : 'clean';
  return {
    state,
    topCategory: state === 'clean' ? null : (top ? top.category : null),
    maxScore: top ? top.weightedScore : 0,
    categories: aggregates,
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm test -- trust-core/verdict`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/trust-core/verdict.ts tests/trust-core/verdict.test.ts
git commit -m "feat(trust-core): kategori durumu ve hesap verdikti"
```

---

## Task 6: trust-core — itibar (konsensüs) + barrel (TDD)

**Files:**
- Create: `supabase/functions/_shared/trust-core/reputation.ts`, `supabase/functions/_shared/trust-core/index.ts`
- Test: `tests/trust-core/reputation.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
// tests/trust-core/reputation.test.ts
import { describe, it, expect } from 'vitest';
import {
  reputationFromConsensus, classifyConsensus, tallyReputation
} from '../../supabase/functions/_shared/trust-core/reputation.ts';
import type { ReporterReportContext } from '../../supabase/functions/_shared/trust-core/types.ts';

describe('reputationFromConsensus', () => {
  it('yeni raporlayan baz ~1.0 ile başlar', () => {
    expect(reputationFromConsensus(0, 0)).toBeCloseTo(1.0, 5); // 3 * 1/3
  });
  it('sürekli doğru raporlayan R_max\'e yaklaşır', () => {
    expect(reputationFromConsensus(100, 0)).toBeGreaterThan(2.9);
  });
  it('kötü niyetli (çok disagreement) raporlayanın etkisi 0\'a iner', () => {
    expect(reputationFromConsensus(0, 100)).toBeLessThan(0.1);
  });
});

describe('classifyConsensus', () => {
  it('flagged hesap → agreement', () => {
    expect(classifyConsensus({ categoryState: 'flagged', categoryReporterCount: 5 })).toBe('agreement');
  });
  it('yeterli gözle temiz kalan hesap → disagreement', () => {
    expect(classifyConsensus({ categoryState: 'clean', categoryReporterCount: 3 })).toBe('disagreement');
  });
  it('az gözle temiz → neutral', () => {
    expect(classifyConsensus({ categoryState: 'clean', categoryReporterCount: 1 })).toBe('neutral');
  });
  it('suspicious → neutral', () => {
    expect(classifyConsensus({ categoryState: 'suspicious', categoryReporterCount: 5 })).toBe('neutral');
  });
});

describe('tallyReputation', () => {
  it('agreement/disagreement sayıp itibar üretir', () => {
    const ctx: ReporterReportContext[] = [
      { categoryState: 'flagged', categoryReporterCount: 5 },   // agreement
      { categoryState: 'flagged', categoryReporterCount: 4 },   // agreement
      { categoryState: 'clean', categoryReporterCount: 3 },     // disagreement
      { categoryState: 'suspicious', categoryReporterCount: 9 } // neutral
    ];
    const r = tallyReputation(ctx);
    expect(r.agreements).toBe(2);
    expect(r.disagreements).toBe(1);
    expect(r.reputation).toBeCloseTo(3 * (2 + 1) / (2 + 1 + 1 + 2), 5);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm test -- trust-core/reputation`
Expected: FAIL.

- [ ] **Step 3: `reputation.ts` oluştur**

```ts
import { DEFAULT_CONFIG, type TrustConfig } from './config.ts';
import type { ReporterReportContext } from './types.ts';

export function reputationFromConsensus(
  agreements: number,
  disagreements: number,
  config: TrustConfig = DEFAULT_CONFIG
): number {
  const { repAlpha, repBeta, repMax } = config;
  return repMax * (agreements + repAlpha) / (agreements + disagreements + repAlpha + repBeta);
}

export function classifyConsensus(
  ctx: ReporterReportContext,
  config: TrustConfig = DEFAULT_CONFIG
): 'agreement' | 'disagreement' | 'neutral' {
  if (ctx.categoryState === 'flagged') return 'agreement';
  if (ctx.categoryState === 'clean' && ctx.categoryReporterCount >= config.disagreementMinReporters) {
    return 'disagreement';
  }
  return 'neutral';
}

export function tallyReputation(
  contexts: ReporterReportContext[],
  config: TrustConfig = DEFAULT_CONFIG
): { agreements: number; disagreements: number; reputation: number } {
  let agreements = 0;
  let disagreements = 0;
  for (const ctx of contexts) {
    const k = classifyConsensus(ctx, config);
    if (k === 'agreement') agreements++;
    else if (k === 'disagreement') disagreements++;
  }
  return {
    agreements,
    disagreements,
    reputation: reputationFromConsensus(agreements, disagreements, config),
  };
}
```

- [ ] **Step 4: `index.ts` (barrel) oluştur**

```ts
export * from './types.ts';
export * from './config.ts';
export * from './util.ts';
export * from './scoring.ts';
export * from './verdict.ts';
export * from './reputation.ts';
```

- [ ] **Step 5: Tüm trust-core testlerini + tip denetimini çalıştır**

Run: `npm test -- trust-core && npm run typecheck:functions`
Expected: Tüm trust-core testleri PASS; tip denetimi temiz.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/trust-core/reputation.ts supabase/functions/_shared/trust-core/index.ts tests/trust-core/reputation.test.ts
git commit -m "feat(trust-core): konsensüs uyumlu itibar + barrel"
```

---

## Task 7: Veritabanı migration'ı (şema + RLS + trigger)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

> Doğrulama: Bu SQL, Task 11'de `supabase start` + `supabase db reset` ile uygulanıp test edilir. Bu task'ta SQL'i tam ve doğru yazmak hedeftir.

- [ ] **Step 1: `0001_init.sql` oluştur**

```sql
-- Enumlar
create type category as enum
  ('bot', 'spam', 'crypto', 'fake_giveaway', 'ads', 'ai_bot', 'harassment');
create type account_state as enum ('clean', 'suspicious', 'flagged');

-- Raporlayan profilleri
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  reputation double precision not null default 1.0,
  reports_count integer not null default 0,
  agreements integer not null default 0,
  disagreements integer not null default 0,
  created_at timestamptz not null default now()
);

-- Tek tek raporlar (oylar)
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_handle text not null,
  category category not null,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_handle, category)
);
create index reports_target_idx on public.reports (target_handle, category);
create index reports_reporter_idx on public.reports (reporter_id);

-- Kategori başına toplanan ağırlıklı puan
create table public.account_category_scores (
  target_handle text not null,
  category category not null,
  weighted_score double precision not null default 0,
  reporter_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (target_handle, category)
);

-- Hesap başına özet verdikt (filtreleme bunu okur)
create table public.account_verdicts (
  target_handle text primary key,
  top_category category,
  max_score double precision not null default 0,
  state account_state not null default 'clean',
  updated_at timestamptz not null default now()
);
create index account_verdicts_state_idx on public.account_verdicts (state, updated_at);

-- Yeni auth kullanıcısı için profil otomatik oluştur
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.account_category_scores enable row level security;
alter table public.account_verdicts enable row level security;

-- profiles: kullanıcı yalnızca kendi satırını okur (reputation'ı yazamaz)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- reports: giriş yapmış kullanıcı yalnızca kendi adına ekler; kendi raporlarını okur
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "reports_select_own" on public.reports
  for select using (auth.uid() = reporter_id);

-- verdict/score tabloları: herkese açık okuma; yazma yok (yalnızca service role)
create policy "verdicts_public_read" on public.account_verdicts
  for select using (true);
create policy "scores_public_read" on public.account_category_scores
  for select using (true);
```

- [ ] **Step 2: SQL'i sözdizimi açısından gözden geçir**

SQL'i elle gözden geçir: enum tipleri tablolardan önce; `handle_new_user` `security definer` ve `search_path` ayarlı; RLS tüm tablolarda açık; service-role yazımları policy gerektirmez (RLS service-role'u atlar). Sözdizimi PostgreSQL 15 uyumlu.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(backend): şema, kısıtlar, indeksler, RLS ve profil trigger'ı"
```

---

## Task 8: Edge Function — submit_report

**Files:**
- Create: `supabase/functions/_shared/http.ts`, `supabase/functions/submit_report/index.ts`

> Doğrulama: Tip mantığı `trust-core` import'ları üzerinden; canlı test Task 11'de.

- [ ] **Step 1: `_shared/http.ts` oluştur**

```ts
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: `submit_report/index.ts` oluştur**

```ts
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { json, CORS_HEADERS } from '../_shared/http.ts';
import { normalizeHandle } from '../_shared/trust-core/util.ts';
import { categoryScore } from '../_shared/trust-core/scoring.ts';
import { computeVerdict } from '../_shared/trust-core/verdict.ts';
import { CATEGORIES, type Category, type CategoryAggregate } from '../_shared/trust-core/types.ts';
import { DEFAULT_CONFIG } from '../_shared/trust-core/config.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function recomputeHandle(admin: SupabaseClient, handle: string) {
  const { data: reports } = await admin
    .from('reports')
    .select('reporter_id, category, created_at')
    .eq('target_handle', handle);
  const list = reports ?? [];

  const reporterIds = [...new Set(list.map((r) => r.reporter_id as string))];
  const { data: profs } = await admin
    .from('profiles')
    .select('id, reputation')
    .in('id', reporterIds.length ? reporterIds : ['00000000-0000-0000-0000-000000000000']);
  const repById = new Map((profs ?? []).map((p) => [p.id as string, p.reputation as number]));

  const now = Date.now();
  const aggregates: CategoryAggregate[] = [];
  for (const category of CATEGORIES) {
    const catReports = list.filter((r) => r.category === category);
    if (catReports.length === 0) continue;
    const inputs = catReports.map((r) => ({
      reporterReputation: repById.get(r.reporter_id as string) ?? DEFAULT_CONFIG.baselineReputation,
      ageDays: (now - new Date(r.created_at as string).getTime()) / 86_400_000,
    }));
    const weighted = categoryScore(inputs);
    const reporterCount = new Set(catReports.map((r) => r.reporter_id)).size;
    aggregates.push({ category, weightedScore: weighted, reporterCount });
    await admin.from('account_category_scores').upsert({
      target_handle: handle, category,
      weighted_score: weighted, reporter_count: reporterCount,
      updated_at: new Date().toISOString(),
    });
  }

  const verdict = computeVerdict(aggregates);
  await admin.from('account_verdicts').upsert({
    target_handle: handle,
    top_category: verdict.topCategory,
    max_score: verdict.maxScore,
    state: verdict.state,
    updated_at: new Date().toISOString(),
  });
  return verdict;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const target_handle = normalizeHandle(body?.target_handle ?? '');
  const category = body?.category as Category;
  if (!target_handle || !CATEGORIES.includes(category)) return json({ error: 'invalid_input' }, 400);

  const admin = createClient(URL, SERVICE);

  // Hız sınırı: son 24 saatte gönderilen rapor sayısı
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= DEFAULT_CONFIG.dailyReportLimit) return json({ error: 'rate_limited' }, 429);

  // Raporu kullanıcı bağlamında ekle (RLS), çift oy unique kısıtla reddedilir
  const { error: insErr } = await userClient
    .from('reports')
    .insert({ reporter_id: user.id, target_handle, category });
  if (insErr && !/duplicate key/i.test(insErr.message)) {
    return json({ error: insErr.message }, 400);
  }

  const verdict = await recomputeHandle(admin, target_handle);
  return json({ ok: true, verdict });
});
```

- [ ] **Step 3: trust-core import'larının tip denetiminden geçtiğini doğrula**

Run: `npm run typecheck:functions`
Expected: PASS (Edge Function `tsconfig.functions`'a dahil değil; bu adım trust-core'un bütünlüğünü doğrular. Edge Function'ın kendi tip denetimi `deno check` / Task 11'dedir.)

- [ ] **Step 4: (Varsa) deno check — en iyi çaba**

Deno kuruluysa: `deno check supabase/functions/submit_report/index.ts`
Deno yoksa bu adımı atla ve raporunda belirt; canlı doğrulama Task 11'de.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/http.ts supabase/functions/submit_report/index.ts
git commit -m "feat(backend): submit_report Edge Function (auth + verdikt yeniden hesaplama)"
```

---

## Task 9: Edge Functions — get_verdicts + get_flagged_list

**Files:**
- Create: `supabase/functions/get_verdicts/index.ts`, `supabase/functions/get_flagged_list/index.ts`

- [ ] **Step 1: `get_verdicts/index.ts` oluştur**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, CORS_HEADERS } from '../_shared/http.ts';
import { normalizeHandle } from '../_shared/trust-core/util.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.handles) ? body.handles : [];
  const handles = [...new Set(raw.map((h) => normalizeHandle(String(h))).filter(Boolean))].slice(0, 100);
  if (handles.length === 0) return json({ verdicts: [] });

  const client = createClient(URL, ANON);
  const { data, error } = await client
    .from('account_verdicts')
    .select('target_handle, top_category, max_score, state, updated_at')
    .in('target_handle', handles);
  if (error) return json({ error: error.message }, 500);
  return json({ verdicts: data ?? [] });
});
```

- [ ] **Step 2: `get_flagged_list/index.ts` oluştur**

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, CORS_HEADERS } from '../_shared/http.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const since = url.searchParams.get('updated_since');

  const client = createClient(URL, ANON);
  let q = client
    .from('account_verdicts')
    .select('target_handle, top_category, state, updated_at')
    .eq('state', 'flagged')
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (since) q = q.gt('updated_at', since);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ flagged: data ?? [] });
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/get_verdicts/index.ts supabase/functions/get_flagged_list/index.ts
git commit -m "feat(backend): get_verdicts ve get_flagged_list Edge Functions"
```

---

## Task 10: Edge Function — recompute_reputations

**Files:**
- Create: `supabase/functions/recompute_reputations/index.ts`

- [ ] **Step 1: `recompute_reputations/index.ts` oluştur**

```ts
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/http.ts';
import { categoryState } from '../_shared/trust-core/verdict.ts';
import { tallyReputation } from '../_shared/trust-core/reputation.ts';
import type { ReporterReportContext } from '../_shared/trust-core/types.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function contextForReporter(admin: SupabaseClient, reporterId: string): Promise<ReporterReportContext[]> {
  const { data: reports } = await admin
    .from('reports')
    .select('target_handle, category')
    .eq('reporter_id', reporterId);
  const contexts: ReporterReportContext[] = [];
  for (const r of reports ?? []) {
    const { data: score } = await admin
      .from('account_category_scores')
      .select('weighted_score, reporter_count')
      .eq('target_handle', r.target_handle as string)
      .eq('category', r.category as string)
      .maybeSingle();
    const state = score
      ? categoryState(score.weighted_score as number, score.reporter_count as number)
      : 'clean';
    contexts.push({ categoryState: state, categoryReporterCount: (score?.reporter_count as number) ?? 0 });
  }
  return contexts;
}

Deno.serve(async () => {
  const admin = createClient(URL, SERVICE);
  const { data: profiles } = await admin.from('profiles').select('id');
  let updated = 0;
  for (const p of profiles ?? []) {
    const contexts = await contextForReporter(admin, p.id as string);
    const { agreements, disagreements, reputation } = tallyReputation(contexts);
    await admin
      .from('profiles')
      .update({ agreements, disagreements, reputation })
      .eq('id', p.id as string);
    updated++;
  }
  return json({ ok: true, updated });
});
```

- [ ] **Step 2: typecheck:functions doğrula (trust-core bütünlüğü)**

Run: `npm run typecheck:functions`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/recompute_reputations/index.ts
git commit -m "feat(backend): recompute_reputations Edge Function (konsensüs itibarı)"
```

---

## Task 11: Backend doğrulama rehberi + canlı bütünleşme (kullanıcı tarafından)

**Files:**
- Create: `docs/BACKEND.md`

- [ ] **Step 1: `docs/BACKEND.md` oluştur**

```markdown
# Faz 2 Backend — Kurulum ve Doğrulama

## Gereksinimler
- [Supabase CLI](https://supabase.com/docs/guides/cli) kurulu
- Docker (yerel Supabase yığını için)

## Yerel çalıştırma
```bash
supabase start          # yerel Postgres + Auth + API ayağa kalkar
supabase db reset       # migration'ları uygular (0001_init.sql)
supabase functions serve --no-verify-jwt   # Edge Functions'ı yerelde sunar
```
`supabase start` çıktısındaki `API URL`, `anon key`, `service_role key` değerlerini
Edge Functions ortamına aktarın (yerelde otomatik enjekte edilir).

## Manuel doğrulama kontrol listesi
- [ ] `supabase db reset` hatasız tamamlanır (şema + RLS uygulanır).
- [ ] Yeni bir auth kullanıcısı oluşturunca `profiles` satırı otomatik oluşur (trigger).
- [ ] Giriş yapmış kullanıcı `submit_report` ile rapor gönderebilir; aynı (handle, kategori) için ikinci kez gönderim çift oy olarak reddedilir (verdikt değişmez).
- [ ] `account_category_scores` ve `account_verdicts` rapordan sonra güncellenir.
- [ ] Tek bir raporlayan bir hesabı `flagged` yapamaz (min-raporlayan eşiği); 3 ayrı raporlayan + yeterli ağırlıklı puanla `flagged` olur.
- [ ] `get_verdicts` (anon) verilen handle'lar için verdikt döner.
- [ ] `get_flagged_list` (anon) yalnızca `flagged` hesapları döner; `updated_since` artımlı çalışır.
- [ ] Anon bir istemci `reports` tablosuna doğrudan yazamaz (RLS reddi); `account_verdicts`'i okuyabilir.
- [ ] `recompute_reputations` çalıştırılınca itibarlar konsensüs uyumuna göre güncellenir.

## Üretim dağıtımı
```bash
supabase link --project-ref <PROJE_REF>
supabase db push
supabase functions deploy submit_report get_verdicts get_flagged_list recompute_reputations
```

### OAuth sağlayıcıları (X / Google)
Supabase Dashboard → Authentication → Providers altından Google ve Twitter (X)
sağlayıcılarını etkinleştirip istemci kimlik/secret bilgilerini girin. (Bu adım
sizin hesap kimlik bilgilerinizi gerektirir.)

### Periyodik itibar yeniden hesaplama (pg_cron + pg_net)
Dashboard → Database → Extensions'tan `pg_cron` ve `pg_net`'i etkinleştirin, sonra
SQL Editor'de (kendi proje ref ve service-role anahtarınızla):
```sql
select cron.schedule(
  'recompute-reputations',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJE_REF>.functions.supabase.co/recompute_reputations',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```
Alternatif: Dashboard'daki Scheduled Functions arayüzünden aynı fonksiyonu zamanlayın.
```

- [ ] **Step 2: Tüm otomatik kontrolleri son kez çalıştır**

Run: `npm test && npm run typecheck && npm run typecheck:functions`
Expected: Tüm testler (Faz 1: 26 + trust-core: yeni testler) PASS; her iki tip denetimi temiz.

- [ ] **Step 3: Commit**

```bash
git add docs/BACKEND.md
git commit -m "docs(backend): Supabase kurulum ve doğrulama rehberi"
```

- [ ] **Step 4: Kullanıcıya devret**

Kullanıcıya bildir: backend kodu ve migration'lar hazır. Canlı doğrulama için
`docs/BACKEND.md`'deki adımları (Supabase CLI + Docker) kullanıcı çalıştırmalı;
OAuth sağlayıcı kimlikleri ve üretim projesi kullanıcının kimlik bilgilerini gerektirir.

---

## Öz-Denetim Notları (plan yazarı)

- **Spec kapsamı:**
  - §3 Şema → Task 7 (tüm tablolar, enum, kısıtlar, indeksler, RLS, trigger).
  - §4 Güven motoru → Tasks 4 (puan/sönüm), 5 (durum/verdikt, "tek kişi flagged yapamaz" değişmezi test edildi), 6 (Bayesçi itibar).
  - §5 API → Tasks 8 (submit_report), 9 (get_verdicts, get_flagged_list), 10 (recompute_reputations).
  - §6 Manipülasyon → unique kısıt (Task 7), min-raporlayan (Task 5), hız sınırı (Task 8), itibar sönümü (Task 6), RLS (Task 7).
  - §8 Test → trust-core Vitest (Tasks 3-6); RLS/uçtan uca (Task 11 manuel).
  - §2 Mimari (saf çekirdek + Edge Functions) → Tasks 1-10.
- **Tip tutarlılığı:** `Category`, `AccountState`, `CategoryAggregate`, `AccountVerdict`, `ReporterReportContext`, `TrustConfig` Task 2'de tanımlandı; `categoryScore`, `decay`, `categoryState`, `computeVerdict`, `reputationFromConsensus`, `classifyConsensus`, `tallyReputation`, `normalizeHandle` imzaları tüm kullanım yerleriyle (Edge Functions dahil) eşleşiyor.
- **Yer tutucu yok:** Tüm kod tam. `docs/BACKEND.md`'deki `<PROJE_REF>`/`<SERVICE_ROLE_KEY>` kod yer tutucusu değil, kullanıcının kendi gizli kimlik bilgileridir (Faz 1'deki "dist'i Chrome'a yükle" gibi kullanıcıya ait yapılandırma adımı).
- **Faz 2 Plan B** (uzantı entegrasyonu) ayrı planda ele alınacak; bu plan backend'i tek başına test edilebilir şekilde tamamlar.
```
