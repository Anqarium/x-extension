import { getHandleFromArticle, findActionBar } from './adapters/x-selectors';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../core/models';

const MARK = 'data-xcf-report-injected';

export interface ReportMenuCallbacks {
  isSignedIn: () => boolean;
  onReport: (handle: string, category: Category) => void;
  onNeedLogin: () => void;
}

function buildMenu(handle: string, cb: ReportMenuCallbacks): HTMLElement {
  const menu = document.createElement('div');
  menu.style.cssText =
    'position:absolute;z-index:99999;background:#15181c;border:1px solid #2f3336;' +
    'border-radius:12px;padding:6px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.5);';

  if (!cb.isSignedIn()) {
    const item = document.createElement('button');
    item.textContent = 'Rapor vermek için giriş yap';
    item.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:#1d9bf0;padding:8px 12px;cursor:pointer;';
    item.addEventListener('click', () => { cb.onNeedLogin(); menu.remove(); });
    menu.appendChild(item);
    return menu;
  }

  for (const cat of CATEGORIES) {
    const item = document.createElement('button');
    item.textContent = CATEGORY_LABELS[cat];
    item.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;border:none;color:#e7e9ea;padding:8px 12px;cursor:pointer;border-radius:8px;';
    item.addEventListener('mouseenter', () => { item.style.background = '#1d2127'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', () => { cb.onReport(handle, cat); menu.remove(); });
    menu.appendChild(item);
  }
  return menu;
}

// Her gönderiye "Rapor et" butonu ekler; tıklanınca kategori menüsü açar.
export function injectReportButton(article: HTMLElement, cb: ReportMenuCallbacks): void {
  if (article.hasAttribute(MARK)) return;
  const bar = findActionBar(article);
  const handle = getHandleFromArticle(article);
  if (!bar || !handle) return;

  article.setAttribute(MARK, '1');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = `@${handle} hesabını raporla`;
  btn.textContent = '🚩';
  btn.style.cssText = 'background:transparent;border:none;cursor:pointer;color:#71767b;font-size:15px;padding:0 8px;';

  let open: HTMLElement | null = null;
  const close = () => { open?.remove(); open = null; document.removeEventListener('click', onDocClick, true); };
  const onDocClick = (e: MouseEvent) => { if (open && !open.contains(e.target as Node) && e.target !== btn) close(); };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) { close(); return; }
    const menu = buildMenu(handle, cb);
    document.body.appendChild(menu);
    const rect = btn.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    open = menu;
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  });

  bar.appendChild(btn);
}
