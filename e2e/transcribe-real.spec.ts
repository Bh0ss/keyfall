import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi } from './helpers';
import { bundledSong, referenceNotes, synthesize, toWav } from '../tests/fixtures/audio';
import { onsetF1 } from '../tests/fixtures/metrics';
import type { DebugTranscribeResult } from '../src/transcribe/debug';

/**
 * The real model in the real worker, in the browser under test. On the preview build and the live URL this is the one
 * check that the model files load under the Pages base and that transcription raises no CSP violation (the `test`
 * from ./fixtures fails any violation). The dev server runs it too. It reports which backend ran; there is no CPU path
 * in the browser, so a machine without WebGL gets `unsupported` and the spec says so instead of passing quietly.
 */
test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const SECONDS = 10;
const song = bundledSong('ode-to-joy');
const wavB64 = Buffer.from(toWav(synthesize(song, { seconds: SECONDS }))).toString('base64');
const ref = referenceNotes(song, SECONDS);

async function transcribe(page: Page, opts: { fileName?: string; repeat?: number; cancelAfterMs?: number; b64?: string } = {}) {
  return page.evaluate(
    async ({ b64, o }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return window.__keyfall!.transcribe(bytes, o);
    },
    { b64: opts.b64 ?? wavB64, o: { fileName: opts.fileName, repeat: opts.repeat, cancelAfterMs: opts.cancelAfterMs } },
  );
}

function unsupportedNote(r: DebugTranscribeResult): string {
  return r.ok ? '' : `${r.kind}: ${r.message}`;
}

test.describe('real transcription', () => {
  test('the real model returns the notes from a worker, loading its files under the base', async ({ page, context }) => {
    const modelFetches: string[] = [];
    context.on('requestfinished', (req) => {
      if (req.url().includes('/models/basic-pitch-')) modelFetches.push(req.url());
    });
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    await gotoApp(page, './?debug=1#/');

    const r = await transcribe(page);
    if (!r.ok && r.kind === 'unsupported') {
      test.info().annotations.push({ type: 'backend', description: `unsupported (${r.message})` });
      console.log(`transcribe-real: backend UNSUPPORTED in this browser: ${unsupportedNote(r)}`);
      expect(r.liveWorkers).toBe(0);
      test.skip(true, 'No WebGL in this browser: transcription is unsupported by design (no CPU path). Backend not exercised.');
    }
    expect(r, unsupportedNote(r)).toMatchObject({ ok: true });
    if (!r.ok) return;

    test.info().annotations.push({ type: 'backend', description: r.info.backend });
    console.log(`transcribe-real: backend=${r.info.backend} loadMs=${Math.round(r.info.loadMs)} inferMs=${Math.round(r.info.inferMs)} postMs=${Math.round(r.info.postMs)} notes=${r.notes.length}`);
    expect(r.info.backend).toBe('webgl');
    expect(r.notes.length).toBeGreaterThan(0);
    const score = onsetF1(ref, r.notes);
    expect(score.f1, JSON.stringify(score)).toBeGreaterThanOrEqual(0.9);
    expect(r.stages).toEqual(['loading-model', 'listening', 'finishing']);
    expect(r.seconds).toBeGreaterThan(SECONDS);
    expect(r.liveWorkers).toBe(0);
    expect(workers.some((u) => /transcribe\.worker/.test(u))).toBe(true);
    expect(modelFetches.some((u) => /\/keyfall\/models\/basic-pitch-1\.0\.1\/model\.json$/.test(u))).toBe(true);
    expect(modelFetches.some((u) => /\/keyfall\/models\/basic-pitch-1\.0\.1\/group1-shard1of1\.bin$/.test(u))).toBe(true);
  });

  test('cancelling terminates the worker and leaves none behind', async ({ page }) => {
    let opened = 0;
    let closed = 0;
    page.on('worker', (w) => {
      opened++;
      w.on('close', () => closed++);
    });
    await gotoApp(page, './?debug=1#/');
    const r = await transcribe(page, { repeat: 6, cancelAfterMs: 1500 });
    if (!r.ok && r.kind === 'unsupported') test.skip(true, `No WebGL in this browser (${r.message}); nothing to cancel.`);
    expect(r).toMatchObject({ ok: false, kind: 'cancelled', liveWorkers: 0 });
    await expect.poll(() => closed).toBe(opened);
    expect(opened).toBe(1);
  });

  test('a file that is not audio is refused before any worker starts', async ({ page }) => {
    let opened = 0;
    page.on('worker', () => opened++);
    await gotoApp(page, './?debug=1#/');
    const junk = Buffer.from('this is not audio at all, just text').toString('base64');
    expect(await transcribe(page, { b64: junk, fileName: 'junk.mp3' })).toMatchObject({ ok: false, kind: 'import' });
    expect(await transcribe(page, { fileName: 'song.flac' })).toMatchObject({ ok: false, kind: 'import' });
    expect(opened).toBe(0);
  });
});
