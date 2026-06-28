import { describe, it, expect } from 'vitest';
import { parseCount, parseReply } from '../../src/content/adapters/x-selectors';

describe('parseCount', () => {
  it('boş/yok değeri 0 yapar', () => {
    expect(parseCount('')).toBe(0);
    expect(parseCount(null)).toBe(0);
  });
  it('düz sayıları okur', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('57')).toBe(57);
  });
  it('K ve M soneklerini açar', () => {
    expect(parseCount('1.2K')).toBe(1200);
    expect(parseCount('3M')).toBe(3000000);
  });
});

describe('parseReply', () => {
  it('bir yorum article düğümünden veri çıkarır', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <span>Alice</span>
          <a href="/alice"><span>@alice</span></a>
        </div>
        <svg data-testid="icon-verified"></svg>
        <div data-testid="tweetText">Merhaba dünya</div>
        <a href="/alice/status/12345"><time></time></a>
        <button data-testid="like" aria-label="42 Beğeni"></button>
        <button data-testid="retweet" aria-label="5 repost"></button>
        <button data-testid="reply" aria-label="3 yanıt"></button>
      </article>`;
    const article = document.querySelector('article')!;
    const r = parseReply(article as HTMLElement)!;
    expect(r.handle).toBe('alice');
    expect(r.displayName).toBe('Alice');
    expect(r.text).toBe('Merhaba dünya');
    expect(r.likes).toBe(42);
    expect(r.reposts).toBe(5);
    expect(r.replies).toBe(3);
    expect(r.isVerified).toBe(true);
    expect(r.id).toBe('12345');
    expect(r.permalink).toContain('/alice/status/12345');
  });

  it('zorunlu alan yoksa null döner (sayfayı bozmamak için)', () => {
    document.body.innerHTML = `<article data-testid="tweet"></article>`;
    const article = document.querySelector('article')!;
    expect(parseReply(article as HTMLElement)).toBeNull();
  });
});
