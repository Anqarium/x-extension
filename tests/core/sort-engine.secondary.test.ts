import { describe, it, expect } from 'vitest';
import { sortReplies } from '../../src/core/sort-engine';
import type { ReplyData } from '../../src/core/models';

function reply(p: Partial<ReplyData>): ReplyData {
  return {
    id: 'x', handle: 'a', displayName: 'A', text: 't',
    likes: 0, reposts: 0, replies: 0, isVerified: false,
    permalink: '', avatarUrl: null, ...p
  };
}

describe('sortReplies secondary tie-breaker', () => {
  it('beğeni ve birincil eşitse ikincil alanı kullanır (reposts birincilse replies ikincil)', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 10, reposts: 5, replies: 1 }),
       reply({ id: 'b', likes: 10, reposts: 5, replies: 9 })],
      'reposts'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'a']);
  });
});
