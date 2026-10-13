/**
 * `window.__keyfall.transcribe`, behind ?debug=1 only (see midi/virtual.ts). It drives the real decode + worker path
 * from e2e tests and for measurements. Loaded on demand, so none of this is in the main chunk. It never throws:
 * failures come back as { ok: false }. Nothing is stored; the bytes live only for the call.
 */
import { ImportError } from '../import/limits';
import { decodeAudio } from './decode';
import { liveWorkers, TranscribeUnsupportedError, workerTranscriber } from './client';
import type { NoteEvent, TranscribeInfo } from './types';

export interface DebugTranscribeOptions {
  fileName?: string;
  /** Tile the decoded audio this many times (3 minute timings from a short clip). */
  repeat?: number;
  /** Abort the run after this many milliseconds. */
  cancelAfterMs?: number;
}

export type DebugTranscribeResult =
  | { ok: true; notes: NoteEvent[]; info: TranscribeInfo; seconds: number; decodeMs: number; wallMs: number; stages: string[]; liveWorkers: number }
  | { ok: false; kind: 'cancelled' | 'unsupported' | 'import' | 'error'; message: string; liveWorkers: number };

export async function debugTranscribe(
  input: ArrayBuffer | Uint8Array | number[],
  opts: DebugTranscribeOptions = {},
): Promise<DebugTranscribeResult> {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : Uint8Array.from(input);
  const ac = new AbortController();
  const timer = opts.cancelAfterMs === undefined ? undefined : setTimeout(() => ac.abort(), opts.cancelAfterMs);
  const fail = (kind: 'cancelled' | 'unsupported' | 'import' | 'error', message: string): DebugTranscribeResult => ({ ok: false, kind, message, liveWorkers: liveWorkers() });
  try {
    const t0 = performance.now();
    const decoded = await decodeAudio({ name: opts.fileName ?? 'debug.wav', size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer });
    let pcm = decoded.pcm;
    const repeat = Math.max(1, Math.min(10, Math.floor(opts.repeat ?? 1)));
    if (repeat > 1) {
      const tiled = new Float32Array(pcm.length * repeat);
      for (let k = 0; k < repeat; k++) tiled.set(pcm, k * pcm.length);
      pcm = tiled;
    }
    const decodeMs = performance.now() - t0;
    const seconds = pcm.length / 22050;
    const stages: string[] = [];
    let info: TranscribeInfo | undefined;
    const t1 = performance.now();
    const notes = await workerTranscriber()(pcm, {
      signal: ac.signal,
      onProgress: (p) => {
        if (stages.at(-1) !== p.stage) stages.push(p.stage);
      },
      onInfo: (i) => (info = i),
    });
    return { ok: true, notes, info: info!, seconds, decodeMs, wallMs: performance.now() - t1, stages, liveWorkers: liveWorkers() };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return fail('cancelled', e.message);
    if (e instanceof TranscribeUnsupportedError) return fail('unsupported', e.message);
    if (e instanceof ImportError) return fail('import', e.message);
    return fail('error', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
