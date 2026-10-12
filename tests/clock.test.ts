import { describe, expect, it } from 'vitest';
import { Clock, beatsToMs, msToBeats } from '../src/engine/clock';

describe('beat/ms conversion', () => {
  it('one beat at 120 bpm is 500 ms and back', () => {
    expect(beatsToMs(1, 120)).toBe(500);
    expect(msToBeats(500, 120)).toBe(1);
    expect(beatsToMs(4, 60)).toBe(4000);
    expect(msToBeats(1000, 90)).toBeCloseTo(1.5);
  });
});

describe('Clock', () => {
  it('stands still until started', () => {
    const c = new Clock(120);
    expect(c.beatAt(1000)).toBe(0);
    expect(c.running).toBe(false);
  });

  it('advances at the song bpm once resumed', () => {
    const c = new Clock(120);
    c.resume(1000);
    expect(c.beatAt(1500)).toBeCloseTo(1);
    expect(c.beatAt(3000)).toBeCloseTo(4);
  });

  it('pause freezes the beat and resume continues from it', () => {
    const c = new Clock(60);
    c.resume(0);
    c.pause(2000);
    expect(c.beatAt(9000)).toBeCloseTo(2);
    c.resume(10000);
    expect(c.beatAt(11000)).toBeCloseTo(3);
  });

  it('seek moves the position while running or paused', () => {
    const c = new Clock(60);
    c.seek(-4, 0);
    expect(c.beatAt(0)).toBe(-4);
    c.resume(0);
    expect(c.beatAt(1000)).toBeCloseTo(-3);
    c.seek(8, 1000);
    expect(c.beatAt(2000)).toBeCloseTo(9);
  });

  it('speed scales the advance', () => {
    const c = new Clock(120, 0.5);
    c.resume(0);
    expect(c.beatAt(1000)).toBeCloseTo(1);
  });

  it('resume and pause are idempotent', () => {
    const c = new Clock(60);
    c.resume(0);
    c.resume(500);
    expect(c.beatAt(1000)).toBeCloseTo(1);
    c.pause(1000);
    c.pause(5000);
    expect(c.beatAt(6000)).toBeCloseTo(1);
  });
});
