import { useSyncExternalStore } from 'react';
import { getDb } from '../storage/db';
import { migrateLegacyLatency } from '../storage/migrate';
import { createProfile, listProfiles, saveSettings, updateProfile, type ProfileInput } from '../storage/profiles';
import type { Profile, ProfileSettings } from '../storage/types';

export interface ProfileState {
  status: 'loading' | 'ready' | 'error';
  profiles: Profile[];
  /** The profile playing in this tab session; null shows the picker. */
  activeId: string | null;
  error?: string;
}

const SESSION_KEY = 'keyfall.session.profile';

function sessionGet(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function sessionSet(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Blocked storage: the picker just shows again on reload.
  }
}

let state: ProfileState = { status: 'loading', profiles: [], activeId: null };
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;

function set(next: Partial<ProfileState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Open the database, move Phase 2 latency data over once, load the profiles. Safe to call twice. */
export function initProfiles(): Promise<void> {
  started ??= (async () => {
    try {
      const db = getDb();
      let storage: Storage | undefined;
      try {
        storage = localStorage;
      } catch {
        storage = undefined;
      }
      await migrateLegacyLatency(db, storage);
      const profiles = await listProfiles(db);
      const remembered = sessionGet();
      set({ status: 'ready', profiles, activeId: profiles.some((p) => p.id === remembered) ? remembered : null });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return started;
}

async function reload(): Promise<void> {
  set({ profiles: await listProfiles(getDb()) });
}

export const profiles = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: (): ProfileState => state,
  select(id: string): void {
    sessionSet(id);
    set({ activeId: id });
  },
  /** Back to the picker (the avatar button on Home). */
  switchProfile(): void {
    sessionSet(null);
    set({ activeId: null });
  },
  /** Re-read the profiles after sync changed storage. A profile that vanished drops back to the picker. */
  async refresh(): Promise<void> {
    const list = await listProfiles(getDb());
    set({ profiles: list, activeId: list.some((p) => p.id === state.activeId) ? state.activeId : null });
  },
  async create(input: ProfileInput): Promise<Profile> {
    const p = await createProfile(getDb(), input);
    await reload();
    return p;
  },
  async update(id: string, patch: Partial<ProfileInput>): Promise<void> {
    await updateProfile(getDb(), id, patch);
    await reload();
  },
  /** Remember a play setting on the profile. The in-memory copy updates at once. */
  async saveSettings(id: string, patch: Partial<ProfileSettings>): Promise<void> {
    const cur = state.profiles.find((p) => p.id === id);
    if (cur) set({ profiles: state.profiles.map((p) => (p.id === id ? { ...p, settings: { ...p.settings, ...patch } } : p)) });
    await saveSettings(getDb(), id, patch);
  },
};

export function useProfiles(): ProfileState {
  return useSyncExternalStore(profiles.subscribe, profiles.getSnapshot);
}

/** The active profile. Only call under the ProfileGate, which guarantees one. */
export function useActiveProfile(): Profile {
  const s = useProfiles();
  const p = s.profiles.find((x) => x.id === s.activeId);
  if (!p) throw new Error('No active profile');
  return p;
}
