import { DEFAULT_CONFIG, type TrustConfig } from './config.ts';
import type { ReporterReportContext } from './types.ts';

export function reputationFromConsensus(
  agreements: number,
  disagreements: number,
  config: TrustConfig = DEFAULT_CONFIG
): number {
  const { repAlpha, repBeta, repMax } = config;
  return repMax * (agreements + repAlpha) / (agreements + disagreements + repAlpha + repBeta);
}

export function classifyConsensus(
  ctx: ReporterReportContext,
  config: TrustConfig = DEFAULT_CONFIG
): 'agreement' | 'disagreement' | 'neutral' {
  if (ctx.categoryState === 'flagged') return 'agreement';
  if (ctx.categoryState === 'clean' && ctx.categoryReporterCount >= config.disagreementMinReporters) {
    return 'disagreement';
  }
  return 'neutral';
}

export function tallyReputation(
  contexts: ReporterReportContext[],
  config: TrustConfig = DEFAULT_CONFIG
): { agreements: number; disagreements: number; reputation: number } {
  let agreements = 0;
  let disagreements = 0;
  for (const ctx of contexts) {
    const k = classifyConsensus(ctx, config);
    if (k === 'agreement') agreements++;
    else if (k === 'disagreement') disagreements++;
  }
  return {
    agreements,
    disagreements,
    reputation: reputationFromConsensus(agreements, disagreements, config),
  };
}
