import type { ReportInput } from './types.ts';
import { DEFAULT_CONFIG, type TrustConfig } from './config.ts';

export function decay(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function categoryScore(
  reports: ReportInput[],
  config: TrustConfig = DEFAULT_CONFIG
): number {
  return reports.reduce(
    (sum, r) => sum + r.reporterReputation * decay(r.ageDays, config.halfLifeDays),
    0
  );
}
