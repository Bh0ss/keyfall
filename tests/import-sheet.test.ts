import { describe, expect, it } from 'vitest';
import { GRID, quantise } from '../src/import/quantise';
import { toMusicXml, barUnitsOf } from '../src/import/toMusicXml';
import { parseMusicXml } from '../src/songs/musicxml';
import type { Hand } from '../src/engine/song';

const n = (midi: number, startBeat: number, durationBeats: number, hand: Hand = 'right') => ({ midi, startBeat, durationBeats, hand });

describe('quantise to sixteenths', () => {
  it('snaps starts and ends to the grid', () => {
    const [a, b] = quantise([n(60, 0.02, 0.97), n(62, 1.11, 0.4)]);
    expect([a!.startBeat, a!.durationBeats]).toEqual([0, 1]);
    expect([b!.startBeat, b!.durationBeats]).toEqual([1.0, 0.5]);
    expect(GRID).toBe(0.25);
  });

  it('never makes a note shorter than one sixteenth', () => {
    const [a] = quantise([n(60, 1, 0.01)]);
    expect(a!.durationBeats).toBe(0.25);
  });

  it('cuts a held note when the same pitch is struck again, and drops exact duplicates', () => {
    const out = quantise([n(60, 0, 2), n(60, 1, 1), n(64, 0, 1), n(64, 0.01, 1)]);
    expect(out.filter((x) => x.midi === 60).map((x) => [x.startBeat, x.durationBeats])).toEqual([[0, 1], [1, 1]]);
    expect(out.filter((x) => x.midi === 64)).toHaveLength(1);
  });

  it('keeps the same pitch in both hands', () => {
    expect(quantise([n(60, 0, 1, 'right'), n(60, 0, 1, 'left')])).toHaveLength(2);
  });
});

describe('generated MusicXML', () => {
  const roundTrip = (notes: ReturnType<typeof n>[], ts: [number, number] = [4, 4]) => {
    const q = quantise(notes);
    const xml = toMusicXml({ title: 'T & <Co>', composer: 'A "B"', bpm: 96, timeSignature: ts, notes: q });
    const song = parseMusicXml(xml, { id: 'x', level: 1 });
    const bar = (ts[0] * 4) / ts[1];
    const want = q.map((x) => [x.midi, x.startBeat, x.durationBeats, x.hand, Math.floor(x.startBeat / bar) + 1].join('/')).sort();
    const got = song.notes.map((x) => [x.midi, x.startBeat, x.durationBeats, x.hand, x.measure].join('/')).sort();
    return { xml, song, want, got };
  };

  it('reads back to the same notes: odd lengths, ties over bar lines, chords, rests', () => {
    const { got, want, song } = roundTrip([
      n(60, 0, 1.25), n(64, 0, 1.25), n(67, 0, 1.25), // chord of 5 sixteenths
      n(62, 2.75, 3), // crosses the bar line
      n(72, 8, 0.25), n(74, 9.5, 2.25),
      n(40, 0, 4, 'left'), n(43, 5, 1.5, 'left'), n(36, 12, 6, 'left'),
    ]);
    expect(got).toEqual(want);
    expect(song.bpm).toBe(96);
    expect(song.timeSignature).toEqual([4, 4]);
    expect(song.title).toBe('T & <Co>');
    expect(song.composer).toBe('A "B"');
  });

  it('puts overlapping notes of one hand in separate voices', () => {
    const { got, want } = roundTrip([n(60, 0, 4), n(64, 1, 1), n(67, 2, 0.5), n(62, 3, 1)]);
    expect(got).toEqual(want);
  });

  it('handles 3/4 and 6/8 bars', () => {
    const w = roundTrip([n(60, 0, 3), n(62, 3, 1), n(64, 5, 2)], [3, 4]);
    expect(w.got).toEqual(w.want);
    const six = roundTrip([n(60, 0, 1.5), n(62, 1.5, 1.5), n(64, 3, 3)], [6, 8]);
    expect(six.got).toEqual(six.want);
    expect(barUnitsOf([6, 8])).toBe(12);
    expect(barUnitsOf([7, 32])).toBeNull();
  });

  it('is valid for a single measure and for no notes at all', () => {
    expect(parseMusicXml(toMusicXml({ title: 't', composer: 'c', bpm: 100, timeSignature: [4, 4], notes: [] }), { id: 'e', level: 1 }).notes).toEqual([]);
    const one = roundTrip([n(60, 0, 1)]);
    expect(one.got).toEqual(one.want);
  });
});
