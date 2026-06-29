import { describe, it, expect } from 'vitest';
import { decay, categoryScore } from '../../supabase/functions/_shared/trust-core/scoring.ts';
import { DEFAULT_CONFIG } from '../../supabase/functions/_shared/trust-core/config.ts';

describe('decay', () => {
  it('0 yaşta 1.0 döner', () => {
    expect(decay(0, 180)).toBe(1);
    expect(decay(-5, 180)).toBe(1);
  });
  it('yarı ömürde 0.5 döner', () => {
    expect(decay(180, 180)).toBeCloseTo(0.5, 5);
  });
  it('iki yarı ömürde 0.25 döner', () => {
    expect(decay(360, 180)).toBeCloseTo(0.25, 5);
  });
});

describe('categoryScore', () => {
  it('itibar ağırlıklarını taze raporlarda toplar', () => {
    const score = categoryScore([
      { reporterReputation: 1.0, ageDays: 0 },
      { reporterReputation: 2.0, ageDays: 0 },
    ]);
    expect(score).toBeCloseTo(3.0, 5);
  });
  it('eski raporları sönümler', () => {
    const score = categoryScore(
      [{ reporterReputation: 2.0, ageDays: 180 }],
      DEFAULT_CONFIG
    );
    expect(score).toBeCloseTo(1.0, 5);
  });
  it('boş listede 0 döner', () => {
    expect(categoryScore([])).toBe(0);
  });
});
