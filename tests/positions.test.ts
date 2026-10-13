import { describe, expect, it } from 'vitest';
import { activeShift, analysePositions, drillRange, zonesAt, type Shift } from '../src/engine/positions';
import type { Hand, Song, SongNote } from '../src/engine/song';
import { TimedSession } from '../src/engine/timed';
import { WaitSession } from '../src/engine/wait';
import { getSong } from '../src/songs/catalog';
import { noteName } from '../src/ui/keyboardLayout';

let seq = 0;
/** A hand-written note: pitch as an offset from C4 in semitones is easier to read, so callers pass midi directly. */
function n(midi: number, finger: SongNote['finger'], beat: number, hand: Hand = 'right', measure = Math.floor(beat / 4) + 1): SongNote {
  return { id: `t${seq++}`, midi, startBeat: beat, durationBeats: 1, hand, finger, measure };
}

const describeShift = (s: Shift) => `${s.hand[0]}${s.measure} ${noteName(s.fromAnchor)}>${noteName(s.toAnchor)} ${s.label}`;

function songShifts(id: string): string[] {
  const song = getSong(id) as Song;
  return analysePositions(song.notes).shifts.map(describeShift);
}

describe('hand position detection: synthetic', () => {
  it('a five-finger position with no movement has no shift', () => {
    const notes = [n(60, 1, 0), n(62, 2, 1), n(64, 3, 2), n(65, 4, 3), n(67, 5, 4), n(64, 3, 5), n(60, 1, 6)];
    const map = analysePositions(notes);
    expect(map.shifts).toEqual([]);
    expect(map.spans).toHaveLength(1);
    expect(map.spans[0]!.zone).toMatchObject({ hand: 'right', anchor: 60, lo: 60, hi: 67 });
  });

  it('a pinky stretch one key past the zone, or a thumb one key below it, is not a shift', () => {
    const notes = [n(60, 1, 0), n(67, 5, 1), n(69, 5, 2), n(67, 5, 3), n(59, 1, 4)];
    expect(analysePositions(notes).shifts).toEqual([]);
  });

  it('a one-key move inside the zone is a shift: the probe C thumb, D thumb, then A on the pinky', () => {
    const notes = [n(60, 1, 0), n(62, 1, 1), n(69, 5, 2)];
    const map = analysePositions(notes);
    expect(map.shifts.map((s) => [s.fromAnchor, s.toAnchor, s.label])).toEqual([[60, 62, 'thumb → D']]);
    const zone = zonesAt(map, 2, 4).right.current;
    expect(zone).toMatchObject({ anchor: 62, lo: 62, hi: 69 });
  });

  it('only the edge finger may stretch: a middle finger one key off the position is a shift', () => {
    // C position, then F with the ring finger (anchor C) is fine, but G with the ring finger implies a D position (D E F G A).
    expect(analysePositions([n(60, 1, 0), n(65, 4, 1)]).shifts).toEqual([]);
    const { shifts } = analysePositions([n(60, 1, 0), n(67, 4, 1)]);
    expect(shifts.map((s) => [s.fromAnchor, s.toAnchor, s.label])).toEqual([[60, 62, 'ring → G']]);
    // A pinky stretches up and a thumb down, not the other way round.
    expect(analysePositions([n(60, 1, 0), n(59, 1, 1)]).shifts).toEqual([]);
    expect(analysePositions([n(60, 1, 0), n(64, 1, 1)]).shifts).toHaveLength(1);
    expect(analysePositions([n(60, 1, 0), n(62, 5, 1)]).shifts).toHaveLength(1);
  });

  it('left hand: the thumb stretches one key above the zone and the pinky one below, not the reverse', () => {
    // LH thumb on G3: zone C3 to G3.
    const base = n(55, 1, 0, 'left');
    expect(analysePositions([base, n(57, 1, 1, 'left'), n(47, 5, 2, 'left')]).shifts).toEqual([]);
    expect(analysePositions([base, n(53, 1, 1, 'left')]).shifts).toHaveLength(1);
    expect(analysePositions([base, n(52, 5, 1, 'left')]).shifts).toHaveLength(1);
  });

  it('a thumb crossing under to a new key is a shift to that thumb key', () => {
    // C D E then the thumb tucks under onto F: the hand now sits on F.
    const notes = [n(60, 1, 0), n(62, 2, 1), n(64, 3, 2), n(65, 1, 3), n(67, 2, 4)];
    const { shifts } = analysePositions(notes);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ fromAnchor: 60, toAnchor: 65, direction: 'right', finger: 1, label: 'thumb → F' });
    expect(shifts[0]!.note.midi).toBe(65);
    expect(shifts[0]!.beat).toBe(3);
  });

  it('a downward move reports direction left, with the from and to anchors', () => {
    const notes = [n(67, 1, 0), n(69, 2, 1), n(60, 1, 4)];
    const { shifts } = analysePositions(notes);
    expect(shifts.map((s) => [s.fromAnchor, s.toAnchor, s.direction])).toEqual([[67, 60, 'left']]);
  });

  it('black keys: F# with finger 4 sits in the C position, Bb with finger 4 sits in the F position', () => {
    const inC = [n(60, 1, 0), n(62, 2, 1), n(64, 3, 2), n(66, 4, 3), n(67, 5, 4)];
    expect(analysePositions(inC).shifts).toEqual([]);
    const inF = [n(65, 1, 0), n(67, 2, 1), n(69, 3, 2), n(70, 4, 3), n(72, 5, 4)];
    expect(analysePositions(inF).shifts).toEqual([]);
  });

  it('a black key can be the first note of a new position', () => {
    const notes = [n(60, 1, 0), n(62, 2, 1), n(70, 4, 4), n(72, 5, 5)];
    const { shifts } = analysePositions(notes);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ toAnchor: 65, label: 'ring → A#' });
  });

  it('left hand mirrors: the thumb is the highest finger', () => {
    // LH thumb on G3, pinky on C3.
    const stay = [n(55, 1, 0, 'left'), n(53, 2, 1, 'left'), n(48, 5, 2, 'left'), n(47, 5, 3, 'left')];
    expect(analysePositions(stay).shifts).toEqual([]);
    expect(analysePositions(stay).spans[0]!.zone).toMatchObject({ hand: 'left', anchor: 55, lo: 48, hi: 55 });
    const move = [n(55, 1, 0, 'left'), n(53, 2, 1, 'left'), n(52, 1, 4, 'left')];
    const { shifts } = analysePositions(move);
    expect(shifts.map((s) => [s.hand, s.fromAnchor, s.toAnchor, s.label])).toEqual([['left', 55, 52, 'thumb → E']]);
  });

  it('both hands are tracked separately, and shifts come out in time order', () => {
    const notes = [
      n(60, 1, 0), n(55, 1, 0, 'left'),
      n(72, 1, 4), n(55, 1, 8, 'left'),
      n(62, 1, 12), n(52, 1, 12, 'left'),
    ];
    const { shifts } = analysePositions(notes);
    expect(shifts.map((s) => [s.hand, s.beat])).toEqual([['right', 4], ['right', 12], ['left', 12]]);
    expect(shifts.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('a chord moves the hand once, labelled by its lowest finger', () => {
    const notes = [n(60, 1, 0), n(64, 3, 0), n(72, 1, 4), n(76, 3, 4), n(79, 5, 4)];
    const { shifts } = analysePositions(notes);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ toAnchor: 72, label: 'thumb → C', finger: 1 });
  });

  it('notes without fingers are ignored; a song with none has no shifts and no fingering', () => {
    const bare = [n(60, undefined, 0), n(90, undefined, 4)];
    const map = analysePositions(bare);
    expect(map).toMatchObject({ shifts: [], spans: [], hasFingering: false });
    const mixed = [n(60, 1, 0), n(95, undefined, 1), n(62, 2, 2)];
    expect(analysePositions(mixed)).toMatchObject({ shifts: [], hasFingering: true });
  });

  it('the fingering source can be swapped', () => {
    const notes = [n(60, undefined, 0), n(72, undefined, 4)];
    const map = analysePositions(notes, () => 1);
    expect(map.shifts).toHaveLength(1);
  });

  it('records the position each fingered note is played in', () => {
    const notes = [n(60, 1, 0), n(72, 1, 4)];
    const map = analysePositions(notes);
    expect(map.anchorOf.get(notes[0]!.id)).toBe(60);
    expect(map.anchorOf.get(notes[1]!.id)).toBe(72);
  });
});

