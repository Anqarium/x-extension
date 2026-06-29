import type { Lists, FilterAction, Verdict, CommunityFilterSettings, FilterDecision } from './models';

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

export function decideAction(handle: string, lists: Lists): FilterAction {
  const h = normalizeHandle(handle);
  if (lists.whitelist.some(w => normalizeHandle(w) === h)) return 'show';
  if (lists.blocklist.some(b => normalizeHandle(b) === h)) return 'collapse';
  return 'show';
}

export function decideFilter(
  handle: string,
  lists: Lists,
  verdict: Verdict | null,
  community: CommunityFilterSettings
): FilterDecision {
  const h = normalizeHandle(handle);

  if (lists.whitelist.some((w) => normalizeHandle(w) === h)) {
    return { action: 'show', autoblock: false, reason: 'whitelist', category: null };
  }
  if (lists.blocklist.some((b) => normalizeHandle(b) === h)) {
    return { action: 'collapse', autoblock: false, reason: 'blocklist', category: null };
  }

  if (
    community.enabled &&
    verdict &&
    verdict.state !== 'clean' &&
    verdict.topCategory !== null &&
    community.enabledCategories.includes(verdict.topCategory)
  ) {
    if (verdict.state === 'flagged') {
      switch (community.flaggedAction) {
        case 'warn':
          return { action: 'badge', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'collapse':
          return { action: 'collapse', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'remove':
          return { action: 'remove', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'autoblock':
          return { action: 'collapse', autoblock: true, reason: 'community', category: verdict.topCategory };
      }
    }
    if (verdict.state === 'suspicious') {
      switch (community.suspiciousAction) {
        case 'off':
          return { action: 'show', autoblock: false, reason: 'none', category: null };
        case 'badge':
          return { action: 'badge', autoblock: false, reason: 'community', category: verdict.topCategory };
        case 'collapse':
          return { action: 'collapse', autoblock: false, reason: 'community', category: verdict.topCategory };
      }
    }
  }

  return { action: 'show', autoblock: false, reason: 'none', category: null };
}
