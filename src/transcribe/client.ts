/**
 * The seam between the app and the transcription engine. `Transcriber` has one production adapter (a Web Worker
 * running the real model) and, later, a fake for e2e tests. One worker per run, terminated when the run ends;
 * cancelling terminates it, which is the only reliable way to stop a WebGL program mid-window and frees the GPU.
 */
import type { StartMessage, WorkerMessage } from './protocol';
import type { NoteEvent, TranscribeInfo, TranscribeProgress } from './types';

export interface TranscribeOptions {
  onProgress?: (p: TranscribeProgress) => void;
  /** Called once with backend and timings when the run finishes. */
  onInfo?: (info: TranscribeInfo) => void;
  /** Aborting terminates the worker and rejects with an AbortError. */
  signal?: AbortSignal;
}

/** `pcm` is transferred to the worker: it is empty after the call. */
export type Transcriber = (pcm: Float32Array, opts?: TranscribeOptions) => Promise<NoteEvent[]>;

/** No WebGL (or no worker support): this device cannot run the model. */
export class TranscribeUnsupportedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TranscribeUnsupportedError';
  }
}

export type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
};

// The URL must be a static literal inside new Worker(...): Vite only emits a worker chunk for that exact shape.
const createWorker = (): WorkerLike => new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });

const abortError = () => new DOMException('Transcription cancelled', 'AbortError');

let live = 0;
/** Workers started and not yet terminated. Should be 0 whenever no run is in flight. */
export const liveWorkers = (): number => live;

export function workerTranscriber(make: () => WorkerLike = createWorker): Transcriber {
  return (pcm, opts = {}) =>
    new Promise<NoteEvent[]>((resolve, reject) => {
      const { signal } = opts;
      if (signal?.aborted) return reject(abortError());
      let worker: WorkerLike;
      try {
        worker = make();
      } catch {
        return reject(new TranscribeUnsupportedError('This browser cannot run the transcription worker.'));
      }
      live++;
      let ended = false;
      const end = (settle: () => void) => {
        if (ended) return;
        ended = true;
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
        live--;
        signal?.removeEventListener('abort', onAbort);
        settle();
      };
      const onAbort = () => end(() => reject(abortError()));
      signal?.addEventListener('abort', onAbort);
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') opts.onProgress?.({ stage: m.stage, fraction: m.fraction });
        else if (m.type === 'done') {
          opts.onInfo?.(m.info);
          end(() => resolve(m.notes));
        } else if (m.type === 'unsupported') end(() => reject(new TranscribeUnsupportedError(m.reason)));
        else if (m.type === 'error') end(() => reject(new Error(m.message)));
      };
      worker.onerror = (e) => end(() => reject(new Error(e.message || 'The transcription worker failed.')));
      worker.onmessageerror = () => end(() => reject(new Error('The transcription worker sent something unreadable.')));
      // Transfer the whole buffer; copy first when the samples are a view into a larger one.
      const own = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength ? pcm : pcm.slice();
      const msg: StartMessage = { type: 'start', pcm: own };
      worker.postMessage(msg, [own.buffer]);
    });
}
