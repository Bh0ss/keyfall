import { describe, expect, it } from 'vitest';
import { autoFingers, autoFingersFor } from '../src/engine/fingering';
import { analysePositions } from '../src/engine/positions';
import type { Hand, SongNote } from '../src/engine/song';

let seq = 0;
function n(midi: number, beat: number, hand: Hand = 'right', finger?: SongNote['finger'], dur = 1): SongNote {
  const note: SongNote = { id: `f${seq++}`, midi, startBeat: beat, durationBeats: dur, hand, measure: Math.floor(beat / 4) + 1 };
  if (finger !== undefined) note.finger = finger;
  return note;
}
const line = (pitches: number[], hand: Hand = 'right', dur = 0.5) => pitches.map((p, i) => n(p, i * dur, hand, undefined, dur));
const fingersOf = (notes: SongNote[]) => {
  const m = autoFingers(notes);
  return notes.map((x) => m.get(x.id));
};

describe('auto fingering: worked examples', () => {
  it('a C major scale up and down one octave, right hand: the textbook 1 2 3 1 2 3 4 5', () => {
    const up = line([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(fingersOf(up)).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    const down = line([72, 71, 69, 67, 65, 64, 62, 60]);
    expect(fingersOf(down)).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
  });

  it('a C major scale one octave, left hand: 5 4 3 2 1 3 2 1 up and 1 2 3 1 2 3 4 5 down', () => {
    expect(fingersOf(line([48, 50, 52, 53, 55, 57, 59, 60], 'left'))).toEqual([5, 4, 3, 2, 1, 3, 2, 1]);
    expect(fingersOf(line([60, 59, 57, 55, 53, 52, 50, 48], 'left'))).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
  });

  it('a triad is spread over 1 3 5 (right) and 5 3 1 (left), lowest note first', () => {
    expect(fingersOf([n(60, 0), n(64, 0), n(67, 0)])).toEqual([1, 3, 5]);
    expect(fingersOf([n(48, 0, 'left'), n(52, 0, 'left'), n(55, 0, 'left')])).toEqual([5, 3, 1]);
  });
});

describe('auto fingering: Fur Elise opening, right hand', () => {
  it('E D# E D# E B D C A, then C E A B, takes 5 4 5 4 5 2 4 3 2 1 3 4 5: the hand stays put and the pinky never goes under the thumb', () => {
    const at: [number, number][] = [[76, 1], [75, 1.25], [76, 1.5], [75, 1.75], [76, 2], [71, 2.25], [74, 2.5], [72, 2.75], [69, 3], [60, 3.75], [64, 4], [69, 4.25], [71, 4.5]];
    const notes = at.map(([midi, beat]) => n(midi, beat, 'right', undefined, 0.25));
    expect(fingersOf(notes)).toEqual([5, 4, 5, 4, 5, 2, 4, 3, 2, 1, 3, 4, 5]);
  });
});

describe('auto fingering: authored fingers', () => {
  it('only notes without a finger get one, and given fingers steer the rest', () => {
    const notes = [n(60, 0, 'right', 1), n(62, 1), n(64, 2, 'right', 3), n(65, 3), n(67, 4, 'right', 5)];
    const m = autoFingers(notes);
    expect([...m.keys()].sort()).toEqual([notes[1]!.id, notes[3]!.id].sort());
    // Between a thumb on C and a middle finger on E sits the index; between that middle finger on E and a pinky on G sits the ring.
    expect(m.get(notes[1]!.id)).toBe(2);
    expect(m.get(notes[3]!.id)).toBe(4);
  });

  it('a fully fingered hand gets nothing, and the other hand is fingered on its own', () => {
    const notes = [n(60, 0, 'right', 1), n(62, 1, 'right', 2), n(48, 0, 'left'), n(50, 1, 'left')];
    const m = autoFingers(notes);
    expect([...m.keys()].sort()).toEqual([notes[2]!.id, notes[3]!.id].sort());
  });

  it('is deterministic and handles an empty song', () => {
    const notes = line([60, 64, 62, 65, 67, 72, 71, 69]);
    expect([...autoFingers(notes)]).toEqual([...autoFingers(notes)]);
    expect(autoFingers([]).size).toBe(0);
  });
});

import { getSong, getSongs } from '../src/songs/catalog';
import type { Song } from '../src/engine/song';

const strip = (song: Song) => song.notes.map((x) => ({ id: x.id, midi: x.midi, startBeat: x.startBeat, durationBeats: x.durationBeats, hand: x.hand }));
/** Whether no other note of the hand starts with this one. */
const alone = (sorted: SongNote[], i: number) => sorted[i - 1]?.startBeat !== sorted[i]!.startBeat && sorted[i + 1]?.startBeat !== sorted[i]!.startBeat;
const agreement = (song: Song) => {
  const m = autoFingers(strip(song));
  return (100 * song.notes.filter((x) => m.get(x.id) === x.finger).length) / song.notes.length;
};

// Measured on 2026-10-12 with the model as first shipped (percent of notes given the same finger as the hand-fingered
// song). Each floor sits a few points under its measurement, so a real regression trips it but noise in a tie does not.
// Do not raise or lower a floor to make a change pass: if the model gets worse, that is the finding.
const MEASURED: Record<string, { measured: number; floor: number }> = {
  'mary-had-a-little-lamb': { measured: 100, floor: 95 },
  'twinkle-twinkle-little-star': { measured: 61.9, floor: 55 },
  'ode-to-joy': { measured: 100, floor: 95 },
  'jingle-bells': { measured: 100, floor: 95 },
  'when-the-saints-go-marching-in': { measured: 100, floor: 95 },
  'row-row-row-your-boat': { measured: 81.5, floor: 75 },
  'london-bridge': { measured: 87.5, floor: 80 },
  'frere-jacques': { measured: 68.8, floor: 62 },
  'yankee-doodle': { measured: 24.1, floor: 18 },
  'oh-susanna': { measured: 86.7, floor: 80 },
  'happy-birthday': { measured: 68, floor: 62 },
  'amazing-grace': { measured: 20.8, floor: 15 },
  'brahms-lullaby': { measured: 74.6, floor: 68 },
  'auld-lang-syne': { measured: 47, floor: 42 },
  'scarborough-fair': { measured: 81.1, floor: 75 },
};

describe('auto fingering: agreement with the hand-fingered bundled songs (levels 1 to 3)', () => {
  it.each(Object.keys(MEASURED))('%s: strip the fingers, run the model, stay above the floor', (id) => {
    const { measured, floor } = MEASURED[id]!;
    expect(floor).toBeLessThan(measured);
    expect(agreement(getSong(id)!)).toBeGreaterThanOrEqual(floor);
  });

  it('covers every hand-fingered song, and the notes-weighted overall agreement stays above 65 (measured 71.8)', () => {
    const songs = getSongs().filter((s) => typeof s.level === 'number' && s.level <= 3);
    expect(songs.map((s) => s.id).sort()).toEqual(Object.keys(MEASURED).sort());
    const total = songs.reduce((a, s) => a + s.notes.length, 0);
    const same = songs.reduce((a, s) => a + (agreement(s) * s.notes.length) / 100, 0);
    expect((100 * same) / total).toBeGreaterThanOrEqual(65);
  });
});

describe('auto fingering: hand-position shifts', () => {
  it('on the hand-fingered songs the auto fingers make about as many position shifts as the authored ones (measured 45 against 46)', () => {
    const songs = getSongs().filter((s) => typeof s.level === 'number' && s.level <= 3);
    let authored = 0;
    let auto = 0;
    for (const s of songs) {
      authored += analysePositions(s.notes).shifts.length;
      const m = autoFingers(strip(s));
      auto += analysePositions(s.notes, (x) => m.get(x.id)).shifts.length;
    }
    expect(authored).toBe(46);
    expect(auto).toBeLessThanOrEqual(55);
  });
});

describe('auto fingering: properties over every bundled song, fingers stripped', () => {
  it.each(getSongs().map((s) => s.id))('%s: every note gets a finger 1-5, chords use distinct fingers in pitch order, a quick single-note move to a different key changes finger', (id) => {
    const song = getSong(id)!;
    const m = autoFingers(strip(song));
    expect(m.size).toBe(song.notes.length);
    for (const note of song.notes) expect([1, 2, 3, 4, 5]).toContain(m.get(note.id));
    for (const hand of ['right', 'left'] as const) {
      const mine = song.notes.filter((x) => x.hand === hand).sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
      for (let i = 1; i < mine.length; i++) {
        const a = mine[i - 1]!;
        const b = mine[i]!;
        if (a.midi === b.midi) continue;
        const fa = m.get(a.id)!;
        const fb = m.get(b.id)!;
        if (b.startBeat === a.startBeat) {
          // Within a chord: distinct fingers, rising with the pitch for the right hand and falling for the left.
          expect(fa, `${hand} chord at ${a.startBeat}`).not.toBe(fb);
          expect(hand === 'right' ? fb > fa : fb < fa, `${hand} chord order at ${a.startBeat}`).toBe(true);
        } else if (b.startBeat - a.startBeat <= 1 + 1e-6 && alone(mine, i - 1) && alone(mine, i)) {
          expect(fa, `${hand} ${a.midi}->${b.midi} at ${a.startBeat}`).not.toBe(fb);
        }
      }
    }
  });
});

describe('auto fingering: no impossible crossings on any bundled song, fingers stripped', () => {
  const REACH = [0, 2, 4, 5, 7];
  it.each(getSongs().map((s) => s.id))('%s: no crossing with the little finger, no ring finger and thumb crossing each other, and no thumb crossing wider than a sixth between single notes within a beat', (id) => {
    const song = getSong(id)!;
    const m = autoFingers(strip(song));
    for (const hand of ['right', 'left'] as const) {
      const mine = song.notes.filter((x) => x.hand === hand).sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
      for (let i = 1; i < mine.length; i++) {
        const a = mine[i - 1]!;
        const b = mine[i]!;
        if (a.midi === b.midi || b.startBeat - a.startBeat > 1 + 1e-6 || !alone(mine, i - 1) || !alone(mine, i)) continue;
        const f = m.get(a.id)!;
        const g = m.get(b.id)!;
        const d = b.midi - a.midi;
        const e = (hand === 'right' ? 1 : -1) * (REACH[g - 1]! - REACH[f - 1]!);
        if (f === g || d * e > 0) continue;
        const at = `${hand} ${a.midi}=${f} -> ${b.midi}=${g} at ${a.startBeat}`;
        expect(f === 5 || g === 5, `pinky crossing ${at}`).toBe(false);
        if (f === 1 || g === 1) expect(f === 4 || g === 4, `ring-thumb crossing ${at}`).toBe(false);
        if (f === 1 || g === 1) expect(Math.abs(d), `wide thumb crossing ${at}`).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe('auto fingering: speed', () => {
  it('the largest bundled song (The Entertainer, 2621 notes) is fingered on the first, cold call in well under 100 ms (measured 22 ms)', () => {
    const song = getSongs().reduce((a, b) => (b.notes.length > a.notes.length ? b : a));
    const notes = strip(song);
    const t0 = performance.now();
    autoFingers(notes);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(100);
  });
});

describe('auto fingering: lazy and cached', () => {
  it('the same notes array gives the same map without running the model again; a fully fingered song gets an empty map', () => {
    const notes = line([60, 62, 64]);
    expect(autoFingersFor(notes)).toBe(autoFingersFor(notes));
    expect(autoFingersFor(notes).size).toBe(3);
    expect(autoFingersFor(getSong('mary-had-a-little-lamb')!.notes).size).toBe(0);
  });
});

describe('auto fingering feeds the hand-position help', () => {
  it('an unfingered song has no shifts until the auto fingers are the source; authored fingers win over auto ones', () => {
    const song = getSong('minuet-in-g')!;
    const auto = autoFingersFor(song.notes);
    expect(analysePositions(song.notes).hasFingering).toBe(false);
    const withAuto = analysePositions(song.notes, (x) => x.finger ?? auto.get(x.id));
    expect(withAuto.hasFingering).toBe(true);
    expect(withAuto.shifts.length).toBeGreaterThan(0);
    // A fingered song is unchanged by the fallback.
    const mary = getSong('frere-jacques')!;
    const plain = analysePositions(mary.notes).shifts.map((s) => s.label);
    expect(analysePositions(mary.notes, (x) => x.finger ?? autoFingersFor(mary.notes).get(x.id)).shifts.map((s) => s.label)).toEqual(plain);
  });
});
