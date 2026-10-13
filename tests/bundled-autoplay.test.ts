import { afterEach, describe, expect, it } from 'vitest';
import type { PlaySession } from '../src/engine/session';
import type { Song } from '../src/engine/song';
import { setCurrentPlay } from '../src/engine/current';
import { runAutoplay, type AccuracyProfile, type AutoplayResult } from '../src/midi/autoplay';
import { createMidiEngine } from '../src/midi/engine';
import { bundledSummaries, loadBundledSong } from '../src/songs/bundled';
import { createPlaySession, feedNote } from '../src/ui/playSession';

/**
 * Every bundled song, played through the shipping loader, the Play screen's own session factory and note feed, the
 * real MIDI engine and the real autoplay, on virtual time (16 ms frames, like the animation loop). Full mode.
 * It does not cover the React wiring, drawing, the results screen or real timer jitter (those stay in e2e).
 */
async function playFull(song: Song, profile: AccuracyProfile) {
  let t = 1000;
  const session: PlaySession = createPlaySession(song, { mode: 'full', speedPct: 100 }, { latencyMs: 0 });
  const engine = createMidiEngine({});
  const off = engine.subscribeNotes((e) => feedNote(session, e, t));
  const tick = () => {
    t += 16;
    session.update(t);
  };
  const handle = { song, session, ensureStarted: () => session.status === 'ready' && session.start(t) };
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
  let result: AutoplayResult;
  try {
    result = await runAutoplay(engine, profile, handle, env);
    for (let i = 0; i < 2000 && session.status !== 'finished'; i++) tick();
  } finally {
    off();
    setCurrentPlay(null);
  }
  return { session, result };
}

afterEach(() => setCurrentPlay(null));

describe('every bundled song, Full mode, perfect player', () => {
  it('the catalog is not empty', () => {
    expect(bundledSummaries().length).toBeGreaterThanOrEqual(99);
  });

  for (const s of bundledSummaries()) {
    it(`${s.title} finishes at 100%`, async () => {
      const song = (await loadBundledSong(s.id))!;
      const { session, result } = await playFull(song, {});
      const sum = session.summary();
      expect(session.status).toBe('finished');
      expect(sum.total).toBeGreaterThan(20);
      expect(sum.hits).toBe(sum.total);
      expect(sum.accuracy).toBe(1);
      expect(sum.misses).toHaveLength(0);
      expect(result.presses).toBe(sum.total);
      expect(result.wrongPresses).toBe(0);
    }, 60_000);
  }
});

describe('the gate can fail', () => {
  it('a player 200 ms late on every note does not reach 100%', async () => {
    const song = (await loadBundledSong('mary-had-a-little-lamb'))!;
    const { session } = await playFull(song, { offsetMs: 200 });
    const sum = session.summary();
    expect(session.status).toBe('finished');
    expect(sum.accuracy).toBeLessThan(1);
    expect(sum.hits).toBeLessThan(sum.total);
  });

  it('a player who skips notes does not reach 100%', async () => {
    const song = (await loadBundledSong('mary-had-a-little-lamb'))!;
    const { session, result } = await playFull(song, { missRate: 0.3, seed: 5 });
    const sum = session.summary();
    expect(result.presses).toBeLessThan(sum.total);
    expect(sum.hits).toBeLessThan(sum.total);
    expect(sum.accuracy).toBeLessThan(1);
  });
});
