export interface TapJudgement {
  hits: number;
  total: number;
  /** Taps that matched no beat. */
  extra: number;
}

/** Beat positions to millisecond timestamps at a tempo, from a start time. */
export function tapTimes(beats: number[], bpm: number, startMs: number): number[] {
  return beats.map((b) => Math.round(startMs + (b * 60000) / bpm));
}

/** Match each expected beat to the nearest unused tap inside the window. One tap satisfies one beat. */
export function judgeTaps(expected: number[], taps: number[], windowMs: number): TapJudgement {
  const used = new Set<number>();
  let hits = 0;
  for (const t of expected) {
    let best = -1;
    let bestDist = Infinity;
    taps.forEach((tap, i) => {
      const d = Math.abs(tap - t);
      if (!used.has(i) && d <= windowMs && d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best >= 0) {
      used.add(best);
      hits++;
    }
  }
  return { hits, total: expected.length, extra: taps.length - used.size };
}

/** Review-queue ids at or above this are rhythm symbols, not pitches (MIDI notes stop at 127). */
export const RHYTHM_ID_BASE = 200;

export interface RhythmSymbol {
  id: number;
  name: string;
  /** Length in quarter-note beats. */
  beats: number;
  rest: boolean;
  /** VexFlow duration letter without the rest or dot marks. */
  vex: 'w' | 'h' | 'q' | '8';
  dots: 0 | 1;
}

const sym = (n: number, name: string, beats: number, vex: RhythmSymbol['vex'], rest = false, dots: 0 | 1 = 0): RhythmSymbol => ({
  id: RHYTHM_ID_BASE + n, name, beats, rest, vex, dots,
});

export const RHYTHM_SYMBOLS: RhythmSymbol[] = [
  sym(1, 'Quarter note', 1, 'q'),
  sym(2, 'Half note', 2, 'h'),
  sym(3, 'Whole note', 4, 'w'),
  sym(4, 'Quarter rest', 1, 'q', true),
  sym(5, 'Half rest', 2, 'h', true),
  sym(6, 'Whole rest', 4, 'w', true),
  sym(7, 'Eighth note', 0.5, '8'),
  sym(8, 'Dotted quarter note', 1.5, 'q', false, 1),
  sym(9, 'Dotted half note', 3, 'h', false, 1),
  sym(10, 'Eighth rest', 0.5, '8', true),
];

export const Q = RHYTHM_ID_BASE + 1;
export const H = RHYTHM_ID_BASE + 2;
export const W = RHYTHM_ID_BASE + 3;
export const QR = RHYTHM_ID_BASE + 4;
export const HR = RHYTHM_ID_BASE + 5;
export const WR = RHYTHM_ID_BASE + 6;
export const E = RHYTHM_ID_BASE + 7;
export const DQ = RHYTHM_ID_BASE + 8;
export const DH = RHYTHM_ID_BASE + 9;
export const ER = RHYTHM_ID_BASE + 10;

export function symbolById(id: number): RhythmSymbol | undefined {
  return RHYTHM_SYMBOLS.find((s) => s.id === id);
}

/** VexFlow duration string for a symbol, e.g. "qr" for a quarter rest, "qd" for a dotted quarter. */
export function vexDuration(s: RhythmSymbol): string {
  return `${s.vex}${s.dots ? 'd' : ''}${s.rest ? 'r' : ''}`;
}

/** "1 beat", "1½ beats", "½ beat". */
export function beatsLabel(beats: number): string {
  const whole = Math.floor(beats);
  const frac = beats - whole === 0.5 ? '½' : '';
  const text = `${whole || ''}${frac}`;
  return `${text} ${beats > 1 ? 'beats' : 'beat'}`;
}

/** Symbols in order -> where each note starts (rests make silence, no onset) and the total length, in beats. */
export function layOut(steps: number[]): { onsets: number[]; length: number } {
  const onsets: number[] = [];
  let at = 0;
  for (const id of steps) {
    const s = symbolById(id);
    if (!s) throw new Error(`Unknown rhythm symbol ${id}`);
    if (!s.rest) onsets.push(at);
    at += s.beats;
  }
  return { onsets, length: at };
}

/** Tap window: 200 ms, tightened so two neighbouring taps never share a window. */
export function tapWindow(onsets: number[], bpm: number): number {
  let gap = Infinity;
  for (let i = 1; i < onsets.length; i++) gap = Math.min(gap, (onsets[i]! - onsets[i - 1]!) * (60000 / bpm));
  return Math.min(200, Math.floor(gap * 0.4));
}

/** A tap lesson counts as done at 75% of beats hit, with no more extra taps than a quarter of the beats. */
export function tapsPass(j: TapJudgement): boolean {
  return j.total > 0 && j.hits * 4 >= j.total * 3 && j.extra * 4 <= j.total;
}
