import { describe, expect, it } from 'vitest';
import { bundledSong, fromWav, referenceNotes, synthesize, toWav } from './fixtures/audio';
import { onsetF1 } from './fixtures/metrics';

describe('audio fixtures', () => {
  const song = bundledSong('ode-to-joy');

  it('synthesize is deterministic, bounded and covers the requested time', () => {
    const a = synthesize(song, { seconds: 5 });
    const b = synthesize(song, { seconds: 5 });
    expect(a).toEqual(b);
    expect(a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThanOrEqual(1);
    expect(a.length / 22050).toBeGreaterThan(5);
    expect(a.length / 22050).toBeLessThan(7);
  });

  it('the mix variant differs from the clean one, and is still deterministic', () => {
    const clean = synthesize(song, { seconds: 4 });
    const m1 = synthesize(song, { seconds: 4, mix: true });
    expect(m1).not.toEqual(clean);
    expect(synthesize(song, { seconds: 4, mix: true })).toEqual(m1);
  });

  it('toWav writes a 16-bit mono PCM file that reads back within quantisation error', () => {
    const pcm = synthesize(song, { seconds: 2 });
    const wav = toWav(pcm, 22050);
    expect(wav.length).toBe(44 + pcm.length * 2);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    const back = fromWav(wav);
    expect(back.sampleRate).toBe(22050);
    expect(back.pcm.length).toBe(pcm.length);
    for (let i = 0; i < pcm.length; i += 997) expect(back.pcm[i]).toBeCloseTo(pcm[i]!, 3);
  });

  it('referenceNotes keeps only notes that start before the cut', () => {
    const all = referenceNotes(song);
    const cut = referenceNotes(song, 5);
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.length).toBeLessThan(all.length);
    expect(cut.every((n) => n.startSec < 5)).toBe(true);
  });
});

describe('onsetF1', () => {
  const ref = [{ midi: 60, startSec: 0 }, { midi: 62, startSec: 1 }, { midi: 64, startSec: 2 }];
  it('is 1 for a perfect match', () => {
    expect(onsetF1(ref, ref).f1).toBe(1);
  });
  it('needs the same pitch and an onset within 50 ms', () => {
    const est = [{ midi: 60, startSec: 0.049 }, { midi: 62, startSec: 1.06 }, { midi: 65, startSec: 2 }];
    const r = onsetF1(ref, est);
    expect(r.tp).toBe(1);
    expect(r.precision).toBeCloseTo(1 / 3);
    expect(r.recall).toBeCloseTo(1 / 3);
  });
  it('matches one-to-one, so a duplicated estimate counts once', () => {
    const est = [{ midi: 60, startSec: 0 }, { midi: 60, startSec: 0.01 }];
    const r = onsetF1([ref[0]!], est);
    expect(r.tp).toBe(1);
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(1);
    expect(r.f1).toBeCloseTo(2 / 3);
  });
  it('is 0 with nothing to match instead of NaN', () => {
    expect(onsetF1(ref, []).f1).toBe(0);
    expect(onsetF1([], ref).f1).toBe(0);
  });
});