describe('hand position detection: bundled songs', () => {
  it('Mary, Twinkle and Ode to Joy stay in one position', () => {
    expect(songShifts('mary-had-a-little-lamb')).toEqual([]);
    expect(songShifts('twinkle-twinkle-little-star')).toEqual([]);
    expect(songShifts('ode-to-joy')).toEqual([]);
    expect(songShifts('when-the-saints-go-marching-in')).toEqual([]);
  });

  it('Row Row Row Your Boat: pinky C5 then thumb G4 in bar 5, back to the C position in bar 6', () => {
    // C4 position, C5 pinky implies F4, the G4 thumb implies G4 (in the zone, so a move), E4 middle implies C4.
    expect(songShifts('row-row-row-your-boat')).toEqual(['r5 C4>F4 pinky → C', 'r5 F4>G4 thumb → G', 'r6 G4>C4 middle → E']);
  });

  it('Frere Jacques: the G ring finger in bar 5 sits the hand on D4 (the C thumb is a stretch), then it drops to G3 in bar 7', () => {
    expect(songShifts('frere-jacques')).toEqual(['r5 C4>D4 ring → G', 'r7 D4>G3 ring → C']);
  });

  it('London Bridge: the D index finger in bar 7 moves the hand from D4 to C4', () => {
    expect(songShifts('london-bridge')).toEqual(['r7 D4>C4 index → D']);
  });

  it('Oh Susanna: the index-finger E in bars 2 and 6 sits the hand on D4, the pinky G that opens bars 3 and 7 returns it to C4', () => {
    expect(songShifts('oh-susanna')).toEqual(['r2 C4>D4 index → E', 'r3 D4>C4 pinky → G', 'r6 C4>D4 index → E', 'r7 D4>C4 pinky → G']);
  });

  it('Yankee Doodle: swings between the G3 and B3 positions', () => {
    expect(songShifts('yankee-doodle')).toEqual([
      'r2 G3>B3 index → C',
      'r3 B3>G3 thumb → G',
      'r4 G3>B3 index → C',
      'r5 B3>G3 middle → B',
    ]);
  });

  it('every shift in every bundled fingered song names a note in that song, in time order', () => {
    for (const id of ['amazing-grace', 'brahms-lullaby', 'auld-lang-syne', 'scarborough-fair', 'happy-birthday', 'oh-susanna', 'london-bridge', 'jingle-bells']) {
      const song = getSong(id) as Song;
      const { shifts } = analysePositions(song.notes);
      for (const s of shifts) expect(song.notes).toContain(s.note);
      expect(shifts.map((s) => s.beat)).toEqual([...shifts.map((s) => s.beat)].sort((a, b) => a - b));
      expect(new Set(shifts.map((s) => s.id)).size).toBe(shifts.length);
    }
  });

  it('a song with no fingering has no shifts', () => {
    const clair = getSong('clair-de-lune') as Song;
    const bare = clair.notes.map((x) => ({ ...x, finger: undefined }));
    expect(analysePositions(bare).shifts).toEqual([]);
  });
});

