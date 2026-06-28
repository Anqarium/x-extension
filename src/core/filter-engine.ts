import type { Lists, FilterAction } from './models';

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

export function decideAction(handle: string, lists: Lists): FilterAction {
  const h = normalizeHandle(handle);
  if (lists.whitelist.some(w => normalizeHandle(w) === h)) return 'show';
  if (lists.blocklist.some(b => normalizeHandle(b) === h)) return 'collapse';
  return 'show';
}
