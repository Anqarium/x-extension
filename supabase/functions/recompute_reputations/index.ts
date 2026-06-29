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
