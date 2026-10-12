/** Latency calibration: how late (ms) a player's taps land after the clicks, per device. */

export const LATENCY_CLICKS = 8;
export const LATENCY_INTERVAL_MS = 750;
export const MIN_MATCHED_TAPS = 4;

export interface LatencyResult {
  /** Median of (tap time - click time); positive = the device or player is late. */
  offsetMs: number;
  matched: number;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/**
 * Match each tap to the nearest unused click within half an interval and take
 * the median offset. Returns null when too few taps matched to trust.
 */
export function medianOffset(clickTimes: number[], tapTimes: number[], intervalMs = LATENCY_INTERVAL_MS): LatencyResult | null {
  const used = new Set<number>();
  const offsets: number[] = [];
  for (const tap of tapTimes) {
    let best = -1;
    let bestAbs = Infinity;
    clickTimes.forEach((c, i) => {
      const abs = Math.abs(tap - c);
      if (!used.has(i) && abs < bestAbs) {
        best = i;
        bestAbs = abs;
      }
    });
    if (best >= 0 && bestAbs <= intervalMs / 2) {
      used.add(best);
      offsets.push(tap - clickTimes[best]!);
    }
  }
  if (offsets.length < MIN_MATCHED_TAPS) return null;
  return { offsetMs: Math.round(median(offsets) * 10) / 10, matched: offsets.length };
}

/** Phase 2 stored offsets in localStorage under this key; storage/migrate.ts moves them to Dexie. */
export const LEGACY_LATENCY_KEY = 'keyfall.latency.v1';

/** Parse the old localStorage store into { device: offsetMs }, ignoring anything malformed. */
export function readLegacyLatency(storage: Pick<Storage, 'getItem'> | undefined): Record<string, number> {
  try {
    const raw = storage?.getItem(LEGACY_LATENCY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
  } catch {
    return {};
  }
}

/** The key used for the current device; one shared key when no keyboard is connected. */
export function deviceKey(name: string | null): string {
  return name ?? 'default';
}
