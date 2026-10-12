import { noteWeight, type ReviewEntry } from './review';
import { taughtThrough, type LessonDef, type Unit } from './units';

export type PromptKind = 'key-finder' | 'note-flash';

export interface Prompt {
  kind: PromptKind;
  midi: number;
}

/**
 * Next prompt for a lesson. The pool is the unit's notes plus any queued review notes taught in
 * earlier units (never an untaught note). Queued notes weigh more until answered right 3 times in a row.
 * The note just asked is skipped so the same key never comes up twice in a row.
 */
export function makePrompt(unit: Unit, lesson: LessonDef, queue: ReadonlyMap<number, ReviewEntry>, rng: () => number, prev?: number): Prompt {
  const own = new Set(unit.notes);
  const taught = new Set(taughtThrough(unit.number));
  const pool = new Map<number, number>();
  for (const midi of unit.notes) pool.set(midi, 1 + noteWeight(queue.get(midi)));
  for (const [midi, entry] of queue) {
    if (!own.has(midi) && taught.has(midi) && noteWeight(entry) > 0) pool.set(midi, noteWeight(entry));
  }
  if (pool.size > 1 && prev !== undefined) pool.delete(prev);
  const total = [...pool.values()].reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let midi = [...pool.keys()][0]!;
  for (const [m, w] of pool) {
    midi = m;
    roll -= w;
    if (roll < 0) break;
  }
  const kinds = lesson.kinds ?? [];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))] ?? 'key-finder';
  return { kind, midi };
}
