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

const KEY = 'keyfall.latency.v1';

type Store = Record<string, number>;

function read(storage: Pick<Storage, 'getItem'> | undefined): Store {
  try {
    const raw = storage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Calibrated latency for a device name (0 when never calibrated). */
export function getLatency(device: string, storage: Pick<Storage, 'getItem'> | undefined = defaultStorage()): number {
  const v = read(storage)[device];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function hasLatency(device: string, storage: Pick<Storage, 'getItem'> | undefined = defaultStorage()): boolean {
  return typeof read(storage)[device] === 'number';
}

export function saveLatency(device: string, offsetMs: number, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...read(storage), [device]: offsetMs }));
  } catch {
    // Storage blocked: the calibration just does not persist.
  }
}

export function clearLatency(device: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = defaultStorage()): void {
  const all = read(storage);
  delete all[device];
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** The key used for the current device; one shared key when no keyboard is connected. */
export function deviceKey(name: string | null): string {
  return name ?? 'default';
}