describe('zones and the cue', () => {
  const notes = [n(60, 1, 0), n(62, 2, 2), n(72, 1, 8), n(74, 2, 10), n(67, 5, 16)];
  const map = analysePositions(notes);

  it('shows the current zone, and the next one only inside the cue window', () => {
    expect(map.shifts.map((s) => s.beat)).toEqual([8, 16]);
    const early = zonesAt(map, 1, 4).right;
    expect(early.current).toMatchObject({ anchor: 60, lo: 60, hi: 67 });
    expect(early.next).toBeNull();
    const near = zonesAt(map, 5, 4).right;
    expect(near.current?.anchor).toBe(60);
    expect(near.next).toMatchObject({ anchor: 72, lo: 72, hi: 79 });
    const after = zonesAt(map, 9, 4).right;
    expect(after.current?.anchor).toBe(72);
    expect(after.next).toBeNull();
  });

  it('before the first note the opening zone is already shown; a hand with no notes has none', () => {
    expect(zonesAt(map, -6, 4).right.current?.anchor).toBe(60);
    expect(zonesAt(map, 0, 4).left).toEqual({ current: null, next: null });
  });

  it('the cue opens one bar before the shift and closes when the note is done', () => {
    const [first] = map.shifts;
    expect(activeShift(map.shifts, 3.9, 4, () => false)).toBeNull();
    expect(activeShift(map.shifts, 4, 4, () => false)).toBe(first);
    expect(activeShift(map.shifts, 9, 4, () => false)).toBe(first);
    expect(activeShift(map.shifts, 9, 4, (s) => s === first)).toBeNull();
    expect(activeShift(map.shifts, 13, 4, (s) => s === first)).toBe(map.shifts[1]);
  });

  it('with no shifts nothing is active', () => {
    expect(activeShift([], 5, 4, () => false)).toBeNull();
  });
});

