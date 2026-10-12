import { describe, expect, it } from 'vitest';
import { labelVisible } from '../src/engine/fade';
import { WaitSession } from '../src/engine/wait';
import { getSong } from '../src/songs/catalog';
import { drawFrame, type HighwayState } from '../src/ui/highwayDraw';
import { buildLayout, keyRangeFor } from '../src/ui/highwayLayout';

/** A canvas context that records every fillText and ignores all other drawing. */
function recorder() {
  const texts: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'fillText') return (text: string) => void texts.push(text);
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return typeof prop === 'string' && prop in target ? target[prop] : () => undefined;
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

describe('note labels on the highway', () => {
  const mary = getSong('mary-had-a-little-lamb')!;
  const layout = buildLayout(keyRangeFor(mary.notes.map((n) => n.midi)));
  const session = new WaitSession(mary, { leadInBeats: 6 });
  const base: Omit<HighwayState, 'labels' | 'noteLabel'> = { layout, session, beat: 0, pressed: new Map(), now: 0 };

  function names(state: Pick<HighwayState, 'labels' | 'noteLabel'>): string[] {
    const { ctx, texts } = recorder();
    drawFrame(ctx, 1280, 700, { ...base, ...state });
    return texts;
  }

  it('Mary has E notes in view at the start', () => {
    expect(mary.notes.some((n) => n.midi === 64 && n.startBeat < 6)).toBe(true);
  });

  it('fade drops the labels of pitches with a 10-hit streak and keeps the others', () => {
    const streaks = new Map([[64, 10], [62, 9]]);
    const all = names({ labels: true });
    const faded = names({ labels: true, noteLabel: (m) => labelVisible('fade', streaks.get(m) ?? 0) });
    const count = (list: string[], t: string) => list.filter((x) => x === t).length;
    const eNotesInView = mary.notes.filter((n) => n.midi === 64 && n.startBeat < 6 + 0.5).length;
    expect(eNotesInView).toBeGreaterThan(0);
    expect(count(all, 'E') - count(faded, 'E')).toBe(eNotesInView);
    expect(count(faded, 'D')).toBe(count(all, 'D'));
    expect(count(faded, 'C')).toBe(count(all, 'C'));
  });

  it('off draws no note labels, on draws them', () => {
    const on = names({ labels: true });
    const off = names({ labels: false });
    expect(off.length).toBe(0);
    expect(on.length).toBeGreaterThan(off.length);
  });
});
