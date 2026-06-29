import type { Verdict, AccountState, Category } from '../core/models';
import { normalizeHandle } from '../core/filter-engine';
import { CATEGORIES } from '../core/models';

const STATES: AccountState[] = ['clean', 'suspicious', 'flagged'];

export interface VerdictRow {
  target_handle: string;
  top_category: string | null;
  max_score: number | null;
  state: string;
}

export function mapVerdictRow(row: VerdictRow): Verdict {
  const state = (STATES as string[]).includes(row.state) ? (row.state as AccountState) : 'clean';
  const topCategory =
    row.top_category && (CATEGORIES as string[]).includes(row.top_category)
      ? (row.top_category as Category)
      : null;
  return {
    handle: normalizeHandle(row.target_handle),
    state,
    topCategory,
    maxScore: typeof row.max_score === 'number' ? row.max_score : 0,
  };
}
