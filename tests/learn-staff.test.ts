import { describe, expect, it } from 'vitest';
import { clefFor, staffPlace, vexKey } from '../src/learn/staff';

describe('staff positions', () => {
  it('names VexFlow keys', () => {
    expect(vexKey(60)).toBe('c/4');
    expect(vexKey(67)).toBe('g/4');
    expect(vexKey(43)).toBe('g/2');
    expect(vexKey(77)).toBe('f/5');
  });
  it('picks the clef: middle C and up is treble', () => {
    expect(clefFor(60)).toBe('treble');
    expect(clefFor(59)).toBe('bass');
    expect(clefFor(48)).toBe('bass');
  });
  it('places treble notes by the EGBDF / FACE rule', () => {
    expect(staffPlace(64)).toBe('1st line');
    expect(staffPlace(65)).toBe('1st space');
    expect(staffPlace(67)).toBe('2nd line');
    expect(staffPlace(69)).toBe('2nd space');
    expect(staffPlace(77)).toBe('5th line');
    expect(staffPlace(76)).toBe('4th space');
    expect(staffPlace(62)).toBe('just below the staff');
    expect(staffPlace(60)).toBe('on a ledger line below the staff');
  });
  it('places bass notes by the GBDFA / ACEG rule', () => {
    expect(staffPlace(43)).toBe('1st line');
    expect(staffPlace(45)).toBe('1st space');
    expect(staffPlace(48)).toBe('2nd space');
    expect(staffPlace(57)).toBe('5th line');
    expect(staffPlace(55)).toBe('4th space');
  });
  it('refuses black keys', () => {
    expect(() => vexKey(61)).toThrow();
  });
});
