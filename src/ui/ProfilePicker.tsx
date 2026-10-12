import { useState, type FormEvent, type ReactNode } from 'react';
import { MAX_NAME_LENGTH, PROFILE_COLOURS } from '../storage/profiles';
import type { PlayerLevel, Profile } from '../storage/types';
import { profiles, useProfiles } from './profileStore';

const LEVELS: { id: PlayerLevel; label: string; hint: string }[] = [
  { id: 'beginner', label: 'Beginner', hint: 'Starts on Wait mode with note names' },
  { id: 'advanced', label: 'Advanced', hint: 'Starts on Full, labels fade as you learn them' },
];

export function Avatar({ profile, size = 44 }: { profile: Pick<Profile, 'name' | 'colour'>; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, borderColor: profile.colour, fontSize: Math.round(size * 0.38) }}
    >
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ProfileForm({ profile, onDone, onCancel }: { profile?: Profile; onDone: (p?: Profile) => void; onCancel?: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [colour, setColour] = useState(profile?.colour ?? PROFILE_COLOURS[0]);
  const [level, setLevel] = useState<PlayerLevel>(profile?.level ?? 'beginner');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (profile) {
        await profiles.update(profile.id, { name, colour, level });
        onDone();
      } else {
        onDone(await profiles.create({ name, colour, level }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the profile.');
      setBusy(false);
    }
  };

  return (
    <form className="card profile-form" data-testid="profile-form" onSubmit={(e) => void submit(e)}>
      <h2>{profile ? 'Edit profile' : 'New profile'}</h2>
      <label className="field stack">
        Name
        <input
          className="text-input"
          data-testid="profile-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <fieldset className="swatches">
        <legend className="field">Colour</legend>
        {PROFILE_COLOURS.map((c) => (
          <label key={c} className="swatch" style={{ background: c }}>
            <input type="radio" name="colour" value={c} checked={colour === c} aria-label={`Colour ${c}`} onChange={() => setColour(c)} />
          </label>
        ))}
      </fieldset>
      <fieldset className="levels">
        <legend className="field">Player level</legend>
        {LEVELS.map((l) => (
          <label key={l.id} className="level-choice" data-on={level === l.id}>
            <input type="radio" name="level" value={l.id} checked={level === l.id} onChange={() => setLevel(l.id)} />
            <span>
              <strong>{l.label}</strong>
              <small>{l.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="form-error" data-testid="profile-error">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn" data-primary type="submit" data-testid="profile-save" disabled={busy}>
          {profile ? 'Save' : 'Create profile'}
        </button>
        {onCancel && (
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

type View = { name: 'pick' } | { name: 'new' } | { name: 'edit'; id: string };

export function ProfilePicker() {
  const { profiles: list } = useProfiles();
  const [view, setView] = useState<View>({ name: 'pick' });
  const editing = view.name === 'edit' ? list.find((p) => p.id === view.id) : undefined;

  let body: ReactNode;
  if (view.name === 'new' || list.length === 0) {
    body = (
      <ProfileForm
        onDone={(p) => {
          if (p) profiles.select(p.id);
        }}
        onCancel={list.length ? () => setView({ name: 'pick' }) : undefined}
      />
    );
  } else if (editing) {
    body = <ProfileForm profile={editing} onDone={() => setView({ name: 'pick' })} onCancel={() => setView({ name: 'pick' })} />;
  } else {
    body = (
      <ul className="profile-grid" aria-label="Profiles">
        {list.map((p) => (
          <li key={p.id} className="card profile-card" data-testid={`profile-card-${p.name}`}>
            <button className="profile-pick" type="button" onClick={() => profiles.select(p.id)} aria-label={`Play as ${p.name}`}>
              <Avatar profile={p} size={72} />
              <span className="profile-name">{p.name}</span>
              <span className="profile-level">{p.level === 'advanced' ? 'Advanced' : 'Beginner'}</span>
            </button>
            <button className="btn small" type="button" aria-label={`Edit ${p.name}`} onClick={() => setView({ name: 'edit', id: p.id })}>
              Edit
            </button>
          </li>
        ))}
        <li className="card profile-card profile-add">
          <button className="profile-pick" type="button" data-testid="profile-new" onClick={() => setView({ name: 'new' })}>
            <span className="avatar avatar-add" aria-hidden="true" style={{ width: 72, height: 72, fontSize: 32 }}>
              +
            </span>
            <span className="profile-name">New profile</span>
          </button>
        </li>
      </ul>
    );
  }

  return (
    <div className="shell" data-testid="profile-picker">
      <main className="main picker">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Keyfall</div>
            <h1 className="title">{list.length ? "Who's playing?" : 'Welcome to Keyfall'}</h1>
          </div>
        </header>
        {list.length === 0 && <p className="muted">Create a profile to keep your scores and settings. Each player gets their own.</p>}
        {body}
      </main>
    </div>
  );
}
