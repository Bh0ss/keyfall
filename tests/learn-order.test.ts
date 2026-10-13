import { describe, expect, it } from 'vitest';
import { UNITS, getUnit } from '../src/learn/units';
import { isSongUnlocked, nextUnit, unitLockText, unitStatus, unlockHint } from '../src/learn/unlocks';
import { getSongs } from '../src/songs/catalog';

const ORDER = ['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7', 'unit-8', 'unit-11', 'unit-9', 'unit-10'];
const upTo = (id: string) => new Set(ORDER.slice(0, ORDER.indexOf(id) + 1));

describe('unit order (Moving around the keyboard sits after Both hands)', () => {
  it('lists the units in the new order with position-based display numbers', () => {
    expect(UNITS.map((u) => u.id)).toEqual(ORDER);
    expect(UNITS.map((u) => u.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(getUnit('unit-11')!.name).toBe('Moving around the keyboard');
    expect(getUnit('unit-11')!.number).toBe(9);
    expect(getUnit('unit-9')!.number).toBe(10);
    expect(getUnit('unit-10')!.number).toBe(11);
  });

  it('the moved unit needs Both hands; eighth notes need the moved unit', () => {
    const through8 = upTo('unit-8');
    expect(unitStatus(getUnit('unit-11')!, new Set(ORDER.slice(0, 7)))).toBe('locked');
    expect(unitStatus(getUnit('unit-11')!, through8)).toBe('open');
    expect(unitStatus(getUnit('unit-9')!, through8)).toBe('locked');
    expect(unitStatus(getUnit('unit-9')!, upTo('unit-11'))).toBe('open');
    expect(unitStatus(getUnit('unit-10')!, upTo('unit-11'))).toBe('locked');
    expect(unitStatus(getUnit('unit-10')!, upTo('unit-9'))).toBe('open');
  });

  it('lock text names the new prerequisite', () => {
    expect(unitLockText(getUnit('unit-9')!)).toBe('Pass Unit 9 · Moving around the keyboard first.');
  });

  it('nextUnit follows the new order, and is null after all eleven', () => {
    expect(nextUnit(upTo('unit-8'))!.id).toBe('unit-11');
    expect(nextUnit(upTo('unit-11'))!.id).toBe('unit-9');
    expect(nextUnit(upTo('unit-9'))!.id).toBe('unit-10');
    expect(nextUnit(new Set(ORDER))).toBeNull();
  });

  it('a profile that passed old Unit 9 or 10 is not re-locked', () => {
    const legacy9 = new Set([...ORDER.slice(0, 8), 'unit-9']);
    expect(unitStatus(getUnit('unit-9')!, legacy9)).toBe('passed');
    expect(unitStatus(getUnit('unit-10')!, legacy9)).toBe('open');
    expect(unitStatus(getUnit('unit-11')!, legacy9)).toBe('open');
    const legacy10 = new Set([...legacy9, 'unit-10']);
    expect(unitStatus(getUnit('unit-9')!, legacy10)).toBe('passed');
    expect(unitStatus(getUnit('unit-10')!, legacy10)).toBe('passed');
    expect(nextUnit(legacy10)!.id).toBe('unit-11');
  });

  it('a unit whose own prerequisite is unpassed stays open when a later unit was passed', () => {
    const skipped = new Set([...ORDER.slice(0, 8), 'unit-10']);
    expect(unitStatus(getUnit('unit-9')!, skipped)).toBe('open');
  });

  it('song unlocks keep their unit ids', () => {
    const gate = (id: string) => getSongs().find((s) => s.id === id)!.unlockedBy;
    expect(gate('fur-elise-opening')).toBe('unit-8');
    expect(gate('canon-in-d')).toBe('unit-9');
    expect(getSongs().filter((s) => s.unlockedBy === 'unit-11')).toEqual([]);
    expect(isSongUnlocked({ unlockedBy: 'unit-9' }, upTo('unit-9'), 'beginner')).toBe(true);
    expect(unlockHint({ unlockedBy: 'unit-9' })).toBe('Pass Unit 10 · Eighth notes and dotted rhythms to unlock');
    expect(unlockHint({ unlockedBy: 'unit-8' })).toBe('Pass Unit 8 · Both hands to unlock');
  });

  it('Advanced override still covers the same unit ids (5 to 9) and not the moved unit', () => {
    const none = new Set<string>();
    for (const id of ['unit-5', 'unit-6', 'unit-7', 'unit-8', 'unit-9']) expect(isSongUnlocked({ unlockedBy: id }, none, 'advanced')).toBe(true);
    for (const id of ['unit-10', 'unit-11']) expect(isSongUnlocked({ unlockedBy: id }, none, 'advanced')).toBe(false);
    expect(isSongUnlocked({ unlockedBy: 'unit-9' }, none, 'beginner')).toBe(false);
  });
});
