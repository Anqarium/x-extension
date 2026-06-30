// Kullanıcı kendi Supabase projesini oluşturduktan sonra burayı doldurur.
// anonKey herkese açıktır (publishable), commit edilebilir. Boşken topluluk
// özellikleri devre dışı kalır; Faz 1 yerel işlevsellik etkilenmez.
export const CLOUD = {
  url: 'https://yepmwbshnzziypfsmkqc.supabase.co',       // örn. https://abcdefgh.supabase.co
  anonKey: 'sb_publishable_kHlJH1ZddqzWwENssgi0zQ_tT42ZX1w',   // public anon key
};

export function cloudConfigured(): boolean {
  return CLOUD.url.length > 0 && CLOUD.anonKey.length > 0;
}

export function functionUrl(name: string): string {
  return `${CLOUD.url}/functions/v1/${name}`;
}
