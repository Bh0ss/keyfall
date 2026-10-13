import { describe, expect, it } from 'vitest';
import { autoFingers } from '../src/engine/fingering';
import { WaitSession } from '../src/engine/wait';
import { getSong } from '../src/songs/catalog';
import { drawFrame, type HighwayState } from '../src/ui/highwayDraw';
import { buildLayout, keyRangeFor } from '../src/ui/highwayLayout';

/** A canvas context that records every fillText with the font it was drawn in. */
function recorder() {
  const texts: { text: string; font: string }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'fillText') return (text: string) => void texts.push({ text, font: String(target.font) });
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

describe('auto fingers on the highway', () => {
  const song = getSong('minuet-in-g')!; // no fingers in the file
  const layout = buildLayout(keyRangeFor(song.notes.map((n) => n.midi)));
  const session = new WaitSession(song, { leadInBeats: 6 });
  const auto = autoFingers(song.notes);
  const base = { layout, session, pressed: new Map(), labels: true, now: 0, beat: 0 } satisfies HighwayState;

  it('draws nothing finger-like for a song with no fingers when the auto source is off', () => {
    const r = recorder();
    const out = drawFrame(r.ctx, 1280, 700, base);
    expect(out.autoFingers).toBe(0);
    expect(r.texts.filter((t) => /^\(?[1-5]\)?$/.test(t.text))).toEqual([]);
  });

  it('with the auto source, each finger is in parentheses and italic, so it differs from an authored one by shape and text, not colour', () => {
    const r = recorder();
    const out = drawFrame(r.ctx, 1280, 700, { ...base, autoFinger: (id) => auto.get(id) });
    expect(out.autoFingers).toBeGreaterThan(0);
    const fingers = r.texts.filter((t) => /^\([1-5]\)$/.test(t.text));
    expect(fingers.length).toBeGreaterThanOrEqual(out.autoFingers);
    expect(fingers.every((t) => t.font.includes('italic'))).toBe(true);
  });

  it('an authored finger stays a plain digit even when an auto source is supplied', () => {
    const mary = getSong('mary-had-a-little-lamb')!;
    const r = recorder();
    const out = drawFrame(r.ctx, 1280, 700, {
      ...base,
      layout: buildLayout(keyRangeFor(mary.notes.map((n) => n.midi))),
      session: new WaitSession(mary, { leadInBeats: 6 }),
      autoFinger: () => 2,
    });
    expect(out.autoFingers).toBe(0);
    expect(r.texts.some((t) => /^[1-5]$/.test(t.text) && !t.font.includes('italic'))).toBe(true);
    expect(r.texts.some((t) => t.text.startsWith('('))).toBe(false);
  });
});
