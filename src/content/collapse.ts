import { getHandleFromArticle } from './adapters/x-selectors';
import { decideAction } from '../core/filter-engine';
import type { Lists } from '../core/models';

const COLLAPSED = 'data-xcf-collapsed';
const BAR = 'data-xcf-bar';
const HIDDEN = 'data-xcf-prev-display';

// Engellenen hesabın article'ını İÇERİĞİNİ SİLMEDEN collapse eder: mevcut
// çocuklarını gizler ve yerine küçük bir çubuk ekler. React kontrolündeki
// DOM'u yok etmez (sayfayı bozmaz).
export function applyCollapse(article: HTMLElement, lists: Lists): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;

  const action = decideAction(handle, lists);

  if (action !== 'collapse') {
    if (article.getAttribute(COLLAPSED)) restore(article); // beyaz listeye alınmış olabilir
    return;
  }
  if (article.getAttribute(COLLAPSED)) return; // zaten gizli

  article.setAttribute(COLLAPSED, handle);

  for (const child of Array.from(article.children)) {
    const el = child as HTMLElement;
    el.setAttribute(HIDDEN, el.style.display);
    el.style.display = 'none';
  }

  const bar = document.createElement('div');
  bar.setAttribute(BAR, '1');
  bar.style.cssText =
    'padding:12px 16px;color:#71767b;font-size:14px;display:flex;justify-content:space-between;align-items:center;';

  const label = document.createElement('span');
  label.textContent = `@${handle} engellendi`;
  bar.appendChild(label);

  const showBtn = document.createElement('button');
  showBtn.textContent = 'Göster';
  showBtn.style.cssText =
    'background:transparent;border:1px solid #536471;color:#e7e9ea;border-radius:9999px;padding:4px 12px;cursor:pointer;';
  showBtn.addEventListener('click', () => restore(article));
  bar.appendChild(showBtn);

  article.appendChild(bar);
}

function restore(article: HTMLElement): void {
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
