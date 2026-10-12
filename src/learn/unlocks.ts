import type { PlayerLevel } from '../storage/types';
import { UNITS, getUnit, unitNumber, type Unit } from './units';

/** Songs behind these units are open for Advanced profiles. */
const ADVANCED_OPEN_UNITS = new Set([5, 6, 7, 8, 9]);

/** `unlockedBy` is a unit id, `'advanced'` (open on Advanced profiles only), or absent (open from the start). */
export function isSongUnlocked(song: { unlockedBy?: string }, passed: ReadonlySet<string>, level: PlayerLevel): boolean {
  const gate = song.unlockedBy;
  if (!gate) return true;
  if (gate === 'advanced') return level === 'advanced';
  if (passed.has(gate)) return true;
  return level === 'advanced' && ADVANCED_OPEN_UNITS.has(unitNumber(gate));
}

export type UnitStatus = 'passed' | 'open' | 'locked' | 'coming-soon';

/** Units go in order: a unit opens when the one before it is passed. */
export function unitStatus(unit: Unit, passed: ReadonlySet<string>): UnitStatus {
  if (unit.comingSoon) return 'coming-soon';
  if (passed.has(unit.id)) return 'passed';
  const before = UNITS.find((u) => u.number === unit.number - 1);
  return !before || passed.has(before.id) ? 'open' : 'locked';
}

/** The unit to continue with: the first playable unit not passed yet, or null when every unit is done. */
export function nextUnit(passed: ReadonlySet<string>): Unit | null {
  return UNITS.find((u) => !u.comingSoon && !passed.has(u.id)) ?? null;
}

/** "Pass Unit 2 · Middle C position to unlock", for a locked song. */
export function unlockHint(song: { unlockedBy?: string }): string {
  const gate = song.unlockedBy;
  if (gate === 'advanced') return 'Open on Advanced profiles';
  const unit = gate ? getUnit(gate) : undefined;
  if (!unit) return 'Locked';
  return unit.comingSoon ? `Unlocks with Unit ${unit.number} · ${unit.name} (coming soon)` : `Pass Unit ${unit.number} · ${unit.name} to unlock`;
}

export function unitLockText(unit: Unit): string {
  const before = UNITS.find((u) => u.number === unit.number - 1);
  return before ? `Pass Unit ${before.number} · ${before.name} first.` : 'Locked.';
}
