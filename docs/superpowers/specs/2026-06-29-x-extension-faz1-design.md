# X Uzantısı — Faz 1 Tasarım Dökümanı

**Tarih:** 2026-06-29
**Kapsam:** Faz 1 — bulutsuz, tek başına çalışan yerel Chrome uzantısı
**Durum:** Onaylandı (uygulama planı bekleniyor)

---

## 1. Amaç ve Kapsam

Bu döküman, X (Twitter) için geliştirilecek topluluk destekli içerik filtreleme
ekosisteminin **ilk fazını** tanımlar. Faz 1, bulut/topluluk altyapısı olmadan,
tek başına gerçek değer üreten çalışan bir uzantıdır.

### Faz 1 kapsamı (DAHİL)

- **Yorum sıralama motoru:** tweet altındaki yorumları beğeni sayısına göre
  sıralar. Mavi tik sıralamaya etki etmez.
- **Manuel engelleme listesi:** kullanıcının elle engellediği hesapların içeriği
  gizlenir (collapse).
- **Beyaz liste:** asla filtrelenmeyecek hesaplar.
- **Ayarlar paneli:** koyu tema, animasyonlar, responsive, liste yönetimi.

### Faz 1 kapsamı (HARİÇ — sonraki fazlar)

- Bulut backend ve merkezi veritabanı (Faz 2)
- Topluluk bildirimleri ve hesap güven puanları (Faz 2)
- Bildiren kullanıcı itibar/ağırlık sistemi (Faz 2)
- Yönetim paneli (Faz 3)
- Yapay zekâ analiz katmanı (Faz 4)

Bu döküman yalnızca Faz 1'i kapsar. Her faz kendi spec → plan → uygulama
döngüsünü alır.

---

## 2. Alınan Kararlar

| Konu | Karar |
|------|-------|
| Filtreleme kapsamı | Yorum sıralaması + manuel engelleme listesi + beyaz liste. Otomatik/akıllı filtreleme Faz 2'ye bırakıldı. |
| Sıralama davranışı | **Hibrit:** varsayılan olarak görünen yorumları canlı sırala; "Tümünü yükle ve tam sırala" butonuyla derin sıralama manuel tetiklenir. |
| Sıralama render yöntemi | **Overlay:** uzantı kendi sıralı listesini X'in yorum alanının üstüne çizer (React sanallaştırmasıyla savaşmaz). |
| Engelleme eylemi | **Gizle (collapse):** içerik yerinde küçük bir çubuğa dönüşür, tıklayınca açılır. DOM'dan silinmez. |
| Engelleme yöntemi | **Satır içi buton + ayarlar paneli:** her gönderi yanında tek-tık engelle butonu + panelden @handle yönetimi. |

---

## 3. Mimari

Manifest V3 tabanlı uzantı, bağımsız test edilebilir modüllere ayrılır. Temel
ilke: **X'in DOM yapısına bağımlı her şey tek bir yerde (`adapters/x-selectors.ts`)
izole edilir.** X arayüzü değiştiğinde yalnızca bu dosya güncellenir.

```
src/
├─ content/                     # X sayfasına enjekte edilen kod
│  ├─ adapters/x-selectors.ts   # X'e özgü TÜM seçiciler (kırılganlık tek noktada)
│  ├─ collector.ts              # Görünen yorumları model verisine dönüştürür
│  ├─ overlay/                  # Kendi sıralı liste arayüzümüz
│  ├─ block-injector.ts         # Gönderi yanına engelle butonu ekler
│  └─ orchestrator.ts           # MutationObserver + akış yönetimi
├─ core/                        # SAF, DOM'suz, %100 test edilebilir mantık
│  ├─ sort-engine.ts            # Yorum listesi → sıralı liste
│  ├─ filter-engine.ts          # Hesap + listeler + ayar → eylem kararı
│  └─ models.ts                 # Veri modelleri / tipler
├─ data/                        # Depolama soyutlaması (Faz 2 bulut buraya takılır)
│  └─ data-provider.ts          # chrome.storage sarmalayıcı + reaktif ayarlar
├─ ui/                          # Ayarlar paneli + popup (Preact, koyu tema)
├─ background/                  # Service worker (hafif: depolama yayını, gelecekte sync)
└─ shared/                      # Tipler, mesajlaşma, sabitler
```

