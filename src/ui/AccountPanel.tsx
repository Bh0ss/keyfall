import { useState, type FormEvent } from 'react';
import { chooseStartFresh, chooseUpload, signIn, signOut, syncNow, useSync, type SyncState } from '../sync/controller';
import { hrefFor } from './useRoute';

export function syncLabel(s: SyncState): string {
  if (s.choice) return 'Choose what to do with this device\'s data';
  if (s.phase === 'syncing') return 'Syncing…';
  if (s.phase === 'error') return 'Sync paused';
  if (s.lastSyncedAt) return 'Synced';
  return 'Signed in';
}

/** Email + password sign-in for the household account, and the sync status once signed in. */
export function AccountPanel({ compact = false }: { compact?: boolean }) {
  const s = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!s.configured) {
    return (
      <section className="card" data-testid="account-card" data-state="unconfigured">
        <h2>Account</h2>
        <p className="muted">Sync is not set up in this build. Keyfall works on this device only.</p>
      </section>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
    else setPassword('');
  };

  if (s.auth === 'signedIn' && s.choice) {
    return (
      <section className="card" data-testid="account-card" data-state="choose">
        <h2>This device has data</h2>
        <p>
          You signed in as <strong data-testid="account-email">{s.email}</strong>, but the scores, profiles and songs on this device have never been synced to that account.
          Nothing is uploaded until you choose.
        </p>
        <div className="row">
          <button className="btn" data-primary type="button" data-testid="choice-upload" onClick={() => void chooseUpload()}>
            Upload this device&apos;s data to {s.email}
          </button>
          <button className="btn" type="button" data-testid="choice-fresh" onClick={() => void chooseStartFresh()}>
            Start fresh (discard local data on this device)
          </button>
          <button className="btn" type="button" data-testid="choice-cancel" onClick={() => void signOut()}>
            Cancel (sign out)
          </button>
        </div>
      </section>
    );
  }

  if (s.auth === 'signedIn') {
    return (
      <section className="card" data-testid="account-card" data-state="signed-in">
        <h2>Account</h2>
        <p>
          Signed in as <strong data-testid="account-email">{s.email}</strong>. Scores, progress and imported songs sync to your other devices.
        </p>
        <p className="muted" role="status" data-testid="sync-status" data-phase={s.phase}>
          {syncLabel(s)}
          {s.lastSyncedAt ? ` · last ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : ''}
          {s.phase === 'error' && s.error ? ` · ${s.error}. Your data is safe on this device and will retry.` : ''}
        </p>
        <div className="row">
          <button className="btn" type="button" data-testid="sync-now" disabled={s.phase === 'syncing'} onClick={() => void syncNow()}>
            Sync now
          </button>
          <button className="btn" type="button" data-testid="sign-out" onClick={() => void signOut()}>
            Sign out
          </button>
          <button className="btn" type="button" data-testid="sign-out-clear" onClick={() => void signOut(true)}>
            Sign out and clear local data on this device
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="card" data-testid="account-card" data-state="signed-out" onSubmit={(e) => void submit(e)}>
      <h2>{compact ? 'Sync across devices' : 'Sign in to sync'}</h2>
      <p className="muted">Optional. Sign in with the household account to share scores, progress and imported songs between devices. Keyfall works without it.</p>
      <label className="field stack">
        Email
        <input className="text-input" type="email" data-testid="account-email-input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field stack">
        Password
        <input className="text-input" type="password" data-testid="account-password-input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && (
        <p role="alert" className="form-error" data-testid="account-error">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn" data-primary type="submit" data-testid="sign-in" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}

/** Small status chip for Home: links to Settings, where the account lives. */
export function AccountChip() {
  const s = useSync();
  if (!s.configured) return null;
  const signedIn = s.auth === 'signedIn';
  return (
    <a
      className="chip"
      href={hrefFor.settings()}
      data-testid="account-chip"
      data-tone={signedIn ? (s.phase === 'error' ? 'warn' : 'ok') : 'idle'}
      title={signedIn ? (s.email ?? undefined) : 'Sign in to sync'}
    >
      {signedIn ? syncLabel(s) : 'Not syncing'}
    </a>
  );
}