describe('shift drill range', () => {
  it('runs from two notes before to the end of two notes after, in that hand', () => {
    const run = [n(60, 1, 0), n(62, 2, 1), n(64, 3, 2), n(65, 4, 3), n(72, 1, 8), n(74, 2, 9), n(76, 3, 10), n(77, 4, 11)];
    const { shifts } = analysePositions(run);
    expect(shifts).toHaveLength(1);
    expect(drillRange(shifts[0]!, run)).toEqual({ startBeat: 2, endBeat: 11 });
  });

  it('clips at the start and end of the song', () => {
    const run = [n(60, 1, 0), n(72, 1, 4), n(74, 2, 5)];
    const { shifts } = analysePositions(run);
    expect(drillRange(shifts[0]!, run)).toEqual({ startBeat: 0, endBeat: 6 });
  });

  it('counts only that hand\'s notes', () => {
    const run = [n(60, 1, 0), n(62, 2, 1), n(48, 5, 1.5, 'left'), n(72, 1, 4), n(74, 2, 5)];
    const { shifts } = analysePositions(run);
    expect(drillRange(shifts[0]!, run)).toEqual({ startBeat: 0, endBeat: 6 });
  });
});

describe('sessions loop a beat range', () => {
  const song = getSong('twinkle-twinkle-little-star') as Song;
  it('wait and timed sessions only play the notes inside the range', () => {
    const wait = new WaitSession(song, { loop: { startBeat: 4, endBeat: 8 } });
    const timed = new TimedSession(song, { mode: 'full', loop: { startBeat: 4, endBeat: 8 } });
    const inside = song.notes.filter((x) => x.startBeat >= 4 && x.startBeat < 8);
    expect(inside.length).toBeGreaterThan(0);
    expect(wait.stats().total).toBe(inside.length);
    expect(wait.playStartBeat).toBe(4);
    expect(wait.endBeat).toBe(8);
    expect(timed.playStartBeat).toBe(4);
    expect(timed.endBeat).toBe(8);
    expect(timed.summary().total).toBe(inside.length);
  });
});
