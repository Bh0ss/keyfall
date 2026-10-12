import { runAutoplay, type AccuracyProfile, type AutoplayResult } from './autoplay';
import type { MidiEngine } from './engine';

/** A W S E D F T G Y H U J K = C4 to C5 */
export const KEY_TO_MIDI: Readonly<Record<string, number>> = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
};

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function midiForKeyEvent(e: KeyLike): number | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return KEY_TO_MIDI[e.key.toLowerCase()] ?? null;
}

export interface KeyfallDebug {
  press(midi: number, velocity?: number): void;
  release(midi: number): void;
  /** Play the open song with the given timing offsets and mistakes. Resolves when done. */
  autoplay(profile?: AccuracyProfile): Promise<AutoplayResult>;
}

declare global {
  interface Window {
    __keyfall?: KeyfallDebug;
  }
}

/** Debug surface is on in dev builds and with ?debug=1; hidden otherwise. */
export function virtualInputEnabled(dev: boolean, search: string): boolean {
  return dev || new URLSearchParams(search).get('debug') === '1';
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Install window.__keyfall and the computer-keyboard piano. Returns a cleanup function. */
export function installVirtualInput(engine: MidiEngine, win: Window = window): () => void {
  win.__keyfall = {
    press: (midi, velocity = 80) => engine.press(midi, velocity),
    release: (midi) => engine.release(midi),
    autoplay: (profile) => runAutoplay(engine, profile),
  };
  const held = new Set<number>();
  const onDown = (e: KeyboardEvent) => {
    const midi = midiForKeyEvent(e);
    if (midi === null || e.repeat || isTyping(e.target)) return;
    held.add(midi);
    engine.press(midi);
  };
  const onUp = (e: KeyboardEvent) => {
    const midi = midiForKeyEvent(e);
    if (midi === null || !held.delete(midi)) return;
    engine.release(midi);
  };
  const onBlur = () => {
    held.forEach((m) => engine.release(m));
    held.clear();
  };
  win.addEventListener('keydown', onDown);
  win.addEventListener('keyup', onUp);
  win.addEventListener('blur', onBlur);
  return () => {
    win.removeEventListener('keydown', onDown);
    win.removeEventListener('keyup', onUp);
    win.removeEventListener('blur', onBlur);
    delete win.__keyfall;
  };
}
