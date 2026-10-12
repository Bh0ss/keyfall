import { defineConfig, devices } from '@playwright/test';

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
  use: { baseURL },
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
