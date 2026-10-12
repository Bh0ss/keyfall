import type { NoteEvent } from './parse';

/** midi note number -> velocity it was struck with */
export type PressedKeys = ReadonlyMap<number, number>;

export const emptyPressed: PressedKeys = new Map();

export function applyNoteEvent(state: PressedKeys, event: NoteEvent): PressedKeys {
  if (event.type === 'noteOn') {
    const next = new Map(state);
    next.set(event.midi, event.velocity);
    return next;
  }
  if (!state.has(event.midi)) return state;
  const next = new Map(state);
  next.delete(event.midi);
  return next;
}
