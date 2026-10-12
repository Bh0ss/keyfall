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

export type Spell = 'sharp' | 'flat';

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (midi: number): boolean => BLACK_PCS.has(midi % 12);

/** The white key a black key is written on: the one below for a sharp, the one above for a flat. */
export function whiteOf(midi: number, spell: Spell = 'sharp'): number {
  if (!isBlackKey(midi)) return midi;
  return spell === 'sharp' ? midi - 1 : midi + 1;
}

const LETTER_UPPER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** "F♯4" or "G♭4". White keys have no sign. */
export function spellName(midi: number, spell: Spell = 'sharp'): string {
  const white = whiteOf(midi, spell);
  const letter = LETTER_UPPER[step(white) % 7]!;
  const sign = isBlackKey(midi) ? (spell === 'sharp' ? '♯' : '♭') : '';
  return `${letter}${sign}${Math.floor(white / 12) - 1}`;
}

/** Both names of a black key ("F♯4 / G♭4"); a white key just has its own. */
export function bothNames(midi: number): string {
  return isBlackKey(midi) ? `${spellName(midi, 'sharp')} / ${spellName(midi, 'flat')}` : spellName(midi);
}

/** The other spelling of the same key. */
export const otherSpell = (s: Spell): Spell => (s === 'sharp' ? 'flat' : 'sharp');

export interface VexPitch {
  key: string;
  /** Sign written before the note; undefined for a plain white key. */
  accidental?: '#' | 'b';
}

/** VexFlow key and accidental for any key, white or black. */
export function vexSpelled(midi: number, spell: Spell = 'sharp'): VexPitch {
  const key = vexKey(whiteOf(midi, spell));
  if (!isBlackKey(midi)) return { key };
  return { key, accidental: spell === 'sharp' ? '#' : 'b' };
}

/** How to find a black key from its white neighbour. */
export function blackKeyHint(midi: number, spell: Spell): string {
  const letter = LETTER_UPPER[step(whiteOf(midi, spell)) % 7]!;
  return spell === 'sharp'
    ? `${letter}♯ is the black key just right of ${letter} (a half step up).`
    : `${letter}♭ is the black key just left of ${letter} (a half step down).`;
}

export type Sign = '#' | 'b' | 'n';

export interface StaffNote {
  midi: number;
  spell?: Spell;
}

/**
 * Which accidental to print before each note of a bar (undefined: none). A sign is written when the note differs
 * from what the key signature, or an earlier sign in the same bar on the same line or space, already says.
 */
export function barAccidentals(notes: StaffNote[], signature?: { kind: 'sharp' | 'flat' | 'none'; letters: string[] }): (Sign | undefined)[] {
  const state = new Map<string, number>();
  const sigAlt = (letter: string) => (signature && signature.letters.includes(letter) ? (signature.kind === 'sharp' ? 1 : -1) : 0);
  return notes.map((n) => {
    const spell = n.spell ?? (signature?.kind === 'flat' ? 'flat' : 'sharp');
    const white = whiteOf(n.midi, spell);
    const letter = LETTERS[step(white) % 7]!;
    const slot = `${letter}${Math.floor(white / 12)}`;
    const alt = isBlackKey(n.midi) ? (spell === 'sharp' ? 1 : -1) : 0;
    const current = state.get(slot) ?? sigAlt(letter);
    state.set(slot, alt);
    if (alt === current) return undefined;
    return alt === 1 ? '#' : alt === -1 ? 'b' : 'n';
  });
}
