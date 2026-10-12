const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const;
const STEP_OF_PC: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

export type Clef = 'treble' | 'bass';

/** Middle C and above read on the treble staff, below it on the bass staff. */
export const clefFor = (midi: number): Clef => (midi >= 60 ? 'treble' : 'bass');

/** Diatonic step count: C0 = 0, D0 = 1 ... Black keys have no step. */
function step(midi: number): number {
  const s = STEP_OF_PC[midi % 12];
  if (s === undefined) throw new Error(`No staff position for black key ${midi}`);
  return s + 7 * Math.floor(midi / 12);
}

/** VexFlow key string for a white key, e.g. 60 -> "c/4". */
export function vexKey(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${LETTERS[step(midi) % 7]}/${octave}`;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

/** Where a white-key note sits on its staff, in words ("2nd line", "3rd space", "below the staff"). */
export function staffPlace(midi: number, clef: Clef = clefFor(midi)): string {
  const bottom = clef === 'treble' ? step(64) : step(43);
  const rel = step(midi) - bottom;
  if (rel < 0) return rel === -1 ? 'just below the staff' : 'on a ledger line below the staff';
  if (rel > 8) return rel === 9 ? 'just above the staff' : 'on a ledger line above the staff';
  return rel % 2 === 0 ? `${ORDINAL[rel / 2]} line` : `${ORDINAL[(rel - 1) / 2]} space`;
}
