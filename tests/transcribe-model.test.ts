/**
 * The real Basic Pitch model, run in Node on the CPU backend (test only; the browser is WebGL only) through the same
 * runner.ts the worker uses. Clips are bundled public-domain songs, synthesized at test time. This proves the
 * windowing and post-processing; it does not prove browser, GPU or real-recording accuracy (synthetic audio is easy).
 */
import { readFileSync } from 'node:fs';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CancelledError, runBasicPitch } from '../src/transcribe/runner';
import { SAMPLE_RATE, type NoteEvent, type TranscribeProgress } from '../src/transcribe/types';
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
const asTimed = (notes: NoteEvent[]) => notes.map((n) => ({ midi: n.midi, startSec: n.startSec }));

describe('Basic Pitch through runner.ts (real model, CPU)', () => {
  it('Ode to Joy, clean: finds the melody (raw onset F1 >= 0.95), with progress and no leaked tensors', async () => {
    const song = bundledSong('ode-to-joy');
    const ref = referenceNotes(song, SECONDS);
    const progress: TranscribeProgress[] = [];
    const before = tf.memory().numTensors;
    const r = await runBasicPitch(model, synthesize(song, { seconds: SECONDS }), { onProgress: (p) => progress.push(p) });
    const score = onsetF1(ref, asTimed(r.notes));
    console.log('ode-to-joy raw', JSON.stringify(score));
    expect(score.f1).toBeGreaterThanOrEqual(0.95);
    expect(tf.memory().numTensors).toBe(before);
    expect(progress.filter((p) => p.stage === 'listening').at(-1)!.fraction).toBe(1);
    expect(progress.at(-1)).toEqual({ stage: 'finishing', fraction: 0 });
    const frac = progress.filter((p) => p.stage === 'listening').map((p) => p.fraction);
    expect([...frac].sort((a, b) => a - b)).toEqual(frac);
    expect(r.notes.every((n) => n.midi >= 21 && n.midi <= 108 && n.durationSec > 0 && n.amplitude >= 0)).toBe(true);
  }, 60_000);

  it.each([
    ['when-the-saints', 0.95],
    ['fur-elise', 0.95],
  ])('%s, two hands, clean: finds the notes (raw recall >= %d)', async (stem, floor) => {
    const song = bundledSong(stem);
    const ref = referenceNotes(song, SECONDS);
    const r = await runBasicPitch(model, synthesize(song, { seconds: SECONDS }), {});
    const score = onsetF1(ref, asTimed(r.notes));
    console.log(stem, 'raw', JSON.stringify(score));
    expect(score.recall).toBeGreaterThanOrEqual(floor);
  }, 60_000);

  it('stops between windows when cancelled, and leaves no tensors behind', async () => {
    const song = bundledSong('ode-to-joy');
    const before = tf.memory().numTensors;
    let windows = 0;
    const run = runBasicPitch(model, synthesize(song, { seconds: SECONDS }), {
      onProgress: (p) => { if (p.stage === 'listening') windows++; },
      isCancelled: () => windows >= 2,
    });
    await expect(run).rejects.toBeInstanceOf(CancelledError);
    expect(windows).toBe(2);
    expect(tf.memory().numTensors).toBe(before);
  }, 60_000);

  it('handles audio shorter than one window', async () => {
    const r = await runBasicPitch(model, new Float32Array(SAMPLE_RATE / 2), {});
    expect(r.notes).toEqual([]);
  }, 60_000);
});
