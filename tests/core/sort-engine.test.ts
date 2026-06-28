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

describe('sortReplies', () => {
  it('beğeniye göre azalan sıralar', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 5 }), reply({ id: 'b', likes: 50 }), reply({ id: 'c', likes: 10 })],
      'reposts'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('mavi tik sıralamayı etkilemez; en çok beğenilen mavi tikli en üstte', () => {
    const out = sortReplies(
      [reply({ id: 'plain', likes: 10, isVerified: false }),
       reply({ id: 'verified', likes: 99, isVerified: true })],
      'reposts'
    );
    expect(out[0].id).toBe('verified');
  });

  it('eşit beğenide tie-breaker reposts kullanır', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 10, reposts: 1 }), reply({ id: 'b', likes: 10, reposts: 9 })],
      'reposts'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('eşit beğenide tie-breaker replies seçilebilir', () => {
    const out = sortReplies(
      [reply({ id: 'a', likes: 10, replies: 2 }), reply({ id: 'b', likes: 10, replies: 8 })],
      'replies'
    );
    expect(out.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('girdiyi mutasyona uğratmaz', () => {
    const input = [reply({ id: 'a', likes: 1 }), reply({ id: 'b', likes: 2 })];
    const copy = [...input];
    sortReplies(input, 'reposts');
    expect(input).toEqual(copy);
  });
});
