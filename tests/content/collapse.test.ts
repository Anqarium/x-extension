import { describe, it, expect } from 'vitest';
import { applyCollapse } from '../../src/content/collapse';
import type { Lists } from '../../src/core/models';

function makeArticle(handle: string): HTMLElement {
  document.body.innerHTML = `
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/${handle}"><span>@${handle}</span></a></div>
      <div data-testid="tweetText">içerik</div>
    </article>`;
  return document.querySelector('article')!;
}

const lists = (p: Partial<Lists>): Lists => ({ blocklist: [], whitelist: [], ...p });

describe('applyCollapse', () => {
  it('engellenen hesabın çocuklarını gizler ama DOM\'dan silmez', () => {
    const article = makeArticle('spam');
    applyCollapse(article, lists({ blocklist: ['spam'] }));
    const text = article.querySelector('[data-testid="tweetText"]') as HTMLElement;
    expect(text).not.toBeNull();                 // içerik silinmedi
    expect(text.style.display).toBe('none');      // sadece gizlendi
    expect(article.querySelector('[data-xcf-bar]')).not.toBeNull();
    expect(article.getAttribute('data-xcf-collapsed')).toBe('spam');
  });

  it('beyaz liste engellemeyi ezer; daha önce gizlendiyse geri açar', () => {
    const article = makeArticle('spam');
    applyCollapse(article, lists({ blocklist: ['spam'] }));
    applyCollapse(article, lists({ blocklist: ['spam'], whitelist: ['spam'] }));
    const text = article.querySelector('[data-testid="tweetText"]') as HTMLElement;
    expect(text.style.display).not.toBe('none');  // geri açıldı
    expect(article.querySelector('[data-xcf-bar]')).toBeNull();
    expect(article.hasAttribute('data-xcf-collapsed')).toBe(false);
  });
});
