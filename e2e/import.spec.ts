import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { FIXTURE_NOTE_COUNT, MELODY, musicXml, mxl, oneTrackMidi, singleStaffMusicXml, twoTrackMidi, zipBomb } from '../tests/fixtures/generate';
import { createProfile, gotoApp, isolateMidi, ORIGIN, readStore, switchTo } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

interface Fixture {
  name: string;
  file: string;
  mime: string;
  bytes: () => Uint8Array | string;
  /** Right and left hand note counts at the default split. */
  hands: [number, number];
  /** Whether the sheet is generated (labelled approximate). */
  approximate: boolean;
}

const FIXTURES: Fixture[] = [
  { name: 'one-track MIDI', file: 'frere-one-track.mid', mime: 'audio/midi', bytes: oneTrackMidi, hands: [MELODY.length, 2], approximate: true },
  { name: 'two-track MIDI', file: 'frere-two-track.midi', mime: 'audio/midi', bytes: twoTrackMidi, hands: [MELODY.length, 2], approximate: true },
  { name: 'MusicXML', file: 'frere.musicxml', mime: 'application/vnd.recordare.musicxml+xml', bytes: musicXml, hands: [MELODY.length, 4], approximate: false },
  { name: 'MusicXML (.xml, one staff)', file: 'frere-one-staff.xml', mime: 'text/xml', bytes: singleStaffMusicXml, hands: [MELODY.length, 4], approximate: false },
  { name: 'compressed MusicXML (.mxl)', file: 'frere.mxl', mime: 'application/vnd.recordare.musicxml', bytes: mxl, hands: [MELODY.length, 4], approximate: false },
];

const buffer = (f: Fixture) => Buffer.from(f.bytes() as Uint8Array | string);

async function pickFile(page: Page, name: string, data: Buffer, mimeType = 'application/octet-stream') {
  await page.getByTestId('import-file').setInputFiles({ name, mimeType, buffer: data });
}

/** Import a fixture through the UI and land on the song list. Returns the imported song id. */
async function importThroughUi(page: Page, f: Fixture): Promise<string> {
  await gotoApp(page, './?debug=1#/import');
  await pickFile(page, f.file, buffer(f), f.mime);
  const form = page.getByTestId('import-form');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('import-title')).toHaveValue(/Frere Jacques/);
  await expect(page.getByTestId('import-hand-counts')).toHaveText(`Right hand ${f.hands[0]} notes · Left hand ${f.hands[1]} notes`);
  await page.getByTestId('import-save').click();
  await expect(page).toHaveURL(/#\/songs$/);
  const card = page.getByTestId(/^song-imp-/);
  await expect(card).toHaveCount(1);
  const testId = (await card.getAttribute('data-testid'))!;
  return testId.replace(/^song-/, '');
}

async function playToEnd(page: Page, songId: string, total: number) {
  await page.goto(`./?debug=1#/play/${songId}`);
  await expect(page.getByTestId('play-ready')).toBeVisible();
  await page.getByTestId('mode-full').click();
  const result = await page.evaluate(() => window.__keyfall!.autoplay({}));
  await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
  const hits = (await page.getByTestId('summary-hits').textContent())!.match(/(\d+) of (\d+)/)!;
  expect(Number(hits[2])).toBe(total);
  expect(hits[1]).toBe(hits[2]);
  expect(result.presses).toBe(total);
  await expect(page.getByTestId('summary-accuracy')).toHaveText('100.0%');
}

test.describe('each fixture imports through the file input and plays to the end', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const f of FIXTURES) {
    test(f.name, async ({ page }) => {
      test.setTimeout(90_000);
      const id = await importThroughUi(page, f);
      const card = page.getByTestId(`song-${id}`);
      await expect(card).toContainText('Frere Jacques');
      await expect(page.getByTestId(`song-imported-${id}`)).toBeVisible();
      await playToEnd(page, id, f.hands[0] + f.hands[1]);
    });
  }
});

test.describe('sheet view of an import', () => {
  test('MIDI import renders a score labelled approximate', async ({ page }) => {
    test.setTimeout(90_000);
    const id = await importThroughUi(page, FIXTURES[0]!);
    await page.goto(`./?debug=1#/play/${id}`);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('view-sheet').click();
    const sheet = page.getByTestId('sheet');
    await expect(sheet).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(sheet.locator('svg').first()).toBeVisible();
    await expect(sheet).toHaveAttribute('data-measures', '4');
    await expect(sheet).toHaveAttribute('data-mapped', String(FIXTURE_NOTE_COUNT));
    await expect(page.getByTestId('sheet-cursor')).toBeVisible();
    await expect(page.getByTestId('sheet-approximate')).toBeVisible();
    await expect(page.getByTestId('sheet-approximate')).toContainText('Approximate');
  });

  test('MusicXML import shows its own score without the approximate label', async ({ page }) => {
    test.setTimeout(90_000);
    const id = await importThroughUi(page, FIXTURES[2]!);
    await page.goto(`./?debug=1#/play/${id}`);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('view-sheet').click();
    const sheet = page.getByTestId('sheet');
    await expect(sheet).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(sheet).toHaveAttribute('data-measures', '4');
    await expect(page.getByTestId('sheet-approximate')).toHaveCount(0);
  });
});

