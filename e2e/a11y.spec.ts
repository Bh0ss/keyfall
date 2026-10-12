import { expect, test, type Page } from '@playwright/test';
import { gotoApp, isolateMidi } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

/** Every visible control on the page that is smaller than 44 x 44 CSS px, or has no accessible name. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        const label = el.labels?.[0]?.textContent?.trim();
        if (label) return label;
      }
      return (el.textContent ?? '').trim() || el.getAttribute('title') || '';
    };
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=switch]')) {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || el.closest('[aria-hidden=true]')) continue;
      let box = el.getBoundingClientRect();
      // A visually hidden input inside a label button is operated through its label: measure the label.
      const host = el.closest('label, .btn');
      if (host && box.width < 2) box = host.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const label = `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''} "${nameOf(el).slice(0, 30)}"`;
      if (!nameOf(el)) problems.push(`no accessible name: ${label}`);
      // Links inside a sentence are exempt (WCAG 2.5.8 inline exception).
      const inline = el.tagName === 'A' && !!el.closest('p, .muted, .small-text, .setup-note') && style.display === 'inline';
      if (!inline && (box.width < 43.5 || box.height < 43.5)) problems.push(`${Math.round(box.width)}x${Math.round(box.height)}: ${label}`);
    }
    return problems;
  });
}

const SCREENS: [string, string, string][] = [
  ['Home', '/#/', 'home'],
  ['Songs', '/#/songs', 'song-mary-had-a-little-lamb'],
  ['Learn path', '/#/learn', 'learn-screen'],
  ['Unit', '/#/learn/unit-1', 'unit-detail'],
  ['Stats', '/#/stats', 'stats'],
  ['Settings', '/#/settings', 'latency-card'],
  ['Keyboard check', '/#/keyboard', ''],
  ['Import', '/#/import', 'import-file'],
  ['Play setup', '/#/play/mary-had-a-little-lamb', 'play-ready'],
];

test.describe('accessibility', () => {
  test('every control on every main screen is at least 44 px and has a name', async ({ page }) => {
    await gotoApp(page, '/#/');
    for (const [name, url, ready] of SCREENS) {
      await page.goto(url);
      if (ready) await expect(page.getByTestId(ready).first()).toBeAttached();
      await page.waitForTimeout(350); // the screen's fade-in
      expect(await audit(page), name).toEqual([]);
    }
  });

  test('a lesson prompt and the Results screen meet the same bar', async ({ page }) => {
    await gotoApp(page, '/#/learn/unit-1/keys');
    await expect(page.getByTestId('learn-prompt')).toBeVisible();
    await page.waitForTimeout(350);
    expect(await audit(page), 'lesson').toEqual([]);
    await page.goto('/#/play/mary-had-a-little-lamb');
    await page.evaluate(() => window.__keyfall!.autoplay({ wrongKeyRate: 0.3, seed: 2 }));
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
    expect(await audit(page), 'end card').toEqual([]);
    await page.getByTestId('see-results').click();
    await expect(page.getByTestId('results')).toBeVisible();
    await page.waitForTimeout(350);
    expect(await audit(page), 'results').toEqual([]);
  });

  test('every focused control shows a focus ring and Tab reaches the content in page order', async ({ page }) => {
    await gotoApp(page, '/#/');
    await expect(page.getByTestId('home')).toBeVisible();
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return { tag: el.tagName, name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, y: Math.round(el.getBoundingClientRect().top), x: Math.round(el.getBoundingClientRect().left) };
      });
      expect(info.ring, `focus ring on ${info.name}`).toBe(true);
      seen.push(info.name);
    }
    // The skip link comes first, then the rail (Home, Learn, Play, Stats, Settings), then the page.
    expect(seen[0]).toBe('Skip to content');
    expect(seen.slice(1, 6).map((n) => n.replace(/\s+/g, ' '))).toEqual(['Home', 'Learn', 'Play', 'Stats', 'Settings']);
  });

  test('the skip link moves focus into the page, and the page has one main landmark and one h1', async ({ page }) => {
    await gotoApp(page, '/#/stats');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
    expect(await page.locator('main').count()).toBe(1);
    expect(await page.locator('h1').count()).toBe(1);
    await expect(page.locator('nav[aria-label=Main]')).toHaveCount(1);
  });

  test('text is readable from a metre away: no body text under 13 px, nothing clipped sideways', async ({ page }) => {
    await gotoApp(page, '/#/');
    await page.waitForTimeout(350);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('main *')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 13) out.push(`${size}px ${el.textContent!.trim().slice(0, 30)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test('contrast: text and muted text meet 4.5:1 on their surfaces', async ({ page }) => {
    await gotoApp(page, '/#/');
    const ratio = await page.evaluate(() => {
      const lum = (hex: string) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
      };
      const cr = (a: string, b: string) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const pairs: Record<string, number> = {};
      for (const fg of ['--text', '--muted', '--accent', '--accent-hi', '--right-hand', '--correct', '--miss']) {
        for (const bg of ['--bg', '--surface', '--raised']) pairs[`${fg} on ${bg}`] = cr(css(fg), css(bg));
      }
      pairs['accent-ink on accent'] = cr(css('--accent-ink'), css('--accent'));
      return pairs;
    });
    for (const [pair, r] of Object.entries(ratio)) expect(r, pair).toBeGreaterThanOrEqual(4.5);
  });
});
