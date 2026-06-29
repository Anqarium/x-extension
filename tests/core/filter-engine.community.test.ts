import { describe, it, expect } from 'vitest';
import { decideFilter } from '../../src/core/filter-engine';
import { DEFAULT_COMMUNITY, type Lists, type Verdict, type CommunityFilterSettings } from '../../src/core/models';

const lists = (p: Partial<Lists>): Lists => ({ blocklist: [], whitelist: [], ...p });
const community = (p: Partial<CommunityFilterSettings>): CommunityFilterSettings => ({ ...DEFAULT_COMMUNITY, ...p });
const verdict = (p: Partial<Verdict>): Verdict => ({ handle: 'x', state: 'clean', topCategory: null, maxScore: 0, ...p });

describe('decideFilter', () => {
  it('beyaz liste her şeyi ezer (flagged olsa bile show)', () => {
    const d = decideFilter('bob', lists({ whitelist: ['bob'], blocklist: ['bob'] }),
      verdict({ state: 'flagged', topCategory: 'spam' }), community({}));
    expect(d.action).toBe('show');
    expect(d.reason).toBe('whitelist');
  });

  it('kullanıcı engellemesi bulut verdiktinden önce gelir', () => {
    const d = decideFilter('bob', lists({ blocklist: ['bob'] }),
      verdict({ state: 'flagged', topCategory: 'spam' }), community({}));
    expect(d.action).toBe('collapse');
    expect(d.reason).toBe('blocklist');
  });

  it('flagged + flaggedAction=collapse → collapse (community)', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'crypto' }), community({ flaggedAction: 'collapse' }));
    expect(d.action).toBe('collapse');
    expect(d.reason).toBe('community');
    expect(d.category).toBe('crypto');
  });

  it('flagged + flaggedAction=autoblock → collapse + autoblock bayrağı', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'crypto' }), community({ flaggedAction: 'autoblock' }));
    expect(d.action).toBe('collapse');
    expect(d.autoblock).toBe(true);
  });

  it('flagged + flaggedAction=warn → badge', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'bot' }), community({ flaggedAction: 'warn' }));
    expect(d.action).toBe('badge');
  });

  it('suspicious + suspiciousAction=off → show', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'suspicious', topCategory: 'ads' }), community({ suspiciousAction: 'off' }));
    expect(d.action).toBe('show');
  });

  it('kategori kapalıysa community kararı uygulanmaz', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'ads' }),
      community({ enabledCategories: ['bot'] }));
    expect(d.action).toBe('show');
    expect(d.reason).toBe('none');
  });

  it('community kapalıysa verdikt yok sayılır', () => {
    const d = decideFilter('eve', lists({}),
      verdict({ state: 'flagged', topCategory: 'bot' }), community({ enabled: false }));
    expect(d.action).toBe('show');
  });

  it('verdikt yoksa show', () => {
    const d = decideFilter('eve', lists({}), null, community({}));
    expect(d.action).toBe('show');
    expect(d.reason).toBe('none');
  });

  it('clean verdikt → show', () => {
    const d = decideFilter('eve', lists({}), verdict({ state: 'clean' }), community({}));
    expect(d.action).toBe('show');
  });
});
