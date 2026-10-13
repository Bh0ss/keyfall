/**
 * Runs the Basic Pitch model over mono 22050 Hz samples and returns note events.
 *
 * The windowing below is a port of `BasicPitch.evaluateModel` from @spotify/basic-pitch (Apache-2.0, Copyright 2022
 * Spotify AB, https://github.com/spotify/basic-pitch-ts). It differs from the original in four ways: every window runs
 * inside tf.tidy and its outputs are disposed (the original leaks about 190 MB over a 3 minute file); only the frame
 * and onset outputs are computed (we do not use pitch bends); cancellation is checked between windows; and progress is
 * reported per window. Note extraction is the package's own `outputToNotesPoly`, imported by deep path so the TF.js
 * umbrella the package index drags in is never bundled.
 *
 * Pure over a GraphModel and the tfjs-core API: the worker and the Node test both call this. The caller picks the
 * backend. Chained tensor methods are not registered when only tfjs-core is imported, hence the functional forms.
 */
import * as tf from '@tensorflow/tfjs-core';
import type { GraphModel } from '@tensorflow/tfjs-converter';
import { noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch/esm/toMidi.js';
import { SAMPLE_RATE, type NoteEvent, type TranscribeProgress } from './types';
import { FRAMES_PER_SECOND, HOP_SAMPLES, OVERLAP_FRAMES, OVERLAP_SAMPLES, WINDOW_SAMPLES, windowCount } from './windows';

const HALF_OVERLAP = OVERLAP_FRAMES / 2;
/** Output tensor names in the converted graph model. */
const FRAMES = 'Identity_1';
const ONSETS = 'Identity_2';
/** The package's defaults for onset threshold, frame threshold and minimum note length (frames). */
const ONSET_THRESHOLD = 0.5;
const FRAME_THRESHOLD = 0.3;
const MIN_NOTE_FRAMES = 11;

export class CancelledError extends Error {
  constructor() {
    super('Transcription cancelled');
    this.name = 'CancelledError';
  }
}

export interface RunOptions {
  onProgress?: (p: TranscribeProgress) => void;
  /** Polled between windows; true throws CancelledError. */
  isCancelled?: () => boolean;
}

export interface RunResult {
  notes: NoteEvent[];
  inferMs: number;
  postMs: number;
}

export async function runBasicPitch(model: GraphModel, pcm: Float32Array, opts: RunOptions = {}): Promise<RunResult> {
  const outFrames = Math.floor(pcm.length * (FRAMES_PER_SECOND / SAMPLE_RATE));
  // Half an overlap of silence in front, so the first window's trimmed edge is not real audio.
  const padded = new Float32Array(OVERLAP_SAMPLES / 2 + pcm.length);
  padded.set(pcm, OVERLAP_SAMPLES / 2);
  const windows = windowCount(pcm.length);

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const t0 = performance.now();
  for (let w = 0; w < windows; w++) {
    if (opts.isCancelled?.()) throw new CancelledError();
    const input = new Float32Array(WINDOW_SAMPLES);
    input.set(padded.subarray(w * HOP_SAMPLES, w * HOP_SAMPLES + WINDOW_SAMPLES));
    const [f, o] = tf.tidy(() => {
      const outs = model.execute(tf.tensor3d(input, [1, WINDOW_SAMPLES, 1]), [FRAMES, ONSETS]) as tf.Tensor3D[];
      return outs.map((t) => tf.reshape(tf.slice(t, [0, HALF_OVERLAP, 0], [-1, t.shape[1] - 2 * HALF_OVERLAP, -1]), [-1, t.shape[2]])) as tf.Tensor2D[];
    });
    try {
      const [fa, oa] = (await Promise.all([f!.array(), o!.array()])) as [number[][], number[][]];
      for (let k = 0; k < fa.length && frames.length < outFrames; k++) {
        frames.push(fa[k]!);
        onsets.push(oa[k]!);
      }
    } finally {
      f!.dispose();
      o!.dispose();
    }
    opts.onProgress?.({ stage: 'listening', fraction: (w + 1) / windows });
  }
  const inferMs = performance.now() - t0;

  opts.onProgress?.({ stage: 'finishing', fraction: 0 });
  const t1 = performance.now();
  const timed = noteFramesToTime(outputToNotesPoly(frames, onsets, ONSET_THRESHOLD, FRAME_THRESHOLD, MIN_NOTE_FRAMES));
  const notes = timed
    .filter((n) => n.pitchMidi >= 21 && n.pitchMidi <= 108 && n.durationSeconds > 0)
    .map((n) => ({ midi: n.pitchMidi, startSec: n.startTimeSeconds, durationSec: n.durationSeconds, amplitude: n.amplitude }))
    .sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
  return { notes, inferMs, postMs: performance.now() - t1 };
}
