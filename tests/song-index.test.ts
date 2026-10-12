import { describe, expect, it } from 'vitest';
import { bundledSummaries, bundledSummary, loadBundledSong } from '../src/songs/bundled';
import { getSongs } from '../src/songs/catalog';
import { BUNDLED_ENTRIES } from '../src/songs/entries';
import { summarize } from '../src/songs/summary';

describe('lazy bundled songs', () => {
  it('the build-time index matches the fully parsed catalog, in catalog order', () => {
    expect(bundledSummaries()).toEqual(getSongs().map(summarize));
    expect(bundledSummaries().map((s) => s.id)).toEqual(BUNDLED_ENTRIES.map((e) => e.meta.id));
  });

  it('a summary has counts and no notes', () => {
    const mary = bundledSummary('mary-had-a-little-lamb')!;
    expect(mary).toMatchObject({ noteCount: 26, measureCount: 8, level: 1, source: 'bundled' });
    expect('notes' in mary).toBe(false);
    expect('musicXml' in mary).toBe(false);
    expect(bundledSummary('gated')).toBeUndefined();
  });

  it('loads one song on demand, identical to the eager parse, and caches the result', async () => {
    const a = await loadBundledSong('twinkle-twinkle-little-star');
    expect(a).toEqual(getSongs().find((s) => s.id === 'twinkle-twinkle-little-star'));
    expect(a!.notes.length).toBeGreaterThan(0);
    expect(a!.musicXml).toContain('<score-partwise');
    expect(loadBundledSong('twinkle-twinkle-little-star')).toBe(loadBundledSong('twinkle-twinkle-little-star'));
  });

  it('every bundled id loads and matches its summary', async () => {
    for (const s of bundledSummaries()) {
      const song = (await loadBundledSong(s.id))!;
      expect(summarize(song), s.id).toEqual(s);
    }
  });

  it('an unknown id resolves to undefined', async () => {
    expect(await loadBundledSong('nope')).toBeUndefined();
  });
});