test.describe('import screen: hands, difficulty, metadata', () => {
  test('one track splits at middle C and the split point is adjustable', async ({ page }) => {
    await gotoApp(page, './?debug=1#/import');
    await pickFile(page, 'a.mid', Buffer.from(oneTrackMidi()));
    await expect(page.getByTestId('import-split-groups')).toHaveCount(0);
    await expect(page.getByTestId('import-split-pitch')).toBeChecked();
    await expect(page.getByTestId('import-split')).toHaveValue('60');
    await expect(page.getByTestId('import-split-name')).toHaveText('C4');
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 14 notes · Left hand 2 notes');
    await page.getByTestId('import-split').fill('65');
    await expect(page.getByTestId('import-split-name')).toHaveText('F4');
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 4 notes · Left hand 12 notes');
    await page.getByTestId('import-split').fill('21');
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 16 notes · Left hand 0 notes');
    await page.getByRole('button', { name: 'Middle C' }).click();
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 14 notes · Left hand 2 notes');
  });

  test('two tracks split by track by default, with the pitch split as an option', async ({ page }) => {
    await gotoApp(page, './?debug=1#/import');
    await pickFile(page, 'a.mid', Buffer.from(twoTrackMidi()));
    await expect(page.getByTestId('import-split-groups')).toBeChecked();
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 14 notes · Left hand 2 notes');
    await page.getByTestId('import-split-pitch').check();
    await page.getByTestId('import-split').fill('40');
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 16 notes · Left hand 0 notes');
  });

  test('title and composer come from the file and can be edited; difficulty is estimated and can be overridden', async ({ page }) => {
    await gotoApp(page, './?debug=1#/import');
    await pickFile(page, 'a.musicxml', Buffer.from(musicXml()));
    await expect(page.getByTestId('import-title')).toHaveValue('Frere Jacques');
    await expect(page.getByTestId('import-composer')).toHaveValue('Traditional');
    await expect(page.getByTestId('import-estimate')).toHaveText(/^Estimated: Level [1-3]$/);
    const estimated = await page.getByTestId('import-level').inputValue();
    await page.getByTestId('import-level').selectOption('expert');
    await expect(page.getByTestId('import-estimate')).toContainText('(you changed it)');
    await page.getByRole('button', { name: 'Use estimate' }).click();
    await expect(page.getByTestId('import-level')).toHaveValue(estimated);
    await page.getByTestId('import-title').fill('My Round');
    await page.getByTestId('import-composer').fill('Me');
    await page.getByTestId('import-level').selectOption('4');
    await page.getByTestId('import-save').click();
    const card = page.getByTestId(/^song-imp-/);
    await expect(card).toContainText('My Round');
    await expect(card).toContainText('Me');
    await expect(card).toContainText('Level 4');
    const [row] = await readStore<{ id: string; updatedAt: number; levelOverridden: boolean; song: { source: string; level: number } }>(page, 'songs');
    expect(row!.id).toMatch(/^imp-/);
    expect(row!.updatedAt).toBeGreaterThan(0);
    expect(row!.levelOverridden).toBe(true);
    expect(row!.song).toMatchObject({ source: 'imported', level: 4 });
  });

  test('a MIDI import says its sheet view is approximate', async ({ page }) => {
    await gotoApp(page, './?debug=1#/import');
    await pickFile(page, 'a.mid', Buffer.from(oneTrackMidi()));
    await expect(page.getByTestId('import-approx-note')).toContainText('approximate');
    await pickFile(page, 'a.musicxml', Buffer.from(musicXml()));
    await expect(page.getByTestId('import-approx-note')).toHaveCount(0);
  });
});

