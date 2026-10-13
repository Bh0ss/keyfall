import { describe, expect, it } from 'vitest';
import { detectChords } from '../src/arrange/chords';
import { estimateKey } from '../src/arrange/key';
import { gridFrom } from '../src/arrange/grid';
import type { NoteEvent } from '../src/transcribe/types';
import { bundledSong } from './fixtures/audio';
import { eventsOf } from './fixtures/events';

const ev = (midi: number, startSec: number, durationSec: number, amplitude = 0.8): NoteEvent => ({ midi, startSec, durationSec, amplitude });
// 120 bpm: a beat is 0.5 s, a 4/4 bar is 2 s.
const grid = gridFrom(120, 0, [4, 4]);

describe('key', () => {
  it.each([
    ['ode-to-joy', 0, 'major'],
    ['fur-elise', 9, 'minor'],
  ])('%s is found from its notes', (stem, tonic, mode) => {
    const k = estimateKey(eventsOf(bundledSong(stem), 20));
    expect([k.tonic, k.mode]).toEqual([tonic, mode]);
  });

  it('a major key holds its seven degrees; a minor key adds the raised seventh', () => {
    const c = estimateKey([ev(60, 0, 1), ev(64, 1, 1), ev(67, 2, 1), ev(60, 3, 1), ev(62, 4, 1), ev(65, 5, 1), ev(67, 6, 1)]);
    expect([...c.pcs].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    const a = estimateKey([ev(57, 0, 2), ev(60, 2, 1), ev(64, 3, 2), ev(57, 5, 2), ev(59, 7, 1), ev(60, 8, 1), ev(64, 9, 2)]);
    expect(a.mode).toBe('minor');
    expect(a.pcs.has(8)).toBe(true);
  });

  it('empty input is C major', () => {
    expect(estimateKey([])).toMatchObject({ tonic: 0, mode: 'major' });
  });
});

describe('chords', () => {
  const key = estimateKey([ev(60, 0, 1), ev(64, 1, 1), ev(67, 2, 1), ev(62, 3, 1), ev(65, 4, 1), ev(71, 5, 1)]);

  it('names C then G from their tones, one chord per half bar, with bass counted double', () => {
    const events = [
      // bar 1: C E G arpeggio, bass C2
      ev(36, 0, 2), ev(60, 0, 0.5), ev(64, 0.5, 0.5), ev(67, 1, 0.5), ev(64, 1.5, 0.5),
      // bar 2: G B D arpeggio, bass G2
      ev(43, 2, 2), ev(67, 2, 0.5), ev(71, 2.5, 0.5), ev(74, 3, 0.5), ev(71, 3.5, 0.5),
    ];
    const segs = detectChords(events, grid, key, 2);
    expect(segs.map((s) => [s.root, s.quality])).toEqual([[0, 'maj'], [7, 'maj']]);
    expect(segs.map((s) => [s.startBeat, s.endBeat])).toEqual([[0, 4], [4, 8]]);
  });

  it('segments tile the span exactly and merge equal neighbours', () => {
    const events = [ev(36, 0, 6), ev(60, 0, 6), ev(64, 0, 6), ev(67, 0, 6)];
    const segs = detectChords(events, grid, key, 3);
    expect(segs[0]!.startBeat).toBe(0);
    expect(segs.at(-1)!.endBeat).toBe(12);
    segs.slice(1).forEach((s, i) => expect(s.startBeat).toBe(segs[i]!.endBeat));
    expect(segs).toHaveLength(1);
  });

  it('silence carries the neighbouring chord', () => {
    const events = [ev(36, 0, 2), ev(60, 0, 2), ev(64, 0, 2), ev(67, 0, 2)];
    const segs = detectChords(events, grid, key, 3);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.root).toBe(0);
  });

  it('a quick passing note does not flip the chord (change penalty)', () => {
    const events = [ev(36, 0, 4), ev(60, 0, 4), ev(64, 0, 4), ev(67, 0, 4), ev(62, 2.05, 0.1, 0.3)];
    expect(detectChords(events, grid, key, 2).map((s) => s.root)).toEqual([0]);
  });

  it('never invents a root outside the key plus the secondary dominant', () => {
    const segs = detectChords(eventsOf(bundledSong('ode-to-joy'), 20), grid, key, 8);
    for (const s of segs) expect([0, 2, 4, 5, 7, 9, 11, 4 /* V/vi */]).toContain(s.root);
  });
});
