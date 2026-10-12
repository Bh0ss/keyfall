import { describe, expect, it } from 'vitest';
import { makePrompt } from '../src/learn/generate';
import { judgeTaps, tapTimes } from '../src/learn/rhythm';
import { LearnRun, MiniSongRun } from '../src/learn/run';
import type { ReviewEntry } from '../src/learn/review';
import { UNITS, getUnit, taughtThrough, type LessonDef } from '../src/learn/units';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const promptLessons = (unitId: string) => getUnit(unitId)!.lessons.filter((l) => l.kind === 'key-finder' || l.kind === 'note-flash');

describe('lesson generators only use taught notes', () => {
  for (const unit of UNITS.filter((u) => !u.comingSoon)) {
    for (const lesson of promptLessons(unit.id)) {
      it(`${unit.id} ${lesson.id}`, () => {
        const rng = seeded(7);
        const taught = new Set(taughtThrough(unit.number));
        const unitNotes = new Set(unit.notes);
        let prev: number | undefined;
        const seen = new Set<number>();
        for (let i = 0; i < 300; i++) {
          const p = makePrompt(unit, lesson, new Map(), rng, prev);
          expect(taught.has(p.midi)).toBe(true);
          expect(unitNotes.has(p.midi)).toBe(true);
          expect(lesson.kinds).toContain(p.kind);
          expect(p.midi).not.toBe(prev);
          prev = p.midi;
          seen.add(p.midi);
        }
        expect(seen.size).toBe(unit.notes.length);
      });
    }
  }
  it('a review note from an earlier unit can appear, because it was taught', () => {
    const unit = getUnit('unit-3')!;
    const lesson = promptLessons('unit-3')[0]!;
    const queue = new Map<number, ReviewEntry>([[60, { midi: 60, streak: 0, misses: 2, active: true }]]);
    const rng = seeded(3);
    const got = new Set<number>();
    for (let i = 0; i < 400; i++) got.add(makePrompt(unit, lesson, queue, rng).midi);
    expect(got.has(60)).toBe(true);
  });
  it('a review note not yet taught never appears', () => {
    const unit = getUnit('unit-2')!;
    const lesson = promptLessons('unit-2')[0]!;
    const queue = new Map<number, ReviewEntry>([[43, { midi: 43, streak: 0, misses: 2, active: true }]]);
    const rng = seeded(3);
    for (let i = 0; i < 300; i++) expect(makePrompt(unit, lesson, queue, rng).midi).not.toBe(43);
  });
});

describe('review weighting in generated prompts', () => {
  it('a queued note appears more often than its peers, and as often again once cleared', () => {
    const unit = getUnit('unit-2')!;
    const lesson = promptLessons('unit-2')[0]!;
    const count = (queue: Map<number, ReviewEntry>) => {
      const rng = seeded(11);
      let n = 0;
      let prev: number | undefined;
      for (let i = 0; i < 4000; i++) {
        const p = makePrompt(unit, lesson, queue, rng, prev);
        prev = p.midi;
        if (p.midi === 62) n++;
      }
      return n;
    };
    const plain = count(new Map());
    const queued = count(new Map([[62, { midi: 62, streak: 0, misses: 1, active: true }]]));
    const cleared = count(new Map([[62, { midi: 62, streak: 0, misses: 1, active: false }]]));
    expect(queued).toBeGreaterThan(plain * 1.8);
    expect(cleared).toBeLessThan(plain * 1.15);
    expect(cleared).toBeGreaterThan(plain * 0.85);
  });
});

