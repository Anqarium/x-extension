import { getHandleFromArticle } from './adapters/x-selectors';
import { decideAction } from '../core/filter-engine';
import type { Lists } from '../core/models';

const COLLAPSED = 'data-xcf-collapsed';

// Engellenen hesabın article'ını yerinde küçük bir çubuğa indirger.
export function applyCollapse(article: HTMLElement, lists: Lists): void {
  const handle = getHandleFromArticle(article);
  if (!handle) return;

  const action = decideAction(handle, lists);

  if (action !== 'collapse') {
    // beyaz listeye alınmış olabilir -> daha önce gizlendiyse geri aç
    if (article.getAttribute(COLLAPSED) === handle) restore(article);
    return;
  }
  if (article.getAttribute(COLLAPSED)) return; // zaten gizli

  const original = article.innerHTML;
  article.setAttribute(COLLAPSED, handle);
  (article as HTMLElement & { _xcfOriginal?: string })._xcfOriginal = original;

  const bar = document.createElement('div');
  bar.style.cssText =
    'padding:12px 16px;color:#71767b;font-size:14px;display:flex;justify-content:space-between;align-items:center;';
  bar.innerHTML = `<span>@${handle} engellendi</span>`;
  const showBtn = document.createElement('button');
  showBtn.textContent = 'Göster';
  showBtn.style.cssText = 'background:transparent;border:1px solid #536471;color:#e7e9ea;border-radius:9999px;padding:4px 12px;cursor:pointer;';
  showBtn.addEventListener('click', () => restore(article));
  bar.appendChild(showBtn);

  article.innerHTML = '';
  article.appendChild(bar);
}

function restore(article: HTMLElement): void {
  const el = article as HTMLElement & { _xcfOriginal?: string };
  if (el._xcfOriginal != null) {
    article.innerHTML = el._xcfOriginal;
    article.removeAttribute(COLLAPSED);
    delete el._xcfOriginal;
  }
}
