import type { NoteEvent } from '../transcribe/types';
import type { Key, Mode } from './types';

/**
 * Krumhansl-Schmuckler key profiles (Krumhansl & Kessler 1982 probe-tone ratings, published literature values),
 * index 0 is the tonic.
 */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Bass notes name the key more reliably than a busy top line: they count 1.8 times (as in the chord histogram). */
const BASS_BELOW = 52;
const BASS_WEIGHT = 1.8;

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** Natural minor; the raised seventh (11) is added to the key's pitch classes for the dominant. */
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

export function keyOf(tonic: number, mode: Mode): Key {
  const scale = mode === 'major' ? MAJOR_SCALE : [...MINOR_SCALE, 11];
  return { tonic, mode, pcs: new Set(scale.map((d) => (tonic + d) % 12)) };
}

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** The key whose profile best correlates with the duration-and-loudness weighted pitch-class histogram. C major when there is nothing to hear. */
export function estimateKey(events: NoteEvent[]): Key {
  const hist = new Array<number>(12).fill(0);
  for (const e of events) hist[e.midi % 12]! += e.amplitude * Math.min(e.durationSec, 2) * (e.midi < BASS_BELOW ? BASS_WEIGHT : 1);
  if (hist.every((h) => h === 0)) return keyOf(0, 'major');
  let best: { tonic: number; mode: Mode; r: number } = { tonic: 0, mode: 'major', r: -Infinity };
  for (const mode of ['major', 'minor'] as const) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const profile = (mode === 'major' ? MAJOR : MINOR).map((_, i, p) => p[(i - tonic + 12) % 12]!);
      const r = correlation(hist, profile);
      if (r > best.r + 1e-12) best = { tonic, mode, r };
    }
  }
  return keyOf(best.tonic, best.mode);
}
