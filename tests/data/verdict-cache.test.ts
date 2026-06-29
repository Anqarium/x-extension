import { describe, it, expect } from 'vitest';
import { VerdictCache } from '../../src/data/verdict-cache';
import type { Verdict } from '../../src/core/models';

const v = (handle: string, state: Verdict['state'] = 'flagged'): Verdict =>
  ({ handle, state, topCategory: 'spam', maxScore: 5 });

describe('VerdictCache', () => {
  it('set sonrası taze veriyi döner', () => {
    let now = 1000;
    const c = new VerdictCache(10_000, () => now);
    c.set(v('alice'));
    expect(c.get('alice')?.state).toBe('flagged');
  });

  it('TTL dolunca null döner', () => {
    let now = 1000;
    const c = new VerdictCache(10_000, () => now);
    c.set(v('alice'));
    now = 1000 + 10_001;
    expect(c.get('alice')).toBeNull();
  });

  it('handle normalize edilir (@ ve büyük harf)', () => {
    let now = 0;
    const c = new VerdictCache(10_000, () => now);
    c.set(v('Alice'));
    expect(c.get('@alice')?.handle).toBe('alice');
  });

  it('missing() cache\'te olmayan veya süresi dolmuş handle\'ları döner', () => {
    let now = 0;
    const c = new VerdictCache(10_000, () => now);
    c.setMany([v('a'), v('b')]);
    now = 10_001;
    c.set(v('c'));
    expect(c.missing(['a', 'b', 'c', 'd']).sort()).toEqual(['a', 'b', 'd']);
  });

  it('serialize/load round-trip', () => {
    let now = 5;
    const c = new VerdictCache(10_000, () => now);
    c.setMany([v('a'), v('b')]);
    const data = c.toJSON();
    const c2 = new VerdictCache(10_000, () => now);
    c2.loadFrom(data);
    expect(c2.get('a')?.state).toBe('flagged');
    expect(c2.get('b')?.state).toBe('flagged');
  });
});