### Modül sorumlulukları

- **orchestrator.ts:** Sayfa türünü algılar (tweet detay / akış), `MutationObserver`
  başlatır, collector + filter + overlay akışını koordine eder.
- **collector.ts:** Ekrana giren her yorum hücresinden veri çeker, handle+id
  anahtarlı bir `Map`'te biriktirir. Kullanıcı kaydırdıkça liste büyür.
- **sort-engine.ts:** Saf fonksiyon. Yorum listesini beğeniye göre sıralar.
- **filter-engine.ts:** Saf fonksiyon. `(handle, blocklist, whitelist, settings) → eylem`.
- **overlay/:** Sıralanmış listeyi çizer, collapse/expand ve native aksiyon
  bağlantılarını yönetir.
- **block-injector.ts:** Gönderi/yorum aksiyon satırına engelle butonu ekler.
- **data-provider.ts:** `chrome.storage` üzerine tek giriş noktası; reaktif ayar
  yayını. **Faz 2 bulut bu arayüzün arkasına takılır, üst katman değişmez.**

---

## 4. Sıralama Altsistemi

### Veri akışı

1. **Orchestrator** bir tweet detay sayfası açıldığını algılar, yorum bölgesini
   bulur, `MutationObserver` başlatır.
2. **Collector** her görünen yorum hücresinden çeker:
   `{ yazar, handle, metin, beğeni, repost, yanıt, maviTik, yorumLinki, id }`.
   Veriyi `Map`'te biriktirir; kaydırmada kaybolmaz.
3. **Sort-engine** (saf): beğeniye göre azalan sıralar.
   - Mavi tik **sıralamaya hiç girmez** — yalnızca beğeni belirleyici.
   - Tie-breaker sırası: beğeni → repost → yanıt sayısı.
   - En çok beğenilen yorum mavi tikliyse, doğrulanmış olduğu için değil,
     gerçekten en çok beğenildiği için en üstte çıkar.
4. **Overlay renderer** X'in yorum alanının üstüne kendi sıralı listemizi çizer.
   Her kart: avatar, isim, metin, beğeni sayısı + "X'te aç / yanıtla / beğen"
   aksiyonları (native eyleme link/yönlendirme olarak bağlanır).
5. **Hibrit mod:**
   - Varsayılan: o ana kadar toplanan yorumları **canlı** sıralar.
   - "Tümünü yükle ve tam sırala" butonu: throttle'lı otomatik kaydırma ile tüm
     yorumları yükletir (oran sınırına takılmamak için), sonra mutlak sıralama yapar.
6. Kullanıcı overlay'i bir toggle ile açıp kapatabilir → istemezse X'in kendi
   görünümü kalır.

### Dayanıklılık

- Collector bir alanı okuyamazsa (örn. beğeni sayısı) yorumu atmaz; eksik veriyle
  (beğeni=0 varsayımı) devam eder.
- X seçicileri değişirse overlay sessizce devre dışı kalır; native görünüm bozulmaz.
- Uzantı hiçbir koşulda sayfayı kırmaz (defansif parsing).

---

## 5. Filtreleme Altsistemi

### Karar mantığı (filter-engine, saf fonksiyon)

`(handle, blocklist, whitelist, settings) → eylem`

1. Beyaz listedeyse → **her zaman göster** (engelleme listesinde olsa bile beyaz
   liste önceliklidir).
2. Engelleme listesindeyse → **gizle (collapse)**.
3. Aksi halde → dokunma.

### Collapse davranışı

- Engellenen hesabın gönderisi/yorumu yerinde küçük bir çubuğa dönüşür:
  *"@handle engellendi — göster"*.
- Tıklayınca yalnızca o örnek açılır.
- İçerik DOM'dan silinmez, sadece gizlenir.

### Uygulama kapsamı

