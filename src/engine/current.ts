import type { Song } from './song';
import type { PlaySession } from './session';

/** The song screen currently open, so debug tooling (autoplay) can drive it. */
export interface PlayHandle {
  song: Song;
  session: PlaySession;
  /** Start the song if it has not started yet. */
  ensureStarted(): void;
}

let current: PlayHandle | null = null;

export function setCurrentPlay(handle: PlayHandle | null): void {
  current = handle;
}

export function getCurrentPlay(): PlayHandle | null {
  return current;
}
