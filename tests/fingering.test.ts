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

// The v1.3 songs (levels 1 to 3, fingered by a position-based generator rather than by hand), measured on 2026-10-13 with the
// same model and the same method. Same rule for the floors. The agreement is lower than on the first 15 because those songs
// choose where the hand moves differently, not because the model got worse: the first 15 are checked on their own below, with
// the original floors unchanged.
const MEASURED_V13: Record<string, { measured: number; floor: number }> = {
  'hot-cross-buns': { measured: 100, floor: 95 },
  'au-clair-de-la-lune': { measured: 11.4, floor: 5 },
  'old-macdonald': { measured: 89.8, floor: 83 },
  'alle-meine-entchen': { measured: 48.1, floor: 42 },
  'haenschen-klein': { measured: 100, floor: 95 },
  'kuckuck': { measured: 100, floor: 95 },
  'farmer-in-the-dell': { measured: 50, floor: 44 },
  'hush-little-baby': { measured: 16.7, floor: 10 },
  'der-kuckuck-und-der-esel': { measured: 88.4, floor: 82 },
  'wer-hat-die-schoensten-schaefchen': { measured: 92.3, floor: 86 },
  'haensel-und-gretel-verliefen-sich-im-wald': { measured: 100, floor: 95 },
  'silent-night': { measured: 49.3, floor: 43 },
  'joy-to-the-world': { measured: 88.3, floor: 82 },
  'away-in-a-manger': { measured: 45.6, floor: 39 },
  'o-christmas-tree': { measured: 46.6, floor: 40 },
  'deck-the-halls': { measured: 63.6, floor: 57 },
  'we-wish-you-a-merry-christmas': { measured: 42.1, floor: 36 },
  'aloha-oe': { measured: 58.9, floor: 52 },
  'weisst-du-wieviel-sternlein-stehen': { measured: 83.3, floor: 77 },
  'nicaea-holy-holy-holy': { measured: 65.8, floor: 59 },
  'kein-schoener-land': { measured: 71.2, floor: 65 },
  'nearer-my-god-to-thee': { measured: 56.5, floor: 50 },
  'winter-ade': { measured: 100, floor: 95 },
  'auf-du-junger-wandersmann': { measured: 75.3, floor: 69 },
  'alle-jahre-wieder': { measured: 55.6, floor: 49 },
  'o-du-froehliche': { measured: 82.6, floor: 76 },
  'hark-the-herald-angels-sing': { measured: 75.4, floor: 69 },
  'o-come-all-ye-faithful': { measured: 68, floor: 62 },
  'good-king-wenceslas': { measured: 83.9, floor: 77 },
  'god-rest-ye-merry-gentlemen': { measured: 57.5, floor: 51 },
  'nun-danket-alle-gott': { measured: 71.8, floor: 65 },
  'duke-street': { measured: 50.7, floor: 44 },
  'lasst-uns-erfreuen': { measured: 58.7, floor: 52 },
  'allein-gott-in-der-hoeh': { measured: 64.5, floor: 58 },
  'o-haupt-voll-blut-und-wunden': { measured: 37.5, floor: 31 },
  'sakura-sakura': { measured: 52.5, floor: 46 },
  'ding-dong-merrily-on-high': { measured: 58, floor: 52 },
  'suesser-die-glocken': { measured: 74.5, floor: 68 },
  'die-gedanken-sind-frei': { measured: 56, floor: 50 },
  'my-bonnie-lies-over-the-ocean': { measured: 67.5, floor: 61 },
  'loch-lomond': { measured: 47, floor: 41 },
  'veni-veni-emmanuel': { measured: 36.1, floor: 30 },
  'wachet-auf-ruft-uns-die-stimme': { measured: 75.5, floor: 69 },
  'ein-feste-burg': { measured: 49.5, floor: 43 },
  'tochter-zion': { measured: 56, floor: 50 },
};

describe('auto fingering: agreement with the hand-fingered bundled songs (levels 1 to 3)', () => {
  it.each(Object.keys(MEASURED))('%s: strip the fingers, run the model, stay above the floor', (id) => {
    const { measured, floor } = MEASURED[id]!;
    expect(floor).toBeLessThan(measured);
    expect(agreement(getSong(id)!)).toBeGreaterThanOrEqual(floor);
  });

  it.each(Object.keys(MEASURED_V13))('%s: (v1.3) strip the fingers, run the model, stay above the floor', (id) => {
    const { measured, floor } = MEASURED_V13[id]!;
    expect(floor).toBeLessThan(measured);
    expect(agreement(getSong(id)!)).toBeGreaterThanOrEqual(floor);
  });

  const weighted = (ids: string[]) => {
    const songs = ids.map((id) => getSong(id)!);
    const total = songs.reduce((a, s) => a + s.notes.length, 0);
    const same = songs.reduce((a, s) => a + (agreement(s) * s.notes.length) / 100, 0);
    return (100 * same) / total;
  };

  it('covers every hand-fingered song, and the notes-weighted overall agreement on the first 15 stays above 65 (measured 71.8)', () => {
    const songs = getSongs().filter((s) => typeof s.level === 'number' && s.level <= 3);
    expect(songs.map((s) => s.id).sort()).toEqual([...Object.keys(MEASURED), ...Object.keys(MEASURED_V13)].sort());
    expect(weighted(Object.keys(MEASURED))).toBeGreaterThanOrEqual(65);
  });

  it('the v1.3 fingered songs together stay above 58 (measured 63.6)', () => {
    expect(weighted(Object.keys(MEASURED_V13))).toBeGreaterThanOrEqual(58);
  });
});

describe('auto fingering: hand-position shifts', () => {
  it('on the first 15 hand-fingered songs the auto fingers make about as many position shifts as the authored ones (measured 45 against 46)', () => {
    let authored = 0;
    let auto = 0;
    for (const id of Object.keys(MEASURED)) {
      const s = getSong(id)!;
      authored += analysePositions(s.notes).shifts.length;
      const m = autoFingers(strip(s));
      auto += analysePositions(s.notes, (x) => m.get(x.id)).shifts.length;
    }
    expect(authored).toBe(46);
    expect(auto).toBeLessThanOrEqual(55);
  });

  it('on the v1.3 fingered songs the auto fingers make no more than 1.2 times the authored shifts (measured 234 against 423)', () => {
    let authored = 0;
    let auto = 0;
    for (const id of Object.keys(MEASURED_V13)) {
      const s = getSong(id)!;
      authored += analysePositions(s.notes).shifts.length;
      const m = autoFingers(strip(s));
      auto += analysePositions(s.notes, (x) => m.get(x.id)).shifts.length;
    }
    expect(authored).toBe(423);
    expect(auto).toBeLessThanOrEqual(Math.ceil(authored * 1.2));
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
    // Shared CI runners are slower and noisier than a dev machine (115.6 ms seen once), so allow 3x there; local runs keep 100 ms.
    expect(ms).toBeLessThan(process.env.CI ? 300 : 100);
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
