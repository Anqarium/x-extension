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
  if (error) return json({ error: 'query_failed' }, 500);
  return json({ verdicts: data ?? [] });
});
