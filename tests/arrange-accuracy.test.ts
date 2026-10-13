/**
 * Melody-extraction accuracy through the real Basic Pitch model (Node, CPU, same runner.ts as the worker), on bundled
 * public-domain songs synthesized at test time. Metric (scope (f)): note-onset F1, one-to-one greedy matching, same MIDI
 * pitch, onset within a tolerance; raw transcription uses 50 ms, melody extraction uses one 8th at the song's tempo
 * after grid snapping. The reference for the melody is the song's right hand. The floors are guards against
 * regression: synthetic audio is easy, and real recordings will score lower (see HUMAN_CHECKS).
 */
import { readFileSync } from 'node:fs';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arrange } from '../src/arrange/arrange';
import { secOf, type TimeSignature } from '../src/arrange/types';
import { runBasicPitch } from '../src/transcribe/runner';
import type { NoteEvent } from '../src/transcribe/types';
import { bundledSong, referenceNotes, synthesize } from './fixtures/audio';
import { onsetF1 } from './fixtures/metrics';

const dir = new URL('../node_modules/@spotify/basic-pitch/model/', import.meta.url);
let model: GraphModel;

beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
  const json = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  const bin = readFileSync(new URL('group1-shard1of1.bin', dir));
  model = await loadGraphModel({
    load: async () => ({
      modelTopology: json.modelTopology,
      weightSpecs: json.weightsManifest[0].weights,
      weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
      format: json.format,
      generatedBy: json.generatedBy,
      convertedBy: json.convertedBy,
    }),
  });
}, 60_000);

afterAll(() => model?.dispose());

const SECONDS = 10;
// Floors = measured melody F1 minus 0.05, rounded down to 0.01 (measured: ode 1.000 / 0.667, saints 0.870 / 0.769,
// fur elise 0.970 / 0.644, clean / mix). Recorded in PROGRESS.md with the command.
const FIXTURES: { stem: string; ts: TimeSignature; floors: { clean: number; mix: number } }[] = [
  { stem: 'ode-to-joy', ts: [4, 4], floors: { clean: 0.95, mix: 0.61 } },
  { stem: 'when-the-saints', ts: [4, 4], floors: { clean: 0.82, mix: 0.71 } },
  { stem: 'fur-elise', ts: [3, 4], floors: { clean: 0.92, mix: 0.59 } },
];

describe('melody extraction through the real model', () => {
  for (const { stem, ts, floors } of FIXTURES) {
    for (const mix of [false, true]) {
      it(`${stem}, ${mix ? 'crude full-mix stand-in' : 'clean'}: melody F1 stays above its floor`, async () => {
        const song = bundledSong(stem);
        const run = await runBasicPitch(model, synthesize(song, { seconds: SECONDS, mix }), {});
        const events: NoteEvent[] = run.notes;
        const all = referenceNotes(song, SECONDS);
        const rh = all.filter((n) => n.hand === 'right');
        const raw = onsetF1(all, events.map((n) => ({ midi: n.midi, startSec: n.startSec })));
        const a = arrange(events, { version: 'full', timeSignature: ts });
        const tol = 0.5 * (60 / song.bpm);
        const melody = onsetF1(rh, a.melody.map((n) => ({ midi: n.midi, startSec: secOf(a.grid, n.startBeat) })), tol);
        process.stderr.write(`\nACC ${stem} ${mix ? 'mix' : 'clean'} ${JSON.stringify({ rawF1: +raw.f1.toFixed(3), rawP: +raw.precision.toFixed(3), rawR: +raw.recall.toFixed(3), melodyF1: +melody.f1.toFixed(3), melodyP: +melody.precision.toFixed(3), melodyR: +melody.recall.toFixed(3), bpm: a.bpm, estimatedBpm: a.estimatedBpm, key: [a.key.tonic, a.key.mode] })}\n`);
        expect(melody.f1).toBeGreaterThanOrEqual(mix ? floors.mix : floors.clean);
      }, 60_000);
    }
  }
});
