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