test.describe('imported songs belong to the whole household', () => {
  test('another profile sees, plays and scores an imported song; it survives a reload; stats and results name it', async ({ page }) => {
    test.setTimeout(120_000);
    const id = await importThroughUi(page, FIXTURES[1]!);
    await switchTo(page, 'Second');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId(`song-${id}`)).toContainText('Frere Jacques');
    await page.reload();
    await expect(page.getByTestId(`song-${id}`)).toContainText('Frere Jacques');
    await playToEnd(page, id, FIXTURE_NOTE_COUNT);
    await page.getByTestId('see-results').click();
    await expect(page.getByTestId('results')).toContainText('Frere Jacques');
    await page.goto('./?debug=1#/stats');
    const row = page.getByTestId('stats-best-row');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-song', id);
    await expect(row).toContainText('Frere Jacques');
    // Home lists it too.
    await page.goto('./?debug=1#/');
    await expect(page.getByTestId('home')).toContainText('Frere Jacques');
  });

  test('editing keeps the song and its scores; removing hides it but Stats still names it', async ({ page }) => {
    test.setTimeout(120_000);
    const id = await importThroughUi(page, FIXTURES[0]!);
    await playToEnd(page, id, FIXTURE_NOTE_COUNT);
    await page.goto('./?debug=1#/songs');
    await page.getByTestId(`song-edit-${id}`).click();
    await expect(page.getByTestId('import-form')).toBeVisible();
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 14 notes · Left hand 2 notes');
    await page.getByTestId('import-split').fill('65');
    await page.getByTestId('import-title').fill('Renamed Round');
    await page.getByTestId('import-save').click();
    await expect(page.getByTestId(`song-${id}`)).toContainText('Renamed Round');
    await page.getByTestId(`song-edit-${id}`).click();
    await expect(page.getByTestId('import-split')).toHaveValue('65');
    await expect(page.getByTestId('import-hand-counts')).toHaveText('Right hand 4 notes · Left hand 12 notes');
    await page.getByTestId('import-delete').click();
    await page.getByTestId('import-delete-confirm').click();
    await expect(page).toHaveURL(/#\/songs$/);
    await expect(page.getByTestId(`song-${id}`)).toHaveCount(0);
    await page.goto('./?debug=1#/stats');
    await expect(page.getByTestId('stats-best-row')).toContainText('Renamed Round');
    await page.goto(`./?debug=1#/play/${id}`);
    await expect(page.getByText('Song not found')).toBeVisible();
  });
});

test.describe('bad files get a friendly message', () => {
  test('garbage, oversize, a zip bomb, wrong type, and an XML file that is not a score', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoApp(page, './?debug=1#/import');
    const error = page.getByTestId('import-error');

    await pickFile(page, 'bad.mid', Buffer.from('this is not a midi file'));
    await expect(error).toContainText('MIDI');
    await expect(page.getByTestId('import-form')).toHaveCount(0);

    await pickFile(page, 'big.mid', Buffer.alloc(11 * 1024 * 1024));
    await expect(error).toContainText('larger than 10 MB');

    await pickFile(page, 'bomb.mxl', Buffer.from(zipBomb(40 * 1024 * 1024)));
    await expect(error).toContainText('expands to more than');

    await pickFile(page, 'song.pdf', Buffer.from('%PDF-1.4'));
    await expect(error).toContainText('.mid, .midi, .musicxml, .xml and .mxl');

    await pickFile(page, 'page.xml', Buffer.from('<html><body>hello</body></html>'));
    await expect(error).toContainText('not a MusicXML score');

    // The screen is still usable: a good file now works.
    await pickFile(page, 'ok.mid', Buffer.from(oneTrackMidi()));
    await expect(page.getByTestId('import-form')).toBeVisible();
    await expect(error).toHaveCount(0);
  });

  test('the input only offers the five accepted types', async ({ page }) => {
    await gotoApp(page, './?debug=1#/import');
    await expect(page.getByTestId('import-file')).toHaveAttribute('accept', '.mid,.midi,.musicxml,.xml,.mxl');
  });

  test('Songs links to Import, and nothing was fetched from the network for a file', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.origin !== ORIGIN) external.push(r.url());
    });
    await gotoApp(page, './?debug=1#/songs');
    await expect(page.getByTestId('import-link')).toHaveText('Add song');
    await page.getByTestId('import-link').click();
    await expect(page.getByTestId('import-screen')).toBeVisible();
    await pickFile(page, 'a.mxl', Buffer.from(mxl()));
    await expect(page.getByTestId('import-form')).toBeVisible();
    await page.getByTestId('import-save').click();
    await expect(page.getByTestId(/^song-imp-/)).toHaveCount(1);
    expect(external).toEqual([]);
  });
});

test('the Add song chooser offers both ways, with help, and the Spotify choice opens the audio flow', async ({ page }) => {
  await gotoApp(page, './?debug=1#/import');
  const file = page.getByTestId('import-choice-file');
  const audio = page.getByTestId('import-choice-audio');
  await expect(file).toHaveText('From a file (MIDI, MusicXML)');
  await expect(file).toHaveAttribute('aria-current', 'page');
  await expect(audio).toHaveText('From Spotify + audio');
  await expect(page.getByTestId('help-import.choose')).toBeVisible();
  await expect(page.getByTestId('import-file')).toBeAttached();
  await audio.click();
  await expect(page).toHaveURL(/#\/add\/audio$/);
  await expect(page.getByTestId('add-audio-screen')).toBeVisible();
});

test('a profile can be created before importing (picker flow)', async ({ page }) => {
  await page.goto('./?debug=1#/import');
  await createProfile(page, 'Importer');
  await expect(page.getByTestId('import-screen')).toBeVisible();
});
