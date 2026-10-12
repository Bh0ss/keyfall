/** Review-queue ids from this up are key signatures (index into KEY_SIGS). */
export const KEYSIG_ID_BASE = 300;

export type Accidental = 'sharp' | 'flat';

export interface KeySig {
  id: string;
  /** Review-queue id. */
  rid: number;
  name: string;
  /** VexFlow key-signature name. */
  vex: string;
  kind: Accidental | 'none';
  count: number;
  /** The white key (middle octave) the scale starts on, as written. */
  tonicWhite: number;
}

/** Major keys up to three sharps or flats: every altered note is a black key Unit 7 teaches. */
export const KEY_SIGS: KeySig[] = [
  { id: 'C', rid: KEYSIG_ID_BASE, name: 'C major', vex: 'C', kind: 'none', count: 0, tonicWhite: 60 },
  { id: 'G', rid: KEYSIG_ID_BASE + 1, name: 'G major', vex: 'G', kind: 'sharp', count: 1, tonicWhite: 67 },
  { id: 'D', rid: KEYSIG_ID_BASE + 2, name: 'D major', vex: 'D', kind: 'sharp', count: 2, tonicWhite: 62 },
  { id: 'A', rid: KEYSIG_ID_BASE + 3, name: 'A major', vex: 'A', kind: 'sharp', count: 3, tonicWhite: 69 },
  { id: 'F', rid: KEYSIG_ID_BASE + 4, name: 'F major', vex: 'F', kind: 'flat', count: 1, tonicWhite: 65 },
  { id: 'Bb', rid: KEYSIG_ID_BASE + 5, name: 'B♭ major', vex: 'Bb', kind: 'flat', count: 2, tonicWhite: 71 },
  { id: 'Eb', rid: KEYSIG_ID_BASE + 6, name: 'E♭ major', vex: 'Eb', kind: 'flat', count: 3, tonicWhite: 64 },
];

export const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b'] as const;
export const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f'] as const;

export function keySigById(id: string): KeySig | undefined {
  return KEY_SIGS.find((k) => k.id === id);
}

export function keySigByRid(rid: number): KeySig | undefined {
  return KEY_SIGS.find((k) => k.rid === rid);
}

/** The letters the signature alters, in signature order ("f", "c" for two sharps). */
export function alteredLetters(sig: KeySig): string[] {
  if (sig.kind === 'none') return [];
  return (sig.kind === 'sharp' ? SHARP_ORDER : FLAT_ORDER).slice(0, sig.count);
}

/** +1 for a sharped letter, -1 for a flatted one, 0 otherwise. */
export function alteration(sig: KeySig, letter: string): -1 | 0 | 1 {
  if (!alteredLetters(sig).includes(letter)) return 0;
  return sig.kind === 'sharp' ? 1 : -1;
}

const LETTER_OF_PC: Record<number, string> = { 0: 'c', 2: 'd', 4: 'e', 5: 'f', 7: 'g', 9: 'a', 11: 'b' };

/** The key that actually sounds for a white note written on the staff, once the signature is applied. */
export function applyKeySig(sig: KeySig, writtenWhite: number): number {
  const letter = LETTER_OF_PC[writtenWhite % 12];
  if (!letter) throw new Error(`Not a white key: ${writtenWhite}`);
  return writtenWhite + alteration(sig, letter);
}

const WHITE_STEPS = [2, 2, 1, 2, 2, 2, 1];
const WHITES_FROM_C = [0, 2, 4, 5, 7, 9, 11];

/** The eight written white keys of the scale, tonic first. */
export function writtenScale(sig: KeySig): number[] {
  const out: number[] = [sig.tonicWhite];
  let idx = WHITES_FROM_C.indexOf(sig.tonicWhite % 12);
  let m = sig.tonicWhite;
  for (let i = 0; i < 7; i++) {
    m += WHITE_STEPS[idx % 7]!;
    idx++;
    out.push(m);
  }
  return out;
}

/** The eight keys to press for the major scale in this signature. */
export function scaleKeys(sig: KeySig): number[] {
  return writtenScale(sig).map((m) => applyKeySig(sig, m));
}

/** The white keys a key-signature note prompt can show: C4 up to B4, so every altered note is a black key Unit 7 teaches. */
export const WRITTEN_RANGE = [60, 62, 64, 65, 67, 69, 71];

export function signatureText(sig: KeySig): string {
  if (sig.kind === 'none') return 'no sharps or flats';
  const word = sig.kind === 'sharp' ? 'sharp' : 'flat';
  return `${sig.count} ${word}${sig.count > 1 ? 's' : ''}`;
}
