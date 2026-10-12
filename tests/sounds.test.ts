import { describe, expect, it } from 'vitest';
import {
  SOUND_DEFS,
  createSounds,
  isSoundEnabled,
  playSound,
  setSoundEnabled,
  type AudioContextLike,
  type SoundName,
} from '../src/ui/sounds';

const NAMES: SoundName[] = [
  'nav',
  'select',
  'back',
  'correct',
  'wrong',
  'pass',
  'fail',
  'complete',
  'star',
  'levelup',
  'badge',
  'pause',
  'resume',
  'combo',
];

interface FakeOsc {
  type: string;
  frequency: { value: number };
  starts: number[];
  stops: number[];
  disconnected: boolean;
  onended: (() => void) | null;
  connect: (dest: unknown) => unknown;
  disconnect: () => void;
  start: (t: number) => void;
  stop: (t: number) => void;
}

interface FakeGain {
  calls: Array<[string, number, number]>;
  gain: {
    setValueAtTime: (v: number, t: number) => void;
    exponentialRampToValueAtTime: (v: number, t: number) => void;
  };
  connect: (dest: unknown) => unknown;
  disconnect: () => void;
}

function fakeCtx(state = 'running') {
  const oscs: FakeOsc[] = [];
  const gains: FakeGain[] = [];
  const resumed = { count: 0 };
  const ctx = {
    currentTime: 10,
    state,
    destination: {},
    resume: () => {
      resumed.count += 1;
      return Promise.resolve();
    },
    createOscillator: () => {
      const o: FakeOsc = {
        type: 'sine',
        frequency: { value: 0 },
        starts: [],
        stops: [],
        disconnected: false,
        onended: null,
        connect: (d) => d,
        disconnect: () => {
          o.disconnected = true;
        },
        start: (t) => o.starts.push(t),
        stop: (t) => o.stops.push(t),
      };
      oscs.push(o);
      return o;
    },
    createGain: () => {
      const g: FakeGain = {
        calls: [],
        gain: {
          setValueAtTime: (v, t) => g.calls.push(['set', v, t]),
          exponentialRampToValueAtTime: (v, t) => g.calls.push(['ramp', v, t]),
        },
        connect: (d) => d,
        disconnect: () => undefined,
      };
      gains.push(g);
      return g;
    },
  };
  return { ctx: ctx as unknown as AudioContextLike, oscs, gains, resumed };
}

describe('SOUND_DEFS', () => {
  it('defines every sound name and nothing else', () => {
    expect(Object.keys(SOUND_DEFS).sort()).toEqual([...NAMES].sort());
  });

  it.each(NAMES)('%s has quiet, in-range, non-negative, sorted notes', (name) => {
    const notes = SOUND_DEFS[name];
    expect(notes.length).toBeGreaterThan(0);
    let prev = 0;
    for (const n of notes) {
      expect(n.freq).toBeGreaterThanOrEqual(100);
      expect(n.freq).toBeLessThanOrEqual(4000);
      expect(n.gain).toBeGreaterThan(0);
      expect(n.gain).toBeLessThanOrEqual(0.18);
      expect(n.startSec).toBeGreaterThanOrEqual(0);
      expect(n.durSec).toBeGreaterThanOrEqual(0.03);
      expect(['sine', 'triangle']).toContain(n.type);
      expect(n.startSec).toBeGreaterThanOrEqual(prev);
      prev = n.startSec;
    }
  });

  it.each(NAMES)('%s stays within its length budget', (name) => {
    const end = Math.max(...SOUND_DEFS[name].map((n) => n.startSec + n.durSec));
    const limit = name === 'levelup' || name === 'badge' ? 1.2 : 0.7;
    expect(end).toBeLessThanOrEqual(limit);
  });

  it('keeps summed simultaneous gain at or under 0.18', () => {
    for (const name of NAMES) {
      for (const a of SOUND_DEFS[name]) {
        const sum = SOUND_DEFS[name]
          .filter((b) => b.startSec <= a.startSec && b.startSec + b.durSec > a.startSec + 1e-9)
          .reduce((s, b) => s + b.gain, 0);
        expect(sum).toBeLessThanOrEqual(0.18 + 1e-9);
      }
    }
  });
});

