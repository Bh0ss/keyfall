/** Gentle UI sound effects. Oscillators and gain envelopes only, no samples. */
import { audioContext } from './audio';

export type SoundName =
  | 'nav'
  | 'select'
  | 'back'
  | 'correct'
  | 'wrong'
  | 'pass'
  | 'fail'
  | 'complete'
  | 'star'
  | 'levelup'
  | 'badge'
  | 'pause'
  | 'resume'
  | 'combo';

export interface NoteDef {
  freq: number;
  startSec: number;
  durSec: number;
  type: 'sine' | 'triangle';
  gain: number;
}

const n = (
  freq: number,
  startSec: number,
  durSec: number,
  gain: number,
  type: 'sine' | 'triangle' = 'sine',
): NoteDef => ({ freq, startSec, durSec, type, gain });

export const SOUND_DEFS: Record<SoundName, NoteDef[]> = {
  nav: [n(880, 0, 0.04, 0.08)],
  select: [n(659.25, 0, 0.06, 0.12, 'triangle'), n(880, 0.06, 0.1, 0.12, 'triangle')],
  back: [n(392, 0, 0.12, 0.12, 'triangle')],
  correct: [n(1046.5, 0, 0.3, 0.1), n(1318.5, 0.07, 0.4, 0.07)],
  wrong: [n(311.13, 0, 0.16, 0.14, 'triangle'), n(233.08, 0.16, 0.3, 0.14, 'triangle')],
  pass: [
    n(523.25, 0, 0.15, 0.08),
    n(659.25, 0.09, 0.15, 0.08),
    n(783.99, 0.18, 0.15, 0.08),
    n(1046.5, 0.27, 0.4, 0.08),
  ],
  fail: [n(440, 0, 0.17, 0.12, 'triangle'), n(369.99, 0.17, 0.35, 0.12, 'triangle')],
  complete: [
    n(392, 0, 0.2, 0.05),
    n(493.88, 0, 0.2, 0.05),
    n(587.33, 0, 0.2, 0.05),
    n(523.25, 0.2, 0.45, 0.05),
    n(659.25, 0.2, 0.45, 0.05),
    n(783.99, 0.2, 0.45, 0.05),
  ],
  star: [n(1174.66, 0, 0.35, 0.14)],
  levelup: [
    n(523.25, 0, 0.14, 0.07),
    n(659.25, 0.1, 0.14, 0.07),
    n(783.99, 0.2, 0.14, 0.07),
    n(1046.5, 0.3, 0.85, 0.07),
    n(1051.7, 0.3, 0.85, 0.03),
  ],
  badge: [n(1318.5, 0, 0.35, 0.09), n(1975.5, 0.12, 0.7, 0.09)],
  pause: [n(392, 0, 0.12, 0.1, 'triangle')],
  resume: [n(523.25, 0, 0.12, 0.1, 'triangle')],
  combo: [n(784, 0, 0.08, 0.09), n(1046.5, 0.07, 0.12, 0.08)],
};

/** The slice of AudioContext this module uses; fakes implement it in tests. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  resume?: () => Promise<void> | void;
  createOscillator: () => OscillatorLike;
  createGain: () => GainLike;
}

export interface OscillatorLike {
  type: OscillatorType;
  frequency: { value: number };
  onended: ((ev: Event) => void) | null;
  connect: (dest: never) => unknown;
  disconnect: () => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

export interface GainLike {
  gain: {
    setValueAtTime: (value: number, time: number) => unknown;
    exponentialRampToValueAtTime: (value: number, time: number) => unknown;
  };
  connect: (dest: never) => unknown;
  disconnect: () => void;
}

const FLOOR = 0.0001;
const ATTACK_SEC = 0.005;
const STOP_PAD_SEC = 0.02;
const DEDUPE_MS = 25;
const STAR_GAP_SEC = 0.18;

function scheduleNote(ctx: AudioContextLike, note: NoteDef, at: number, freqMul: number): void {
  const start = at + note.startSec;
  const end = start + note.durSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = note.type;
  osc.frequency.value = note.freq * freqMul;
  gain.gain.setValueAtTime(FLOOR, start);
  gain.gain.exponentialRampToValueAtTime(note.gain, start + ATTACK_SEC);
  gain.gain.exponentialRampToValueAtTime(FLOOR, end);
  osc.connect(gain as never);
  gain.connect(ctx.destination as never);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(start);
  osc.stop(end + STOP_PAD_SEC);
}

export interface Sounds {
  play: (name: SoundName) => void;
  playStarSequence: (stars: number) => void;
  setEnabled: (on: boolean) => void;
  isEnabled: () => boolean;
}

export function createSounds(
  getCtx: () => AudioContextLike | null,
  now: () => number = () => Date.now(),
): Sounds {
  let enabled = true;
  const lastPlayed = new Map<SoundName, number>();

  function liveCtx(): AudioContextLike | null {
    const ctx = getCtx();
    if (!ctx) return null;
    if (ctx.state === 'suspended') void Promise.resolve(ctx.resume?.()).catch(() => undefined);
    return ctx;
  }

  function play(name: SoundName): void {
    if (!enabled) return;
    const t = now();
    const last = lastPlayed.get(name);
    if (last !== undefined && t - last < DEDUPE_MS) return;
    lastPlayed.set(name, t);
    try {
      const ctx = liveCtx();
      if (!ctx) return;
      for (const note of SOUND_DEFS[name]) scheduleNote(ctx, note, ctx.currentTime, 1);
    } catch {
      // audio is best-effort
    }
  }

  function playStarSequence(stars: number): void {
    if (!enabled || !(stars >= 1)) return;
    try {
      const ctx = liveCtx();
      if (!ctx) return;
      const base = ctx.currentTime;
      for (let i = 0; i < Math.floor(stars); i += 1) {
        const mul = 2 ** ((i * 2) / 12);
        for (const note of SOUND_DEFS.star) scheduleNote(ctx, note, base + i * STAR_GAP_SEC, mul);
      }
    } catch {
      // audio is best-effort
    }
  }

  return {
    play,
    playStarSequence,
    setEnabled: (on) => {
      enabled = on;
    },
    isEnabled: () => enabled,
  };
}

const shared = createSounds(audioContext);

export function playSound(name: SoundName): void {
  shared.play(name);
}

export function playStarSequence(stars: number): void {
  shared.playStarSequence(stars);
}

export function setSoundEnabled(on: boolean): void {
  shared.setEnabled(on);
}

export function isSoundEnabled(): boolean {
  return shared.isEnabled();
}
