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
`supabase start` çıktısındaki `API URL`, `anon key`, `service_role key` değerleri
Edge Functions ortamına yerelde otomatik enjekte edilir.

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

### Yerel uçtan uca hızlı test (örnek)
```bash
# anon anahtarla verdikt sorgula (giriş gerektirmez)
curl -s -X POST http://localhost:54321/functions/v1/get_verdicts \
  -H "Content-Type: application/json" \
  -d '{"handles":["spambot"]}'

# flagged liste
curl -s "http://localhost:54321/functions/v1/get_flagged_list"
```
`submit_report` için geçerli bir kullanıcı JWT'si gerekir (Authorization: Bearer <token>);
token'ı Supabase Auth ile (örn. e-posta veya OAuth oturumu) elde edin.

## Üretim dağıtımı
```bash
supabase link --project-ref <PROJE_REF>
supabase db push
supabase functions deploy submit_report get_verdicts get_flagged_list recompute_reputations
```

### OAuth sağlayıcıları (X / Google)
Supabase Dashboard → Authentication → Providers altından Google ve Twitter (X)
sağlayıcılarını etkinleştirip istemci kimlik/secret bilgilerini girin. (Bu adım
sizin hesap kimlik bilgilerinizi gerektirir; Plan B'deki uzantı girişi bu
sağlayıcıları kullanır.)

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

## Mimari notu
Güven/itibar matematiği `supabase/functions/_shared/trust-core/` altında saf
TypeScript olarak yaşar ve Vitest ile tamamen test edilir (`npm test -- trust-core`).
Edge Functions yalnızca veritabanı I/O + auth yapıp bu çekirdeği çağırır. Böylece
mantık taşınabilir (Faz 3 panel / mobil aynı çekirdeği kullanabilir) ve test edilebilir kalır.

## Bilinen takip işleri (backlog — gerçek trafikten önce)
- **recompute_reputations ölçeklenmesi:** Şu an profil başına + rapor başına ayrı sorgu (O(N+M) seri round-trip) ve `profiles` sorgusu `max_rows=1000` ile sınırlı. Gerçek hacimden önce: tüm `account_category_scores`'u tek seferde Map'e çekmek veya tek bir Postgres RPC'sine taşımak; profilleri sayfalamak.
- **Zaman sönümlemesi olay-güdümlü:** `weighted_score` yalnızca o handle'a yeni rapor gelince (submit_report) yeniden hesaplanıyor; rapor almayan hesabın puanı sönmeden kalır. Periyodik tam yeniden-puanlama işi eklenebilir.
- **İşlem (transaction) bütünlüğü:** submit_report'taki kategori puanı + verdikt upsert'leri ayrı statement'lar; tek bir Postgres fonksiyonuna alınarak atomik yapılabilir.
- **`profiles.reports_count`:** şema/spec'te var ama henüz yazılmıyor (rezerve).

## Uzantı tarafı bağlama (Plan B)
1. Supabase projenizi oluşturup deploy ettikten sonra `src/data/cloud-config.ts`
   içine projenizin `url` (https://<ref>.supabase.co) ve **anon** anahtarını yazın.
2. **Sabit Extension ID gerekir:** OAuth redirect URL'i (`https://<EXTENSION_ID>.chromiumapp.org/`)
   Extension ID'den türetilir ve bu ID paketlenmemiş yüklemelerde değişebilir. Kalıcı bir ID
   için ya uzantıyı paketleyip (`manifest`'e sabit bir `key` ekleyerek) ya da Web Store'a
   yükleyerek ID'yi sabitleyin. Sonra Supabase Dashboard → Authentication → URL Configuration →
   Redirect URLs'e bu sabit redirect URL'sini ekleyin. (Extension ID'yi `chrome://extensions`
   sayfasında görebilirsiniz.)
3. Authentication → Providers'tan Google ve/veya Twitter (X) sağlayıcılarını
   etkinleştirin.
4. `npm run build` → `dist/`'i Chrome'a yükleyin. Ayarlar → "Topluluk filtresi"
   sekmesinden giriş yapıp raporlama ve filtrelemeyi test edin.
