import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HANDS_FILTER,
  DEFAULT_SORT,
  filterSongs,
  lastPlayedBySong,
  parseHandsFilter,
  parseSort,
  sortSongs,
  viewSongs,
  type ListSong,
} from '../src/songs/listView';

const s = (id: string, title: string, level: ListSong['level'], hands: ListSong['hands']): ListSong => ({ id, title, level, hands });

const SONGS: ListSong[] = [
  s('c', 'Canon', 5, 'both'),
  s('b', 'beta', 1, 'right'),
  s('a', 'Alpha', 1, 'left'),
  s('x', 'Expert piece', 'expert', 'both'),
  s('m', 'Minuet', 3, 'right'),
];

const ids = (l: ListSong[]) => l.map((x) => x.id);

describe('sortSongs', () => {
  it('difficulty orders by level (expert last), then title ignoring case', () => {
    expect(ids(sortSongs(SONGS, 'difficulty', new Map()))).toEqual(['a', 'b', 'm', 'c', 'x']);
  });

  it('A-Z orders by title ignoring case', () => {
    expect(ids(sortSongs(SONGS, 'title', new Map()))).toEqual(['a', 'b', 'c', 'x', 'm']);
  });

  it('recent puts the latest play first, never-played last in A-Z order', () => {
    const played = new Map([
      ['m', 100],
      ['c', 500],
    ]);
    expect(ids(sortSongs(SONGS, 'recent', played))).toEqual(['c', 'm', 'a', 'b', 'x']);
  });

  it('recent breaks equal times by title', () => {
    const played = new Map([
      ['b', 7],
      ['a', 7],
    ]);
    expect(ids(sortSongs(SONGS, 'recent', played)).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('does not change the input array', () => {
    const copy = [...SONGS];
    sortSongs(SONGS, 'title', new Map());
    expect(SONGS).toEqual(copy);
  });
});

describe('filterSongs', () => {
  it('all keeps everything', () => {
    expect(filterSongs(SONGS, 'all')).toHaveLength(5);
  });

  it('right and left keep only songs for that one hand', () => {
    expect(ids(filterSongs(SONGS, 'right'))).toEqual(['b', 'm']);
    expect(ids(filterSongs(SONGS, 'left'))).toEqual(['a']);
  });

  it('both keeps the two-hand songs', () => {
    expect(ids(filterSongs(SONGS, 'both'))).toEqual(['c', 'x']);
  });
});

describe('viewSongs', () => {
  it('filters then sorts', () => {
    expect(ids(viewSongs(SONGS, { sort: 'title', hands: 'right' }, new Map()))).toEqual(['b', 'm']);
  });
});

describe('lastPlayedBySong', () => {
  it('takes the latest of attempts and scores for each song', () => {
    const map = lastPlayedBySong(
      [
        { songId: 'a', finishedAt: 10 },
        { songId: 'a', finishedAt: 30 },
        { songId: 'b', finishedAt: 5 },
      ],
      [
        { songId: 'a', achievedAt: 20 },
        { songId: 'c', achievedAt: 40 },
      ],
    );
    expect(Object.fromEntries(map)).toEqual({ a: 30, b: 5, c: 40 });
  });
});

describe('remembered choices', () => {
  it('fall back to the defaults for anything unknown', () => {
    expect(parseSort(undefined)).toBe(DEFAULT_SORT);
    expect(parseSort('nonsense')).toBe(DEFAULT_SORT);
    expect(parseSort('recent')).toBe('recent');
    expect(parseHandsFilter(undefined)).toBe(DEFAULT_HANDS_FILTER);
    expect(parseHandsFilter('feet')).toBe(DEFAULT_HANDS_FILTER);
    expect(parseHandsFilter('left')).toBe('left');
  });
});
