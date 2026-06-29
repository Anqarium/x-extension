import type { Verdict } from '../core/models';
import { normalizeHandle } from '../core/filter-engine';

interface Entry {
  verdict: Verdict;
  fetchedAt: number;
}

// Verdiktleri TTL ile yerel olarak önbelleğe alır; handle anahtarları normalize.
export class VerdictCache {
  private map = new Map<string, Entry>();

  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  private fresh(entry: Entry | undefined): entry is Entry {
    return !!entry && this.now() - entry.fetchedAt <= this.ttlMs;
  }

  get(handle: string): Verdict | null {
    const entry = this.map.get(normalizeHandle(handle));
    return this.fresh(entry) ? entry.verdict : null;
  }

  set(verdict: Verdict): void {
    const handle = normalizeHandle(verdict.handle);
    this.map.set(handle, { verdict: { ...verdict, handle }, fetchedAt: this.now() });
  }

  setMany(verdicts: Verdict[]): void {
    for (const v of verdicts) this.set(v);
  }

  // Cache'te olmayan VEYA süresi dolmuş handle'ları döner (taze sorgu için).
  missing(handles: string[]): string[] {
    const out: string[] = [];
    for (const h of handles) {
      const norm = normalizeHandle(h);
      if (!norm) continue;
      if (!this.fresh(this.map.get(norm))) out.push(norm);
    }
    return out;
  }

  toJSON(): Record<string, Entry> {
    return Object.fromEntries(this.map.entries());
  }

  loadFrom(data: Record<string, Entry> | undefined | null): void {
    if (!data) return;
    for (const [handle, entry] of Object.entries(data)) {
      if (entry && entry.verdict) this.map.set(handle, entry);
    }
  }
}
