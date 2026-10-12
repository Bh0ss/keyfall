import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// The sync specs sign in to Supabase. Read only the keys they need from the gitignored env files into the
// environment (never printed, never written anywhere); real environment variables win over the files.
const ENV_KEYS = /^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|TEST_USER_[12]_(EMAIL|PASSWORD))$/;
for (const file of ['.env.local', '.env.test.local']) {
  if (!existsSync(file)) continue;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (ENV_KEYS.test(k) && v && process.env[k] === undefined) process.env[k] = v;
  }
}

/**
 * Three ways to run:
 *  - default: the dev server on :5173 (everything).
 *  - KEYFALL_PREVIEW=1: `vite preview` of the production build on :4173 (no dev-only behaviour; pages need ?debug=1).
 *  - KEYFALL_BASE_URL=<url>: a live deployment, no local server. Only the phone project runs against it
 *    (the older specs address the dev server by absolute path).
 */
const live = process.env.KEYFALL_BASE_URL?.trim();
const preview = process.env.KEYFALL_PREVIEW === '1';
const withSlash = (u: string) => (u.endsWith('/') ? u : `${u}/`);
const baseURL = live ? withSlash(live) : preview ? 'http://localhost:4173/keyfall/' : 'http://localhost:5173/keyfall/';

// A recent iPhone turned sideways. Web MIDI only exists in Chromium, so run the iPhone shape on Chromium.
const iphone = { ...devices['iPhone 15 landscape'], defaultBrowserType: 'chromium' as const };

export default defineConfig({
  testDir: 'e2e',
  // Traces, videos and screenshots can capture typed passwords: keep them off.
  use: { baseURL, trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone\.spec\.ts/ },
    { name: 'iphone-landscape', use: iphone, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: live
    ? undefined
    : {
        command: preview ? 'npm run preview' : 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
      },
});
