import { describe, expect, it } from 'vitest';
import { analysePositions, type PositionNote } from '../src/engine/positions';
import { makePrompt } from '../src/learn/generate';
import type { ReviewEntry } from '../src/learn/review';
import { LearnRun, MiniSongRun } from '../src/learn/run';
import { isBlackKey } from '../src/learn/staff';
import { nextUnit, unitStatus } from '../src/learn/unlocks';
import { UNITS, getUnit, taughtThrough, type MiniSong } from '../src/learn/units';
import { getSongs } from '../src/songs/catalog';

const unit = getUnit('unit-11')!;
const none = new Map<number, ReviewEntry>();

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const lesson = (id: string) => unit.lessons.find((l) => l.id === id)!;

/** A mini song as timed right-hand notes, so the hand-position analysis can read it. */
function asNotes(song: MiniSong): PositionNote[] {
  let beat = 0;
  const out: PositionNote[] = [];
  for (const n of song.notes) {
    if (!n.rest) out.push({ id: `n${out.length}`, midi: n.midi, startBeat: beat, durationBeats: n.beats, hand: 'right', finger: n.finger, measure: Math.floor(beat / song.beatsPerBar) + 1 });
    beat += n.beats;
  }
  return out;
}

describe('Unit 11: Moving around the keyboard', () => {
  it('sits after Both hands as Unit 9 (stable id unit-11), playable, and opens when Unit 8 is passed', () => {
    expect(unit.number).toBe(9);
    expect(unit.name).toBe('Moving around the keyboard');
    expect(UNITS[8]).toBe(unit);
    expect(unit.comingSoon).toBe(false);
    const through7 = new Set(UNITS.slice(0, 7).map((u) => u.id));
    expect(unitStatus(unit, through7)).toBe('locked');
    expect(unitStatus(unit, new Set([...through7, 'unit-8']))).toBe('open');
    expect(nextUnit(new Set(UNITS.slice(0, 8).map((u) => u.id)))!.id).toBe('unit-11');
    expect(nextUnit(new Set(UNITS.map((u) => u.id)))).toBeNull();
  });

  it('gates no song, so no existing unlock changes', () => {
    expect(unit.unlocks).toBeUndefined();
    expect(getSongs().filter((s) => s.unlockedBy === 'unit-11')).toEqual([]);
  });

  it('has a 20-prompt unit test, an eyes-off lesson, and two shift-drill mini songs', () => {
    const tests = unit.lessons.filter((l) => l.test);
    expect(tests).toHaveLength(1);
    expect(tests[0]!.prompts).toBe(20);
    expect(lesson('anchors').eyesOff).toBe(true);
    expect(unit.lessons.filter((l) => l.kind === 'mini-song').map((l) => l.id)).toEqual(['shift', 'homes']);
  });

  it('teaches white keys only, on the lesson keyboard, clear of the piano-navigation keys', () => {
    expect(unit.notes.length).toBeGreaterThan(12);
    for (const m of unit.notes) {
      expect(isBlackKey(m), String(m)).toBe(false);
      expect(m).toBeGreaterThanOrEqual(unit.keyboard[0]);
      expect(m).toBeLessThanOrEqual(unit.keyboard[1]);
    }
    expect(unit.keyboard[0]).toBeGreaterThan(28);
    for (const m of [48, 53, 55, 60, 65, 67, 72]) expect(unit.notes).toContain(m);
  });

  it('the anchors lesson asks only for C, F and G, in every octave of the keyboard', () => {
    const anchors = lesson('anchors').notes!;
    expect(anchors.map((m) => m % 12).every((pc) => [0, 5, 7].includes(pc))).toBe(true);
    expect(new Set(anchors.map((m) => m % 12))).toEqual(new Set([0, 5, 7]));
    const rng = seeded(11);
    const seen = new Set<number>();
    let prev: number | undefined;
    for (let i = 0; i < 300; i++) {
      const p = makePrompt(unit, lesson('anchors'), none, rng, prev);
      expect(p.kind).toBe('key-finder');
      expect(anchors).toContain(p.midi);
      seen.add(p.midi);
      prev = p.midi;
    }
    expect(seen.size).toBe(anchors.length);
  });

  it('the landmarks lesson and the test draw from every white key', () => {
    const rng = seeded(5);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) seen.add(makePrompt(unit, lesson('test'), none, rng).midi);
    expect([...seen].sort((a, b) => a - b)).toEqual([...unit.notes].sort((a, b) => a - b));
  });

  it('a lesson without its own note list keeps drawing from the whole unit (every other unit is unchanged)', () => {
    for (const u of UNITS.filter((x) => x.id !== 'unit-11')) expect(u.lessons.every((l) => l.notes === undefined && !l.eyesOff)).toBe(true);
  });

  it('passes at 18 of 20 and not at 17, and a miss joins the review queue', () => {
    const play = (misses: number) => {
      const run = new LearnRun({ unit, lesson: lesson('test'), queue: none, rng: seeded(3) });
      run.start(0);
      for (let i = 0; i < 20; i++) {
        const t = run.current!.midi;
        run.answer(i >= 20 - misses ? (t === 60 ? 62 : 60) : t, i * 1000);
        run.next(i * 1000 + 500);
      }
      return run;
    };
    expect(play(2).result().passed).toBe(true);
    expect(play(3).result().passed).toBe(false);
    const run = play(1);
    expect(run.result().missed).toHaveLength(1);
    expect(run.reviewNotes).toEqual(run.result().missed);
  });

  it('the shift-drill mini songs are 4 to 8 bars, fully fingered, and use only taught keys', () => {
    const taught = new Set(taughtThrough(unit.number));
    for (const id of ['shift', 'homes']) {
      const song = lesson(id).song!;
      const beats = song.notes.reduce((a, n) => a + n.beats, 0);
      expect(beats % song.beatsPerBar).toBe(0);
      expect(beats / song.beatsPerBar).toBeGreaterThanOrEqual(4);
      expect(beats / song.beatsPerBar).toBeLessThanOrEqual(8);
      for (const n of song.notes) {
        expect(taught.has(n.midi)).toBe(true);
        expect(n.finger).toBeDefined();
      }
      expect(lesson(id).optional).toBe(true);
    }
  });

  it('each drill really moves the hand (hand-position analysis finds the shifts)', () => {
    const shifts = (id: string) => analysePositions(asNotes(lesson(id).song!)).shifts.map((s) => `${s.fromAnchor}>${s.toAnchor}`);
    expect(shifts('shift')).toEqual(['60>67', '67>60']);
    expect(shifts('homes')).toEqual(['60>65', '65>67', '67>60']);
  });

  it('a mini song plays through with the notes in order', () => {
    for (const id of ['shift', 'homes']) {
      const song = lesson(id).song!;
      const run = new MiniSongRun(song);
      for (const n of song.notes) expect(run.press(n.midi)).toBe('correct');
      expect(run.done).toBe(true);
      expect(run.wrong).toBe(0);
    }
  });
});