- **Site geneli:** ana akış, yorumlar, alıntılar — hepsinde engelleme uygulanır.
- **Sıralama yalnızca yorum bölgelerinde**, engelleme her yerde.
- Orchestrator'ın observer'ına bağlı → sayfa yenilenmeden, kaydırma sırasında
  gelen yeni içeriklere anında uygulanır.

### Engelleme arayüzü

- **block-injector**, her gönderi/yorumun aksiyon satırına uzantının küçük
  butonunu ekler (X'in ikon diliyle ve koyu temayla uyumlu).
- Tek tık → handle engelleme listesine yazılır, içerik anında collapse olur.

---

## 6. Ayarlar Paneli ve Depolama

### Popup (araç çubuğu ikonu)

Hızlı erişim: overlay aç/kapat, "tam sırala", engellenen hesap sayısı, ayarlara git.

### Ayarlar sayfası (options page, Preact)

Koyu tema, akıcı geçiş animasyonları, responsive. Sekmeler:

- **Sıralama:** overlay varsayılan açık/kapalı, tie-breaker tercihi, otomatik
  kaydırma hız limiti.
- **Engelleme listesi:** @handle ekle/sil, ara, toplu temizle, içe/dışa aktar (JSON).
- **Beyaz liste:** aynı yönetim arayüzü.
- **Görünüm:** tema (koyu varsayılan; sistem/açık seçeneği), animasyon aç/kapat.

### Depolama

- **`chrome.storage.sync`** (cihazlar arası senkron, kota-bilinçli): listeler ve
  ayarlar.
- Kota dolarsa **`chrome.storage.local`**'a otomatik taşan tasarım.
- **`data-provider.ts`** tek giriş noktasıdır. Faz 2'de bulut bu arayüzün arkasına
  takılır; üst katmanlar değişmez.

---

## 7. Teknoloji Yığını

| Katman | Seçim | Gerekçe |
|--------|-------|---------|
| Manifest | MV3 | Yeni Chrome uzantıları için zorunlu, Edge uyumlu |
| Dil/Build | TypeScript + Vite | Tip güvenliği, hızlı build, modülerlik |
| Content script | Vanilla TS | X'in React'iyle çakışmamak için çerçevesiz, hafif |
| Ayarlar/popup UI | Preact (~3KB) | Temiz bileşen kodu, küçük ayak izi |
| Çapraz tarayıcı | webextension-polyfill | Faz 1 Chrome/Edge; Firefox tek adım |
| Test | Vitest | `core/` saf mantığı için birim testleri |

---

## 8. Test Stratejisi

- **Birim (Vitest):** `sort-engine` ve `filter-engine` saf fonksiyonları — beğeni
  sıralaması, tie-breaker, beyaz liste önceliği, collapse kararı tam kapsanır.
  TDD ile yazılır.
- **Adaptör katmanı:** `x-selectors.ts` için sahte (fixture) DOM parçacıklarıyla
  collector testleri.
- **Manuel doğrulama:** gerçek X sayfasında overlay, engelleme ve senkron davranış
  kontrolü.

---

## 9. Gelecek-Uyumluluk

- `data-provider` soyutlaması → Faz 2 bulut + güven puanları sorunsuz takılır.
- `x-selectors` izolasyonu → X arayüz değişikliklerine dayanıklılık.
- `webextension-polyfill` + MV3 → Firefox/Edge'e minimum eforla taşıma.
- `core/` saf mantık → ileride mobil/web panelde yeniden kullanılabilir.

---

## 10. Başarı Kriterleri

- Bir tweet detay sayfasında yorumlar beğeniye göre doğru sıralanır; mavi tik
  sıralamayı bozmaz.
- "Tümünü yükle ve tam sırala" tüm yorumları yükleyip mutlak sıralama verir.
- Engellenen hesabın içeriği site genelinde collapse olur; beyaz liste önceliklidir.
- Engelleme/beyaz liste cihazlar arası senkronlanır.
- Uzantı hiçbir koşulda X sayfasını kırmaz; seçici değişiminde native görünüme
  zarif şekilde geri düşer.
- Ayarlar paneli koyu tema, responsive ve akıcıdır.
