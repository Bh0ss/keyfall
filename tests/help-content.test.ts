import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTROL_HELP, HELP, SETTINGS_PREFERENCE_HELP, TOUR_STEPS } from '../src/help/content';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The data-testid of every button and select in a source file, with template parts (`mode-${id}`) cut to their prefix. */
function controlIds(source: string): string[] {
  const out: string[] = [];
  const re = /<(?:button|select)\b[^<]*?data-testid=(?:"([^"]+)"|\{`([^`]+)`\})/g;
  for (const m of source.matchAll(re)) out.push((m[1] ?? m[2]!).replace(/\$\{[^}]*\}.*$/, ''));
  return out;
}

/** The text between a function's opening line and the next top-level `}` (good enough to fence one component). */
function fn(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end);
}

const play = read('src/ui/PlayScreen.tsx');
const songs = read('src/ui/SongPicker.tsx');
const settings = read('src/ui/SettingsScreen.tsx');

describe('help content', () => {
  it('every entry has a title and plain-language text, and reads cleanly', () => {
    for (const [id, h] of Object.entries(HELP)) {
      expect(h.title.length, id).toBeGreaterThan(2);
      expect(h.text.length, `${id} text`).toBeGreaterThan(20);
      expect(h.text.length, `${id} is short enough for a bubble`).toBeLessThan(420);
      for (const item of h.items ?? []) {
        expect(item.term.length, `${id} term`).toBeGreaterThan(1);
        expect(item.text.length, `${id} item ${item.term}`).toBeGreaterThan(10);
      }
      for (const s of [h.title, h.text, ...(h.items ?? []).flatMap((i) => [i.term, i.text])]) {
        expect(s, id).toBe(s.trim());
        expect(s, `${id} has no em dash`).not.toContain('—');
      }
    }
  });

  it('every control in the Play setup panel has a help entry', () => {
    const ids = controlIds(fn(play, 'SetupPanel'));
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) {
      expect(CONTROL_HELP, `Play setup control "${id}" has no help entry: add it to CONTROL_HELP in src/help/content.ts`).toHaveProperty(id);
      expect(HELP, id).toHaveProperty(CONTROL_HELP[id]!);
    }
  });

  it('every control in the Play setup panel is shown next to its help bubble', () => {
    const panel = fn(play, 'SetupPanel');
    for (const id of new Set(controlIds(panel).map((c) => CONTROL_HELP[c]!))) {
      expect(panel, `${id} is not rendered in SetupPanel`).toContain(`"${id}"`);
    }
  });

  it('the Play setup and Songs controls (sort, hands) have help entries', () => {
    for (const id of controlIds(songs)) {
      expect(CONTROL_HELP, `Songs control "${id}" has no help entry`).toHaveProperty(id);
    }
    expect(controlIds(songs)).toEqual(expect.arrayContaining(['sort-', 'hands-']));
  });

  it('Home: the All songs control sits next to its help bubble', () => {
    const home = read('src/ui/HomeScreen.tsx');
    expect(home).toContain('data-testid="all-songs"');
    expect(home).toContain('<HelpBubble id="home.allSongs" />');
  });

  it('every Settings preference has a help entry', () => {
    const ids = [...settings.matchAll(/<Preference\s+id="([A-Za-z]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const id of ids) {
      expect(SETTINGS_PREFERENCE_HELP, `Settings item "${id}" has no help entry`).toHaveProperty(id);
      expect(HELP, id).toHaveProperty(SETTINGS_PREFERENCE_HELP[id]!);
    }
  });

  it('the Settings cards (About, Latency check, Account, tips tour) have help entries', () => {
    for (const id of ['settings.about', 'settings.latency', 'settings.account', 'settings.tour']) expect(HELP).toHaveProperty(id);
  });

  it('modes: Wait, Practice, Full and Expert are each explained', () => {
    const terms = HELP['play.mode'].items!.map((i) => i.term);
    expect(terms).toEqual(['Wait', 'Practice', 'Full', 'Expert']);
  });

  it('Results terms: the four grades with their windows, the score, accuracy and stars, streak, XP, missed bars and the board', () => {
    expect(HELP['results.timing'].items!.map((i) => i.term)).toEqual(['Perfect', 'Great', 'Good', 'Miss']);
    expect(HELP['results.timing'].items![0]!.text).toContain('50');
    for (const id of ['results.score', 'results.accuracy', 'results.streak', 'results.xp', 'results.missed', 'results.practice', 'results.board']) {
      expect(HELP).toHaveProperty(id);
    }
    expect(HELP['results.accuracy'].text).toMatch(/70.*85.*95/);
  });

  it('Learn: the pass rule (18 of 20) and the review rule (3 in a row) are stated', () => {
    expect(HELP['learn.pass'].text).toMatch(/20 .*18/);
    expect(HELP['learn.review'].text).toMatch(/3 .*in a row/);
  });

  it('the shift marker and the shaded keys are explained, with the drill', () => {
    expect(HELP['play.shiftMarker'].text).toMatch(/dashed/i);
    expect(HELP['play.shiftMarker'].text).toMatch(/shaded/i);
    expect(HELP).toHaveProperty('play.drill');
  });

  it('every help id is used by a bubble somewhere, and every bubble names a real entry', () => {
    const files = ['HomeScreen', 'PlayScreen', 'SongPicker', 'SettingsScreen', 'ResultsScreen', 'AccountPanel', 'learn/UnitDetail', 'AddAudioScreen', 'ImportScreen'].map((f) => read(`src/ui/${f}.tsx`));
    const all = files.join('\n') + read('src/help/content.ts');
    const direct = new Set([...all.matchAll(/<HelpBubble\s+id="([a-zA-Z.]+)"/g)].map((m) => m[1]!));
    const mapped = new Set([...Object.values(CONTROL_HELP), ...Object.values(SETTINGS_PREFERENCE_HELP)]);
    for (const id of direct) expect(HELP, `<HelpBubble id="${id}"> has no entry`).toHaveProperty(id);
    for (const id of Object.keys(HELP)) expect(direct.has(id) || mapped.has(id as never), `${id} is never shown`).toBe(true);
  });
});

describe('tips tour content', () => {
  it('has a handful of steps, each with a title and text, and covers piano keys, modes, the highway marker, results and the (i) buttons', () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(8);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.text.length).toBeGreaterThan(30);
    }
    const all = TOUR_STEPS.map((s) => s.text).join(' ');
    for (const word of ['A0', 'Wait', 'dashed', 'Results', '(i)', 'Settings']) expect(all, word).toContain(word);
  });
});
