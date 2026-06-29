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
