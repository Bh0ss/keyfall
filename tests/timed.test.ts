import { describe, expect, it } from 'vitest';
import { windowsFor, type TimedMode } from '../src/engine/judge';
import type { Song } from '../src/engine/song';
import { TimedSession, speedFor } from '../src/engine/timed';

function song(starts: number[], bpm = 120): Song {
  return {
    id: 't',
    title: 't',
    composer: '',
    source: 'bundled',
    level: 1,
    hands: 'right',
    bpm,
    timeSignature: [4, 4],
    notes: starts.map((b, i) => ({ id: `n${i}`, midi: 60, startBeat: b, durationBeats: 1, hand: 'right', measure: Math.floor(b / 4) + 1 })),
  };
}

/** One note at beat 0; the session starts at t=0 with a 4 beat lead-in. Returns the note's wall time. */
function setup(mode: TimedMode, speed = 1, latencyMs = 0) {
  const s = new TimedSession(song([0]), { mode, speed, leadInBeats: 4, latencyMs });
  s.start(0);
  const noteAt = (4 * 500) / s.speed;
  return { s, noteAt };
}

const LABEL = { full: 1, practice: 2, expert: 0.5 } as const;

describe('TimedSession grades by timing offset', () => {
  for (const mode of ['full', 'practice', 'expert'] as const) {
    const k = LABEL[mode];
    for (const [speed, note] of mode === 'practice' ? [[0.7, 'at 70%'] as const, [0.5, 'at 50%'] as const] : [[1, 'at 100%'] as const]) {
      for (const sign of [-1, 1]) {
        const side = sign < 0 ? 'early' : 'late';
        const cases: [number, string][] = [
          [0, 'perfect'],
          [50 * k - 1, 'perfect'],
          [50 * k, 'perfect'],
          [50 * k + 1, 'great'],
          [100 * k - 1, 'great'],
          [100 * k, 'great'],
          [100 * k + 1, 'good'],
          [150 * k - 1, 'good'],
          [150 * k, 'good'],
          [150 * k + 1, 'miss'],
        ];
        for (const [off, label] of cases) {
          it(`${mode} ${note} ${side} ${off} ms -> ${label}`, () => {
            const { s, noteAt } = setup(mode, speed);
            const result = s.noteOn(60, noteAt + sign * off);
            expect(s.last.label).toBe(label);
            expect(result).toBe(label === 'miss' ? 'wrong' : 'correct');
            const sum = s.summary();
            expect(sum.hits).toBe(label === 'miss' ? 0 : 1);
            expect(sum.score).toBe({ perfect: 100, great: 70, good: 40, miss: 0 }[label]);
            if (label === 'miss') {
              expect(sum.misses).toEqual([
                { noteId: 'n0', midi: 60, pressedMidi: 60, measure: 1, kind: sign < 0 ? 'early' : 'late', offsetMs: sign * off },
              ]);
            }
          });
        }
      }
    }
  }

  it('windows are in real milliseconds, not song time', () => {
    const { s, noteAt } = setup('practice', 0.5);
    expect(noteAt).toBe(4000);
    s.noteOn(60, noteAt + 100);
    expect(s.last.label).toBe('perfect');
  });
});

describe('TimedSession behaviour', () => {
  it('a wrong pitch is a wrong-key miss, resets the streak, and leaves the note playable', () => {
    const { s, noteAt } = setup('full');
    expect(s.noteOn(61, noteAt - 100)).toBe('wrong');
    expect(s.summary().misses[0]).toMatchObject({ kind: 'wrong-key', midi: 60, pressedMidi: 61, offsetMs: null });
    expect(s.noteOn(60, noteAt)).toBe('correct');
    expect(s.summary()).toMatchObject({ hits: 1, accuracy: 1 });
  });

  it('a note nobody plays expires as a late miss and ends the song', () => {
    const { s, noteAt } = setup('full');
    s.update(noteAt + 224);
    expect(s.summary().misses).toHaveLength(0);
    s.update(noteAt + 226);
    expect(s.summary().misses).toEqual([{ noteId: 'n0', midi: 60, pressedMidi: null, measure: 1, kind: 'late', offsetMs: null }]);
    s.update(noteAt + 3000);
    expect(s.status).toBe('finished');
    expect(s.summary()).toMatchObject({ hits: 0, accuracy: 0, stars: 0 });
  });

  it('subtracts the calibrated latency from every hit time', () => {
    const { s, noteAt } = setup('full', 1, 80);
    s.noteOn(60, noteAt + 80);
    expect(s.last).toMatchObject({ label: 'perfect', offsetMs: 0 });
    const b = setup('full', 1, 0);
    b.s.noteOn(60, b.noteAt + 80);
    expect(b.s.last.label).toBe('great');
  });

  it('ignores presses before start and after finish', () => {
    const s = new TimedSession(song([0]), { mode: 'full' });
    expect(s.noteOn(60, 0)).toBe('ignored');
  });

  it('pausing freezes the clock', () => {
    const { s } = setup('full');
    s.pause(1000);
    const beat = s.beatAt(1000);
    expect(s.beatAt(5000)).toBe(beat);
    s.resume(5000);
    expect(s.beatAt(5500)).toBeCloseTo(beat + 1, 6);
  });

  it('only the practice mode honours a speed, clamped to 50-90%', () => {
    expect(speedFor('full', 0.7)).toBe(1);
    expect(speedFor('expert', 0.5)).toBe(1);
    expect(speedFor('practice', 0.7)).toBe(0.7);
    expect(speedFor('practice', 0.2)).toBe(0.5);
    expect(speedFor('practice', 1)).toBe(0.9);
  });

  it('an A-B loop only judges its measures and wraps with a fresh score', () => {
    const sg = song([0, 4, 8, 12]);
    const s = new TimedSession(sg, { mode: 'full', leadInBeats: 4, loop: { fromMeasure: 2, toMeasure: 3 } });
    expect(s.playStartBeat).toBe(4);
    expect(s.endBeat).toBe(12);
    expect(s.summary().total).toBe(2);
    s.start(0);
    // Loop starts at beat 4 with a 4 beat run-up: note n1 (beat 4) arrives 2000 ms after start.
    expect(s.noteOn(60, 2000)).toBe('correct');
    expect(s.noteOn(60, 4000)).toBe('correct');
    expect(s.summary().hits).toBe(2);
    s.update(4000 + 3000);
    expect(s.status).toBe('playing');
    expect(s.summary().hits).toBe(0);
    expect(s.beatAt(7000)).toBeLessThan(4);
  });

  it('chooses the nearest note when one pitch repeats', () => {
    const s = new TimedSession(song([0, 1]), { mode: 'full', leadInBeats: 0 });
    s.start(0);
    s.noteOn(60, 480);
    expect(s.isHit('n1')).toBe(true);
    expect(s.isHit('n0')).toBe(false);
    expect(windowsFor('full').good).toBe(150);
  });
});
