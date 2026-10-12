import { describe, expect, it } from 'vitest';
import { buildKeyboard, noteName } from '../src/ui/keyboardLayout';

describe('88-key layout', () => {
  const kb = buildKeyboard();

  it('has 52 white and 36 black keys covering midi 21-108', () => {
    expect(kb.whites).toHaveLength(52);
    expect(kb.blacks).toHaveLength(36);
    const all = [...kb.whites, ...kb.blacks].map((k) => k.midi).sort((a, b) => a - b);
    expect(all[0]).toBe(21);
    expect(all[all.length - 1]).toBe(108);
    expect(new Set(all).size).toBe(88);
  });

  it('places middle C as the 24th white key', () => {
    expect(kb.whites.findIndex((k) => k.midi === 60)).toBe(23);
  });

  it('centres each black key on the boundary between its neighbouring whites', () => {
    const cSharp4 = kb.blacks.find((k) => k.midi === 61)!;
    expect(cSharp4.center).toBe(24);
  });

  it('names notes with octave', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(21)).toBe('A0');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(108)).toBe('C8');
  });
});
