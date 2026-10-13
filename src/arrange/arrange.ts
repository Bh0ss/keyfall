import { ImportError } from '../import/limits';
import { barUnitsOf } from '../import/toMusicXml';
import type { NoteEvent } from '../transcribe/types';
import { detectChords } from './chords';
import { estimateGrid, gridFrom } from './grid';
import { estimateKey, keyOf } from './key';
import { generateLeftHand } from './lh';
import { extractMelody } from './melody';
import { simplifyMelody } from './rh';
import { beatOf, type Arrangement, type Mode, type TimeSignature, type Version } from './types';

export interface ArrangeOptions {
  version: Version;
  /** 4/4 unless the player says otherwise. Anything toMusicXml can write in whole sixteenths per bar. */
  timeSignature: TimeSignature;
  /** From the tap-tempo control; overrides the estimate. */
  bpm?: number;
  /** Seconds on the audio clock of the first bar line; overrides the phase estimate. */
  downbeatSec?: number;
  /** From the key control; overrides the estimate. `tonic` is a pitch class 0-11. */
  key?: { tonic: number; mode: Mode };
  /** Keep only notes that start in [from, to] seconds. */
  trimSec?: [number, number];
}

const NO_NOTES = 'No notes could be made out in that recording. A clearer recording, or one with a solo piano, works best.';

/** Notes per bar, scaled so that a busy bar (the 90th percentile of non-empty bars) is 1. */
function energyPerBar(events: NoteEvent[], bars: number, barBeats: number, beat: (sec: number) => number): number[] {
  const counts = new Array<number>(bars).fill(0);
  for (const e of events) {
    const bar = Math.floor(Math.max(0, beat(e.startSec)) / barBeats + 1e-9);
    if (bar < bars) counts[bar]!++;
  }
  const busy = counts.filter((c) => c > 0).sort((a, b) => a - b);
  const p90 = busy[Math.min(busy.length - 1, Math.floor(busy.length * 0.9))] ?? 1;
  return counts.map((c) => Math.min(1, c / p90));
}

/**
 * Transcribed notes in, an Arrangement out: a constant-tempo beat grid, the key, one chord per half bar, the
 * simplified melody in the right hand and our own generated left hand. Pure and deterministic.
 */
export function arrange(input: NoteEvent[], opts: ArrangeOptions): Arrangement {
  if (!barUnitsOf(opts.timeSignature)) throw new ImportError('Keyfall can only write bars that divide into whole sixteenth notes, such as 4/4, 3/4 or 6/8.');
  const [from, to] = opts.trimSec ?? [-Infinity, Infinity];
  const events = input
    .filter((e) => e.midi >= 21 && e.midi <= 108 && e.durationSec > 0 && e.startSec >= from && e.startSec <= to)
    .map((e) => ({ ...e, durationSec: Math.min(e.durationSec, to - e.startSec) }))
    .filter((e) => e.durationSec > 0);
  if (events.length === 0) throw new ImportError(NO_NOTES);

  const free = estimateGrid(events, opts.timeSignature);
  // Whole beats per minute: the score and the song record both carry an integer tempo, so the grid uses the same one.
  const bpm = Math.round(opts.bpm ?? free.bpm);
  const phased = estimateGrid(events, opts.timeSignature, { bpm, ...(opts.downbeatSec !== undefined ? { downbeatSec: opts.downbeatSec } : {}) });
  const grid = gridFrom(bpm, phased.downbeatSec, opts.timeSignature);
  const key = opts.key ? keyOf(opts.key.tonic, opts.key.mode) : estimateKey(events);

  const melody = extractMelody(events, grid, key);
  const lastBeat = melody.length
    ? Math.max(...melody.map((n) => n.startBeat + n.durationBeats))
    : Math.max(...events.map((e) => beatOf(grid, e.startSec + e.durationSec)));
  const bars = Math.max(1, Math.ceil(lastBeat / grid.barBeats - 1e-9));
  const chords = detectChords(events, grid, key, bars);
  const energy = energyPerBar(events, bars, grid.barBeats, (s) => beatOf(grid, s));

  const right = simplifyMelody(melody, chords, opts.version);
  const left = generateLeftHand({ chords, grid, bars, version: opts.version, energy });
  const notes = [...right, ...left]
    .map((n) => ({ ...n, startBeat: Math.round(n.startBeat * 1e6) / 1e6, durationBeats: Math.round(n.durationBeats * 1e6) / 1e6 }))
    .sort((a, b) => a.startBeat - b.startBeat || (a.hand === b.hand ? 0 : a.hand === 'right' ? -1 : 1) || a.midi - b.midi);
  if (notes.length === 0) throw new ImportError(NO_NOTES);

  return { bpm, timeSignature: opts.timeSignature, key, grid, chords, melody, notes, estimatedBpm: free.bpm, confidence: free.confidence, bars };
}
