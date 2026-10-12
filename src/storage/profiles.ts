import type { KeyfallDb } from './db';
import { newId } from './db';
import type { PlayerLevel, Profile, ProfileSettings } from './types';

export const PROFILE_COLOURS = ['#F5A524', '#4DA8FF', '#B78CFF', '#6FE3A8', '#FF6B5A', '#FF8FC8'] as const;

export const MAX_NAME_LENGTH = 24;

/** Starting settings: Beginner learns on Wait with labels; Advanced plays Full with labels fading out. */
export function defaultSettings(level: PlayerLevel): ProfileSettings {
  return level === 'advanced'
    ? { labels: 'fade', mode: 'full', speedPct: 70, metronome: false, countIn: true }
    : { labels: 'on', mode: 'wait', speedPct: 70, metronome: false, countIn: true };
}

export interface ProfileInput {
  name: string;
  colour: string;
  level: PlayerLevel;
}

export class ProfileError extends Error {}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new ProfileError('Enter a name.');
  if (n.length > MAX_NAME_LENGTH) throw new ProfileError(`Names can be up to ${MAX_NAME_LENGTH} characters.`);
  return n;
}

async function assertUnique(db: KeyfallDb, name: string, exceptId?: string): Promise<void> {
  const taken = (await db.profiles.toArray()).some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new ProfileError('Someone already has that name.');
}

export async function listProfiles(db: KeyfallDb): Promise<Profile[]> {
  return (await db.profiles.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createProfile(db: KeyfallDb, input: ProfileInput, now = Date.now()): Promise<Profile> {
  const name = cleanName(input.name);
  await assertUnique(db, name);
  const profile: Profile = {
    id: newId(),
    name,
    colour: input.colour,
    level: input.level,
    settings: defaultSettings(input.level),
    createdAt: now,
    updatedAt: now,
  };
  await db.profiles.add(profile);
  return profile;
}

/** Edit name, colour or level. Changing level does not touch the player's own settings. */
export async function updateProfile(db: KeyfallDb, id: string, patch: Partial<ProfileInput>, now = Date.now()): Promise<Profile> {
  const cur = await db.profiles.get(id);
  if (!cur) throw new ProfileError('That profile no longer exists.');
  const name = patch.name === undefined ? cur.name : cleanName(patch.name);
  await assertUnique(db, name, id);
  const next: Profile = { ...cur, name, colour: patch.colour ?? cur.colour, level: patch.level ?? cur.level, updatedAt: now };
  await db.profiles.put(next);
  return next;
}

export async function saveSettings(db: KeyfallDb, id: string, patch: Partial<ProfileSettings>, now = Date.now()): Promise<Profile> {
  // One transaction, so two changes made a few milliseconds apart (two switches in a row) both land.
  return db.transaction('rw', db.profiles, async () => {
    const cur = await db.profiles.get(id);
    if (!cur) throw new ProfileError('That profile no longer exists.');
    const next: Profile = { ...cur, settings: { ...cur.settings, ...patch }, updatedAt: now };
    await db.profiles.put(next);
    return next;
  });
}
