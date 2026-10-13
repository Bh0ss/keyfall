import type { PlayerLevel } from '../storage/types';
import { UNITS, getUnit, type Unit } from './units';

/** Songs behind these units (by stable id, not path position) are open for Advanced profiles: every gated song there is. */
const ADVANCED_OPEN_UNITS = new Set(['unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7', 'unit-8', 'unit-9']);

/** `unlockedBy` is a unit id, `'advanced'` (open on Advanced profiles only), or absent (open from the start). */
export function isSongUnlocked(song: { unlockedBy?: string }, passed: ReadonlySet<string>, level: PlayerLevel): boolean {
  const gate = song.unlockedBy;
  if (!gate) return true;
  if (gate === 'advanced') return level === 'advanced';
  if (passed.has(gate)) return true;
  return level === 'advanced' && ADVANCED_OPEN_UNITS.has(gate);
}

export type UnitStatus = 'passed' | 'open' | 'locked' | 'coming-soon';

/**
 * Units go in path order: a unit opens when the one before it is passed. A passed unit stays passed, and a
 * unit stays open when any later unit is passed, so reordering the path never re-locks existing progress.
 */
export function unitStatus(unit: Unit, passed: ReadonlySet<string>): UnitStatus {
  if (unit.comingSoon) return 'coming-soon';
  if (passed.has(unit.id)) return 'passed';
  const before = UNITS.find((u) => u.number === unit.number - 1);
  if (!before || passed.has(before.id)) return 'open';
  return UNITS.some((u) => u.number > unit.number && passed.has(u.id)) ? 'open' : 'locked';
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
