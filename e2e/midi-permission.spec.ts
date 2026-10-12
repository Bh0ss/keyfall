import { expect, test, type Browser } from '@playwright/test';

const ORIGIN = 'http://localhost:5173';

type Permission = 'midi' | 'midi-sysex';

interface MidiProbe {
  state: PermissionState;
  ok: boolean;
  error?: string;
  isMap?: boolean;
}

async function probe(browser: Browser, grants: Permission[], sysex: boolean): Promise<MidiProbe> {
  const context = await browser.newContext();
  try {
    if (grants.length > 0) await context.grantPermissions(grants, { origin: ORIGIN });
    const page = await context.newPage();
    await page.goto('/keyfall/');
    return await page.evaluate(async (sysexFlag) => {
      const state = (await navigator.permissions.query({ name: 'midi' as PermissionName })).state;
      try {
        const access = await navigator.requestMIDIAccess({ sysex: sysexFlag });
        return {
          state,
          ok: true,
          isMap: typeof access.inputs.get === 'function' && typeof access.inputs.size === 'number',
        };
      } catch (e) {
        return { state, ok: false, error: String(e) };
      }
    }, sysex);
  } finally {
    await context.close();
  }
}

// Finding: on this Chromium, context.grantPermissions(['midi']) alone does NOT make
// requestMIDIAccess() resolve (it rejects with NotAllowedError even though the
// permissions API reports 'granted'). Both 'midi' and 'midi-sysex' must be granted.
const GRANT: Permission[] = ['midi', 'midi-sysex'];

test('with midi granted, requestMIDIAccess resolves to a MIDIAccess', async ({ browser }) => {
  const result = await probe(browser, GRANT, false);
  expect(result, JSON.stringify(result)).toMatchObject({ state: 'granted', ok: true, isMap: true });
});

test('without a grant, midi is not granted and requestMIDIAccess rejects', async ({ browser }) => {
  const result = await probe(browser, [], false);
  expect(result.state).not.toBe('granted');
  expect(result.ok).toBe(false);
  expect(result.error).toContain('NotAllowedError');
});

test('sysex request fails without grant and succeeds with it', async ({ browser }) => {
  const denied = await probe(browser, [], true);
  expect(denied.ok).toBe(false);
  const granted = await probe(browser, GRANT, true);
  expect(granted, JSON.stringify(granted)).toMatchObject({ ok: true, isMap: true });
});
