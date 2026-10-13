import { mkdtempSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi, readStore } from './helpers';
import { bundledSong, synthesize, toWav } from '../tests/fixtures/audio';

/**
 * The Add song flow at #/add/audio (dark: nothing links to it yet). oEmbed is always stubbed with page.route. The
 * model is replaced by the debug-only fake behind the transcriber seam, so the whole UI runs: link, file, progress,
 * cancel, review (version, tempo, key, trim), save, then Wait mode played to the end with autoplay. One test at the
 * end runs the real worker through the same screen. On the preview build the CSP is live and the `test` from
 * ./fixtures fails any violation.
 */
test.use({ permissions: ['midi', 'midi-sysex'] });
test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const LINK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };

const song = bundledSong('ode-to-joy');
const goodWav = Buffer.from(toWav(synthesize(song, { seconds: 8 })));

/** A mono 8 kHz 8-bit WAV of silence or a quiet tone, small on the wire but long in seconds. */
function plainWav(seconds: number, tone: boolean): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n, 128);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  if (tone) for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return b;
}

async function stubSpotify(page: Page, reply: { status?: number; body?: unknown } = { body: { title: '  Ode Test ', thumbnail_url: 'https://image-cdn-fa.spotifycdn.com/image/x' } }) {
  const seen: string[] = [];
  await page.route('https://open.spotify.com/oembed*', async (route) => {
    seen.push(route.request().url());
    await route.fulfill({ status: reply.status ?? 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(reply.body ?? {}) });
  });
  await page.route('https://image-cdn-fa.spotifycdn.com/**', (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG }));
  return seen;
}

const FAST = { stepMs: 10, steps: 3, finishingMs: 60 };
const installFake = (page: Page, opts: object = FAST) => page.evaluate(([o]) => window.__keyfall!.useFakeTranscriber('ode-to-joy', o as never), [opts]);

async function open(page: Page, fake: object | null = FAST) {
  await gotoApp(page, './?debug=1#/add/audio');
  await expect(page.getByTestId('add-audio-screen')).toBeVisible();
  if (fake) expect(await installFake(page, fake)).toBe(true);
}

const pick = (page: Page, name: string, buffer: Buffer, mimeType = 'audio/wav') => page.getByTestId('audio-file').setInputFiles({ name, mimeType, buffer });

async function lookup(page: Page) {
  await page.getByTestId('link-input').fill(LINK);
  await page.getByTestId('link-lookup').click();
}

/** Everything the screen should leave behind: nothing audio-shaped anywhere the browser can store. */
async function storedAudioShapes(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ shapes: string[]; caches: string[]; web: string[] }>((resolve, reject) => {
        const open = indexedDB.open('keyfall');
        open.onerror = () => reject(open.error);
        open.onsuccess = async () => {
          const db = open.result;
          const shapes: string[] = [];
          const walk = (v: unknown, path: string) => {
            if (v instanceof ArrayBuffer || ArrayBuffer.isView(v) || v instanceof Blob) shapes.push(path);
            else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
          };
          for (const name of Array.from(db.objectStoreNames)) {
            const rows = await new Promise<unknown[]>((res, rej) => {
              const r = db.transaction(name, 'readonly').objectStore(name).getAll();
              r.onsuccess = () => res(r.result);
              r.onerror = () => rej(r.error);
            });
            rows.forEach((row, i) => walk(row, `${name}[${i}]`));
          }
          db.close();
          const web = [...Object.entries(localStorage), ...Object.entries(sessionStorage)].filter(([, v]) => /RIFF|WAVE/.test(v)).map(([k]) => k);
          resolve({ shapes, caches: await caches.keys(), web });
        };
      }),
  );
}

