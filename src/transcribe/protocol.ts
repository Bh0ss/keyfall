import type { NoteEvent, TranscribeInfo, TranscribeStage } from './types';

/** Main thread to worker. The only message; its samples are transferred, not copied. */
export interface StartMessage {
  type: 'start';
  pcm: Float32Array;
}

/** Worker to main thread. */
export type WorkerMessage =
  | { type: 'backend'; backend: string }
  | { type: 'unsupported'; reason: string }
  | { type: 'progress'; stage: TranscribeStage; fraction: number }
  | { type: 'done'; notes: NoteEvent[]; info: TranscribeInfo }
  | { type: 'error'; message: string };
