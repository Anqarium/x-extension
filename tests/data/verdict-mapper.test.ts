import { describe, it, expect } from 'vitest';
import { mapVerdictRow } from '../../src/data/verdict-mapper';

describe('mapVerdictRow', () => {
  it('sunucu satırını Verdict\'e çevirir', () => {
    const v = mapVerdictRow({
      target_handle: 'Spammer', top_category: 'crypto', max_score: 7.5, state: 'flagged',
    });
    expect(v).toEqual({ handle: 'spammer', state: 'flagged', topCategory: 'crypto', maxScore: 7.5 });
  });

  it('eksik/temiz alanlarda güvenli varsayılanlar', () => {
    const v = mapVerdictRow({ target_handle: 'a', top_category: null, max_score: null, state: 'clean' });
    expect(v).toEqual({ handle: 'a', state: 'clean', topCategory: null, maxScore: 0 });
  });

  it('geçersiz state clean\'e düşer', () => {
    const v = mapVerdictRow({ target_handle: 'a', top_category: null, max_score: 0, state: 'garbage' });
    expect(v.state).toBe('clean');
  });
});
