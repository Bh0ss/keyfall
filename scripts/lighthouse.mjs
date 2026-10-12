// Lighthouse accessibility audit of the production build: `npm run lighthouse`.
// Builds nothing itself (the npm script builds first). Serves dist with `vite preview`, opens it in headless
// Chromium (Playwright's), creates a profile so the audited screens are the real ones and not the profile
// picker, then runs Lighthouse (accessibility category only) against that same browser, one URL at a time.
// Home and Play must score at least 90 (CLAUDE.md Phase 9); the other screens are reported and held to the same bar.
import { spawn } from 'node:child_process';
import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';

const PORT = 4174;
const DEBUG_PORT = 9333;
const BASE = `http://localhost:${PORT}/keyfall/`;
const MIN = 90;
const REQUIRED = new Set(['Home', 'Play']);
const TARGETS = [
  ['Home', '#/'],
  ['Play', '#/play/mary-had-a-little-lamb'],
  ['Songs', '#/songs'],
  ['Learn', '#/learn'],
  ['Stats', '#/stats'],
  ['Settings', '#/settings'],
  ['Credits', '#/credits'],
];

async function waitFor(url, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not come up`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
let failed = false;
try {
  await waitFor(BASE);
  browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${DEBUG_PORT}`] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}#/`);
  await page.getByTestId('profile-name').or(page.getByTestId('profile-new')).first().waitFor();
  if (await page.getByTestId('profile-new').isVisible()) await page.getByTestId('profile-new').click();
  await page.getByTestId('profile-name').fill('Audit');
  await page.getByTestId('profile-save').click();
  await page.getByTestId('app-ready').waitFor({ state: 'attached' });

  console.log(`Lighthouse accessibility, production build, minimum ${MIN} on ${[...REQUIRED].join(' and ')}\n`);
  for (const [name, hash] of TARGETS) {
    // Same tab throughout, so the chosen profile (kept in sessionStorage) stays active across Lighthouse's navigations.
    await page.goto(`${BASE}${hash}`);
    await page.getByTestId('app-ready').waitFor({ state: 'attached' });
    // Headless Chromium sometimes reports NO_FCP for a tab it did not just paint; bring it forward and retry.
    let result;
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.bringToFront();
      result = await lighthouse(
        `${BASE}${hash}`,
        { port: DEBUG_PORT, output: 'json', logLevel: 'error', onlyCategories: ['accessibility'], disableStorageReset: true },
        {
          extends: 'lighthouse:default',
          settings: { formFactor: 'desktop', screenEmulation: { disabled: true }, throttlingMethod: 'provided', onlyCategories: ['accessibility'] },
        },
      );
      if (!result.lhr.runtimeError) break;
    }
    const lhr = result.lhr;
    if (process.env.LH_DEBUG) for (const pg of context.pages()) console.log('  tab', pg.url(), (await pg.locator('body').innerText()).slice(0, 80).replace(/\n/g, ' | '));
    if (lhr.runtimeError) console.log(`  runtime error: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
    const score = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
    const bad = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual');
    const nodes = lhr.audits['dom-size']?.numericValue;
    console.log(`${name.padEnd(9)} ${String(score).padStart(3)}  ${score >= MIN ? 'ok' : 'BELOW ' + MIN}${REQUIRED.has(name) ? '  (required)' : ''}${nodes ? `  [${nodes} DOM nodes]` : ''}`);
    for (const a of bad) console.log(`           - ${a.id}: ${a.title} (${a.details?.items?.length ?? 0} items)`);
    if (score < MIN) failed = true;
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser?.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
