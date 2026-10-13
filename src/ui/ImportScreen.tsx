import { useMemo, useRef, useState } from 'react';
import type { Song } from '../engine/song';
import { analyseFile } from '../import/analyse';
import { buildSong, suggestLevel } from '../import/build';
import { ACCEPTED_EXTENSIONS, ImportError, MAX_FILE_BYTES } from '../import/limits';
import { saveNewImport, updateImport } from '../import/save';
import { canSplitByGroups, defaultSplit, noteName } from '../import/split';
import type { ImportAnalysis, SplitMode } from '../import/types';
import { importedRecord, loadLibrary } from '../songs/library';
import { getDb } from '../storage/db';
import { deleteImportedSong } from '../storage/songs';
import { AppLayout } from './AppLayout';
import { useAsync } from './useAsync';
import { hrefFor } from './useRoute';

const LEVELS: Song['level'][] = [1, 2, 3, 4, 5, 'expert'];
const levelText = (l: Song['level']) => (l === 'expert' ? 'Expert' : `Level ${l}`);

export interface Initial {
  title: string;
  composer: string;
  splitMode: SplitMode;
  splitMidi: number;
  level: Song['level'];
  levelOverridden: boolean;
}

export function ImportForm({
  analysis,
  initial,
  saveLabel,
  onSave,
  onCancel,
  extra,
  controls,
  heading,
}: {
  analysis: ImportAnalysis;
  initial: Initial;
  saveLabel: string;
  onSave: (v: Initial) => Promise<void>;
  onCancel: () => void;
  extra?: React.ReactNode;
  /** Rendered between title/composer and the hands split (the Add song review puts version, tempo, key and trim here). */
  controls?: React.ReactNode;
  /** Replaces the small label above the title (the file kind). */
  heading?: string;
}) {
  const [title, setTitle] = useState(initial.title);
  const [composer, setComposer] = useState(initial.composer);
  const [splitMode, setSplitMode] = useState<SplitMode>(initial.splitMode);
  const [splitMidi, setSplitMidi] = useState(initial.splitMidi);
  const [pickedLevel, setPickedLevel] = useState<Song['level'] | null>(initial.levelOverridden ? initial.level : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = useMemo(() => suggestLevel(analysis, { splitMode, splitMidi }), [analysis, splitMode, splitMidi]);
  const level = pickedLevel ?? estimate;
  const counts = useMemo(() => {
    const { song } = buildSong(analysis, 'preview', { title: '', composer: '', level: 1, splitMode, splitMidi }, false);
    return { right: song.notes.filter((n) => n.hand === 'right').length, left: song.notes.filter((n) => n.hand === 'left').length, total: song.notes.length };
  }, [analysis, splitMode, splitMidi]);
  const groups = canSplitByGroups(analysis);
  const noun = analysis.groupNoun;
  const clampMidi = (n: number) => Math.min(108, Math.max(21, Math.round(n)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ title, composer, splitMode, splitMidi, level, levelOverridden: pickedLevel !== null });
    } catch (err) {
      setError(err instanceof ImportError ? err.message : 'Keyfall could not save this song. Check that the browser allows site storage, then try again.');
      setSaving(false);
    }
  }

  return (
    <form className="card import-form" onSubmit={submit} data-testid="import-form">
      <div className="label">{heading ?? (analysis.format === 'midi' ? 'MIDI file' : analysis.format === 'mxl' ? 'Compressed MusicXML' : 'MusicXML')}</div>
      <div className="import-grid">
        <label className="field stack">
          Title
          <input className="text-input" data-testid="import-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field stack">
          Composer
          <input className="text-input" data-testid="import-composer" value={composer} maxLength={80} onChange={(e) => setComposer(e.target.value)} />
        </label>
      </div>

      {controls}

      <fieldset className="import-split">
        <legend>Hands</legend>
        {groups && (
          <label className="radio">
            <input type="radio" name="split" data-testid="import-split-groups" checked={splitMode === 'groups'} onChange={() => setSplitMode('groups')} />
            By {noun}: {analysis.groups[0]!.label} and {analysis.groups[1]!.label}
          </label>
        )}
        <label className="radio">
          <input type="radio" name="split" data-testid="import-split-pitch" checked={splitMode === 'pitch'} onChange={() => setSplitMode('pitch')} />
          Split at a note: right hand at or above, left hand below
        </label>
        {splitMode === 'pitch' && (
          <div className="row import-slider">
            <input
              type="range"
              min={21}
              max={108}
              value={splitMidi}
              aria-label="Split point"
              data-testid="import-split-slider"
              onChange={(e) => setSplitMidi(clampMidi(Number(e.target.value)))}
            />
            <input
              className="text-input import-midi"
              type="number"
              min={21}
              max={108}
              value={splitMidi}
              aria-label="Split point (MIDI note number)"
              data-testid="import-split"
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setSplitMidi(clampMidi(e.target.valueAsNumber))}
            />
            <span className="mono" data-testid="import-split-name">
              {noteName(splitMidi)}
            </span>
            {splitMidi !== 60 && (
              <button className="btn small" type="button" onClick={() => setSplitMidi(60)}>
                Middle C
              </button>
            )}
          </div>
        )}
        <p className="muted" data-testid="import-hand-counts">
          Right hand {counts.right} notes · Left hand {counts.left} notes
        </p>
      </fieldset>

      <div className="row">
        <label className="field">
          Difficulty
          <select data-testid="import-level" value={String(level)} onChange={(e) => setPickedLevel(e.target.value === 'expert' ? 'expert' : (Number(e.target.value) as Song['level']))}>
            {LEVELS.map((l) => (
              <option key={l} value={String(l)}>
                {levelText(l)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted" data-testid="import-estimate">
          Estimated: {levelText(estimate)}
          {pickedLevel !== null && pickedLevel !== estimate ? ' (you changed it)' : ''}
        </span>
        {pickedLevel !== null && (
          <button className="btn small" type="button" onClick={() => setPickedLevel(null)}>
            Use estimate
          </button>
        )}
      </div>

      <p className="muted" data-testid="import-facts">
        {counts.total} notes · {analysis.bpm} bpm · {analysis.timeSignature[0]}/{analysis.timeSignature[1]}
        {analysis.skipped > 0 ? ` · ${analysis.skipped} notes outside the piano range were left out` : ''}
      </p>
      {analysis.format === 'midi' && (
        <p className="muted" data-testid="import-approx-note">
          The sheet view for MIDI files is approximate: Keyfall writes it itself, with notes snapped to sixteenths.
        </p>
      )}
      {error && (
        <p role="alert" className="import-error" data-testid="import-save-error">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn big" data-primary type="submit" disabled={saving || !title.trim()} data-testid="import-save">
          {saving ? 'Saving...' : saveLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        {extra}
      </div>
    </form>
  );
}

function NewImport() {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ fileName: string; bytes: ArrayBuffer; analysis: ImportAnalysis } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(file: File | undefined) {
    if (!file) return;
    setError(null);
    setState(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`This file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB, which is more than Keyfall will import.`);
      return;
    }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const analysis = await analyseFile(file.name, bytes);
      setState({ fileName: file.name, bytes, analysis });
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'This file could not be read.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const split = state ? defaultSplit(state.analysis) : null;
  return (
    <>
      <section className="card import-drop" data-testid="import-drop">
        <h2>Choose a file</h2>
        <p>
          Keyfall reads MIDI and MusicXML files ({ACCEPTED_EXTENSIONS.join(', ')}), up to {MAX_FILE_BYTES / 1024 / 1024} MB. The file stays on this device. Only import music you have the right to use.
        </p>
        <div className="row">
          <label className="btn big" data-primary={state ? undefined : ''} data-testid="import-pick">
            {busy ? 'Reading...' : state ? 'Choose another file' : 'Choose file'}
            <input
              ref={input}
              className="visually-hidden"
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              data-testid="import-file"
              onChange={(e) => void open(e.target.files?.[0])}
            />
          </label>
          <a className="btn" href={hrefFor.songs()}>
            Back to songs
          </a>
        </div>
        {error && (
          <p role="alert" className="import-error" data-testid="import-error">
            {error}
          </p>
        )}
      </section>
      {state && split && (
        <ImportForm
          key={state.fileName + state.analysis.title}
          analysis={state.analysis}
          initial={{ title: state.analysis.title, composer: state.analysis.composer, splitMode: split.mode, splitMidi: split.splitMidi, level: 1, levelOverridden: false }}
          saveLabel="Add to my songs"
          onCancel={() => setState(null)}
          onSave={async (v) => {
            await saveNewImport(getDb(), state.analysis, state.fileName, state.bytes, v);
            window.location.hash = hrefFor.songs();
          }}
        />
      )}
    </>
  );
}

function EditImport({ songId }: { songId: string }) {
  const rec = importedRecord(songId);
  const analysis = useAsync(async () => (rec ? analyseFile(rec.fileName, rec.source).catch(() => null) : null), songId);
  const [confirming, setConfirming] = useState(false);
  if (!rec) {
    return (
      <section className="card" data-tone="warn" role="alert" data-testid="import-missing">
        <h2>Song not found</h2>
        <p>That imported song is not on this device.</p>
        <a className="btn" data-primary href={hrefFor.songs()}>
          Back to songs
        </a>
      </section>
    );
  }
  if (analysis === undefined) return <div data-testid="import-loading" />;
  if (analysis === null) {
    return (
      <section className="card" data-tone="warn" role="alert" data-testid="import-unreadable">
        <h2>This song&apos;s file can&apos;t be read any more</h2>
        <p>You can still play it, but its hands can&apos;t be changed.</p>
        <a className="btn" data-primary href={hrefFor.songs()}>
          Back to songs
        </a>
      </section>
    );
  }
  return (
    <ImportForm
      analysis={analysis}
      initial={{ title: rec.song.title, composer: rec.song.composer, splitMode: rec.splitMode, splitMidi: rec.splitMidi, level: rec.song.level, levelOverridden: rec.levelOverridden }}
      saveLabel="Save changes"
      onCancel={() => (window.location.hash = hrefFor.songs())}
      onSave={async (v) => {
        await updateImport(getDb(), rec, v);
        window.location.hash = hrefFor.songs();
      }}
      extra={
        confirming ? (
          <>
            <span className="muted">Remove this song? Your scores stay in Stats.</span>
            <button
              className="btn"
              type="button"
              data-testid="import-delete-confirm"
              onClick={async () => {
                await deleteImportedSong(getDb(), rec.id);
                await loadLibrary(getDb());
                window.location.hash = hrefFor.songs();
              }}
            >
              Yes, remove
            </button>
            <button className="btn" type="button" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn" type="button" data-testid="import-delete" onClick={() => setConfirming(true)}>
            Remove song
          </button>
        )
      }
    />
  );
}

/** Play › Import: pick a file, check the hands, difficulty and title, save. With `songId`, edit an earlier import. */
export function ImportScreen({ songId }: { songId?: string }) {
  return (
    <AppLayout active="play">
      <main className="main" data-testid={songId ? 'import-edit' : 'import-screen'}>
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Keyfall</div>
            <h1 className="title">{songId ? 'Edit imported song' : 'Import a song'}</h1>
          </div>
        </header>
        {songId ? <EditImport songId={songId} /> : <NewImport />}
      </main>
    </AppLayout>
  );
}
