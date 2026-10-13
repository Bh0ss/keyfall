import { describe, expect, it } from 'vitest';
import { INTRO_ID, explainerFor, introSeen, type Diagram } from '../src/learn/explainers';
import { UNITS } from '../src/learn/units';
import { learnXp } from '../src/progress/levels';

const kinds = (id: string) => explainerFor(id).map((c) => c.diagram.kind);

describe('explainer cards', () => {
  it('every unit has one to three cards with a concept, a diagram and a tip', () => {
    expect(UNITS).toHaveLength(11);
    for (const u of UNITS) {
      const cards = explainerFor(u.id);
      expect(cards.length, u.id).toBeGreaterThanOrEqual(1);
      expect(cards.length, u.id).toBeLessThanOrEqual(3);
      for (const c of cards) {
        expect(c.title.trim().length, `${u.id} title`).toBeGreaterThan(3);
        expect(c.concept.trim().length, `${u.id} ${c.title} concept`).toBeGreaterThan(40);
        expect(c.concept.length, `${u.id} ${c.title} concept length`).toBeLessThanOrEqual(320);
        expect(c.tip.trim().length, `${u.id} ${c.title} tip`).toBeGreaterThan(15);
        expect(c.alt.trim().length, `${u.id} ${c.title} alt text`).toBeGreaterThan(15);
      }
    }
  });

  it('an unknown unit has no cards', () => {
    expect(explainerFor('unit-99')).toEqual([]);
  });

  it('covers posture, finger numbers and counting where they first matter', () => {
    expect(kinds('unit-2')).toEqual(expect.arrayContaining(['posture', 'hands']));
    expect(kinds('unit-4')).toContain('hands');
    expect(kinds('unit-6')).toContain('beats');
    expect(kinds('unit-9')).toContain('beats');
    expect(kinds('unit-1')).toContain('keyboard');
    expect(kinds('unit-3')).toContain('staff');
    expect(kinds('unit-5')).toContain('staff');
  });

  it('Unit 11 explains the landmarks and the hand shift', () => {
    const text = explainerFor('unit-11').map((c) => `${c.title} ${c.concept}`).join(' ').toLowerCase();
    for (const word of ['black key', 'shift']) expect(text).toContain(word);
  });

  it('keyboard diagrams stay on a real keyboard and mark keys inside their own range', () => {
    for (const u of UNITS) {
      for (const c of explainerFor(u.id)) {
        const d: Diagram = c.diagram;
        if (d.kind !== 'keyboard') continue;
        expect(d.range[0], u.id).toBeGreaterThanOrEqual(21);
        expect(d.range[1], u.id).toBeLessThanOrEqual(108);
        expect(d.range[0], u.id).toBeLessThan(d.range[1]);
        for (const m of [...(d.marks ?? []), ...Object.keys(d.fingers ?? {}).map(Number), ...(d.zones ?? []).flatMap((z) => [z.from, z.to])]) {
          expect(m, `${u.id} ${m}`).toBeGreaterThanOrEqual(d.range[0]);
          expect(m, `${u.id} ${m}`).toBeLessThanOrEqual(d.range[1]);
        }
      }
    }
  });

  it('beat diagrams add up to whole bars', () => {
    for (const u of UNITS) {
      for (const c of explainerFor(u.id)) {
        if (c.diagram.kind !== 'beats') continue;
        const total = c.diagram.bars.reduce((a, b) => a + b.span, 0);
        expect(total, u.id).toBe(c.diagram.counts.length);
      }
    }
  });
});

describe('intro seen flag', () => {
  it('is the intro id in the unit\'s finished-lessons list, which already syncs with the profile', () => {
    expect(introSeen(undefined)).toBe(false);
    expect(introSeen({ lessonsDone: ['keys'] })).toBe(false);
    expect(introSeen({ lessonsDone: ['keys', INTRO_ID] })).toBe(true);
  });

  it('is no lesson of any unit, and earns no XP', () => {
    for (const u of UNITS) expect(u.lessons.some((l) => l.id === INTRO_ID)).toBe(false);
    expect(learnXp([{ passed: false, lessonsDone: [INTRO_ID] }])).toBe(0);
    const one = learnXp([{ passed: false, lessonsDone: ['song'] }]);
    expect(one).toBeGreaterThan(0);
    expect(learnXp([{ passed: false, lessonsDone: ['song', INTRO_ID] }])).toBe(one);
  });
});