test.describe('add song from a recording (fake transcriber)', () => {
  test('link, file, listening, review, save, and the song plays to the end in Wait with autoplay', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await stubSpotify(page);
    await open(page);
    await expect(page.getByTestId('audio-privacy')).toContainText('stays on this device and is never saved');
    await expect(page.getByTestId('audio-file')).toHaveAttribute('accept', '.m4a,.mp3,.wav');

    await lookup(page);
    await expect(page.getByTestId('link-title')).toHaveValue('Ode Test');
    await expect(page.getByTestId('link-thumb')).toBeVisible();
    expect(seen).toEqual([`https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')}`]);
    await page.getByTestId('link-artist').fill('Ludwig van Beethoven');

    await pick(page, 'ode.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
    await expect(page.getByTestId('import-title')).toHaveValue('Ode Test');
    await expect(page.getByTestId('import-composer')).toHaveValue('Ludwig van Beethoven');
    for (const id of ['addAudio.version', 'addAudio.tempo', 'addAudio.key', 'addAudio.trim']) await expect(page.getByTestId(`help-${id}`)).toBeVisible();

    // Beginner and Full, tempo half/double/typed, key override and trim each re-arrange without listening again.
    const facts = page.getByTestId('import-facts');
    const beginnerNotes = Number((await facts.textContent())!.match(/(\d+) notes/)![1]);
    await page.getByTestId('version-full').check();
    await expect.poll(async () => Number((await facts.textContent())!.match(/(\d+) notes/)![1])).not.toBe(beginnerNotes);
    await page.getByTestId('version-beginner').check();
    await expect.poll(async () => Number((await facts.textContent())!.match(/(\d+) notes/)![1])).toBe(beginnerNotes);

    const tempo = page.getByTestId('tempo-input');
    const detected = Number(await tempo.inputValue());
    await page.getByTestId('tempo-half').click();
    await expect(tempo).toHaveValue(String(Math.round(detected / 2)));
    await expect(facts).toContainText(`${Math.round(detected / 2)} bpm`);
    await page.getByTestId('tempo-double').click();
    await expect(tempo).toHaveValue(String(Math.round(detected / 2) * 2));
    await tempo.fill('90');
    await expect(facts).toContainText('90 bpm');
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('tempo-tap').click();
      await page.waitForTimeout(500);
    }
    const tapped = Number(await tempo.inputValue());
    expect(tapped).toBeGreaterThan(95);
    expect(tapped).toBeLessThan(145);
    await page.getByTestId('tempo-reset').click();
    await expect(tempo).toHaveValue(String(detected));

    const key = page.getByTestId('key-select');
    await expect(key.locator('option').first()).toContainText('Detected:');
    await key.selectOption('9-minor');
    await expect(key).toHaveValue('9-minor');
    await expect(page.getByTestId('review-error')).toHaveCount(0);
    await key.selectOption('');

    await page.getByTestId('trim-end').fill('4');
    await expect(page.getByTestId('trim-whole')).toBeVisible();
    await page.getByTestId('trim-start').fill('7');
    await expect(page.getByTestId('trim-start')).toHaveValue('7');
    await page.getByTestId('trim-whole').click();
    const whole = (await page.getByText(/The recording is \d+ seconds long/).textContent())!.match(/(\d+)/)![1]!;
    await expect(page.getByTestId('trim-end')).toHaveValue(whole);
    await expect(page.getByTestId('trim-start')).toHaveValue('0');

    await page.getByTestId('import-save').click();
    await expect(page).toHaveURL(/#\/play\/imp-/);
    const id = decodeURIComponent(page.url().split('#/play/')[1]!.split('?')[0]!);

    // Saved through the existing pipeline: the record's source is the generated MusicXML, nothing audio-shaped is stored.
    const rows = await readStore<{ id: string; format: string; fileName: string; source: ArrayBuffer }>(page, 'songs');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ format: 'musicxml', fileName: 'Ode Test.musicxml' });
    const head = await page.evaluate(async () => {
      const open = indexedDB.open('keyfall');
      const db = await new Promise<IDBDatabase>((res) => (open.onsuccess = () => res(open.result)));
      const all = await new Promise<{ source: ArrayBuffer }[]>((res) => {
        const r = db.transaction('songs').objectStore('songs').getAll();
        r.onsuccess = () => res(r.result);
      });
      db.close();
      return { text: new TextDecoder().decode(all[0]!.source.slice(0, 5)), bytes: all[0]!.source.byteLength };
    });
    expect(head.text).toBe('<?xml');
    expect(head.bytes).toBeLessThan(goodWav.byteLength);
    const stored = await storedAudioShapes(page);
    expect(stored.shapes.filter((s) => !/^songs\[0\]\.source$/.test(s))).toEqual([]);
    expect(stored.caches).toEqual([]);
    expect(stored.web).toEqual([]);

    // The song plays to the end in Wait mode.
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('mode-wait').click();
    const played = await page.evaluate(() => window.__keyfall!.autoplay({}));
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 60_000 });
    const total = await page.getByTestId('stat-correct').textContent();
    expect(total).toMatch(/^(\d+)\/\1$/);
    await expect(page.getByTestId('stat-wrong')).toHaveText('0');
    expect(played.presses).toBeGreaterThan(20);
    expect(played.wrongPresses).toBe(0);
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId(`song-${id}`)).toContainText('Ode Test');
  });

  test('an invalid link makes no request and leaves manual entry open; an oEmbed failure falls back to manual title and artist', async ({ page }) => {
    const seen = await stubSpotify(page, { status: 404 });
    await open(page);
    await page.getByTestId('link-input').fill('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC');
    await page.getByTestId('link-lookup').click();
    await expect(page.getByTestId('link-status')).toContainText('not a Spotify track link');
    expect(seen).toEqual([]);

    await lookup(page);
    await expect(page.getByTestId('link-status')).toContainText('Type the title and artist instead');
    expect(seen).toHaveLength(1);
    await expect(page.getByTestId('link-thumb')).toHaveCount(0);
    await page.getByTestId('link-title').fill('My Own Title');
    await page.getByTestId('link-artist').fill('Me');
    await pick(page, 'x.wav', goodWav);
    await expect(page.getByTestId('import-title')).toHaveValue('My Own Title');
    await expect(page.getByTestId('import-composer')).toHaveValue('Me');
  });

  test('with no link at all the title comes from the file name', async ({ page }) => {
    await open(page);
    await pick(page, 'moonlit_walk.wav', goodWav);
    await expect(page.getByTestId('import-title')).toHaveValue('moonlit walk');
  });

  test('a wrong type, an empty file, a silent file and an oversize file are refused with a message, and a good one then works', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const error = page.getByTestId('audio-error');
    await pick(page, 'notes.txt', Buffer.from('hello'), 'text/plain');
    await expect(error).toContainText('m4a, mp3 or wav');
    await pick(page, 'empty.wav', Buffer.alloc(0));
    await expect(error).toContainText('empty');
    await pick(page, 'junk.mp3', Buffer.from('this is not audio at all'), 'audio/mpeg');
    await expect(error).toContainText('could not read');
    await pick(page, 'quiet.wav', plainWav(2, false));
    await expect(error).toContainText('silent');
    // 65 MB, over the 64 MB limit: a sparse file on disk, since a buffer this big cannot be passed over the wire.
    const big = join(mkdtempSync(join(tmpdir(), 'keyfall-big-')), 'big.wav');
    writeFileSync(big, '');
    truncateSync(big, 65 * 1024 * 1024);
    await page.getByTestId('audio-file').setInputFiles(big);
    await expect(error).toContainText('too big');
    await expect(page.getByTestId('import-form')).toHaveCount(0);
    await pick(page, 'ok.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
    await expect(error).toHaveCount(0);
  });

  test('cancel works while listening and while finishing; a fresh run then works and nothing from the old one arrives', async ({ page }) => {
    await open(page, { stepMs: 60, steps: 20, finishingMs: 30_000 });
    await pick(page, 'a.wav', goodWav);
    const stage = page.getByTestId('listen-stage');
    await expect(stage).toHaveAttribute('data-stage', 'listening');
    const bar = page.getByTestId('listen-bar');
    await expect(bar).toHaveAttribute('aria-valuenow', /\d+/);
    await page.getByTestId('listen-cancel').click();
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
    await expect(stage).toHaveCount(0);

    await pick(page, 'a.wav', goodWav);
    await expect(stage).toHaveAttribute('data-stage', 'finishing', { timeout: 15_000 });
    // Finishing is indeterminate: no number, and it is not a bar stuck at 100 percent.
    await expect(bar).not.toHaveAttribute('aria-valuenow', /.*/);
    await expect(bar).toHaveAttribute('data-indeterminate', '');
    await page.getByTestId('listen-cancel').click();
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('add-audio-listening')).toHaveCount(0);
    await expect(page.getByTestId('import-form')).toHaveCount(0);

    await installFake(page);
    await pick(page, 'a.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
  });

  test('a device without WebGL gets the Mac card with no Try anyway', async ({ page }) => {
    await open(page, { ...FAST, fail: 'unsupported' });
    await pick(page, 'a.wav', goodWav);
    const card = page.getByTestId('add-audio-mac');
    await expect(card).toContainText('This works best on the Mac');
    await expect(card).toHaveAttribute('data-reason', 'no-webgl');
    await expect(page.getByTestId('mac-try-anyway')).toHaveCount(0);
    await page.getByTestId('mac-choose-another').click();
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
  });

  test('a worker error gets the same card', async ({ page }) => {
    await open(page, { ...FAST, fail: 'error' });
    await pick(page, 'a.wav', goodWav);
    await expect(page.getByTestId('add-audio-mac')).toHaveAttribute('data-reason', 'worker-error');
    await expect(page.getByTestId('mac-try-anyway')).toHaveCount(0);
  });

  test('a run projected to be slow offers Try anyway, which lets it finish', async ({ page }) => {
    test.setTimeout(60_000);
    // A 40 s recording is more than 3 windows; a tiny pace limit makes the projection exceed it.
    await open(page, { stepMs: 80, steps: 10, finishingMs: 100, paceLimitSec: 0.01 });
    await pick(page, 'long.wav', Buffer.from(toWav(synthesize(song, { seconds: 30 }))));
    const card = page.getByTestId('add-audio-mac');
    await expect(card).toHaveAttribute('data-reason', 'too-slow');
    await page.getByTestId('mac-try-anyway').click();
    await expect(page.getByTestId('import-form')).toBeVisible({ timeout: 20_000 });
  });

  test.describe('on an iPhone', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    test('a recording over the phone cap gets the Mac card; a short one runs', async ({ page }) => {
      await open(page);
      await pick(page, 'long.wav', plainWav(250, true));
      await expect(page.getByTestId('add-audio-mac')).toHaveAttribute('data-reason', 'too-long-phone');
      await expect(page.getByTestId('mac-try-anyway')).toHaveCount(0);
      await page.getByTestId('mac-choose-another').click();
      await pick(page, 'short.wav', goodWav);
      await expect(page.getByTestId('import-form')).toBeVisible();
    });
  });

  test('piano-nav alone: link lookup, choose the file, every review control, save', async ({ page }) => {
    test.setTimeout(120_000);
    const A0 = 21;
    const C1 = 24;
    const D1 = 26;
    const tap = (midi: number) =>
      page.evaluate((m) => {
        window.__keyfall!.press(m);
        window.__keyfall!.release(m);
      }, midi);
    const on = (sel: string) => page.evaluate((s) => document.activeElement?.matches(s) ?? false, sel);
    const stepTo = async (sel: string) => {
      for (let i = 0; i < 60; i++) {
        if (await on(sel)) return;
        await tap(D1);
      }
      throw new Error(`selection never reached ${sel}`);
    };
    const press = async (sel: string) => {
      await stepTo(sel);
      await expect(page.locator(sel)).toBeFocused();
      await tap(C1);
    };

    await stubSpotify(page);
    await open(page);
    await page.getByTestId('link-input').fill(LINK);
    // The default stop is the first main action: the lookup, because a link is waiting.
    await tap(D1);
    await expect(page.getByTestId('link-lookup')).toBeFocused();
    await expect(page.getByTestId('link-lookup')).toHaveAttribute('data-primary', '');
    await tap(C1);
    await expect(page.getByTestId('link-title')).toHaveValue('Ode Test');
    await expect(page.getByTestId('help-addAudio.link')).toBeVisible();

    // The file picker is reached and pressed with the piano keys; the native chooser opens.
    await stepTo('[data-testid=audio-file]');
    // A visible ring: the label around the focused input shows the outline.
    const ring = await page.getByTestId('audio-pick').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).not.toBe('none');
    const chooser = page.waitForEvent('filechooser');
    await tap(C1);
    await (await chooser).setFiles({ name: 'ode.wav', mimeType: 'audio/wav', buffer: goodWav });
    await expect(page.getByTestId('import-form')).toBeVisible();

    const tempo = page.getByTestId('tempo-input');
    const detected = Number(await tempo.inputValue());
    await press('[data-testid=version-full]');
    await expect(page.getByTestId('version-full')).toBeChecked();
    await press('[data-testid=tempo-half]');
    await expect(tempo).toHaveValue(String(Math.round(detected / 2)));
    await press('[data-testid=tempo-double]');
    await press('[data-testid=tempo-tap]');
    await stepTo('[data-testid=key-select]');
    await stepTo('[data-testid=trim-start]');
    await stepTo('[data-testid=trim-end]');
    for (const id of ['addAudio.version', 'addAudio.tempo', 'addAudio.key', 'addAudio.trim']) await stepTo(`[data-testid="help-${id}"]`);
    await expect(page.getByTestId('help-bubble')).toBeVisible();
    await press('[data-testid=import-save]');
    await expect(page).toHaveURL(/#\/play\/imp-/);

    // A0 goes back to the song list from the screen.
    await page.goto('./?debug=1#/add/audio');
    await tap(A0);
    await expect(page).toHaveURL(/#\/songs$/);
  });

  test('targets are at least 44 px and the screen has no horizontal scroll on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page);
    await pick(page, 'a.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
    for (const id of ['version-full', 'tempo-tap', 'tempo-half', 'tempo-double', 'key-select', 'trim-start', 'trim-end', 'import-save', 'help-addAudio.tempo']) {
      // A radio's target is its label.
      const target = page.getByTestId(id);
      const box = await (id.startsWith('version-') ? target.locator('xpath=..') : target).boundingBox();
      expect(box!.height, id).toBeGreaterThanOrEqual(43.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  /** Every IndexedDB store, found by listing them (not a hard-coded list), as name -> JSON of its rows; plus the web storage areas. */
  async function persisted(page: Page) {
    return page.evaluate(
      () =>
        new Promise<{ stores: Record<string, string>; web: string }>((resolve, reject) => {
          const open = indexedDB.open('keyfall');
          open.onerror = () => reject(open.error);
          open.onsuccess = async () => {
            const db = open.result;
            const stores: Record<string, string> = {};
            for (const name of Array.from(db.objectStoreNames)) {
              const rows = await new Promise<unknown[]>((res, rej) => {
                const r = db.transaction(name, 'readonly').objectStore(name).getAll();
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
              });
              stores[name] = JSON.stringify(rows);
            }
            db.close();
            resolve({ stores, web: JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]) });
          };
        }),
    );
  }

  /** Set every review choice to something other than its default and return what to expect back. */
  async function choose(page: Page) {
    await page.getByTestId('version-full').check();
    await page.getByTestId('tempo-input').fill('90');
    await page.getByTestId('key-select').selectOption('9-minor');
    await page.getByTestId('trim-end').fill('6');
    await page.getByTestId('trim-start').fill('1');
    await page.getByTestId('import-title').fill('Preview Title');
    await page.getByTestId('import-composer').fill('Preview Artist');
    await page.getByTestId('import-split-pitch').check();
    await page.getByTestId('import-split').fill('64');
    await page.getByTestId('import-level').selectOption('4');
    await expect(page.getByTestId('import-facts')).toContainText('90 bpm');
  }

  async function expectChoices(page: Page) {
    await expect(page.getByTestId('version-full')).toBeChecked();
    await expect(page.getByTestId('tempo-input')).toHaveValue('90');
    await expect(page.getByTestId('key-select')).toHaveValue('9-minor');
    await expect(page.getByTestId('trim-start')).toHaveValue('1');
    await expect(page.getByTestId('trim-end')).toHaveValue('6');
    await expect(page.getByTestId('import-title')).toHaveValue('Preview Title');
    await expect(page.getByTestId('import-composer')).toHaveValue('Preview Artist');
    await expect(page.getByTestId('import-split-pitch')).toBeChecked();
    await expect(page.getByTestId('import-split')).toHaveValue('64');
    await expect(page.getByTestId('import-level')).toHaveValue('4');
  }

  test('a Wait-mode preview plays to the end, writes nothing anywhere, returns to the review with every choice, and then save works', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await pick(page, 'ode.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
    await expect(page.getByTestId('help-addAudio.preview')).toBeVisible();
    await expect(page.getByTestId('preview-note')).toContainText('Reloading the page clears it');
    await choose(page);

    const before = await persisted(page);
    expect(Object.keys(before.stores).sort()).toEqual(expect.arrayContaining(['attempts', 'latency', 'learnProgress', 'meta', 'noteStats', 'profiles', 'reviewQueue', 'scores', 'songs']));
    const sessionKeys = await page.evaluate(() => Object.keys(sessionStorage).concat(Object.keys(localStorage)));

    await page.getByTestId('preview-wait').click();
    await expect(page).toHaveURL(/#\/play\/preview-draft\?preview=1$/);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    // Wait is the only mode, and the header says it is a preview.
    await expect(page.getByTestId('mode-wait')).toHaveAttribute('aria-pressed', 'true');
    for (const m of ['practice', 'full', 'expert']) await expect(page.getByTestId(`mode-${m}`)).toHaveCount(0);
    await expect(page.getByTestId('play-screen')).toContainText('Preview');
    // Settings changed during the preview are not saved.
    await page.getByTestId('toggle-metronome').click();
    await page.getByTestId('toggle-labels').click();
    await page.getByTestId('view-split').click();

    const played = await page.evaluate(() => window.__keyfall!.autoplay({}));
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 60_000 });
    expect(played.presses).toBeGreaterThan(20);
    await expect(page.getByTestId('preview-note')).toContainText('Nothing was saved');
    await expect(page.getByTestId('see-results')).toHaveCount(0);
    await expect(page.getByTestId('saving-results')).toHaveCount(0);

    // Zero new rows in any store, nothing changed in any row (the sync queue is driven by these tables), no web storage.
    const after = await persisted(page);
    expect(after.stores).toEqual(before.stores);
    expect(after.web).toBe(before.web);
    expect(await page.evaluate(() => Object.keys(sessionStorage).concat(Object.keys(localStorage)))).toEqual(sessionKeys);

    await page.getByTestId('preview-back').click();
    await expect(page).toHaveURL(/#\/add\/audio$/);
    await expect(page.getByTestId('import-form')).toBeVisible();
    await expectChoices(page);

    // A second preview from the restored review, left with the Back arrow instead.
    await page.getByTestId('preview-wait').click();
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByRole('link', { name: 'Back to review' }).click();
    await expectChoices(page);
    expect((await persisted(page)).stores).toEqual(before.stores);

    await page.getByTestId('import-save').click();
    await expect(page).toHaveURL(/#\/play\/imp-/);
    const rows = await readStore<{ song: { title: string; level: number } }>(page, 'songs');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.song).toMatchObject({ title: 'Preview Title', level: 4 });
    expect(await readStore(page, 'attempts')).toHaveLength(0);
    expect(await readStore(page, 'scores')).toHaveLength(0);
    expect(await readStore(page, 'noteStats')).toHaveLength(0);
    // The preview song is gone once the real one is saved.
    await page.evaluate(() => (window.location.hash = '#/play/preview-draft?preview=1'));
    await expect(page.getByText('Preview not found')).toBeVisible();
  });

  test('a reload drops the preview and the draft; leaving the flow elsewhere does too', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    await pick(page, 'ode.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
    await choose(page);
    await page.getByTestId('preview-wait').click();
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Preview not found')).toBeVisible();
    await expect(page.getByText('Reloading the page clears it')).toBeVisible();
    await page.getByRole('link', { name: 'Back to Add song' }).click();
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
    await expect(page.getByTestId('import-form')).toHaveCount(0);

    // Preview, then go to Songs instead of back: coming to Add song afterwards starts empty.
    await installFake(page);
    await pick(page, 'ode.wav', goodWav);
    await page.getByTestId('preview-wait').click();
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.evaluate(() => (window.location.hash = '#/songs'));
    await expect(page).toHaveURL(/#\/songs$/);
    await page.evaluate(() => (window.location.hash = '#/add/audio'));
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
    await expect(page.getByTestId('import-form')).toHaveCount(0);
    // Cancel on the review clears the preview slot.
    await installFake(page);
    await pick(page, 'ode.wav', goodWav);
    await page.getByTestId('preview-wait').click();
    await page.getByRole('link', { name: 'Back to review' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
    await page.evaluate(() => (window.location.hash = '#/play/preview-draft?preview=1'));
    await expect(page.getByText('Preview not found')).toBeVisible();
  });

  test('piano-nav alone: Preview in Wait mode, play, and A0 back to the review', async ({ page }) => {
    test.setTimeout(60_000);
    const A0 = 21;
    const C1 = 24;
    const D1 = 26;
    const tap = (midi: number) =>
      page.evaluate((m) => {
        window.__keyfall!.press(m);
        window.__keyfall!.release(m);
      }, midi);
    await open(page);
    await pick(page, 'ode.wav', goodWav);
    await expect(page.getByTestId('import-form')).toBeVisible();
    await page.getByTestId('version-full').check();
    for (let i = 0; i < 80 && !(await page.getByTestId('preview-wait').evaluate((el) => document.activeElement === el)); i++) await tap(D1);
    await expect(page.getByTestId('preview-wait')).toBeFocused();
    const ring = await page.getByTestId('preview-wait').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).not.toBe('none');
    await tap(C1);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    // A0 goes back to the review, not to Songs, and the choice is still there.
    await tap(A0);
    await expect(page).toHaveURL(/#\/add\/audio$/);
    await expect(page.getByTestId('version-full')).toBeChecked();
  });
});

test.describe('add song with the real model', () => {
  test('the real worker runs through the screen, shows the finishing stage, and cancelling there frees the worker', async ({ page }) => {
    test.setTimeout(180_000);
    const workers: { url: string; closed: boolean }[] = [];
    page.on('worker', (w) => {
      const rec = { url: w.url(), closed: false };
      workers.push(rec);
      w.on('close', () => (rec.closed = true));
    });
    await open(page, null);
    const long = Buffer.from(toWav(synthesize(song, { seconds: 12 })));
    // The finishing stage can be as short as 100 ms on a fast machine, so watch the DOM instead of polling it.
    // With cancelOnFinishing set, the Cancel button is pressed the moment that stage appears.
    await page.evaluate(() => {
      const w = window as unknown as { __stages: string[]; __cancelOnFinishing: boolean };
      w.__stages = [];
      w.__cancelOnFinishing = false;
      new MutationObserver(() => {
        const el = document.querySelector('[data-testid=listen-stage]');
        const s = el?.getAttribute('data-stage');
        if (s && w.__stages.at(-1) !== s) {
          w.__stages.push(s);
          if (s === 'finishing' && w.__cancelOnFinishing) (document.querySelector('[data-testid=listen-cancel]') as HTMLElement).click();
        }
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    const stagesSeen = () => page.evaluate(() => (window as unknown as { __stages: string[] }).__stages);
    await pick(page, 'real.wav', long);
    const stage = page.getByTestId('listen-stage');
    const mac = page.getByTestId('add-audio-mac');
    await expect(stage.or(mac)).toBeVisible({ timeout: 30_000 });
    if (await mac.isVisible()) {
      test.info().annotations.push({ type: 'backend', description: 'unsupported (no WebGL in this browser)' });
      test.skip(true, 'No WebGL in this browser: the real worker cannot run, by design.');
    }
    await expect(page.getByTestId('import-form')).toBeVisible({ timeout: 120_000 });
    expect(await stagesSeen()).toEqual(['decoding', 'loading-model', 'listening', 'finishing']);

    // Again, cancelling the moment the finishing stage starts.
    await page.evaluate(() => ((window as unknown as { __cancelOnFinishing: boolean }).__cancelOnFinishing = true));
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page.getByTestId('add-audio-file')).toBeVisible();
    await pick(page, 'real.wav', long);
    await expect(page.getByTestId('add-audio-file')).toBeVisible({ timeout: 120_000 });
    expect((await stagesSeen()).slice(-1)).toEqual(['finishing']);
    await expect.poll(() => workers.filter((w) => w.url.includes('transcribe.worker') && !w.closed).length).toBe(0);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('import-form')).toHaveCount(0);
  });
});