describe('LearnRun', () => {
  const unit = getUnit('unit-2')!;
  const test = unit.lessons.find((l) => l.test)!;
  const start = (queue = new Map<number, ReviewEntry>()) => new LearnRun({ unit, lesson: test, queue, rng: seeded(5) });

  it('the unit test is 20 prompts', () => {
    expect(test.prompts).toBe(20);
  });

  it('a perfect run passes and clears nothing in an empty queue', () => {
    const run = start();
    let t = 0;
    while (run.current) {
      expect(run.answer(run.current.midi, (t += 800))).toBe('correct');
      run.next();
    }
    expect(run.result()).toMatchObject({ total: 20, correct: 20, passed: true });
  });

  it('18 of 20 passes, 17 of 20 fails', () => {
    const play = (wrong: number) => {
      const run = start();
      let i = 0;
      while (run.current) {
        const bad = i++ < wrong;
        run.answer(bad ? run.current.midi + 1 : run.current.midi, 0);
        run.next();
      }
      return run.result();
    };
    expect(play(2)).toMatchObject({ correct: 18, passed: true });
    expect(play(3)).toMatchObject({ correct: 17, passed: false });
  });

  it('a wrong key ends the prompt, shows the answer, and waits for next()', () => {
    const run = start();
    const midi = run.current!.midi;
    expect(run.answer(midi + 1, 0)).toBe('wrong');
    expect(run.state).toBe('wrong');
    expect(run.answer(midi, 0)).toBe('ignored');
    expect(run.answered).toBe(1);
    run.next();
    expect(run.state).toBe('asking');
  });

  it('reveal counts as a miss', () => {
    const run = start();
    const midi = run.current!.midi;
    run.reveal();
    expect(run.result().correct).toBe(0);
    expect(run.drainUpdates().map((e) => e.midi)).toEqual([midi]);
  });

  it('emits queue updates: a miss enters, three right answers in a row leave', () => {
    const queue = new Map<number, ReviewEntry>([[62, { midi: 62, streak: 0, misses: 1, active: true }]]);
    const run = start(queue);
    let rights = 0;
    const updates: ReviewEntry[] = [];
    while (run.current && rights < 3) {
      const m = run.current.midi;
      run.answer(m, 0);
      if (m === 62) rights++;
      updates.push(...run.drainUpdates());
      run.next();
    }
    const last = updates.filter((u) => u.midi === 62).pop()!;
    expect(last.active).toBe(false);
  });

  it('tracks the running streak and accuracy', () => {
    const run = start();
    run.answer(run.current!.midi, 0);
    run.next();
    run.answer(run.current!.midi, 0);
    run.next();
    expect(run.streak).toBe(2);
    run.answer(run.current!.midi + 1, 0);
    expect(run.streak).toBe(0);
    expect(run.accuracy).toBeCloseTo(2 / 3);
  });
});

describe('MiniSongRun', () => {
  const unit = getUnit('unit-2')!;
  const lesson = unit.lessons.find((l) => l.kind === 'mini-song') as LessonDef;
  it('mini songs use only taught notes and run 4 to 8 bars', () => {
    for (const u of UNITS.filter((x) => !x.comingSoon)) {
      for (const l of u.lessons.filter((x) => x.kind === 'mini-song')) {
        const song = l.song!;
        const taught = new Set(u.notes);
        expect(song.notes.every((n) => taught.has(n.midi))).toBe(true);
        const beats = song.notes.reduce((a, n) => a + n.beats, 0);
        expect(beats % song.beatsPerBar).toBe(0);
        const bars = beats / song.beatsPerBar;
        expect(bars).toBeGreaterThanOrEqual(4);
        expect(bars).toBeLessThanOrEqual(8);
      }
    }
  });
  it('advances on the right note, counts wrong keys, finishes at the end', () => {
    const run = new MiniSongRun(lesson.song!);
    expect(run.press(lesson.song!.notes[0]!.midi + 1)).toBe('wrong');
    expect(run.index).toBe(0);
    for (const n of lesson.song!.notes) expect(run.press(n.midi)).toBe('correct');
    expect(run.done).toBe(true);
    expect(run.wrong).toBe(1);
  });
});

describe('rhythm tap', () => {
  const expected = [0, 750, 1500, 2250];
  it('matches taps inside the window and counts the rest', () => {
    expect(judgeTaps(expected, [10, 740, 1700, 2250], 150)).toMatchObject({ hits: 3, total: 4, extra: 1 });
  });
  it('one tap cannot satisfy two beats', () => {
    expect(judgeTaps([0, 100], [50], 150)).toMatchObject({ hits: 1, total: 2 });
  });
  it('turns beats into milliseconds at a tempo', () => {
    expect(tapTimes([0, 1, 2.5], 80, 1000)).toEqual([1000, 1750, 2875]);
  });
});
