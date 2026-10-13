import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clampStep, REPLAY_TOUR, SEEN_TOUR, tourDue } from '../src/help/tour';
import { TOUR_STEPS } from '../src/help/content';
import { KeyfallDb } from '../src/storage/db';
import { createProfile, defaultSettings, saveSettings } from '../src/storage/profiles';
import { fromRemote, toRemote } from '../src/sync/tables';

let n = 0;
let db: KeyfallDb;
beforeEach(() => {
  db = new KeyfallDb(`tour-${++n}`);
});

describe('tips tour', () => {
  it('is due for every new profile, Beginner or Advanced', () => {
    expect(tourDue(defaultSettings('beginner'))).toBe(true);
    expect(tourDue(defaultSettings('advanced'))).toBe(true);
  });

  it('is not due once seen, and due again after a replay', () => {
    const seen = { ...defaultSettings('beginner'), ...SEEN_TOUR };
    expect(tourDue(seen)).toBe(false);
    expect(tourDue({ ...seen, ...REPLAY_TOUR })).toBe(true);
  });

  it('steps stay inside the tour', () => {
    expect(clampStep(-1)).toBe(0);
    expect(clampStep(0)).toBe(0);
    expect(clampStep(TOUR_STEPS.length)).toBe(TOUR_STEPS.length - 1);
    expect(clampStep(2)).toBe(2);
  });

  it('the seen flag is a profile setting: it persists, and it travels with the profile row to the other devices', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    expect(tourDue(p.settings)).toBe(true);
    const seen = await saveSettings(db, p.id, SEEN_TOUR);
    expect(tourDue((await db.profiles.get(p.id))!.settings)).toBe(false);
    const there = fromRemote(toRemote('profiles', seen as never));
    expect(tourDue((there as unknown as typeof seen).settings)).toBe(false);
  });

  it('never touches Learn progress, so it cannot count as a practice day', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    await saveSettings(db, p.id, SEEN_TOUR);
    expect(await db.learnProgress.count()).toBe(0);
  });
});
