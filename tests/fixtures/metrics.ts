/** Transcription accuracy: note-onset F1 (mir_eval "onset only" convention). */

export interface TimedNote {
  midi: number;
  startSec: number;
}

export interface F1 {
  ref: number;
  est: number;
  tp: number;
  precision: number;
  recall: number;
  f1: number;
}

/**
 * One-to-one greedy matching of reference notes to estimated notes. A match needs the same MIDI pitch and an onset
 * within `tolSec` (default 50 ms); the closest unused estimate wins. Offsets are ignored.
 * precision = tp / |est|, recall = tp / |ref|, f1 = their harmonic mean (0 when either is 0).
 */
export function onsetF1(ref: TimedNote[], est: TimedNote[], tolSec = 0.05): F1 {
  const used = new Set<number>();
  let tp = 0;
  for (const r of ref) {
    let best = -1;
    let bestDist = Infinity;
    est.forEach((e, i) => {
      if (used.has(i) || e.midi !== r.midi) return;
      const d = Math.abs(e.startSec - r.startSec);
      if (d <= tolSec && d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      tp++;
    }
  }
  const precision = est.length ? tp / est.length : 0;
  const recall = ref.length ? tp / ref.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { ref: ref.length, est: est.length, tp, precision, recall, f1 };
}
