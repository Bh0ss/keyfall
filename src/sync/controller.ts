import { useSyncExternalStore } from 'react';
import { loadLibrary } from '../songs/library';
import { getDb } from '../storage/db';
import { profiles } from '../ui/profileStore';
import { getClient, syncConfigured } from './client';
import { syncOnce } from './engine';
import { supabaseRemote } from './remote';
import { confirmUpload, discardLocalData, resolveSignIn } from './owner';
import { SYNC_TABLES } from './tables';

export const SYNC_INTERVAL_MS = 60_000;
const KICK_DELAY_MS = 2_000;

export interface SyncState {
  /** False when the build has no Supabase settings: the app is local-only. */
  configured: boolean;
  auth: 'loading' | 'signedOut' | 'signedIn';
  email: string | null;
  uid: string | null;
  /** True while this device holds data never synced to the signed-in account: nothing syncs until the player chooses. */
  choice: boolean;
  phase: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: number | null;
  error: string | null;
}

let state: SyncState = { configured: syncConfigured(), auth: syncConfigured() ? 'loading' : 'signedOut', email: null, uid: null, choice: false, phase: 'idle', lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();
let started = false;
let running: Promise<void> | null = null;
let kickTimer: number | undefined;

function set(next: Partial<SyncState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Run one pass now (no-op when signed out). Overlapping calls share the pass in flight. */
export function syncNow(): Promise<void> {
  const sb = getClient();
  const uid = state.uid;
  if (!sb || !uid || state.choice) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    set({ phase: 'syncing' });
    try {
      const db = getDb();
      const result = await syncOnce(db, supabaseRemote(sb), uid);
      if (state.uid !== uid) return;
      if (result.applied > 0) {
        await loadLibrary(db);
        await profiles.refresh();
      }
      if (result.errors.length) set({ phase: 'error', error: result.errors[0]! });
      else set({ phase: 'synced', error: null, lastSyncedAt: Date.now() });
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

function kick(): void {
  if (!state.uid) return;
  window.clearTimeout(kickTimer);
  kickTimer = window.setTimeout(() => void syncNow(), KICK_DELAY_MS);
}

function applySession(session: { user: { id: string; email?: string | undefined } } | null): void {
  if (!session) {
    set({ auth: 'signedOut', uid: null, email: null, choice: false, phase: 'idle', error: null });
    return;
  }
  const uid = session.user.id;
  if (state.uid === uid) {
    set({ email: session.user.email ?? null });
    return;
  }
  // Hold sync until we know whether this device's data may go to this account.
  set({ auth: 'signedIn', uid, email: session.user.email ?? null, choice: true, phase: 'idle', error: null });
  void resolveSignIn(getDb(), uid).then((decision) => {
    if (state.uid !== uid) return;
    set({ choice: decision === 'choose' });
    if (decision === 'sync') void syncNow();
  });
}

/** Start auth tracking, change-triggered pushes, the 60 s pull and the back-online retry. Safe to call twice. */
export function initSync(): void {
  if (started) return;
  started = true;
  const sb = getClient();
  if (!sb) return;

  void sb.auth.getSession().then(({ data }) => applySession(data.session));
  // Not awaited inside the callback: supabase-js can deadlock on calls made from within it.
  sb.auth.onAuthStateChange((_event, session) => window.setTimeout(() => applySession(session), 0));

  const db = getDb();
  for (const spec of SYNC_TABLES) {
    db.table(spec.local).hook('creating', () => void kick());
    db.table(spec.local).hook('updating', () => void kick());
  }
  window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
  window.addEventListener('online', () => void syncNow());
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const sb = getClient();
  if (!sb) return 'Sync is not set up in this build.';
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  return error ? error.message : null;
}

/** Choice 1: send this device's data to the signed-in account, then sync normally. */
export async function chooseUpload(): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  await confirmUpload(getDb(), uid);
  set({ choice: false });
  await syncNow();
}

/** Choice 2: throw this device's data away and take the account's. */
export async function chooseStartFresh(): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  await discardLocalData(getDb(), uid);
  await loadLibrary(getDb());
  await profiles.refresh();
  set({ choice: false });
  await syncNow();
}

/** Choice 3 (and plain sign-out): leave the account. With `clearLocal`, also wipe this device (shared devices). */
export async function signOut(clearLocal = false): Promise<void> {
  const sb = getClient();
  if (sb) await sb.auth.signOut();
  if (clearLocal) {
    await discardLocalData(getDb(), null);
    await loadLibrary(getDb());
    await profiles.refresh();
  }
}

export const sync = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: (): SyncState => state,
};

export function useSync(): SyncState {
  return useSyncExternalStore(sync.subscribe, sync.getSnapshot);
}
