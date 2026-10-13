import { describe, expect, it } from 'vitest';
import { TranscribeUnsupportedError } from '../src/transcribe/client';
import { fakeTranscriber } from '../src/transcribe/fake';
import type { NoteEvent, TranscribeProgress } from '../src/transcribe/types';

const notes: NoteEvent[] = [{ midi: 60, startSec: 0, durationSec: 1, amplitude: 0.8 }];
const pcm = new Float32Array(10);
const fast = { stepMs: 1, steps: 3, finishingMs: 5 };

describe('fakeTranscriber', () => {
  it('walks the three stages in order, listening up to 1, then returns the notes', async () => {
    const seen: TranscribeProgress[] = [];
    const got = await fakeTranscriber(notes, fast)(pcm, { onProgress: (p) => seen.push(p) });
    expect(got).toEqual(notes);
    expect(seen.map((p) => p.stage)).toEqual(['loading-model', 'listening', 'listening', 'listening', 'finishing']);
    expect(seen.filter((p) => p.stage === 'listening').map((p) => p.fraction)).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('rejects with an AbortError during any stage and then says nothing more', async () => {
    for (const stage of ['loading-model', 'listening', 'finishing']) {
      const ac = new AbortController();
      const seen: string[] = [];
      const p = fakeTranscriber(notes, { ...fast, finishingMs: 50 })(pcm, {
        signal: ac.signal,
        onProgress: (x) => {
          seen.push(x.stage);
          if (x.stage === stage) ac.abort();
        },
      });
      await expect(p).rejects.toMatchObject({ name: 'AbortError' });
      const n = seen.length;
      await new Promise((r) => setTimeout(r, 80));
      expect(seen).toHaveLength(n);
    }
  });

  it('can fail like a device without WebGL or a crashed worker', async () => {
    await expect(fakeTranscriber(notes, { ...fast, fail: 'unsupported' })(pcm)).rejects.toBeInstanceOf(TranscribeUnsupportedError);
    await expect(fakeTranscriber(notes, { ...fast, fail: 'error' })(pcm)).rejects.toThrow('fake worker failure');
  });
});
