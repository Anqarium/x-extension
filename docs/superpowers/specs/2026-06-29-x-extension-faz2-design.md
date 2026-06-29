# X Uzantısı — Faz 2 Tasarım Dökümanı

**Tarih:** 2026-06-29
**Kapsam:** Faz 2 — bulut backend + topluluk destekli güven/itibar sistemi ve uzantı entegrasyonu
**Durum:** Onaylandı (uygulama planı bekleniyor)

---

## 1. Amaç ve Kapsam

Faz 1, bulutsuz çalışan yerel uzantıyı (yorum sıralama + manuel engelleme/beyaz
liste) teslim etti. Faz 2, bunun üstüne **topluluk destekli, manipülasyona
dirençli bir hesap güven/itibar sistemi** ekler.

### Faz 2 kapsamı (DAHİL)
- Bulut backend (Supabase): merkezi veritabanı, OAuth, API.
- Topluluk raporlama: 7 kategori (Bot, Spam, Kripto, Sahte Çekiliş, Reklam, YZ
  Botu, Taciz).
- Hesap güven puanı: **kategori başına**, itibar ağırlıklı, zaman sönümlü.
- Raporlayan itibarı: **konsensüs uyumlu** (Bayesçi), otomatik.
- Uzantı entegrasyonu: OAuth giriş, kategori rapor menüsü, periyodik + talep
  üzerine verdikt senkronu, verdikt-farkında filtreleme, kullanıcı davranış ayarları.

### Faz 2 kapsamı (HARİÇ — sonraki fazlar)
- Yönetim paneli (Faz 3): rapor inceleme, manuel itibar yönetimi, istatistik.
- Yapay zekâ analiz katmanı (Faz 4).

### Temel kararlar
| Konu | Karar |
|------|-------|
| Kimlik modeli | X/Google OAuth (her oy gerçek hesaba bağlı; sybil direnci) |
| Backend | Supabase (yönetilen Postgres + OAuth + RLS + Edge Functions) |
| İtibar mekanizması | Konsensüs uyumlu, otomatik (Bayesçi) |
| Puan granularlığı | Kategori başına puan |

---

## 2. Mimari

