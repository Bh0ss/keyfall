import type { NoteEvent } from '../transcribe/types';
import { MINOR_SCALE } from './key';
import { beatOf, type ChordQuality, type ChordSegment, type Grid, type Key } from './types';

/** Notes below E3 count extra: the bass says what the chord is. */
const BASS_BELOW = 52;
const BASS_WEIGHT = 1.8;
/** A tone outside the chord costs this much relative to a chord tone gaining 1 (the root gains 0.3 more). */
const OUTSIDE_PENALTY = 0.6;
const ROOT_BONUS = 0.3;
/** Prior against the less common chord types, in the same units. */
const SUS_PRIOR = -0.08;
const SECONDARY_PRIOR = -0.05;
/** Cost of changing chord between neighbouring units: a single passing tone cannot pay it, a new harmony can. */
const CHANGE_PENALTY = 0.25;

export const TONES: Record<ChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7] };

interface Template {
  root: number;
  quality: ChordQuality;
  tones: Set<number>;
  prior: number;
}

/** Pitch classes of a chord. */
export const chordPcs = (c: Pick<ChordSegment, 'root' | 'quality'>): number[] => TONES[c.quality].map((t) => (c.root + t) % 12);

const make = (root: number, quality: ChordQuality, prior = 0): Template => ({ root, quality, tones: new Set(TONES[quality].map((t) => (root + t) % 12)), prior });

/** The key's diatonic triads, sus2 and sus4 on each degree, the major V in minor, and V/vi in major. */
function templates(key: Key): Template[] {
  const scale = (key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : MINOR_SCALE).map((d) => (key.tonic + d) % 12);
  const out: Template[] = [];
  scale.forEach((root, i) => {
    const third = (scale[(i + 2) % 7]! - root + 12) % 12;
    const fifth = (scale[(i + 4) % 7]! - root + 12) % 12;
    const quality: ChordQuality = third === 4 && fifth === 7 ? 'maj' : third === 3 && fifth === 7 ? 'min' : 'dim';
    out.push(make(root, quality), make(root, 'sus2', SUS_PRIOR), make(root, 'sus4', SUS_PRIOR));
  });
  if (key.mode === 'minor') out.push(make((key.tonic + 7) % 12, 'maj'));
  else out.push(make((key.tonic + 4) % 12, 'maj', SECONDARY_PRIOR));
  const seen = new Set<string>();
  return out.filter((t) => !seen.has(`${t.root}:${t.quality}`) && !!seen.add(`${t.root}:${t.quality}`));
}

/**
 * One chord per half bar (per bar when the bar does not halve), from pitch-class histograms of every transcribed note
 * with the bass weighted up, scored against the key's chord templates, then smoothed with a Viterbi pass.
 * Silence scores zero for every chord, so it carries the neighbouring chord. Segments tile [0, bars * barBeats].
 */
export function detectChords(events: NoteEvent[], grid: Grid, key: Key, bars: number): ChordSegment[] {
  const unit = Number.isInteger(grid.barBeats / 2) ? grid.barBeats / 2 : grid.barBeats;
  const units = Math.max(1, Math.round((bars * grid.barBeats) / unit));
  const hist = Array.from({ length: units }, () => new Array<number>(12).fill(0));
  for (const e of events) {
    const s = beatOf(grid, e.startSec);
    const f = beatOf(grid, e.startSec + e.durationSec);
    const w = e.amplitude * (e.midi < BASS_BELOW ? BASS_WEIGHT : 1);
    for (let u = Math.max(0, Math.floor(s / unit)); u < units && u * unit < f; u++) {
      const overlap = Math.min(f, (u + 1) * unit) - Math.max(s, u * unit);
      if (overlap > 0) hist[u]![e.midi % 12]! += w * overlap;
    }
  }
  const T = templates(key);
  const fit = hist.map((h) => {
    const total = h.reduce((a, b) => a + b, 0);
    if (total === 0) return T.map(() => 0);
    return T.map((t) => {
      let g = 0;
      for (let pc = 0; pc < 12; pc++) g += t.tones.has(pc) ? h[pc]! * (1 + (pc === t.root ? ROOT_BONUS : 0)) : -OUTSIDE_PENALTY * h[pc]!;
      return g / total + t.prior;
    });
  });

  // Viterbi over units.
  const back: number[][] = [];
  let score = fit[0]!.slice();
  for (let u = 1; u < units; u++) {
    const prevBest = score.indexOf(Math.max(...score));
    const next: number[] = [];
    const from: number[] = [];
    for (let c = 0; c < T.length; c++) {
      const stay = score[c]!;
      const move = score[prevBest]! - CHANGE_PENALTY;
      const useStay = stay >= move;
      next.push((useStay ? stay : move) + fit[u]![c]!);
      from.push(useStay ? c : prevBest);
    }
    back.push(from);
    score = next;
  }
  const path = new Array<number>(units);
  path[units - 1] = score.indexOf(Math.max(...score));
  for (let u = units - 1; u > 0; u--) path[u - 1] = back[u - 1]![path[u]!]!;

  const out: ChordSegment[] = [];
  path.forEach((c, u) => {
    const t = T[c]!;
    const last = out.at(-1);
    if (last && last.root === t.root && last.quality === t.quality) last.endBeat = (u + 1) * unit;
    else out.push({ startBeat: u * unit, endBeat: (u + 1) * unit, root: t.root, quality: t.quality });
  });
  return out;
}
