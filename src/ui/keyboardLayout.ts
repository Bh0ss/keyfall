export const LOWEST_MIDI = 21;
export const HIGHEST_MIDI = 108;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export const isBlack = (midi: number) => BLACK_PCS.has(midi % 12);
export const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

export interface WhiteKey {
  midi: number;
  index: number;
}
export interface BlackKey {
  midi: number;
  /** Position in white-key widths from the left edge of the keyboard. */
  center: number;
}

export function buildKeyboard() {
  const whites: WhiteKey[] = [];
  const blacks: BlackKey[] = [];
  for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
    if (isBlack(midi)) blacks.push({ midi, center: whites.length });
    else whites.push({ midi, index: whites.length });
  }
  return { whites, blacks };
}
