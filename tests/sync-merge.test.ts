import { describe, expect, it } from 'vitest';
import { shouldTakeRemote } from '../src/sync/merge';

const base = { id: 'x', updatedAt: 100 };

describe('merge rules', () => {
  it('last write wins by updatedAt', () => {
    expect(shouldTakeRemote('profiles', { ...base, updatedAt: 100 }, { ...base, updatedAt: 101 })).toBe(true);
    expect(shouldTakeRemote('profiles', { ...base, updatedAt: 101 }, { ...base, updatedAt: 100 })).toBe(false);
  });

  it('an equal stamp keeps the local row', () => {
    expect(shouldTakeRemote('profiles', base, { ...base })).toBe(false);
  });

  it('takes a remote row when there is no local one', () => {
    expect(shouldTakeRemote('attempts', undefined, base)).toBe(true);
  });

  it('a newer delete beats an older edit, and a newer edit beats an older delete', () => {
    expect(shouldTakeRemote('songs', { ...base, updatedAt: 100 }, { ...base, updatedAt: 200, deletedAt: 200 })).toBe(true);
    expect(shouldTakeRemote('songs', { ...base, updatedAt: 300 }, { ...base, updatedAt: 200, deletedAt: 200 })).toBe(false);
    expect(shouldTakeRemote('songs', { ...base, updatedAt: 200, deletedAt: 200 }, { ...base, updatedAt: 300 })).toBe(true);
  });

  it('scores keep the maximum whatever the timestamps say', () => {
    const local = { ...base, updatedAt: 500, score: 4800 };
    expect(shouldTakeRemote('scores', local, { ...base, updatedAt: 900, score: 3000 })).toBe(false);
    expect(shouldTakeRemote('scores', { ...local, score: 3000 }, { ...base, updatedAt: 100, score: 4800 })).toBe(true);
  });

  it('a tied score keeps the local (earlier or same) record', () => {
    expect(shouldTakeRemote('scores', { ...base, score: 100 }, { ...base, updatedAt: 999, score: 100 })).toBe(false);
  });
});
