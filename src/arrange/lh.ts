import type { ArrangedNote, ChordQuality, ChordSegment, Grid, Version } from './types';

/**
 * The left-hand generator. Its input type is the whole of what it may know: chords, the bar length, the version and
 * a per-bar energy figure (how busy the recording was, 0 to 1). There is deliberately no field for transcribed
 * notes, so the left hand cannot be a copy of the recording: it is written fresh over the harmony.
 */
export interface LhInput {
  chords: ChordSegment[];
  grid: Pick<Grid, 'barBeats' | 'timeSignature'>;
  bars: number;
  version: Version;
  /** One figure per bar, 0 (sparse) to 1 (dense). Missing bars count as 0. */
  energy: number[];
}

type Degree = 'R' | '5' | '8' | '10';
export interface LhPattern {
  name: string;
  /** Repeats every `period` beats from the start of a chord's slice of a bar. */
  period: number;
  /** Beat offset within the period and the chord degree played; a note lasts until the next one. */
  events: [number, Degree][];
}

/**
 * Our own pattern library: three energy buckets (sparse, medium, dense), two variants each, one set for bars of four
 * beats and one for bars of three. Degrees: R root, 5 fifth, 8 octave, 10 the tenth (octave plus the chord's third).
 */
export const LH_PATTERNS: Record<'duple' | 'triple', LhPattern[][]> = {
  duple: [
    [
      { name: 'root-then-fifth', period: 4, events: [[0, 'R'], [2, '5']] },
      { name: 'root-then-octave', period: 4, events: [[0, 'R'], [2, '8']] },
    ],
    [
      { name: 'quarter-climb', period: 4, events: [[0, 'R'], [1, '5'], [2, '8'], [3, '5']] },
      { name: 'quarter-rock', period: 4, events: [[0, 'R'], [1, '8'], [2, '5'], [3, '8']] },
    ],
    [
      { name: 'tenth-roll', period: 2, events: [[0, 'R'], [0.5, '5'], [1, '10'], [1.5, '5']] },
      { name: 'octave-pulse', period: 2, events: [[0, 'R'], [0.5, '8'], [1, '5'], [1.5, '8']] },
    ],
  ],
  triple: [
    [
      { name: 'waltz-root-fifth', period: 3, events: [[0, 'R'], [2, '5']] },
      { name: 'waltz-root-octave', period: 3, events: [[0, 'R'], [1.5, '8']] },
    ],
    [
      { name: 'waltz-climb', period: 3, events: [[0, 'R'], [1, '5'], [2, '8']] },
      { name: 'waltz-rock', period: 3, events: [[0, 'R'], [1, '8'], [2, '5']] },
    ],
    [
      { name: 'waltz-tenth-roll', period: 3, events: [[0, 'R'], [0.5, '5'], [1, '8'], [1.5, '5'], [2, '10'], [2.5, '5']] },
      { name: 'waltz-octave-pulse', period: 3, events: [[0, 'R'], [0.5, '8'], [1, '5'], [1.5, '8'], [2, '5'], [2.5, '8']] },
    ],
  ],
};

/** Roots are placed in C2 to B2 (36-47). Then the fifth tops out at 54, the tenth at 64. */
const ROOT_BASE = 36;
/** Interval from the root to the chord's third (the "third" of a sus chord is its suspended note). */
const THIRD: Record<ChordQuality, number> = { maj: 4, min: 3, dim: 3, sus2: 2, sus4: 5 };
const FIFTH: Record<ChordQuality, number> = { maj: 7, min: 7, dim: 6, sus2: 7, sus4: 7 };

const pitchOf = (c: ChordSegment, d: Degree) => {
  const root = ROOT_BASE + c.root;
  return d === 'R' ? root : d === '5' ? root + FIFTH[c.quality] : d === '8' ? root + 12 : root + 12 + THIRD[c.quality];
};

/** A small fixed hash, so the variant changes bar to bar but is the same on every run. */
const variantOf = (bar: number, root: number, n: number) => (((bar * 31 + root * 17 + 7) ^ (bar >> 1)) >>> 0) % n;
const bucketOf = (energy: number) => (energy < 1 / 3 ? 0 : energy < 2 / 3 ? 1 : 2);
const EPS = 1e-9;

export function generateLeftHand(input: LhInput): ArrangedNote[] {
  const { barBeats, timeSignature } = input.grid;
  const family = timeSignature[0] === 3 ? LH_PATTERNS.triple : LH_PATTERNS.duple;
  const out: ArrangedNote[] = [];
  const note = (midi: number, startBeat: number, durationBeats: number): ArrangedNote => ({ midi, startBeat, durationBeats, hand: 'left' });

  for (let bar = 0; bar < input.bars; bar++) {
    const barStart = bar * barBeats;
    const barEnd = barStart + barBeats;
    for (const c of input.chords) {
      const a = Math.max(c.startBeat, barStart);
      const b = Math.min(c.endBeat, barEnd);
      if (b - a < EPS) continue;
      const len = b - a;
      if (input.version === 'beginner') {
        out.push(note(pitchOf(c, 'R'), a, len));
        if (len >= barBeats / 2 - EPS) out.push(note(pitchOf(c, '5'), a, len));
        continue;
      }
      const options = family[bucketOf(input.energy[bar] ?? 0)]!;
      const pattern = options[variantOf(bar, c.root, options.length)]!;
      const times: { t: number; d: Degree }[] = [];
      for (let base = 0; base < len - EPS; base += pattern.period) {
        for (const [off, d] of pattern.events) if (base + off < len - EPS) times.push({ t: base + off, d });
      }
      times.forEach((e, i) => out.push(note(pitchOf(c, e.d), a + e.t, (times[i + 1]?.t ?? len) - e.t)));
    }
  }
  return out;
}