describe('createSounds', () => {
  it('creates, starts and stops one oscillator per note', () => {
    const f = fakeCtx();
    const s = createSounds(() => f.ctx, () => 1000);
    s.play('select');
    const notes = SOUND_DEFS.select;
    expect(f.oscs).toHaveLength(notes.length);
    f.oscs.forEach((o, i) => {
      const n = notes[i]!;
      expect(o.frequency.value).toBe(n.freq);
      expect(o.type).toBe(n.type);
      expect(o.starts).toEqual([10 + n.startSec]);
      expect(o.stops[0]).toBeCloseTo(10 + n.startSec + n.durSec + 0.02, 6);
    });
  });

  it('shapes the gain envelope', () => {
    const f = fakeCtx();
    createSounds(() => f.ctx, () => 1000).play('nav');
    const n = SOUND_DEFS.nav[0]!;
    const g = f.gains[0]!;
    expect(g.calls[0]).toEqual(['set', 0.0001, 10 + n.startSec]);
    expect(g.calls[1]![0]).toBe('ramp');
    expect(g.calls[1]![1]).toBe(n.gain);
    expect(g.calls[1]![2]).toBeCloseTo(10 + n.startSec + 0.005, 6);
    expect(g.calls[2]![0]).toBe('ramp');
    expect(g.calls[2]![1]).toBe(0.0001);
    expect(g.calls[2]![2]).toBeCloseTo(10 + n.startSec + n.durSec, 6);
  });

  it('disconnects nodes when an oscillator ends', () => {
    const f = fakeCtx();
    createSounds(() => f.ctx, () => 1000).play('nav');
    const o = f.oscs[0]!;
    expect(o.disconnected).toBe(false);
    o.onended?.();
    expect(o.disconnected).toBe(true);
  });

  it('resumes a suspended context', () => {
    const f = fakeCtx('suspended');
    createSounds(() => f.ctx, () => 1000).play('nav');
    expect(f.resumed.count).toBe(1);
  });

  it('creates nothing while disabled and plays again once re-enabled', () => {
    const f = fakeCtx();
    const s = createSounds(() => f.ctx, () => 1000);
    expect(s.isEnabled()).toBe(true);
    s.setEnabled(false);
    expect(s.isEnabled()).toBe(false);
    s.play('correct');
    s.playStarSequence(3);
    expect(f.oscs).toHaveLength(0);
    s.setEnabled(true);
    s.play('correct');
    expect(f.oscs).toHaveLength(SOUND_DEFS.correct.length);
  });

  it('does not throw without an AudioContext', () => {
    const s = createSounds(() => null, () => 1000);
    expect(() => s.play('pass')).not.toThrow();
    expect(() => s.playStarSequence(2)).not.toThrow();
  });

  it('does not throw when the context throws', () => {
    const s = createSounds(
      () => {
        throw new Error('boom');
      },
      () => 1000,
    );
    expect(() => s.play('pass')).not.toThrow();
    const bad = {
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        throw new Error('nope');
      },
      createGain: () => {
        throw new Error('nope');
      },
    } as unknown as AudioContextLike;
    const s2 = createSounds(() => bad, () => 1000);
    expect(() => s2.play('pass')).not.toThrow();
    expect(() => s2.playStarSequence(2)).not.toThrow();
  });

  it('de-dupes the same name within 25 ms but not other names or later calls', () => {
    const f = fakeCtx();
    let t = 1000;
    const s = createSounds(() => f.ctx, () => t);
    s.play('nav');
    t += 10;
    s.play('nav');
    expect(f.oscs).toHaveLength(1);
    s.play('back');
    expect(f.oscs).toHaveLength(2);
    t += 20;
    s.play('nav');
    expect(f.oscs).toHaveLength(3);
  });

  it('plays a star sequence 0.18 s apart with rising pitch', () => {
    const f = fakeCtx();
    createSounds(() => f.ctx, () => 1000).playStarSequence(3);
    expect(f.oscs).toHaveLength(3 * SOUND_DEFS.star.length);
    const starts = f.oscs.map((o) => o.starts[0]!);
    expect(starts[0]).toBeCloseTo(10, 6);
    expect(starts[1]! - starts[0]!).toBeCloseTo(0.18, 6);
    expect(starts[2]! - starts[1]!).toBeCloseTo(0.18, 6);
    const freqs = f.oscs.map((o) => o.frequency.value);
    expect(freqs[1]!).toBeGreaterThan(freqs[0]!);
    expect(freqs[2]!).toBeGreaterThan(freqs[1]!);
    expect(Math.max(...freqs)).toBeLessThanOrEqual(4000);
  });

  it('schedules nothing for zero stars', () => {
    const f = fakeCtx();
    const s = createSounds(() => f.ctx, () => 1000);
    s.playStarSequence(0);
    s.playStarSequence(-2);
    expect(f.oscs).toHaveLength(0);
  });
});

describe('singleton', () => {
  it('defaults to enabled, toggles, and no-ops safely without AudioContext', () => {
    expect(isSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(() => playSound('nav')).not.toThrow();
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    expect(() => playSound('nav')).not.toThrow();
  });
});
