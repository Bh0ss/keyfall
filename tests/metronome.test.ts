import { describe, expect, it } from 'vitest';
import { clicksDue, isAccent, wantsClick } from '../src/engine/metronome';

const rules = { metronome: false, countIn: true, barBeats: 4, playStartBeat: 0 };

describe('wantsClick', () => {
  it('count-in clicks one bar before the first judged beat, nothing earlier', () => {
    expect([-5, -4, -3, -2, -1, 0, 1].map((b) => wantsClick(b, rules))).toEqual([false, true, true, true, true, false, false]);
  });
  it('the metronome clicks from the first judged beat on', () => {
    const r = { ...rules, metronome: true };
    expect([-5, -4, -1, 0, 1, 9].map((b) => wantsClick(b, r))).toEqual([false, true, true, true, true, true]);
  });
  it('no count-in, no metronome: silent', () => {
    expect([-3, 0, 2].some((b) => wantsClick(b, { ...rules, countIn: false }))).toBe(false);
  });
  it('a loop starting at beat 8 counts in at beats 4 to 7', () => {
    const r = { ...rules, playStartBeat: 8 };
    expect([3, 4, 7, 8].map((b) => wantsClick(b, r))).toEqual([false, true, true, false]);
  });
});

describe('isAccent', () => {
  it('accents the first beat of each bar', () => {
    expect([0, 1, 4, 5, -4, -1, 8].map((b) => isAccent(b, 4))).toEqual([true, false, true, false, true, false, true]);
    expect([0, 3, 6].map((b) => isAccent(b, 3))).toEqual([true, true, true]);
  });
});

describe('clicksDue', () => {
  it('schedules integer beats inside the look-ahead once', () => {
    const a = clicksDue(0.9, -Infinity, 0.3);
    expect(a.beats).toEqual([1]);
    expect(clicksDue(0.95, a.last, 0.3).beats).toEqual([]);
    expect(clicksDue(1.8, a.last, 0.3).beats).toEqual([2]);
  });
  it('does not click beats already behind the playhead', () => {
    expect(clicksDue(2.4, -Infinity, 0.1).beats).toEqual([]);
  });
  it('restarts after the clock jumps back (loop wrap)', () => {
    const a = clicksDue(11.9, 10, 0.3);
    expect(a.beats).toEqual([12]);
    expect(clicksDue(4.0, a.last, 0.3).beats).toEqual([4]);
  });
});
