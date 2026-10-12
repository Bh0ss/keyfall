import type { ScoreSummary } from './judge';
import type { Song, SongNote } from './song';

export type SessionStatus = 'ready' | 'playing' | 'waiting' | 'paused' | 'finished';
export type PressResult = 'correct' | 'wrong' | 'ignored';

/** What the Play screen, the highway and autoplay need from either kind of session. */
export interface PlaySession {
  readonly kind: 'wait' | 'timed';
  readonly song: Song;
  readonly status: SessionStatus;
  /** Bumps on every observable state change (for useSyncExternalStore). */
  readonly version: number;
  readonly speed: number;
  readonly leadInBeats: number;
  readonly endBeat: number;
  /** First beat the player is judged on (0, or the start of the A-B loop). */
  readonly playStartBeat: number;
  subscribe(listener: () => void): () => void;
  beatAt(nowMs: number): number;
  isHit(noteId: string): boolean;
  isMissed(noteId: string): boolean;
  isPlayed(note: SongNote): boolean;
  pendingNotes(): SongNote[];
  start(nowMs: number): void;
  pause(nowMs: number): void;
  resume(nowMs: number): void;
  update(nowMs: number): void;
  noteOn(midi: number, nowMs: number): PressResult;
  /** Score, accuracy and the miss log so far; saved as an attempt when the song finishes. */
  summary(): ScoreSummary;
}
