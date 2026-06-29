import type { FilterDecision } from '../core/models';
import { CATEGORY_LABELS } from '../core/models';
import { collapseArticle, restoreArticle, isCollapsed } from './collapse';

const BADGE = 'data-xcf-badge';
const REMOVED = 'data-xcf-removed';
const PREV_DISPLAY = 'data-xcf-removed-prev';

function clearBadge(article: HTMLElement): void {
  const existing = article.querySelector(`[${BADGE}]`);
  if (existing) existing.remove();
}

function addBadge(article: HTMLElement, decision: FilterDecision): void {
  if (article.querySelector(`[${BADGE}]`)) return;
  const label = decision.category ? CATEGORY_LABELS[decision.category] : 'Topluluk uyarısı';
  const badge = document.createElement('div');
  badge.setAttribute(BADGE, '1');
  badge.textContent = `⚠ Topluluk: ${label}`;
  badge.style.cssText =
    'margin:4px 16px;padding:2px 10px;border:1px solid #f4a261;color:#f4a261;' +
    'border-radius:9999px;font-size:12px;display:inline-block;';
  article.prepend(badge);
}

function removeArticle(article: HTMLElement): void {
  if (article.getAttribute(REMOVED)) return;
  article.setAttribute(REMOVED, '1');
  article.setAttribute(PREV_DISPLAY, article.style.display);
  article.style.display = 'none';
}

function unremove(article: HTMLElement): void {
  if (!article.getAttribute(REMOVED)) return;
  article.style.display = article.getAttribute(PREV_DISPLAY) ?? '';
  article.removeAttribute(REMOVED);
  article.removeAttribute(PREV_DISPLAY);
}

// Topluluk kararını idempotent uygular. handle, collapse marker'ı olarak kullanılır.
export function applyDecision(article: HTMLElement, handle: string, decision: FilterDecision): void {
  // Önce diğer durumlardan temizle (karar değişmiş olabilir)
  if (decision.action !== 'badge') clearBadge(article);
  if (decision.action !== 'remove') unremove(article);

  switch (decision.action) {
    case 'show':
      if (isCollapsed(article)) restoreArticle(article);
      return;
    case 'collapse': {
      const label = decision.reason === 'blocklist'
        ? `@${handle} engellendi`
        : `@${handle} — topluluk filtresi`;
      collapseArticle(article, label, handle);
      return;
    }
    case 'badge':
      if (isCollapsed(article)) restoreArticle(article);
      addBadge(article, decision);
      return;
    case 'remove':
      removeArticle(article);
      return;
  }
}
