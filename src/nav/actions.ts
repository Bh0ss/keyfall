import type { SessionStatus } from '../engine/session';
import { hrefFor, type Route } from '../ui/useRoute';
import { commandForNote, type NavCommand } from './commands';

/** What the five keys mean on the screen that is open. */
export type NavScope =
  /** Menus: move a selection through the screen and press it. */
  | { kind: 'menu' }
  /** The keyboard check: every key must light up as a plain key, so the commands only act when a key is held for a moment. */
  | { kind: 'keycheck' }
  /** A screen that listens for any key itself (the latency check): commands are ignored and not hidden from it. */
  | { kind: 'suspended' }
  /** The song screen. `blocked` is true when the song uses command notes. While the song runs, C1 only pauses and resumes. */
  | { kind: 'play'; blocked: boolean; status: SessionStatus }
  /** The results screen: C1 retry, D1 practise my mistakes, A0 back to Songs, B0 the next (i) help button. */
  | { kind: 'results'; retryHref: string; practiseHref?: string };

/** How long a command key is held on the keyboard check before it counts as a command. */
export const HOLD_MS = 700;

export type NavAction = { type: 'focus'; dir: 'next' | 'prev'; only?: string } | { type: 'activate' } | { type: 'go'; hash: string } | { type: 'toggle-pause' } | { type: 'none' };

const NONE: NavAction = { type: 'none' };

/** Where "back" goes from a screen; null on Home. */
export function parentHash(route: Route): string | null {
  switch (route.name) {
    case 'home':
      return null;
    case 'play':
    case 'results':
    case 'import':
      return hrefFor.songs();
    case 'learn':
      return route.lessonId && route.unitId ? hrefFor.learn(route.unitId) : route.unitId ? hrefFor.learn() : hrefFor.home();
    default:
      return hrefFor.home();
  }
}

export function resolveCommand(command: NavCommand, scope: NavScope, route: Route): NavAction {
  switch (scope.kind) {
    case 'suspended':
    case 'keycheck':
      return NONE;
    case 'results':
      if (command === 'back') return { type: 'go', hash: hrefFor.songs() };
      if (command === 'select') return { type: 'go', hash: scope.retryHref };
      if (command === 'next') return scope.practiseHref ? { type: 'go', hash: scope.practiseHref } : NONE;
      if (command === 'home') return { type: 'go', hash: hrefFor.home() };
      // The other three keys are taken, so B0 steps through the (i) help buttons: focus shows a button's bubble.
      return command === 'prev' ? { type: 'focus', dir: 'next', only: '.help-btn' } : NONE;
    case 'play':
      if (scope.blocked) return NONE;
      if (scope.status === 'playing' || scope.status === 'waiting' || scope.status === 'paused') {
        return command === 'select' ? { type: 'toggle-pause' } : NONE;
      }
      return menuAction(command, route);
    default:
      return menuAction(command, route);
  }
}

function menuAction(command: NavCommand, route: Route): NavAction {
  switch (command) {
    case 'prev':
      return { type: 'focus', dir: 'prev' };
    case 'next':
      return { type: 'focus', dir: 'next' };
    case 'select':
      return { type: 'activate' };
    case 'back': {
      const hash = parentHash(route);
      return hash ? { type: 'go', hash } : NONE;
    }
    case 'home':
      return route.name === 'home' ? NONE : { type: 'go', hash: hrefFor.home() };
  }
}

/**
 * True when a key press belongs to the navigation and the game (a song, a lesson) must not count it:
 * the commands are on, this screen is not one that wants every key, and the song does not use the note.
 */
export function swallowsNote(enabled: boolean, scope: NavScope, midi: number): boolean {
  if (!enabled || commandForNote(midi) === null) return false;
  if (scope.kind === 'suspended' || scope.kind === 'keycheck') return false;
  if (scope.kind === 'play' && scope.blocked) return false;
  return true;
}
