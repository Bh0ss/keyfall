/** Manual tempo helpers for the review step: tap tempo, half, double. Whole beats per minute, inside BPM_RANGE. */
export const BPM_RANGE: readonly [number, number] = [30, 240];

/** Taps further apart than this start a new count. */
const RESET_GAP_MS = 2500;
const MAX_TAPS = 8;

/** A number the player typed, rounded and kept in range; null when it is not a number. */
export function clampBpm(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.min(BPM_RANGE[1], Math.max(BPM_RANGE[0], Math.round(n)));
}

export const halveBpm = (bpm: number): number => clampBpm(bpm / 2)!;
export const doubleBpm = (bpm: number): number => clampBpm(bpm * 2)!;

/** Tempo from tap times in ms (any clock): the median gap of the latest run of taps. Null until there are two. */
export function tapBpm(times: readonly number[]): number | null {
  let start = times.length - 1;
  while (start > 0 && times[start]! - times[start - 1]! <= RESET_GAP_MS) start--;
  const run = times.slice(Math.max(start, times.length - MAX_TAPS));
  if (run.length < 2) return null;
  const gaps = run.slice(1).map((t, i) => t - run[i]!).sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return median > 0 ? clampBpm(60000 / median) : null;
}
