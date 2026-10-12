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
