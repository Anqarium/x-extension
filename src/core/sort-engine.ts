import type { ReplyData, TieBreaker } from './models';

export function sortReplies(replies: ReplyData[], tieBreaker: TieBreaker): ReplyData[] {
  return [...replies].sort((a, b) => {
    if (b.likes !== a.likes) return b.likes - a.likes;
    const tb = b[tieBreaker] - a[tieBreaker];
    if (tb !== 0) return tb;
    // ikincil tie-breaker: diğer etkileşim alanı
    const other: TieBreaker = tieBreaker === 'reposts' ? 'replies' : 'reposts';
    return b[other] - a[other];
  });
}
