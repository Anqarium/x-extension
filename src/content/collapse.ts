import { getHandleFromArticle } from './adapters/x-selectors';
import { decideAction } from '../core/filter-engine';
import type { Lists } from '../core/models';

const COLLAPSED = 'data-xcf-collapsed';
const BAR = 'data-xcf-bar';
const HIDDEN = 'data-xcf-prev-display';

// Bir article'ı içeriğini silmeden gizler ve etiketli bir çubuk ekler.
export function collapseArticle(article: HTMLElement, label: string, marker: string): void {
  if (article.getAttribute(COLLAPSED)) return;
  article.setAttribute(COLLAPSED, marker);

  for (const child of Array.from(article.children)) {
    const el = child as HTMLElement;
    el.setAttribute(HIDDEN, el.style.display);
    el.style.display = 'none';
  }

  const bar = document.createElement('div');
  bar.setAttribute(BAR, '1');
  bar.style.cssText =
    'padding:12px 16px;color:#71767b;font-size:14px;display:flex;justify-content:space-between;align-items:center;';

  const span = document.createElement('span');
  span.textContent = label;
  bar.appendChild(span);

  const showBtn = document.createElement('button');
  showBtn.textContent = 'Göster';
  showBtn.style.cssText =
    'background:transparent;border:1px solid #536471;color:#e7e9ea;border-radius:9999px;padding:4px 12px;cursor:pointer;';
  showBtn.addEventListener('click', () => restoreArticle(article));
  bar.appendChild(showBtn);

  article.appendChild(bar);
}

export function restoreArticle(article: HTMLElement): void {
  article.removeAttribute(COLLAPSED);
  for (const child of Array.from(article.children)) {
    const el = child as HTMLElement;
    if (el.hasAttribute(BAR)) { el.remove(); continue; }
    if (el.hasAttribute(HIDDEN)) {
      el.style.display = el.getAttribute(HIDDEN) ?? '';
      el.removeAttribute(HIDDEN);
    }
  }
}

export function isCollapsed(article: HTMLElement): boolean {
  return article.hasAttribute(COLLAPSED);
}

export function collapsedMarker(article: HTMLElement): string | null {
  return article.getAttribute(COLLAPSED);
}

// Faz 1 davranışı: manuel engelleme listesine göre collapse / geri aç.
export function applyCollapse(article: HTMLElement, lists: Lists): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;
  const action = decideAction(handle, lists);
  if (action !== 'collapse') {
    if (article.getAttribute(COLLAPSED) === handle) restoreArticle(article);
    return;
  }
  collapseArticle(article, `@${handle} engellendi`, handle);
}
