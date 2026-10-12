import { describe, expect, it } from 'vitest';
import {
  GRADE_POINTS,
  ScoreBoard,
  gradeFor,
  maxScore,
  multiplierFor,
  starsFor,
  windowsFor,
  type Grade,
  type Mode,
} from '../src/engine/judge';

// Spec: Perfect +/-50 ms, Great +/-100, Good +/-150 at Full; Practice doubles, Expert halves.
const SPEC: Record<'full' | 'practice' | 'expert', { k: number }> = { full: { k: 1 }, practice: { k: 2 }, expert: { k: 0.5 } };

describe('windows', () => {
  it.each(Object.entries(SPEC))('%s windows are the Full windows times %s', (mode, { k }) => {
    expect(windowsFor(mode as Mode)).toEqual({ perfect: 50 * k, great: 100 * k, good: 150 * k });
  });
});

describe('gradeFor: every boundary, early and late', () => {
  for (const [mode, { k }] of Object.entries(SPEC)) {
    const edges: [Grade, number, Grade | null][] = [
      ['perfect', 50 * k, 'great'],
      ['great', 100 * k, 'good'],
      ['good', 150 * k, null],
    ];
    for (const sign of [-1, 1]) {
      const side = sign < 0 ? 'early' : 'late';
      it(`${mode} ${side}: centre is perfect`, () => {
        expect(gradeFor(0, mode as Mode)).toBe('perfect');
        expect(gradeFor(sign * 1, mode as Mode)).toBe('perfect');
      });
      for (const [grade, edge, next] of edges) {
        it(`${mode} ${side}: just inside ${edge} ms is ${grade}`, () => {
          expect(gradeFor(sign * (edge - 1), mode as Mode)).toBe(grade);
        });
        it(`${mode} ${side}: exactly ${edge} ms is ${grade}`, () => {
          expect(gradeFor(sign * edge, mode as Mode)).toBe(grade);
        });
        it(`${mode} ${side}: just outside ${edge} ms is ${next ?? 'a miss'}`, () => {
          expect(gradeFor(sign * (edge + 1), mode as Mode)).toBe(next);
        });
      }
    }
  }

  it('points are 100 / 70 / 40', () => {
    expect(GRADE_POINTS).toEqual({ perfect: 100, great: 70, good: 40 });
  });
});

describe('combo multiplier', () => {
  it.each([
    [0, 1],
    [1, 1],
    [9, 1],
    [10, 2],
    [19, 2],
    [20, 3],
    [29, 3],
    [30, 4],
    [39, 4],
    [100, 4],
    [10_000, 4],
  ])('after %i consecutive hits the multiplier is x%i', (streak, mult) => {
    expect(multiplierFor(streak)).toBe(mult);
  });

  it('steps up as hits 9 to 10, 19 to 20 and 29 to 30 are made, caps at x4, resets on a miss', () => {
    const b = new ScoreBoard(60);
    const seen: number[] = [];
    for (let i = 1; i <= 45; i++) {
      b.hit(`n${i}`, 'perfect');
      seen[i] = b.multiplier;
    }
    expect([seen[9], seen[10]]).toEqual([1, 2]);
    expect([seen[19], seen[20]]).toEqual([2, 3]);
    expect([seen[29], seen[30]]).toEqual([3, 4]);
    expect(seen[45]).toBe(4);
    b.miss({ noteId: 'n46', midi: 60, pressedMidi: null, measure: 1, kind: 'late', offsetMs: null });
    expect(b.multiplier).toBe(1);
    expect(b.summary().streak).toBe(0);
    expect(b.summary().longestStreak).toBe(45);
  });

  it('scores a note with the multiplier earned before it: 10 hits x1, 10 hits x2, 10 x3, then x4', () => {
    const b = new ScoreBoard(50);
    let total = 0;
    for (let i = 0; i < 45; i++) total += b.hit(`n${i}`, 'perfect');
    expect(total).toBe(100 * (10 * 1 + 10 * 2 + 10 * 3 + 15 * 4));
    expect(b.summary().score).toBe(total);
  });

  it('a wrong key resets the streak without removing a hit', () => {
    const b = new ScoreBoard(4);
    b.hit('a', 'perfect');
    b.hit('b', 'perfect');
    b.wrongKey({ noteId: 'c', midi: 60, pressedMidi: 61, measure: 1, kind: 'wrong-key', offsetMs: null });
    expect(b.summary()).toMatchObject({ streak: 0, longestStreak: 2, hits: 2, accuracy: 0.5 });
    expect(b.summary().misses).toHaveLength(1);
  });

  it('maxScore matches the all-Perfect run', () => {
    expect(maxScore(26)).toBe(100 * (10 + 20 + 18));
  });
});

describe('stars and accuracy', () => {
  it.each([
    [0, 0],
    [0.6999, 0],
    [0.7, 1],
    [0.8499, 1],
    [0.85, 2],
    [0.9499, 2],
    [0.95, 3],
    [1, 3],
  ])('accuracy %f gives %i stars', (acc, stars) => {
    expect(starsFor(acc)).toBe(stars);
  });

  it('accuracy is hits over total notes', () => {
    const b = new ScoreBoard(10);
    for (let i = 0; i < 7; i++) b.hit(`n${i}`, 'good');
    expect(b.summary()).toMatchObject({ hits: 7, total: 10, accuracy: 0.7, stars: 1 });
  });

  it('forget removes a note so a looped pass is re-judged', () => {
    const b = new ScoreBoard(2);
    b.hit('a', 'perfect');
    b.hit('b', 'great');
    b.forget(['a', 'b']);
    expect(b.summary()).toMatchObject({ score: 0, hits: 0 });
  });
});

describe('summary detail for results', () => {
  it('lists hit and missed notes and the offset of every hit', () => {
    const b = new ScoreBoard(4);
    b.hit('a', 'perfect', -12);
    b.hit('b', 'great', 70);
    b.miss({ noteId: 'c', midi: 60, pressedMidi: 60, measure: 1, kind: 'late', offsetMs: 180 });
    expect(b.summary()).toMatchObject({ hitNoteIds: ['a', 'b'], missedNoteIds: ['c'], hitOffsets: [-12, 70] });
  });
  it('the latest result of a note wins (a looped pass), and forget clears it', () => {
    const b = new ScoreBoard(1);
    b.miss({ noteId: 'a', midi: 60, pressedMidi: null, measure: 1, kind: 'late', offsetMs: null });
    b.hit('a', 'good', 140);
    expect(b.summary()).toMatchObject({ hitNoteIds: ['a'], missedNoteIds: [], hitOffsets: [140] });
    b.forget(['a']);
    expect(b.summary()).toMatchObject({ hitNoteIds: [], missedNoteIds: [], hitOffsets: [] });
  });
});
