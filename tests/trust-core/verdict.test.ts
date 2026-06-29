import { describe, it, expect } from 'vitest';
import { categoryState, computeVerdict } from '../../supabase/functions/_shared/trust-core/verdict.ts';
import type { CategoryAggregate } from '../../supabase/functions/_shared/trust-core/types.ts';

describe('categoryState', () => {
  it('eşik altı temiz', () => {
    expect(categoryState(1.5, 5)).toBe('clean');
  });
  it('puan ve min-raporlayan sağlanınca suspicious', () => {
    expect(categoryState(2.0, 2)).toBe('suspicious');
  });
  it('puan yeterli ama raporlayan az ise temiz (tek kişi tırmandıramaz)', () => {
    expect(categoryState(99, 1)).toBe('clean');
  });
  it('puan ve raporlayan yeterince yüksekse flagged', () => {
    expect(categoryState(5.0, 3)).toBe('flagged');
  });
  it('flagged puanı var ama raporlayan < 3 ise yalnızca suspicious', () => {
    expect(categoryState(10, 2)).toBe('suspicious');
  });
});

describe('computeVerdict', () => {
  it('hiç toplam yoksa temiz, top kategori yok', () => {
    const v = computeVerdict([]);
    expect(v.state).toBe('clean');
    expect(v.topCategory).toBeNull();
  });
  it('en yüksek duruma sahip kategoriyi top seçer (durum > puan)', () => {
    const aggs: CategoryAggregate[] = [
      { category: 'ads', weightedScore: 4.0, reporterCount: 5 },
      { category: 'crypto', weightedScore: 6.0, reporterCount: 3 },
    ];
    const v = computeVerdict(aggs);
    expect(v.state).toBe('flagged');
    expect(v.topCategory).toBe('crypto');
    expect(v.maxScore).toBeCloseTo(6.0, 5);
  });
  it('tüm kategoriler temizse top kategori null kalır', () => {
    const aggs: CategoryAggregate[] = [
      { category: 'ads', weightedScore: 1.0, reporterCount: 1 },
    ];
    const v = computeVerdict(aggs);
    expect(v.state).toBe('clean');
    expect(v.topCategory).toBeNull();
  });
});
