import { describe, expect, it } from 'vitest';
import { getSong } from '../src/songs/catalog';
import { PERFECT_PLAYER, planAutoplay } from '../src/midi/autoplay';

const mary = getSong('mary-had-a-little-lamb')!;
const presses = (plan: ReturnType<typeof planAutoplay>) => plan.filter((e) => e.kind === 'press');

describe('planAutoplay', () => {
  it('a perfect player presses every note exactly on its beat and releases after', () => {
    const plan = planAutoplay(mary, PERFECT_PLAYER);
    const ps = presses(plan);
    expect(ps).toHaveLength(26);
    expect(ps.every((e) => e.intent === 'correct')).toBe(true);
    // 96 bpm: one beat = 625 ms
    expect(ps[0]).toMatchObject({ atMs: 0, midi: 64 });
    expect(ps[1]).toMatchObject({ atMs: 625, midi: 62 });
    expect(ps[25]).toMatchObject({ atMs: 28 * 625, midi: 60 });
    expect(plan.filter((e) => e.kind === 'release')).toHaveLength(26);
    const sorted = [...plan].sort((a, b) => a.atMs - b.atMs);
    expect(plan.map((e) => e.atMs)).toEqual(sorted.map((e) => e.atMs));
  });

  it('applies a constant offset to every press', () => {
    const ps = presses(planAutoplay(mary, { ...PERFECT_PLAYER, offsetMs: 40 }));
    expect(ps[0]!.atMs).toBe(40);
    expect(ps[1]!.atMs).toBe(665);
  });

  it('is deterministic for a seed and different across seeds', () => {
    const p = { jitterMs: 30, wrongKeyRate: 0.2, missRate: 0.2, seed: 7 };
    expect(planAutoplay(mary, p)).toEqual(planAutoplay(mary, p));
    expect(planAutoplay(mary, p)).not.toEqual(planAutoplay(mary, { ...p, seed: 8 }));
  });

  it('jitter stays within bounds', () => {
    const ps = presses(planAutoplay(mary, { jitterMs: 25, seed: 3 }));
    mary.notes.forEach((n, i) => {
      expect(Math.abs(ps[i]!.atMs - n.startBeat * 625)).toBeLessThanOrEqual(25);
    });
  });

  it('wrong keys are never a pitch of the target chord and come before the correct press', () => {
    const plan = planAutoplay(mary, { wrongKeyRate: 1, seed: 1 });
    const wrong = plan.filter((e) => e.intent === 'wrong' && e.kind === 'press');
    expect(wrong).toHaveLength(26);
    for (const w of wrong) {
      const target = mary.notes.find((n) => Math.abs(n.startBeat * 625 - (w.atMs + 100)) < 1e-6)!;
      expect(w.midi).not.toBe(target.midi);
      expect(Math.abs(w.midi - target.midi)).toBeLessThanOrEqual(2);
    }
  });

  it('a missed note makes the player hesitate, delaying that note and everything after', () => {
    const plan = planAutoplay(mary, { missRate: 1, hesitationMs: 500, seed: 1 });
    const ps = presses(plan);
    expect(ps[0]!.atMs).toBe(500);
    expect(ps[1]!.atMs).toBe(625 + 1000);
  });

  it('releases a repeated pitch before its next press', () => {
    const plan = planAutoplay(mary, PERFECT_PLAYER);
    const e = plan.filter((x) => x.midi === 64 && x.kind !== undefined);
    // notes 5,6 are E E: release of the first must precede the press of the second
    const firstE = plan.findIndex((x) => x.kind === 'press' && x.atMs === 4 * 625);
    const rel = plan.slice(firstE).find((x) => x.kind === 'release' && x.midi === 64)!;
    expect(rel.atMs).toBeLessThan(5 * 625);
    expect(e.length).toBeGreaterThan(0);
  });
});

import { runAutoplay, type AccuracyProfile } from '../src/midi/autoplay';
import { setCurrentPlay } from '../src/engine/current';
import { WaitSession } from '../src/engine/wait';
import type { MidiEngine } from '../src/midi/engine';

/** Drive a Wait session with virtual time, the way the animation loop and MIDI pipeline do. */
async function playThrough(profile: AccuracyProfile) {
  let t = 1000;
  const session = new WaitSession(mary, { leadInBeats: 4 });
  const handle = { song: mary, session, ensureStarted: () => session.status === 'ready' && session.start(t) };
  const engine = {
    press: (m: number) => session.noteOn(m, t),
    release: () => undefined,
  } as unknown as MidiEngine;
  const env = {
    now: () => t,
    sleep: async (ms: number) => {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 16);
        session.update(t);
      }
    },
  };
  setCurrentPlay(handle);
  const result = await runAutoplay(engine, profile, handle, env);
  for (let i = 0; i < 400 && session.status !== 'finished'; i++) {
    t += 16;
    session.update(t);
  }
  setCurrentPlay(null);
  return { session, result };
}

describe('runAutoplay against a Wait session', () => {
  it('a perfect player completes Mary with every note correct', async () => {
    const { session, result } = await playThrough({});
    expect(session.status).toBe('finished');
    expect(session.stats()).toMatchObject({ total: 26, correct: 26, wrong: 0 });
    expect(result.presses).toBe(26);
  });

  it('late, early, jittery, hesitating, error-prone players still finish; wrong keys are counted', async () => {
    for (const offsetMs of [-150, 0, 200]) {
      const { session } = await playThrough({ offsetMs, jitterMs: 40, wrongKeyRate: 0.3, missRate: 0.2, seed: 5 });
      expect(session.status).toBe('finished');
      expect(session.stats().correct).toBe(26);
      expect(session.stats().wrong).toBeGreaterThan(0);
    }
  });

  it('rejects when no song is open', async () => {
    await expect(runAutoplay({} as MidiEngine, {}, null)).rejects.toThrow(/no song/);
  });
});

describe('planAutoplay in timed modes', () => {
  it('missRate skips notes instead of stalling the song', () => {
    const plan = planAutoplay(mary, { missRate: 0.3, seed: 5, hesitationMs: 900 }, { timed: true });
    const ps = presses(plan).filter((e) => e.intent === 'correct');
    expect(ps.length).toBeLessThan(26);
    expect(ps.length).toBeGreaterThan(10);
    for (const p of ps) {
      const n = mary.notes.find((x) => Math.abs(x.startBeat * 625 - p.atMs) < 1e-6);
      expect(n).toBeDefined();
    }
    expect(plan.filter((e) => e.kind === 'release')).toHaveLength(ps.length);
  });

  it('missRate 0 and 1 are all or nothing', () => {
    expect(presses(planAutoplay(mary, { missRate: 0 }, { timed: true }))).toHaveLength(26);
    expect(presses(planAutoplay(mary, { missRate: 1 }, { timed: true }))).toHaveLength(0);
  });

  it('speed stretches the timeline but not the offset', () => {
    const ps = presses(planAutoplay(mary, { offsetMs: 30 }, { speed: 0.5, timed: true }));
    expect(ps[0]!.atMs).toBe(30);
    expect(ps[1]!.atMs).toBe(1250 + 30);
  });

  it('Wait-mode plans are unchanged by the new options', () => {
    expect(planAutoplay(mary, { missRate: 0.3, seed: 5 })).toEqual(planAutoplay(mary, { missRate: 0.3, seed: 5 }, { speed: 1, timed: false }));
  });
});
