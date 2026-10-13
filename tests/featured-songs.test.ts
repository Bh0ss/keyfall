import { describe, expect, it } from 'vitest';
import { FEATURED_LIMIT, featuredSongs } from '../src/songs/featured';

type S = { id: string; title: string; level: 1 | 2 | 3 | 4 | 5 | 'expert' };
const s = (id: string, level: S['level'] = 1, title = id): S => ({ id, title, level });
const ids = (xs: readonly S[]) => xs.map((x) => x.id);

describe('featuredSongs', () => {
  const many = Array.from({ length: 40 }, (_, i) => s(`s${String(i).padStart(2, '0')}`, ((i % 5) + 1) as S['level']));

  it('is capped at FEATURED_LIMIT (8)', () => {
    expect(FEATURED_LIMIT).toBe(8);
    expect(featuredSongs(many, new Map(), undefined, 'x')).toHaveLength(8);
    expect(featuredSongs(many.slice(0, 3), new Map(), undefined, 'x')).toHaveLength(3);
  });

  it('puts the up-next song first, then the last played song, then unplayed songs easiest first', () => {
    const open = [s('a', 3), s('b', 1), s('c', 2), s('d', 1), s('e', 'expert')];
    const out = featuredSongs(open, new Map([['c', 3]]), 'c', 'a');
    expect(ids(out)).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('shows unplayed songs before played ones, and songs with fewer stars before three-star ones', () => {
    const open = [s('a', 1), s('b', 1), s('c', 1), s('d', 1)];
    const out = featuredSongs(open, new Map([['a', 3], ['b', 1]]), undefined, 'd');
    expect(ids(out)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('breaks ties by title, so the order is the same on every load', () => {
    const open = [s('x', 1, 'Zebra'), s('y', 1, 'apple'), s('z', 1, 'Mango')];
    expect(ids(featuredSongs(open, new Map(), undefined, 'none'))).toEqual(['y', 'z', 'x']);
    expect(ids(featuredSongs([...open].reverse(), new Map(), undefined, 'none'))).toEqual(['y', 'z', 'x']);
  });

  it('does not repeat a song and ignores a last played song that is not open', () => {
    const open = [s('a'), s('b')];
    expect(ids(featuredSongs(open, new Map(), 'gone', 'a'))).toEqual(['a', 'b']);
    expect(ids(featuredSongs(open, new Map(), 'a', 'a'))).toEqual(['a', 'b']);
  });

  it('returns nothing for no open songs', () => {
    expect(featuredSongs([], new Map(), undefined, undefined)).toEqual([]);
  });
});
