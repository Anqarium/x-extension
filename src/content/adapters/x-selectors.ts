import type { ReplyData } from '../../core/models';

// --- X'e özgü seçiciler: X arayüzü değişirse YALNIZCA burası güncellenir ---
export const SEL = {
  article: 'article[data-testid="tweet"]',
  userName: '[data-testid="User-Name"]',
  verified: '[data-testid="icon-verified"]',
  tweetText: '[data-testid="tweetText"]',
  like: '[data-testid="like"]',
  retweet: '[data-testid="retweet"]',
  reply: '[data-testid="reply"]',
  timeLink: 'a:has(time)',
  avatarImg: '[data-testid="Tweet-User-Avatar"] img'
} as const;

export function parseCount(text: string | null): number {
  if (!text) return 0;
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return Math.round(n * 1_000);
  if (suffix === 'M') return Math.round(n * 1_000_000);
  return Math.round(n);
}

function countFrom(article: HTMLElement, selector: string): number {
  const btn = article.querySelector(selector);
  if (!btn) return 0;
  const label = btn.getAttribute('aria-label');
  return parseCount(label);
}

export function findReplyArticles(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SEL.article));
}

export function getHandleFromArticle(article: HTMLElement): string | null {
  const userName = article.querySelector(SEL.userName);
  if (!userName) return null;
  const handleLink = Array.from(userName.querySelectorAll('a'))
    .map(a => a.textContent || '')
    .find(t => t.startsWith('@'));
  if (!handleLink) return null;
  return handleLink.replace(/^@/, '').trim().toLowerCase();
}

export function findActionBar(article: HTMLElement): HTMLElement | null {
  const like = article.querySelector(SEL.like);
  return (like?.parentElement?.parentElement as HTMLElement) ?? null;
}

/**
 * Fallback for jsdom environments that don't support CSS :has().
 * On real browsers, querySelector(SEL.timeLink) works directly.
 * In jsdom, we fall back to scanning anchors manually.
 */
function findTimeLink(article: HTMLElement): HTMLAnchorElement | null {
  // First attempt: native CSS :has() (works in real Chrome/Edge)
  try {
    const el = article.querySelector<HTMLAnchorElement>(SEL.timeLink);
    if (el) return el;
  } catch {
    // jsdom may throw on unsupported pseudo-class — fall through
  }

  // Fallback: find first <a> that contains a <time> element and href matches /status/\d+
  const anchors = Array.from(article.querySelectorAll<HTMLAnchorElement>('a'));
  return anchors.find(
    a => a.querySelector('time') !== null && /\/status\/\d+/.test(a.getAttribute('href') ?? '')
  ) ?? null;
}

export function parseReply(article: HTMLElement): ReplyData | null {
  const handle = getHandleFromArticle(article);
  const userName = article.querySelector(SEL.userName);
  const displayName = userName?.querySelector('span')?.textContent?.trim() ?? '';
  const timeLink = findTimeLink(article);
  const permalink = timeLink?.getAttribute('href') ?? '';
  const idMatch = permalink.match(/status\/(\d+)/);

  if (!handle || !idMatch) return null; // zorunlu alanlar yoksa atla, sayfayı bozma

  return {
    id: idMatch[1],
    handle,
    displayName,
    text: article.querySelector(SEL.tweetText)?.textContent?.trim() ?? '',
    likes: countFrom(article, SEL.like),
    reposts: countFrom(article, SEL.retweet),
    replies: countFrom(article, SEL.reply),
    isVerified: !!article.querySelector(SEL.verified),
    permalink: permalink.startsWith('http') ? permalink : `https://x.com${permalink}`,
    avatarUrl: article.querySelector<HTMLImageElement>(SEL.avatarImg)?.src ?? null
  };
}
