import type { Verdict, Category } from '../core/models';
import { CLOUD, cloudConfigured, functionUrl } from './cloud-config';
import { mapVerdictRow, type VerdictRow } from './verdict-mapper';

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: CLOUD.anonKey,
    Authorization: `Bearer ${CLOUD.anonKey}`,
    ...extra,
  };
}

// Toplu verdikt (anon). Yapılandırılmamışsa boş döner.
export async function fetchVerdicts(handles: string[]): Promise<Verdict[]> {
  if (!cloudConfigured() || handles.length === 0) return [];
  try {
    const res = await fetch(functionUrl('get_verdicts'), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ handles }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { verdicts?: VerdictRow[] };
    return (data.verdicts ?? []).map(mapVerdictRow);
  } catch {
    return [];
  }
}

export interface FlaggedListResult {
  verdicts: Verdict[];
  maxUpdatedAt: string | null;
}

// flagged listesi (anon, artımlı). Watermark için sunucunun en yeni updated_at'ini de döner.
export async function fetchFlaggedList(since: string | null): Promise<FlaggedListResult> {
  if (!cloudConfigured()) return { verdicts: [], maxUpdatedAt: null };
  try {
    const url = new URL(functionUrl('get_flagged_list'));
    if (since) url.searchParams.set('updated_since', since);
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) return { verdicts: [], maxUpdatedAt: null };
    const data = (await res.json()) as { flagged?: (VerdictRow & { updated_at?: string })[] };
    const rows = data.flagged ?? [];
    let maxUpdatedAt: string | null = null;
    for (const r of rows) {
      if (r.updated_at && (maxUpdatedAt === null || r.updated_at > maxUpdatedAt)) {
        maxUpdatedAt = r.updated_at;
      }
    }
    return { verdicts: rows.map(mapVerdictRow), maxUpdatedAt };
  } catch {
    return { verdicts: [], maxUpdatedAt: null };
  }
}

export interface SubmitResult {
  ok: boolean;
  verdict?: Verdict | null;
  error?: string;
}

// Rapor gönder (giriş gerekli; accessToken kullanıcı JWT'si).
export async function submitReport(
  handle: string,
  category: Category,
  accessToken: string
): Promise<SubmitResult> {
  if (!cloudConfigured()) return { ok: false, error: 'cloud_not_configured' };
  try {
    const res = await fetch(functionUrl('submit_report'), {
      method: 'POST',
      headers: headers({ Authorization: `Bearer ${accessToken}` }),
      body: JSON.stringify({ target_handle: handle, category }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean; verdict?: VerdictRow | null; error?: string;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `http_${res.status}` };
    return { ok: true, verdict: data.verdict ? mapVerdictRow(data.verdict) : null };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}
