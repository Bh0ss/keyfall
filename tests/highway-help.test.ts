import { describe, expect, it } from 'vitest';
import { analysePositions, zonesAt } from '../src/engine/positions';
import { WaitSession } from '../src/engine/wait';
import { getSong } from '../src/songs/catalog';
import { drawFrame, type HighwayState } from '../src/ui/highwayDraw';
import { buildLayout, keyRangeFor } from '../src/ui/highwayLayout';

/** A canvas context that records the fill and stroke colours used, the dashes set and every fillText. */
function recorder() {
  const texts: string[] = [];
  const fills: string[] = [];
  const dashes: number[][] = [];
  const strokes: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'fillText') return (text: string) => void texts.push(text);
      if (prop === 'setLineDash') return (d: number[]) => void dashes.push(d);
      if (prop === 'fill' || prop === 'fillRect')
        return () => void fills.push(String(target.fillStyle));
      if (prop === 'stroke' || prop === 'strokeRect') return () => void strokes.push(String(target.strokeStyle));
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return typeof prop === 'string' && prop in target ? target[prop] : () => undefined;
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, fills, dashes, strokes };
}

describe('hand-position help on the highway', () => {
  // Frere Jacques: the right hand moves from C4 to D4 at bar 5, then drops from D4 to G3 at bar 7 (beat 24).
  const song = getSong('frere-jacques')!;
  const map = analysePositions(song.notes);
  const layout = buildLayout(keyRangeFor(song.notes.map((n) => n.midi)));
  const session = new WaitSession(song, { leadInBeats: 6 });
  const shift = map.shifts[1]!;
  const base = { layout, session, pressed: new Map(), labels: true, now: 0 } satisfies Omit<HighwayState, 'beat'>;

  it('the shift is where the hand-checked analysis says', () => {
    expect([shift.measure, shift.fromAnchor, shift.toAnchor, shift.label]).toEqual([7, 62, 55, 'ring → C']);
  });

  it('draws nothing extra without help', () => {
    const plain = recorder();
    drawFrame(plain.ctx, 1280, 700, { ...base, beat: 22 });
    expect(plain.dashes).toEqual([]);
    expect(plain.texts.some((t) => t.includes('RH'))).toBe(false);
  });

  it('shades the current zone solid and the next zone dashed, with tags and the cue label', () => {
    const r = recorder();
    const zones = zonesAt(map, 22, 4);
    drawFrame(r.ctx, 1280, 700, { ...base, beat: 22, help: { zones, cue: shift } });
    // Current zone: the solid tint of the right-hand colour, and the tag "RH".
    expect(r.fills).toContain('rgba(77, 168, 255, 0.34)');
    expect(r.texts).toContain('RH');
    // Next zone: lighter tint, dashed, tagged "RH next".
    expect(r.fills).toContain('rgba(77, 168, 255, 0.16)');
    expect(r.texts).toContain('RH next');
    expect(r.dashes.some((d) => d.length === 2 && d[0]! > 0)).toBe(true);
    // The marker names the move, with a direction arrow in the text.
    expect(r.texts).toContain('◀ ring → C');
  });

  it('with only the current zone (no shift near) there is no dashed zone and no "next" tag', () => {
    const r = recorder();
    drawFrame(r.ctx, 1280, 700, { ...base, beat: 2, help: { zones: zonesAt(map, 2, 4), cue: null } });
    expect(r.texts).toContain('RH');
    expect(r.texts).not.toContain('RH next');
    expect(r.fills).not.toContain('rgba(77, 168, 255, 0.16)');
  });

  it('position labels add the key under the thumb to the finger number', () => {
    const named = recorder();
    drawFrame(named.ctx, 1280, 700, { ...base, beat: 0, positionOf: (id) => map.anchorOf.get(id) });
    expect(named.texts).toContain('1 · C');
    const plain = recorder();
    drawFrame(plain.ctx, 1280, 700, { ...base, beat: 0 });
    expect(plain.texts).not.toContain('1 · C');
    expect(plain.texts).toContain('1');
  });
});
