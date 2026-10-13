/**
 * Builds the app for production into a temp directory and checks what the build emitted for transcription:
 * the model is a separate worker chunk plus static files, and nothing of TF.js or Basic Pitch is in the main chunk
 * (or any chunk but the worker). A real build, so it holds even if the config or a dynamic import changes.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MODEL_DIR } from '../src/transcribe/modelFiles';

let out: string;
const MARKERS = ['Identity_2', 'registerBackend', 'tfjs', 'basic-pitch', 'Could not get context for WebGL'];

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'keyfall-bundle-'));
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({ logLevel: 'silent', build: { outDir: out, emptyOutDir: true, reportCompressedSize: false } });
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
}, 180_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

const assets = () => readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'));
const text = (f: string) => readFileSync(join(out, 'assets', f), 'utf8');
const worker = () => assets().filter((f) => f.startsWith('transcribe.worker-'));

describe('production bundle and transcription', () => {
  it('the entry chunk carries no TF.js or Basic Pitch', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const entry = /<script[^>]+src="[^"]*\/assets\/(index-[^"]+\.js)"/.exec(html)?.[1];
    expect(entry).toBeTruthy();
    for (const m of MARKERS) expect(text(entry!).includes(m), `entry has ${m}`).toBe(false);
  });

  it('only the worker chunk carries them, and it exists', () => {
    expect(worker()).toHaveLength(1);
    for (const m of ['Identity_2', 'registerBackend']) expect(text(worker()[0]!).includes(m), `worker lacks ${m}`).toBe(true);
    for (const f of assets().filter((a) => !a.startsWith('transcribe.worker-'))) {
      for (const m of MARKERS) expect(text(f).includes(m), `${f} has ${m}`).toBe(false);
    }
  });

  it('the app loads the worker through a lazily imported chunk, never from the entry', () => {
    const chunks = assets().filter((f) => !f.startsWith('transcribe.worker-') && text(f).includes(worker()[0]!));
    expect(chunks.length).toBeGreaterThan(0);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    for (const c of chunks) expect(html).not.toContain(c);
  });

  it('emits the model files and the Apache licence under the versioned directory', () => {
    const dir = join(out, MODEL_DIR);
    expect(readdirSync(dir).sort()).toEqual(['LICENSE', 'group1-shard1of1.bin', 'model.json']);
    expect(statSync(join(dir, 'group1-shard1of1.bin')).size).toBe(742392);
    expect(statSync(join(dir, 'model.json')).size).toBe(174537);
    expect(readFileSync(join(dir, 'LICENSE'), 'utf8')).toContain('Apache License');
  });

  it('keeps the CSP free of eval and wasm', () => {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(join(out, 'index.html'), 'utf8'))?.[1]?.replaceAll('&#39;', "'") ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-eval|wasm-unsafe-eval/);
  });
});
