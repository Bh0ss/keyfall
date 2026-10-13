import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Origin of the app under test, same rules as playwright.config.ts (live URL, preview, or dev server). */
export const ORIGIN = new URL(
  process.env.KEYFALL_BASE_URL?.trim() || (process.env.KEYFALL_PREVIEW === '1' ? 'http://localhost:4173' : 'http://localhost:5173'),
).origin;

/** The bundled Mary arrangement, read from the repo so oracles do not depend on how the server exposes song files. */
export function maryXml(): string {
  return readFileSync(new URL('../src/songs/mary-had-a-little-lamb.musicxml', import.meta.url), 'utf8');
}

/** Fill the profile form (the picker shows it first when no profile exists) and wait for the app. */
export async function createProfile(page: Page, name: string, level: 'beginner' | 'advanced' = 'beginner') {
  const newProfile = page.getByTestId('profile-new');
  if (await newProfile.isVisible()) await newProfile.click();
  await page.getByTestId('profile-name').fill(name);
  await page.getByLabel(level === 'advanced' ? 'Advanced' : 'Beginner').check();
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('app-ready')).toBeAttached();
}

/**
 * Open a URL as a signed-in player: if the profile picker is in the way (a fresh browser
 * context has no profile), create one first. Drop-in for page.goto in tests that are not about profiles.
 */
export async function gotoApp(page: Page, url: string, name = 'Tester') {
  await page.goto(url);
  const ready = page.getByTestId('app-ready');
  const picker = page.getByTestId('profile-picker');
  await ready.or(picker).first().waitFor({ state: 'attached' });
  if (await picker.isVisible()) await createProfile(page, name);
}

/** Switch profile from the avatar button on Home and pick (or create) the named one. */
export async function switchTo(page: Page, name: string, level: 'beginner' | 'advanced' = 'beginner') {
  await page.goto('./?debug=1#/');
  await page.getByTestId('switch-profile').click();
  await expect(page.getByTestId('profile-picker')).toBeVisible();
  const existing = page.getByRole('button', { name: `Play as ${name}` });
  if (await existing.count()) await existing.click();
  else await createProfile(page, name, level);
  await expect(page.getByTestId('app-ready')).toBeAttached();
}

/** Read a row set straight out of IndexedDB (the app's source of truth) from the page. */
export async function readStore<T = unknown>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('keyfall');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(name, 'readonly');
          const all = tx.objectStore(name).getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error);
        };
      }),
    store,
  ) as Promise<T[]>;
}

/**
 * Replace Web MIDI with an empty device list. Chromium on a Mac with the piano paired sees the real
 * FP-30X, and any note played on it reaches every test page (it answered Learn prompts wrongly and
 * hung the Learn tests whenever the piano was on). Call before the first navigation.
 */
export async function isolateMidi(page: Page) {
  await page.addInitScript(() => {
    const empty = { inputs: new Map(), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(empty), configurable: true });
  });
}

/** Mark Learn units as passed for the first profile in the browser database (units open in order, so a late unit needs the earlier ones). */
export async function seedPassed(page: Page, unitIds: string[]) {
  const [profile] = await readStore<{ id: string }>(page, 'profiles');
  await page.evaluate(
    ({ pid, ids }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keyfall');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('learnProgress', 'readwrite');
          const now = Date.now();
          for (const unitId of ids) {
            tx.objectStore('learnProgress').put({
              id: `${pid}:${unitId}`, profileId: pid, unitId, passed: true, passedAt: now, bestCorrect: 20, bestTotal: 20,
              attempts: 1, lessonsDone: [], updatedAt: now,
            });
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { pid: profile!.id, ids: unitIds },
  );
}

/** Learn path order by stable unit id. "Moving around the keyboard" (unit-11) sits after Both hands (unit-8). */
export const UNIT_ORDER = ['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7', 'unit-8', 'unit-11', 'unit-9', 'unit-10'];

/** Every unit id before this one on the path: what a player who reached it has passed. */
export const idsBefore = (id: string) => UNIT_ORDER.slice(0, UNIT_ORDER.indexOf(id));

/** The number shown for a unit: its position on the path. */
export const displayNumber = (id: string) => UNIT_ORDER.indexOf(id) + 1;
