import { describe, it, expect } from 'vitest';
import { normalizeHandle } from '../../supabase/functions/_shared/trust-core/util.ts';

describe('normalizeHandle', () => {
  it('@ ve büyük harfi temizler, boşluğu kırpar', () => {
    expect(normalizeHandle('@SpamBot')).toBe('spambot');
    expect(normalizeHandle('  User  ')).toBe('user');
  });
  it('boş/geçersiz girdi boş string döner', () => {
    expect(normalizeHandle('')).toBe('');
    expect(normalizeHandle('   ')).toBe('');
    expect(normalizeHandle(null as unknown as string)).toBe('');
    expect(normalizeHandle(undefined as unknown as string)).toBe('');
  });
});
