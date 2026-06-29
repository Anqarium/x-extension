# X İçerik Filtresi — Faz 1

X (Twitter) için yorumları beğeniye göre sıralayan (overlay) ve hesapları manuel
filtreleyen, bulutsuz çalışan bir Chrome/Edge (Manifest V3) uzantısı.

Bu, daha büyük bir topluluk destekli içerik filtreleme ekosisteminin **ilk fazıdır**.
Faz 1 tek başına, bulut olmadan çalışır. Sonraki fazlar (bulut backend + güven
puanları, yönetim paneli, yapay zekâ destek katmanı) ayrı ele alınır.

## Özellikler (Faz 1)

- **Yorum sıralama (overlay):** Bir tweet'in yorumlarını beğeni sayısına göre
  sıralayan, X'in kendi alanının üstüne çizilen kendi listemiz. Mavi tik sıralamayı
  etkilemez — en çok beğenilen yorum (mavi tikli olsa da) en üstte çıkar.
- **Hibrit yükleme:** Görünenleri canlı sıralar; "Tümünü yükle ve tam sırala"
  butonuyla tüm yorumları yükleyip mutlak sıralama yapar.
- **Manuel engelleme:** Her gönderi/yorum yanındaki butonla tek tık engelleme.
  Engellenen hesabın içeriği yerinde gizlenir (collapse), "Göster" ile açılır.
  İçerik DOM'dan silinmez.
- **Beyaz liste:** Beyaz listedeki hesaplar engelleme listesinde olsa bile asla
  filtrelenmez (beyaz liste önceliklidir).
- **Ayarlar paneli:** Koyu tema, sekmeli arayüz; sıralama tercihleri, liste yönetimi
  (arama, toplu temizle, JSON içe/dışa aktarma) ve görünüm ayarları.
- **Cihazlar arası senkron:** Listeler ve ayarlar `chrome.storage.sync` ile senkronlanır.
- **Topluluk filtresi (Faz 2):** OAuth giriş, hesapları 7 kategoride raporlama,
  bulut güven verdiktlerine göre kullanıcı seçimli filtreleme (rozet/gizle/kaldır/
  otomatik engelle), periyodik + talep üzerine verdikt senkronu. Bulut
  yapılandırması için `docs/BACKEND.md`'ye bakın.

## Geliştirme

Gereksinim: Node.js 18+.

```bash
npm install        # bağımlılıkları kur
npm test           # birim testleri (Vitest)
npm run typecheck  # TypeScript tip denetimi
npm run build      # dist/ üretir
npm run dev        # geliştirme modu (Vite + HMR)
```

## Uzantıyı Chrome/Edge'e yükleme

1. `npm run build` çalıştır → `dist/` klasörü oluşur.
2. `chrome://extensions` (veya `edge://extensions`) sayfasını aç.
3. Sağ üstten **Geliştirici modu**'nu aç.
4. **Paketlenmemiş öğe yükle** → `dist/` klasörünü seç.
5. x.com'da bir tweet detay sayfası aç ve uzantıyı kullan.

Kod değişikliğinden sonra `npm run build` çalıştırıp uzantılar sayfasından yenile.

## Manuel doğrulama kontrol listesi

Gerçek X sayfasında elle doğrulanması gerekenler:

- [ ] Yorum bölgesinin üstünde sıralı overlay görünüyor; en çok beğenilen üstte.
- [ ] Mavi tikli ama az beğenili yorum üste çıkmıyor.
- [ ] "Tümünü yükle ve tam sırala" daha fazla yorum toplayıp listeyi büyütüyor.
- [ ] Her gönderi/yorumda engelle butonu var; tıklayınca o hesap collapse oluyor.
- [ ] Collapse çubuğundaki "Göster" içeriği geri açıyor.
- [ ] Ayarlar → Engelleme listesine handle eklenince ilgili içerik (yenilemeden)
      collapse oluyor.
- [ ] Beyaz listeye eklenen hesap, engelleme listesinde olsa bile gösteriliyor.
- [ ] Ayarlar paneli koyu tema, sekmeler ve liste yönetimiyle (arama/temizle/JSON)
      çalışıyor.
- [ ] Popup'tan overlay aç/kapat ve tam sırala çalışıyor.

## Mimari

- `src/core/` — saf, DOM'suz, birim test edilen mantık (sıralama, filtreleme, modeller).
- `src/content/adapters/x-selectors.ts` — X'e özgü TÜM seçiciler tek dosyada izole.
- `src/content/` — içerik script'i: toplayıcı, overlay, engelle butonu, collapse, orchestrator.
- `src/data/data-provider.ts` — depolama soyutlaması (Faz 2 bulut bu arayüze takılır).
- `src/ui/` — popup + ayarlar sayfası (Preact, koyu tema).
- `src/background/` — depolama değişikliklerini açık sekmelere ileten service worker.

Tasarım ve plan dökümanları: `docs/superpowers/`.
