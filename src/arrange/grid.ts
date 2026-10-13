import type { NoteEvent } from '../transcribe/types';
import type { Grid, TimeSignature } from './types';

/** Tempo search range and the tempo people tap most (generic music-perception figures, not tuned to any song). */
export const BPM_MIN = 60;
export const BPM_MAX = 180;
export const BPM_DEFAULT = 100;
/** Width of the log2 preference for tempos near BPM_DEFAULT, in octaves: 0.7 keeps 70 and 140 nearly level. */
const PRIOR_SIGMA = 0.7;
/** Support from the two-beat and whole-bar periods: a true tempo repeats at those too, so 144 does not beat 72. */
const SUBHARMONIC = 0.5;
/** Bass notes decide where bar lines fall; weight them up when voting for the downbeat. */
const BASS_BELOW = 52;
const BASS_WEIGHT = 1.5;
/** An onset belongs to a beat when it is within this fraction of a beat. */
const BEAT_TOLERANCE = 0.12;
/** The first onset's beat gets this fraction of the strongest vote added, so another beat needs 1.6x the evidence. */
const FIRST_BEAT_BONUS = 0.6;

export function gridFrom(bpm: number, downbeatSec: number, timeSignature: TimeSignature): Grid {
  return { bpm, downbeatSec, timeSignature, barBeats: (timeSignature[0] * 4) / timeSignature[1] };
}

export interface GridEstimate extends Grid {
  /** 0-1: how strongly the onsets line up with one beat period (1 is a perfect metronome). */
  confidence: number;
}

/** Onset weight: louder and longer notes say more about the beat. */
const weightOf = (e: NoteEvent) => e.amplitude * (0.2 + Math.min(e.durationSec, 2)) * (e.midi < BASS_BELOW ? BASS_WEIGHT : 1);

/** Magnitude and phase of the onsets against a beat period (a single Fourier bin: exact, no binning). */
function bin(events: NoteEvent[], periodSec: number, total: number) {
  let re = 0;
  let im = 0;
  for (const e of events) {
    const a = (2 * Math.PI * e.startSec) / periodSec;
    const w = weightOf(e);
    re += w * Math.cos(a);
    im -= w * Math.sin(a);
  }
  return { mag: Math.hypot(re, im) / total, phase: Math.atan2(im, re) };
}

/**
 * Estimate a constant tempo and the downbeat from note onsets. With `given.bpm` the tempo is kept and only the phase
 * is searched (the tap-tempo path); `given.downbeatSec` overrides the phase too.
 */
export function estimateGrid(events: NoteEvent[], timeSignature: TimeSignature, given: { bpm?: number; downbeatSec?: number } = {}): GridEstimate {
  const total = events.reduce((a, e) => a + weightOf(e), 0);
  const barBeats = (timeSignature[0] * 4) / timeSignature[1];
  if (events.length < 2 || total <= 0) {
    return { ...gridFrom(given.bpm ?? BPM_DEFAULT, given.downbeatSec ?? events[0]?.startSec ?? 0, timeSignature), confidence: 0 };
  }

  let bpm = given.bpm;
  if (bpm === undefined) {
    const score = (b: number) => {
      const prior = Math.exp(-0.5 * (Math.log2(b / BPM_DEFAULT) / PRIOR_SIGMA) ** 2);
      const beat = 60 / b;
      return (bin(events, beat, total).mag + SUBHARMONIC * (bin(events, 2 * beat, total).mag + bin(events, barBeats * beat, total).mag)) * prior;
    };
    let best = BPM_DEFAULT;
    let bestScore = -1;
    for (let b = BPM_MIN; b <= BPM_MAX; b += 0.5) {
      const s = score(b);
      if (s > bestScore) [best, bestScore] = [b, s];
    }
    // Refine to a tenth of a beat per minute around the coarse peak.
    for (let b = best - 0.5; b <= best + 0.5; b += 0.1) {
      const s = score(b);
      if (s > bestScore) [best, bestScore] = [b, s];
    }
    bpm = Math.round(best * 10) / 10;
  }
  const period = 60 / bpm;
  const { mag, phase } = bin(events, period, total);
  // Beat phase: onsets sit at phi + k * period.
  const phi = ((((-phase / (2 * Math.PI)) * period) % period) + period) % period;

  // Which of the beats in a bar is the downbeat: the one whose onsets are heaviest (long notes and bass notes win).
  const slots = Math.max(1, Math.ceil(barBeats));
  const votes = new Array<number>(slots).fill(0);
  for (const e of events) {
    const pos = (e.startSec - phi) / period;
    const k = Math.round(pos);
    if (Math.abs(pos - k) > BEAT_TOLERANCE) continue;
    votes[((k % slots) + slots) % slots]! += e.amplitude * Math.min(e.durationSec / period, 4) * (e.midi < BASS_BELOW ? BASS_WEIGHT : 1);
  }
  // Music most often starts on a downbeat: the first onset's beat gets a head start (a pickup is fixed by tapping).
  const firstPos = Math.round((Math.min(...events.map((e) => e.startSec)) - phi) / period);
  votes[((firstPos % slots) + slots) % slots]! += FIRST_BEAT_BONUS * Math.max(...votes);
  let j = 0;
  for (let i = 1; i < slots; i++) if (votes[i]! > votes[j]! + 1e-9) j = i;

  let downbeat = given.downbeatSec ?? phi + j * period;
  if (given.downbeatSec === undefined) {
    // Put the downbeat at the latest bar line that is not after the first note (a late start leaves whole empty bars out).
    const first = Math.min(...events.map((e) => e.startSec));
    const barSec = barBeats * period;
    downbeat += Math.floor((first - downbeat + BEAT_TOLERANCE * period) / barSec) * barSec;
  }
  return { ...gridFrom(bpm, downbeat, timeSignature), confidence: Math.max(0, Math.min(1, mag)) };
}
