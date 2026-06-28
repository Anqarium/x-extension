// src/content/auto-scroll.ts
// Kontrollü, throttle'lı kaydırma ile tüm yorumları yükletir.
// Yeni içerik gelmeyi durdurana kadar (veya max adım) kaydırır.

export interface AutoScrollOptions {
  delayMs: number;
  maxSteps?: number;
  onStep?: () => void; // her adımda collector ingest tetiklemek için
}

export async function loadAllReplies(opts: AutoScrollOptions): Promise<void> {
  const { delayMs, maxSteps = 100, onStep } = opts;
  let lastHeight = -1;
  let stableCount = 0;

  for (let step = 0; step < maxSteps; step++) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(res => setTimeout(res, delayMs));
    onStep?.();

    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) {
      stableCount++;
      if (stableCount >= 2) break; // iki tur boyunca büyüme yoksa bitti say
    } else {
      stableCount = 0;
      lastHeight = height;
    }
  }
}
