/** One detected note. Seconds from the start of the audio; midi is 21-108 (A0 to C8). */
export interface NoteEvent {
  midi: number;
  startSec: number;
  durationSec: number;
  /** 0-1, the model's confidence in the onset. */
  amplitude: number;
}

/** Sample rate the model needs, and therefore the rate audio is decoded to. */
export const SAMPLE_RATE = 22050;

export type TranscribeStage = 'loading-model' | 'listening' | 'finishing';

export interface TranscribeProgress {
  stage: TranscribeStage;
  /** 0-1 within the stage. "finishing" is indeterminate: it reports 0 until done. */
  fraction: number;
}

/** What a finished run reports besides the notes. */
export interface TranscribeInfo {
  backend: string;
  loadMs: number;
  inferMs: number;
  postMs: number;
}
