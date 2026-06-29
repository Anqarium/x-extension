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
