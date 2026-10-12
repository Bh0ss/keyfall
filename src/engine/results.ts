/** Aggregations behind the Results and Stats screens. Pure functions over saved attempts. */
import type { MissEntry } from './judge';

/** Placeholder XP until levels and badges arrive: 4 per note hit plus 25 per star. */
export function xpFor(hits: number, stars: number): number {
  return hits * 4 + stars * 25;
}

export interface MissedNote {
  midi: number;
  count: number;
}

/** Pitches the song asked for that went wrong most often (wrong keys included). */
export function mostMissedNotes(misses: ReadonlyArray<Pick<MissEntry, 'midi'>>, limit = 5): MissedNote[] {
  const counts = new Map<number, number>();
  for (const m of misses) counts.set(m.midi, (counts.get(m.midi) ?? 0) + 1);
  return [...counts]
    .map(([midi, count]) => ({ midi, count }))
    .sort((a, b) => b.count - a.count || a.midi - b.midi)
    .slice(0, limit);
}

/** Miss count per bar, 1-based, for bars 1..lastBar. */
export function measureMisses(misses: ReadonlyArray<Pick<MissEntry, 'measure'>>, lastBar: number): number[] {
  const out = Array.from({ length: lastBar }, () => 0);
  for (const m of misses) if (m.measure >= 1 && m.measure <= lastBar) out[m.measure - 1]!++;
  return out;
}

export interface BarRange {
  from: number;
  to: number;
}

/**
 * The bars to loop for "Practice my mistakes": the window of at most `maxSpan`
 * bars that holds the most misses (earliest on a tie), trimmed to its first and
 * last missed bar. null when nothing was missed.
 */
export function practiceRange(misses: ReadonlyArray<Pick<MissEntry, 'measure'>>, lastBar: number, maxSpan = 4): BarRange | null {
  const per = measureMisses(misses, lastBar);
  let best: BarRange | null = null;
  let bestSum = 0;
  for (let from = 1; from <= lastBar; from++) {
    const to = Math.min(lastBar, from + maxSpan - 1);
    let sum = 0;
    for (let b = from; b <= to; b++) sum += per[b - 1]!;
    if (sum > bestSum) {
      bestSum = sum;
      best = { from, to };
    }
  }
  if (!best) return null;
  let { from, to } = best;
  while (per[from - 1] === 0) from++;
  while (per[to - 1] === 0) to--;
  return { from, to };
}

/** Bars ranked worst first (only bars with misses). */
export function worstMeasures(misses: ReadonlyArray<Pick<MissEntry, 'measure'>>, lastBar: number, limit = 3): number[] {
  return measureMisses(misses, lastBar)
    .map((count, i) => ({ bar: i + 1, count }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || a.bar - b.bar)
    .slice(0, limit)
    .map((b) => b.bar);
}

/** Every press that landed in or near a note: hit offsets plus the early/late misses. */
export function pressOffsets(hitOffsets: number[], misses: ReadonlyArray<Pick<MissEntry, 'offsetMs'>>): number[] {
  return [...hitOffsets, ...misses.flatMap((m) => (m.offsetMs === null ? [] : [m.offsetMs]))];
}

/** Mean offset in ms (negative = early). null with no presses. */
export function averageOffset(offsets: number[]): number | null {
  if (!offsets.length) return null;
  return offsets.reduce((a, b) => a + b, 0) / offsets.length;
}

/** The coaching line under the timing bars. */
export function timingNote(avgMs: number | null, deadbandMs = 8): string {
  if (avgMs === null) return 'No timed notes to measure.';
  const ms = Math.round(Math.abs(avgMs));
  if (Math.abs(avgMs) < deadbandMs) return 'Your timing is right on the beat.';
  return avgMs < 0
    ? `You tend to play a little early: about ${ms} ms ahead of the beat.`
    : `You tend to play a little late: about ${ms} ms behind the beat.`;
}

export interface HistogramBin {
  /** Inclusive lower edge, ms. The first and last bins also take everything beyond them. */
  from: number;
  to: number;
  count: number;
}

/** Offsets bucketed into `binMs` bins across -range..+range, outliers clamped into the end bins. */
export function offsetHistogram(offsets: number[], binMs = 25, rangeMs = 150): HistogramBin[] {
  const n = Math.round((rangeMs * 2) / binMs);
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => ({ from: -rangeMs + i * binMs, to: -rangeMs + (i + 1) * binMs, count: 0 }));
  for (const o of offsets) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((o + rangeMs) / binMs)));
    bins[i]!.count++;
  }
  return bins;
}

/** High-score board for one song: best score per profile and mode, highest first. */
export function rankBoard<T extends { profileId: string; score: number; mode: string; speedPct: number; stars: number; achievedAt: number }>(
  scores: T[],
  limit = 10,
): Array<T & { rank: number }> {
  return [...scores]
    .sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt)
    .slice(0, limit)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** Accuracy of the most recent `n` attempts, oldest first. */
export function accuracyTrend(attempts: ReadonlyArray<{ finishedAt: number; accuracy: number }>, n = 20): number[] {
  return [...attempts]
    .sort((a, b) => a.finishedAt - b.finishedAt)
    .slice(-n)
    .map((a) => a.accuracy);
}

function joinBars(bars: number[]): string {
  const sorted = [...bars].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted.join('');
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/** "Bars 12, 15 and 16 hold 4 of your 5 misses. Two were the wrong key." */
export function missSummary(misses: ReadonlyArray<Pick<MissEntry, 'measure' | 'kind'>>, lastBar: number): string {
  if (!misses.length) return 'A clean run. Nothing to fix.';
  const worst = worstMeasures(misses, lastBar, 3);
  const per = measureMisses(misses, lastBar);
  const inWorst = worst.reduce((n, b) => n + per[b - 1]!, 0);
  const where = `${worst.length === 1 ? 'Bar' : 'Bars'} ${joinBars(worst)} ${worst.length === 1 ? 'holds' : 'hold'} ${inWorst} of your ${misses.length} ${misses.length === 1 ? 'miss' : 'misses'}.`;
  const wrong = misses.filter((m) => m.kind === 'wrong-key').length;
  return wrong ? `${where} ${wrong} ${wrong === 1 ? 'was' : 'were'} the wrong key.` : where;
}

/**
 * The song to suggest on Home: the one just played if it still has stars to win,
 * else the first song short of 3 stars, else the one just played (or the first).
 */
export function upNext(songIds: string[], bestStars: ReadonlyMap<string, number>, lastSongId?: string): string | undefined {
  if (lastSongId && songIds.includes(lastSongId) && (bestStars.get(lastSongId) ?? 0) < 3) return lastSongId;
  return songIds.find((id) => (bestStars.get(id) ?? 0) < 3) ?? (lastSongId && songIds.includes(lastSongId) ? lastSongId : songIds[0]);
}

export const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
export const points = (n: number): string => n.toLocaleString('en-US');
