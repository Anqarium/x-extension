export function normalizeHandle(handle: string): string {
  if (!handle) return '';
  return handle.trim().replace(/^@/, '').toLowerCase();
}
