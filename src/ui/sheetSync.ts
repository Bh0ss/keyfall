import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { Song } from '../engine/song';

export type SheetTone = 'idle' | 'hit' | 'miss';

/** Correct and miss colours from the design tokens. */
export const TONE_COLOR: Record<Exclude<SheetTone, 'idle'>, string> = { hit: '#6FE3A8', miss: '#FF6B5A' };

/** A song note and the drawn note that stands for it on the score. */
export interface NoteEntry {
  id: string;
  startBeat: number;
  /** The OSMD graphical note (its SVG group is coloured). */
  gn: unknown;
}

interface SvgNote {
  getSVGGElement?: () => SVGGElement | undefined;
}

/** Index of the last cursor stop at or before the beat (0 before the first stop). Stamps are ascending. */
export function cursorIndexAt(stamps: readonly number[], beat: number): number {
  let lo = 0;
  let hi = stamps.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (stamps[mid]! <= beat + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Colour (or reset) every glyph of one drawn note. */
export function applyTone(entry: NoteEntry, tone: SheetTone): void {
  const g = (entry.gn as SvgNote).getSVGGElement?.();
  if (!g) return;
  g.dataset.tone = tone === 'idle' ? '' : tone;
  for (const el of Array.from(g.querySelectorAll<SVGElement>('path, rect, text'))) {
    if (tone === 'idle') {
      el.style.removeProperty('fill');
      el.style.removeProperty('stroke');
    } else {
      el.style.fill = TONE_COLOR[tone];
      el.style.stroke = TONE_COLOR[tone];
    }
  }
}

const key = (startBeat: number, midi: number) => `${Math.round(startBeat * 1000)}:${midi}`;

/** Pair each song note with its drawn note by start time and pitch. Tie continuations have no partner. */
export function buildNoteMap(osmd: OpenSheetMusicDisplay, song: Song): NoteEntry[] {
  const byKey = new Map<string, string>();
  for (const n of song.notes) byKey.set(key(n.startBeat, n.midi), n.id);
  const startOf = new Map(song.notes.map((n) => [n.id, n.startBeat]));
  const out: NoteEntry[] = [];
  const seen = new Set<string>();
  for (const staves of osmd.GraphicSheet.MeasureList) {
    for (const gm of staves) {
      if (!gm) continue;
      for (const se of gm.staffEntries) {
        for (const gve of se.graphicalVoiceEntries) {
          for (const gn of gve.notes) {
            const src = gn.sourceNote;
            if (!src || src.isRest() || src.IsGraceNote) continue;
            const start = src.getAbsoluteTimestamp().RealValue * 4;
            const id = byKey.get(key(start, src.halfTone + 12));
            if (id && !seen.has(id)) {
              seen.add(id);
              out.push({ id, startBeat: startOf.get(id)!, gn });
            }
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.startBeat - b.startBeat);
}
