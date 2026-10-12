import { beatsToMs } from '../engine/clock';
import { getCurrentPlay, type PlayHandle } from '../engine/current';
import type { Song } from '../engine/song';
import type { MidiEngine } from './engine';

/**
 * How the virtual player behaves. Everything is deterministic for a given seed.
 * Times are milliseconds on the song's own timeline (nominal tempo).
 */
export interface AccuracyProfile {
  /** Constant timing error added to every press (negative = early). Default 0. */
  offsetMs?: number;
  /** Random timing error, uniform in +/- jitterMs. Default 0. */
  jitterMs?: number;
  /** Chance (0-1) of hitting a wrong neighbouring key just before a note. Default 0. */
  wrongKeyRate?: number;
  /**
   * Chance (0-1) the player is slow on a note. In Wait mode that is a pause of
   * hesitationMs before the press (the song waits for them). In the timed modes
   * the song does not wait, so the note is skipped (never pressed). Default 0.
   */
  missRate?: number;
  /** Length of a hesitation. Default 600. */
  hesitationMs?: number;
  /** Fraction of a note's length the key is held. Default 0.8. */
  holdFraction?: number;
  seed?: number;
}

export const PERFECT_PLAYER: AccuracyProfile = {};

export interface AutoplayEvent {
  atMs: number;
  kind: 'press' | 'release';
  midi: number;
  intent: 'correct' | 'wrong';
}

export interface AutoplayResult {
  presses: number;
  wrongPresses: number;
}

const WRONG_LEAD_MS = 100;
const WRONG_HOLD_MS = 50;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PlanOptions {
  /** Playback speed (1 = nominal tempo). Offsets and jitter stay in real milliseconds. */
  speed?: number;
  /** Timed modes: missRate skips notes instead of stalling the song. */
  timed?: boolean;
}

/** Turn a song and a profile into a time-ordered list of key presses and releases. */
export function planAutoplay(song: Song, profile: AccuracyProfile = {}, opts: PlanOptions = {}): AutoplayEvent[] {
  const speed = opts.speed ?? 1;
  const timed = opts.timed ?? false;
  const { offsetMs = 0, jitterMs = 0, wrongKeyRate = 0, missRate = 0, hesitationMs = 600, holdFraction = 0.8 } = profile;
  const rand = rng(profile.seed ?? 1);
  const events: AutoplayEvent[] = [];
  const chordMidis = (beat: number) => song.notes.filter((n) => Math.abs(n.startBeat - beat) < 1e-6).map((n) => n.midi);

  let stall = 0;
  let lastStallBeat = NaN;
  let skipStep = false;
  const releases: { midi: number; at: number; pressAt: number }[] = [];
  for (const n of song.notes) {
    const sameStep = Math.abs(n.startBeat - lastStallBeat) < 1e-6;
    // Draw in a fixed order so a seed always yields the same plan.
    const rMiss = rand();
    const rJit = rand();
    const rWrong = rand();
    const rPick = rand();
    if (!sameStep) {
      skipStep = timed && rMiss < missRate;
      if (!timed && rMiss < missRate) stall += hesitationMs;
    }
    lastStallBeat = n.startBeat;
    const pressAt =
      Math.round((beatsToMs(n.startBeat, song.bpm) / speed + offsetMs + (rJit * 2 - 1) * jitterMs + stall) * 1000) / 1000;
    if (!sameStep && rWrong < wrongKeyRate) {
      const choices = [-2, -1, 1, 2]
        .map((d) => n.midi + d)
        .filter((m) => m >= 21 && m <= 108 && !chordMidis(n.startBeat).includes(m));
      const m = choices[Math.floor(rPick * choices.length)];
      if (m !== undefined) {
        events.push({ atMs: pressAt - WRONG_LEAD_MS, kind: 'press', midi: m, intent: 'wrong' });
        events.push({ atMs: pressAt - WRONG_LEAD_MS + WRONG_HOLD_MS, kind: 'release', midi: m, intent: 'wrong' });
      }
    }
    if (skipStep) continue;
    events.push({ atMs: pressAt, kind: 'press', midi: n.midi, intent: 'correct' });
    const hold = Math.max(40, (beatsToMs(n.durationBeats, song.bpm) / speed) * holdFraction);
    releases.push({ midi: n.midi, at: pressAt + hold, pressAt });
  }
  // Never hold a key into the next press of the same pitch.
  for (const r of releases) {
    const next = releases
      .filter((o) => o.midi === r.midi && o.pressAt > r.pressAt)
      .reduce((m, o) => Math.min(m, o.pressAt), Infinity);
    const at = Math.max(r.pressAt + 1, Math.min(r.at, next - 20));
    events.push({ atMs: at, kind: 'release', midi: r.midi, intent: 'correct' });
  }
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.atMs - b.e.atMs || a.i - b.i)
    .map((x) => x.e);
}

export interface AutoplayEnv {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realEnv: AutoplayEnv = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * Play the open song through the virtual MIDI pipeline. Resolves when the last
 * key has been released (or the song screen was closed).
 */
export async function runAutoplay(
  engine: MidiEngine,
  profile: AccuracyProfile = {},
  handle: PlayHandle | null = getCurrentPlay(),
  env: AutoplayEnv = realEnv,
): Promise<AutoplayResult> {
  if (!handle) throw new Error('autoplay: no song is open. Open a song on the Play screen first.');
  const { speed, kind } = handle.session;
  const plan = planAutoplay(handle.song, profile, { speed, timed: kind === 'timed' });
  handle.ensureStarted();
  // Wall-clock time at which the song reaches beat 0 if nothing interrupts it.
  const t0 = env.now() - beatsToMs(handle.session.beatAt(env.now()), handle.song.bpm) / speed;
  const held = new Set<number>();
  const result: AutoplayResult = { presses: 0, wrongPresses: 0 };
  for (const e of plan) {
    const wait = t0 + e.atMs - env.now();
    if (wait > 0) await env.sleep(wait);
    if (getCurrentPlay() !== handle) break;
    if (e.kind === 'press') {
      engine.press(e.midi, 80);
      held.add(e.midi);
      if (e.intent === 'wrong') result.wrongPresses++;
      else result.presses++;
    } else {
      engine.release(e.midi);
      held.delete(e.midi);
    }
  }
  held.forEach((m) => engine.release(m));
  return result;
}
