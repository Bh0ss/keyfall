import { HIGHEST_MIDI, LOWEST_MIDI, isBlack } from './keyboardLayout';

export interface KeyRange {
  lo: number;
  hi: number;
}

const MIN_WHITES = 14;

/**
 * Key range for a song: whole octaves C..B covering its notes, at least two
 * octaves wide, closed with the next C like a real keyboard strip.
 */
export function keyRangeFor(midis: number[]): KeyRange {
  if (midis.length === 0) return { lo: 48, hi: 72 };
  let lo = Math.floor(Math.min(...midis) / 12) * 12;
  let hi = Math.floor(Math.max(...midis) / 12) * 12 + 11;
  let below = true;
  while ((hi - lo + 1) / 12 * 7 < MIN_WHITES) {
    if (below && lo - 12 >= LOWEST_MIDI - 9) lo -= 12;
    else if (hi + 12 <= HIGHEST_MIDI) hi += 12;
    else lo -= 12;
    below = !below;
  }
  if (hi + 1 <= HIGHEST_MIDI) hi += 1; // closing C
  return { lo: Math.max(lo, LOWEST_MIDI), hi: Math.min(hi, HIGHEST_MIDI) };
}

export interface Lane {
  /** Left edge and width as fractions of the keyboard width. */
  x: number;
  w: number;
}

export const BLACK_WIDTH = 0.6; // in white-key widths

export function buildLayout(range: KeyRange) {
  const whites: number[] = [];
  const blacks: { midi: number; x: number; w: number }[] = [];
  for (let m = range.lo; m <= range.hi; m++) if (!isBlack(m)) whites.push(m);
  const n = whites.length;
  const whiteIndex = new Map(whites.map((m, i) => [m, i]));
  for (let m = range.lo; m <= range.hi; m++) {
    if (!isBlack(m)) continue;
    const left = whiteIndex.get(m - 1);
    if (left === undefined) continue;
    const center = left + 1;
    blacks.push({ midi: m, x: (center - BLACK_WIDTH / 2) / n, w: BLACK_WIDTH / n });
  }
  const blackByMidi = new Map(blacks.map((b) => [b.midi, b]));
  return {
    range,
    whites,
    blacks,
    has: (midi: number) => midi >= range.lo && midi <= range.hi,
    laneOf(midi: number): Lane {
      const b = blackByMidi.get(midi);
      if (b) return { x: b.x, w: b.w };
      const i = whiteIndex.get(midi) ?? 0;
      return { x: i / n, w: 1 / n };
    },
  };
}

export type Layout = ReturnType<typeof buildLayout>;
