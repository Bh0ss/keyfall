/**
 * A stand-in for the worker, for e2e tests behind ?debug=1 (see seam.ts). It returns notes it was given after a
 * scripted run through the three stages, and honours the abort signal the way the real client does. Never loaded
 * without the debug flag.
 */
import type { Transcriber } from './client';
import { TranscribeUnsupportedError } from './client';
import type { NoteEvent } from './types';

export interface FakeOptions {
  /** Pause between listening steps, ms. */
  stepMs?: number;
  steps?: number;
  /** How long the "finishing" stage lasts, ms. */
  finishingMs?: number;
  fail?: 'unsupported' | 'error';
}

export function fakeTranscriber(notes: NoteEvent[], opts: FakeOptions = {}): Transcriber {
  const { stepMs = 40, steps = 5, finishingMs = 150, fail } = opts;
  return (_pcm, o = {}) =>
    new Promise<NoteEvent[]>((resolve, reject) => {
      const { signal } = o;
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const stop = () => {
        timers.forEach(clearTimeout);
        timers.clear();
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        stop();
        reject(new DOMException('Transcription cancelled', 'AbortError'));
      };
      const later = (ms: number, fn: () => void) => {
        const t = setTimeout(() => {
          timers.delete(t);
          fn();
        }, ms);
        timers.add(t);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort);
      const step = (i: number) => {
        if (i === 0) o.onProgress?.({ stage: 'loading-model', fraction: 1 });
        else o.onProgress?.({ stage: 'listening', fraction: i / steps });
        if (signal?.aborted) return;
        if (i === 0 && fail === 'unsupported') return (stop(), reject(new TranscribeUnsupportedError('WebGL is not available in this browser.')));
        if (i === 0 && fail === 'error') return (stop(), reject(new Error('fake worker failure')));
        if (i < steps) return later(stepMs, () => step(i + 1));
        o.onProgress?.({ stage: 'finishing', fraction: 0 });
        if (signal?.aborted) return;
        later(finishingMs, () => (stop(), resolve(notes)));
      };
      later(stepMs, () => step(0));
    });
}
