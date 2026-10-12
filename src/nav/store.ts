import { useEffect } from 'react';
import { swallowsNote, type NavScope } from './actions';

/** Which screen is open (what the five keys mean) and whether the commands are switched on. Module state, like the MIDI engine. */
let enabled = true;
let scope: NavScope = { kind: 'menu' };

export function navEnabled(): boolean {
  return enabled;
}

export function setNavEnabled(on: boolean): void {
  enabled = on;
}

export function getNavScope(): NavScope {
  return scope;
}

export function setNavScope(next: NavScope): void {
  scope = next;
}

/** Game code calls this before it counts a key: true means the key was a navigation command. */
export function isNavSwallowed(midi: number): boolean {
  return swallowsNote(enabled, scope, midi);
}

/** A screen declares what the keys mean while it is open; menu again when it closes. */
export function useNavScope(next: NavScope): void {
  const key = JSON.stringify(next);
  useEffect(() => {
    setNavScope(next);
    return () => setNavScope({ kind: 'menu' });
    // `key` stands for the whole scope value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

let pauseHandler: (() => void) | null = null;

/** The song screen registers how to pause and resume; C1 calls it while a song runs. */
export function usePauseHandler(fn: () => void): void {
  useEffect(() => {
    pauseHandler = fn;
    return () => {
      if (pauseHandler === fn) pauseHandler = null;
    };
  }, [fn]);
}

export function togglePause(): void {
  pauseHandler?.();
}
