/** Daily practice streaks on the local calendar. Day numbers come from the local y/m/d, so DST never skews them. */

const DAY_MS = 86400000;

function dayNumber(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Local calendar day as 'YYYY-MM-DD'. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyOfDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export interface StreakInfo {
  current: number;
  longest: number;
  activeToday: boolean;
  /** A streak is running but today has no activity yet. */
  atRisk: boolean;
  lastDay: string | null;
}

export function streakFor(activityMs: readonly number[], nowMs: number): StreakInfo {
  const today = dayNumber(nowMs);
  const days = [...new Set(activityMs.filter(Number.isFinite).map(dayNumber))].filter((d) => d <= today).sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0, activeToday: false, atRisk: false, lastDay: null };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i]! - days[i - 1]! === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = days[days.length - 1]!;
  const activeToday = last === today;
  const alive = activeToday || last === today - 1;
  return {
    current: alive ? run : 0,
    longest,
    activeToday,
    atRisk: !activeToday && alive,
    lastDay: keyOfDayNumber(last),
  };
}