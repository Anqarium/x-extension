import { describe, it, expect } from 'vitest';
import { decideAction, normalizeHandle } from '../../src/core/filter-engine';
import type { Lists } from '../../src/core/models';

const lists = (p: Partial<Lists>): Lists => ({ blocklist: [], whitelist: [], ...p });

describe('normalizeHandle', () => {
  it('@ işaretini ve büyük harfi temizler', () => {
    expect(normalizeHandle('@SpamBot')).toBe('spambot');
    expect(normalizeHandle('  User  ')).toBe('user');
  });
});

describe('decideAction', () => {
  it('engelleme listesindeki hesabı collapse eder', () => {
    expect(decideAction('spambot', lists({ blocklist: ['spambot'] }))).toBe('collapse');
  });

  it('listede olmayan hesaba dokunmaz (show)', () => {
    expect(decideAction('alice', lists({}))).toBe('show');
  });

  it('beyaz liste engelleme listesini ezer', () => {
    expect(decideAction('bob', lists({ blocklist: ['bob'], whitelist: ['bob'] }))).toBe('show');
  });

  it('handle karşılaştırması büyük/küçük harf duyarsız', () => {
    expect(decideAction('@SpamBot', lists({ blocklist: ['spambot'] }))).toBe('collapse');
  });
});
