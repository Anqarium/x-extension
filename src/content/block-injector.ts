import { getHandleFromArticle, findActionBar } from './adapters/x-selectors';

const BTN_CLASS = 'xcf-block-btn';
const MARK = 'data-xcf-injected';

export interface BlockInjectorCallbacks {
  onBlock: (handle: string) => void;
}

// Her yorum/gönderiye tek-tık engelle butonu ekler.
export function injectBlockButton(article: HTMLElement, cb: BlockInjectorCallbacks): void {
  if (article.hasAttribute(MARK)) return;
  const bar = findActionBar(article);
  const handle = getHandleFromArticle(article);
  if (!bar || !handle) return;

  article.setAttribute(MARK, '1');
  const btn = document.createElement('button');
  btn.className = BTN_CLASS;
  btn.type = 'button';
  btn.title = `@${handle} hesabını engelle`;
  btn.textContent = '🚫';
  btn.style.cssText =
    'background:transparent;border:none;cursor:pointer;color:#71767b;font-size:15px;padding:0 8px;';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onBlock(handle);
  });
  bar.appendChild(btn);
}