**İlke (Faz 1 felsefesinin devamı):** İş mantığı saf ve test edilebilir;
veritabanı yalnızca depolama. Güven/itibar matematiği saf TypeScript
(`trust-core/`) olarak yazılır, Vitest ile test edilir, **Supabase Edge
Functions** içinde çalıştırılır. Bu, mantığı taşınabilir (ileride mobil/panel
aynı `trust-core`'u kullanır) ve TDD'ye uygun kılar.

### Veri akışı
```
Uzantı (OAuth oturumu)
   │  rapor gönder ──────────▶ Edge Fn: submit_report ──▶ Postgres (reports + skor güncelle)
   │  verdikt sorgula ◀──────  Edge Fn: get_verdicts  ◀──  account_verdicts (herkese açık okuma)
   │  periyodik senkron ◀────  Edge Fn: get_flagged_list (background alarm ile)
                              pg_cron ──▶ Edge Fn: recompute_reputations (konsensüs uyumu)
```

---

## 3. Veritabanı Şeması (Postgres / Supabase)

- **`profiles`** — raporlayan kullanıcı.
  `id (uuid = auth.uid)`, `created_at`, `reputation (float, varsayılan baz ~1.0)`,
  `reports_count (int)`, `agreements (int)`, `disagreements (int)`.
  (OAuth sağlayıcı bilgisi Supabase `auth.users`'ta.)
- **`reports`** — tek tek oylar.
  `id`, `reporter_id → profiles`, `target_handle (text, küçük harf)`,
  `category (enum: bot | spam | crypto | fake_giveaway | ads | ai_bot | harassment)`,
  `created_at`.
  **`UNIQUE(reporter_id, target_handle, category)`** — bir kişi bir hesabı bir
  kategoride yalnızca bir kez oylar. Serbest metin/not yok (YAGNI, moderasyon
  yükünü önler).
- **`account_category_scores`** — toplanan ağırlıklı puan.
  `PK(target_handle, category)`, `weighted_score (float)`, `reporter_count (int)`,
  `updated_at`.
- **`account_verdicts`** — hesap başına özet (filtreleme bunu okur).
  `PK(target_handle)`, `top_category`, `max_score (float)`,
  `state (clean | suspicious | flagged)`, `updated_at`.

### Erişim (RLS)
- `reports`: yalnızca giriş yapmış kullanıcı ekler, `reporter_id = auth.uid()`
  zorunlu; unique kısıt çift oyu engeller.
- `account_verdicts` / `account_category_scores`: **herkese açık okuma** (uzantı
  anon anahtarla çeker).
- `profiles`: kullanıcı kendi satırını okur; `reputation` yalnızca server/Edge Fn
  tarafından yazılır (kullanıcı değiştiremez).

---

## 4. Güven & İtibar Motoru

Tüm sabitler `trust-core/config.ts`'te tek yerde, ayarlanabilir.

### 4.1 Hesap kategori puanı (ağırlıklı, zaman sönümlü)
```
weighted_score(handle, kategori) = Σ  reputation(reporter) × decay(rapor_yaşı)
decay(yaş) = 0.5 ^ (yaş_gün / yarı_ömür)        # varsayılan yarı_ömür = 180 gün
```
`reporter_count` = o kategorideki ayrı raporlayan sayısı.

### 4.2 Hesap durumu (çift koşul: puan VE min-raporlayan)
| Durum | Koşul (varsayılan, ayarlanabilir) | Etki |
|-------|-----------------------------------|------|
| `clean` | puan < 2.0 **veya** raporlayan < 2 | Hiçbir şey |
| `suspicious` | puan ≥ 2.0 **ve** raporlayan ≥ 2 | Kullanıcıya uyarı |
| `flagged` | puan ≥ 5.0 **ve** raporlayan ≥ 3 | Filtrelenebilir (kullanıcı ayarına göre) |

Genel verdikt = en yüksek puanlı kategorinin durumu + o kategori etiketi.
**Değişmez:** Tek bir kişi, itibarı ne olursa olsun, minimum-raporlayan koşulu
nedeniyle bir hesabı tek başına `flagged` yapamaz.

### 4.3 Raporlayan itibarı (konsensüs uyumu, Bayesçi)
Periyodik (pg_cron) yeniden hesaplanır:
- **agreement:** raporladığı (hesap, kategori) zamanla `flagged` konsensüsüne ulaştıysa.
- **disagreement:** yeterli başka girdiye rağmen hesap `clean` kaldıysa (aykırı/yanlış rapor).
```
reputation = R_max × (agreements + α) / (agreements + disagreements + α + β)
# varsayılan: α=1, β=2, R_max=3.0  → yeni kullanıcı ~1.0 başlar, doğru raporlayan ~3.0'a tırmanır,
# kötü niyetli/yanlış raporlayanın ağırlığı 0'a doğru söner.
```

### 4.4 Hesaplama anı
- `submit_report`: ilgili hesabın kategori puanı + verdikti anında yeniden
  hesaplanır (anlık geri bildirim).
- `recompute_reputations` (cron): konsensüs uyumuna göre tüm itibarları tazeler;
  hesap puanları sonraki turda güncel ağırlıkları yansıtır.

---

## 5. API Yüzeyi (Edge Functions)

Mantık `trust-core/` saf TS'ten gelir; Edge Function yalnızca DB I/O + auth yapar.

| Fonksiyon | Erişim | Görev |
|-----------|--------|-------|
| `submit_report` | Auth | `{ target_handle, category }`; oturum sahibini `reporter_id` yapar, raporu ekler (unique reddi), kategori puanı + verdikti transaction'da yeniden hesaplar, güncel verdikti döner. |
| `get_verdicts` | Anon | `{ handles: string[] }` (max ~100); her handle için `{ state, top_category, max_score, categories }`. |
| `get_flagged_list` | Anon | `flagged` hesapların kompakt listesi; `updated_since` ile artımlı, sayfalı. |
| `recompute_reputations` | pg_cron | Konsensüs uyumuna göre itibarları yeniden hesaplar (API'de değil). |

---

## 6. Manipülasyon Önlemleri (katmanlı)

1. **Kimlik:** OAuth zorunlu — her oy gerçek hesaba bağlı.
2. **Tek oy:** `UNIQUE(reporter_id, target_handle, category)`.
3. **Min ayrı raporlayan:** Tek kişi bir hesabı `flagged` yapamaz.
4. **İtibar ağırlığı + sönüm:** Yanlış raporlayanın etkisi konsensüsle 0'a iner.
5. **Hız sınırı:** Raporlayan başına günlük üst sınır (varsayılan 50), Edge Fn'de.
6. **Yeni hesap düşük güven:** Baz ~1.0; etki doğru raporlarla kazanılır.
7. **RLS:** insert'te `reporter_id = auth.uid()`; verdikt/itibar tabloları
   kullanıcıya kapalı.

### Gizlilik
Saklanan: raporlayan `uuid`, hedef X handle'ı (herkese açık), kategori, zaman.
Serbest metin/kişisel veri yok. Verdikt okumak giriş gerektirmez.

---

## 7. Uzantı Entegrasyonu

### 7.1 Kimlik / giriş
Supabase JS istemcisi popup + ayarlarda; giriş `chrome.identity.launchWebAuthFlow`
ile X/Google OAuth. Oturum `chrome.storage.local`'da, yenileme yönetilir. Giriş
yalnızca rapor vermek için; verdikt okuma/filtre anonim.

### 7.2 Rapor arayüzü
Faz 1 satır içi butonu **kategori menüsüne** dönüşür (7 kategori). Giriş yoksa
"Rapor vermek için giriş yap" → popup. Seçim → `submit_report`, anlık geri bildirim.
Manuel engelleme (Faz 1, kişisel) ayrı kalır.

### 7.3 Verdikt teslimi (hibrit)
- **Toplu:** `background` worker `chrome.alarms` ile periyodik (örn. 6 saat)
  `get_flagged_list` → `chrome.storage.local` verdikt cache (artımlı `updated_since`).
- **Talep üzerine:** Sayfada görülüp cache'te olmayan handle'lar toplanıp
  `get_verdicts`'e toplu sorgulanır (TTL'li cache, örn. 24 saat).

### 7.4 Filtre entegrasyonu (Faz 1 `filter-engine` genişletilir)
`decideAction` saf kalır; verdikt + davranış ayarını da alır. Öncelik:
```
1. Beyaz liste          → her zaman göster
2. Kullanıcı engelleme  → collapse (Faz 1)
3. Bulut verdikti       → kullanıcının o duruma/kategoriye seçtiği eylem
4. aksi                 → dokunma
```

### 7.5 Davranış ayarları ("kullanıcı kendi seçsin")
Ayarlara **"Topluluk filtresi"** sekmesi:
- Giriş durumu (giriş yap/çık).
- Durum → eylem: `suspicious` için *kapalı / uyarı rozeti / collapse*; `flagged`
  için *uyarı / collapse / kaldır / otomatik engelle*.
- Kategori açma/kapama (kullanıcı yalnızca önemsediği kategorilerde filtreler).
- Güven eşiği kaydırıcısı (isteğe bağlı sıkılaştırma).
- **Güvenli varsayılanlar:** `suspicious → uyarı rozeti`, `flagged → collapse`,
  tüm kategoriler açık, otomatik engelle kapalı.

### 7.6 Yeni/değişen modüller
- `src/data/cloud-provider.ts` — Supabase istemcisi + API sarmalayıcı (data-provider seam'i).
- `src/data/verdict-cache.ts` — toplu + TTL'li yerel verdikt cache.
- `src/content/report-menu.ts` — kategori menüsü (block-injector genişletir).
- `src/background/service-worker.ts` — alarm tabanlı senkron eklenir.
- `src/core/filter-engine.ts` — verdikt-farkında karar (saf, test edilir).
- `src/ui/options/` — "Topluluk filtresi" sekmesi + giriş.

---

## 8. Test Stratejisi

- **`trust-core/` (Vitest, TDD):** ağırlıklı puan + sönümleme; çift-koşullu eşikler
  (özellikle "tek kişi `flagged` yapamaz" değişmezi); Bayesçi konsensüs itibarı
  (agreement/disagreement, yeni hesap bazı, kötü niyetli sönüm).
- **`filter-engine` (Vitest):** verdikt + davranış → eylem; öncelik sırası;
  kategori açma/kapama.
- **`verdict-cache` (Vitest):** TTL, artımlı birleştirme, geçersizleştirme.
- **Backend bütünleşme (Supabase yerel + pgTAP/SQL):** RLS (anon yazamaz,
  `reporter_id = auth.uid()`), unique-oy kısıtı, hız sınırı, uçtan uca uç noktalar.
- **Manuel doğrulama:** gerçek X'te giriş, rapor, senkron, filtre davranışı.

---

## 9. İş Bölümü (iki sıralı uygulama planı)

**Plan A — Backend & güven motoru** (önce, tek başına test edilebilir):
Supabase projesi + migration'lar (şema, enum, RLS, kısıtlar), `trust-core/` saf TS
+ testler, üç Edge Function + `recompute_reputations` cron, pgTAP/bütünleşme
testleri, tohum verisi.

**Plan B — Uzantı entegrasyonu** (backend hazırken):
OAuth giriş akışı, kategori rapor menüsü, `cloud-provider` + `verdict-cache`,
alarm tabanlı senkron, verdikt-farkında `filter-engine`, "Topluluk filtresi" ayar
sekmesi, uçtan uca.

Her plan kendi worktree → spec→plan→subagent uygulama→inceleme→merge döngüsünü alır.

---

## 10. Başarı Kriterleri

- Giriş yapmış kullanıcı bir hesabı 7 kategoriden birinde raporlayabilir; çift oy
  reddedilir.
- Bir hesap, yalnızca yeterli ayrı raporlayan + ağırlıklı puan eşiği aşıldığında
  `suspicious`/`flagged` olur; tek kişi tek başına `flagged` yapamaz.
- Sürekli doğru raporlayanın oy ağırlığı artar; yanlış/kötü niyetli raporlayanın
  etkisi zamanla söner.
- Uzantı, verdiktleri periyodik + talep üzerine senkronlar; sayfa yenilenmeden
  filtre uygular.
- Kullanıcı durum/kategori bazında davranışı seçebilir; güvenli varsayılanlar tek
  raporla otomatik gizleme yapmaz.
- Güven/itibar matematiği `trust-core/`'ta tamamen birim test edilir; RLS ve
  kısıtlar bütünleşme testleriyle doğrulanır.
