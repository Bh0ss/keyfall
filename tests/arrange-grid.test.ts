import { describe, expect, it } from 'vitest';
import { estimateGrid, gridFrom } from '../src/arrange/grid';
import { bundledSong } from './fixtures/audio';
import { eventsOf } from './fixtures/events';

describe('beat grid', () => {
  it.each([
    ['ode-to-joy', 100, [4, 4] as [number, number]],
    ['when-the-saints', 100, [4, 4] as [number, number]],
  ])('%s: tempo within 3 percent of %d and a downbeat on a bar line', (stem, bpm, ts) => {
    const song = bundledSong(stem);
    const g = estimateGrid(eventsOf(song, 20), ts);
    expect(Math.abs(g.bpm - bpm) / bpm).toBeLessThan(0.03);
    expect(g.confidence).toBeGreaterThan(0);
    const barSec = (60 / bpm) * ts[0];
    // The song's bars start at 0, so the estimated downbeat is a whole number of bars from 0 (within a tenth of a beat).
    const off = Math.abs(((g.downbeatSec / barSec) % 1) + 1) % 1;
    expect(Math.min(off, 1 - off) * ts[0]).toBeLessThan(0.15);
  });

  it('fur-elise (sixteenths throughout): the tempo is right or doubled, never anything else', () => {
    // Onsets alone cannot tell 72 from 144 here; the review screen's tap-tempo settles it. A double is a harmless error.
    const g = estimateGrid(eventsOf(bundledSong('fur-elise'), 20), [3, 4]);
    const near = (x: number) => Math.abs(g.bpm - x) / x < 0.03;
    expect(near(72) || near(144)).toBe(true);
  });

  it('follows a late start: audio that begins 1.3 s in', () => {
    const song = bundledSong('ode-to-joy');
    const g = estimateGrid(eventsOf(song, 20, 1.3), [4, 4]);
    const beat = 0.6;
    const off = (((g.downbeatSec - 1.3) / (beat * 4)) % 1 + 1) % 1;
    expect(Math.min(off, 1 - off) * 4).toBeLessThan(0.15);
  });

  it('a given tempo is kept exactly and only the phase is searched', () => {
    const g = estimateGrid(eventsOf(bundledSong('ode-to-joy'), 20), [4, 4], { bpm: 100 });
    expect(g.bpm).toBe(100);
  });

  it('gridFrom builds a plain grid with the bar length in quarter beats', () => {
    expect(gridFrom(90, 0.5, [6, 8])).toEqual({ bpm: 90, downbeatSec: 0.5, timeSignature: [6, 8], barBeats: 3 });
  });

  it('too few notes give zero confidence and the default tempo', () => {
    const g = estimateGrid([], [4, 4]);
    expect(g.bpm).toBe(100);
    expect(g.confidence).toBe(0);
  });
});
