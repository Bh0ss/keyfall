import { describe, expect, it } from 'vitest';
import { gridFrom } from '../src/arrange/grid';
import { keyOf } from '../src/arrange/key';
import { extractMelody } from '../src/arrange/melody';
import { secOf } from '../src/arrange/types';
import type { NoteEvent } from '../src/transcribe/types';
import { bundledSong, referenceNotes } from './fixtures/audio';
import { eventsOf } from './fixtures/events';
import { onsetF1 } from './fixtures/metrics';

const ev = (midi: number, startSec: number, durationSec: number, amplitude = 0.8): NoteEvent => ({ midi, startSec, durationSec, amplitude });
// 120 bpm: a beat is 0.5 s, an 8th is 0.25 s, a 4/4 bar is 2 s.
const grid = gridFrom(120, 0, [4, 4]);
const C = keyOf(0, 'major');
const run = (events: NoteEvent[]) => extractMelody(events, grid, C);

describe('melody extraction', () => {
  it('snaps to the 8th grid, never overlaps itself, and is monophonic', () => {
    const m = run([ev(60, 0.02, 0.45), ev(62, 0.52, 0.9), ev(64, 1.49, 0.5), ev(65, 2.01, 1)]);
    expect(m.map((n) => n.midi)).toEqual([60, 62, 64, 65]);
    for (const n of m) expect(n.startBeat % 0.5).toBeCloseTo(0, 9);
    m.slice(1).forEach((n, i) => expect(n.startBeat).toBeGreaterThanOrEqual(m[i]!.startBeat + m[i]!.durationBeats - 1e-9));
    expect(m.every((n) => n.durationBeats >= 0.5)).toBe(true);
  });

  it('uses the melody band: bass notes are not melody, and the loud top line wins a slot', () => {
    const m = run([ev(36, 0, 2, 0.9), ev(64, 0, 1, 0.7), ev(67, 0, 0.2, 0.3), ev(40, 1, 1, 0.9), ev(65, 1, 1, 0.7)]);
    expect(m.map((n) => n.midi)).toEqual([64, 65]);
  });

  it('rejects an upper partial: a note 12, 19 or 24 semitones above a louder simultaneous note', () => {
    for (const interval of [12, 19, 24]) {
      const m = run([ev(48 - 12 + 12 - 0, 0, 2, 0.9), ev(48 + interval, 0, 2, 0.4), ev(62, 2, 1, 0.8)]);
      expect(m.map((n) => n.midi)).toEqual([62]);
    }
  });

  it('keeps an octave that is louder than the note under it (a real octave melody)', () => {
    const m = run([ev(48, 0, 1, 0.3), ev(60, 0, 1, 0.9)]);
    expect(m.map((n) => n.midi)).toEqual([60]);
  });

  it('merges a re-onset of the same pitch within 120 ms into the held note, but keeps a real repeat', () => {
    expect(run([ev(64, 0, 0.5), ev(64, 0.1, 0.4)])).toHaveLength(1);
    expect(run([ev(64, 0, 0.5), ev(64, 0.5, 0.5)])).toHaveLength(2);
  });

  it('drops an out-of-key note shorter than an 8th, keeps it when longer, and drops specks', () => {
    expect(run([ev(61, 0, 0.2)])).toEqual([]);
    expect(run([ev(61, 0, 0.5)]).map((n) => n.midi)).toEqual([61]);
    expect(run([ev(60, 0, 0.04)])).toEqual([]);
  });

  it('widens the band to G3-E6 only for a bar with nothing inside C4-C6', () => {
    const m = run([ev(57, 0, 1), ev(62, 2, 1), ev(86, 2.5, 0.5, 0.2), ev(87, 4.5, 1)]);
    // bar 1 has only 57 (below C4): widened, so kept. Bar 2 has 62 in band; the 86 stays out. Bar 3 has only 87: widened.
    expect(m.map((n) => n.midi)).toEqual([57, 62, 87]);
  });

  it('avoids a jump of an octave or more between neighbouring slots when a close candidate is nearly as loud', () => {
    const m = run([ev(64, 0, 0.5), ev(76, 0.5, 0.5, 0.75), ev(65, 0.5, 0.5, 0.7), ev(67, 1, 0.5)]);
    expect(m.map((n) => n.midi)).toEqual([64, 65, 67]);
  });

  it('keeps a melody that really does leap an octave when nothing competes', () => {
    expect(run([ev(60, 0, 0.5), ev(72, 0.5, 0.5)]).map((n) => n.midi)).toEqual([60, 72]);
  });

  it('empty and silent input give no melody', () => {
    expect(run([])).toEqual([]);
  });

  it('is deterministic', () => {
    const events = eventsOf(bundledSong('when-the-saints'), 20);
    expect(run(events)).toEqual(run(events));
  });

  it.each(['ode-to-joy', 'when-the-saints'])('recovers the right hand of %s from a perfect transcription (melody F1 >= 0.9)', (stem) => {
    const song = bundledSong(stem);
    const g = gridFrom(song.bpm, 0, song.timeSignature);
    const m = extractMelody(eventsOf(song, 20), g, C);
    const ref = referenceNotes(song, 20).filter((n) => n.hand === 'right');
    const est = m.map((n) => ({ midi: n.midi, startSec: secOf(g, n.startBeat) }));
    const s = onsetF1(ref, est, 0.5 * (60 / song.bpm));
    expect(s.f1).toBeGreaterThanOrEqual(0.9);
  });
});
