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

/** The open song, waiting briefly for a screen that is still loading its data from storage. */
export async function waitForCurrentPlay(timeoutMs = 1500, pollMs = 25): Promise<PlayHandle | null> {
  const until = Date.now() + timeoutMs;
  while (!current && Date.now() < until) await new Promise((r) => setTimeout(r, pollMs));
  return current;
}
