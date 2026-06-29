import { describe, it, expect } from 'vitest';
import {
  reputationFromConsensus, classifyConsensus, tallyReputation
} from '../../supabase/functions/_shared/trust-core/reputation.ts';
import type { ReporterReportContext } from '../../supabase/functions/_shared/trust-core/types.ts';

describe('reputationFromConsensus', () => {
  it('yeni raporlayan baz ~1.0 ile başlar', () => {
    expect(reputationFromConsensus(0, 0)).toBeCloseTo(1.0, 5);
  });
  it('sürekli doğru raporlayan R_max\'e yaklaşır', () => {
    expect(reputationFromConsensus(100, 0)).toBeGreaterThan(2.9);
  });
  it('kötü niyetli (çok disagreement) raporlayanın etkisi 0\'a iner', () => {
    expect(reputationFromConsensus(0, 100)).toBeLessThan(0.1);
  });
});

describe('classifyConsensus', () => {
  it('flagged hesap → agreement', () => {
    expect(classifyConsensus({ categoryState: 'flagged', categoryReporterCount: 5 })).toBe('agreement');
  });
  it('yeterli gözle temiz kalan hesap → disagreement', () => {
    expect(classifyConsensus({ categoryState: 'clean', categoryReporterCount: 3 })).toBe('disagreement');
  });
  it('az gözle temiz → neutral', () => {
    expect(classifyConsensus({ categoryState: 'clean', categoryReporterCount: 1 })).toBe('neutral');
  });
  it('suspicious → neutral', () => {
    expect(classifyConsensus({ categoryState: 'suspicious', categoryReporterCount: 5 })).toBe('neutral');
  });
});

describe('tallyReputation', () => {
  it('agreement/disagreement sayıp itibar üretir', () => {
    const ctx: ReporterReportContext[] = [
      { categoryState: 'flagged', categoryReporterCount: 5 },
      { categoryState: 'flagged', categoryReporterCount: 4 },
      { categoryState: 'clean', categoryReporterCount: 3 },
      { categoryState: 'suspicious', categoryReporterCount: 9 }
    ];
    const r = tallyReputation(ctx);
    expect(r.agreements).toBe(2);
    expect(r.disagreements).toBe(1);
    expect(r.reputation).toBeCloseTo(3 * (2 + 1) / (2 + 1 + 1 + 2), 5);
  });
});
