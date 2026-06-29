import type { AccountState, CategoryAggregate, AccountVerdict } from './types.ts';
import { DEFAULT_CONFIG, type TrustConfig } from './config.ts';

export function categoryState(
  weightedScore: number,
  reporterCount: number,
  config: TrustConfig = DEFAULT_CONFIG
): AccountState {
  if (weightedScore >= config.flaggedScore && reporterCount >= config.flaggedReporters) {
    return 'flagged';
  }
  if (weightedScore >= config.suspiciousScore && reporterCount >= config.suspiciousReporters) {
    return 'suspicious';
  }
  return 'clean';
}

const STATE_RANK: Record<AccountState, number> = { clean: 0, suspicious: 1, flagged: 2 };

export function computeVerdict(
  aggregates: CategoryAggregate[],
  config: TrustConfig = DEFAULT_CONFIG
): AccountVerdict {
  let top: CategoryAggregate | null = null;
  let bestRank = -1;
  for (const agg of aggregates) {
    const st = categoryState(agg.weightedScore, agg.reporterCount, config);
    // Önce duruma (flagged > suspicious > clean), sonra puana göre sırala.
    const rank = STATE_RANK[st] * 1_000_000 + agg.weightedScore;
    if (rank > bestRank) {
      bestRank = rank;
      top = agg;
    }
  }
  const state = top ? categoryState(top.weightedScore, top.reporterCount, config) : 'clean';
  return {
    state,
    topCategory: state === 'clean' ? null : (top ? top.category : null),
    maxScore: top ? top.weightedScore : 0,
    categories: aggregates,
  };
}
