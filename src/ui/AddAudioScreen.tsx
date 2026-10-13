import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { arrangementToFile } from '../arrange/toImport';
import type { Mode, Version } from '../arrange/types';
import { Listener, type Fallback, type ListenState } from '../audioImport/listen';
import { buildReview, KEY_CHOICES, keyLabel, type Review, type ReviewChoices } from '../audioImport/review';
import { BPM_RANGE, clampBpm, doubleBpm, halveBpm, tapBpm } from '../audioImport/tempo';
import { analyseFile } from '../import/analyse';
import { ImportError } from '../import/limits';
import { saveNewImport } from '../import/save';
import { lookupTrack } from '../spotify/link';
import { decodeAudio } from '../transcribe/decode';
import { currentPaceLimitSec, currentTranscriber } from '../transcribe/seam';
import type { NoteEvent } from '../transcribe/types';
import { getDb } from '../storage/db';
import { AppLayout } from './AppLayout';
import { HelpBubble } from './HelpBubble';
import { ImportForm, type Initial } from './ImportScreen';
import { hrefFor } from './useRoute';

const AUDIO_ACCEPT = '.m4a,.mp3,.wav';
const clock = () => performance.now();
const isPhone = () => typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);
const stemOf = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

interface Meta {
  title: string;
  artist: string;
  thumbnail: string | undefined;
  fileName: string;
}

/** A number box that lets the player type freely and only passes on values that are valid. */
function NumField({ value, min, max, onCommit, label, testId, wide }: { value: number; min: number; max: number; onCommit: (n: number) => void; label: string; testId: string; wide?: boolean }) {
  // While the player is typing, show what they typed; once the box loses focus it shows the real value again.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`text-input import-midi${wide ? ' trim-input' : ''}`}
      type="number"
      min={min}
      max={max}
      value={draft ?? String(value)}
      aria-label={label}
      data-testid={testId}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function LinkCard({ meta, setMeta }: { meta: Meta; setMeta: (m: Partial<Meta>) => void }) {
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'bad'; text: string }>({ kind: 'idle', text: '' });
  const ready = status.kind !== 'busy' && link.trim() !== '' && status.kind !== 'ok';
  const live = useRef<AbortController | null>(null);
  useEffect(() => () => live.current?.abort(), []);

  async function lookup() {
    live.current?.abort();
    const ac = new AbortController();
    live.current = ac;
    setStatus({ kind: 'busy', text: 'Looking it up...' });
    const r = await lookupTrack(link, { signal: ac.signal });
    if (ac.signal.aborted) return;
    if (r.ok) {
      setMeta({ title: r.title, thumbnail: r.thumbnail });
      setStatus({ kind: 'ok', text: 'Found it. Check the title and type the artist.' });
    } else {
      setMeta({ thumbnail: undefined });
      setStatus({ kind: 'bad', text: r.message });
    }
  }

  return (
    <section className="card" data-testid="add-audio-link">
      <div className="title-help">
        <h2>1. Spotify link</h2>
        <HelpBubble id="addAudio.link" />
      </div>
      <p>Optional. Paste a link to the song to fill in its title, or just type the title and artist yourself.</p>
      <div className="row">
        <label className="field stack grow">
          Link to the song
          <input
            className="text-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://open.spotify.com/track/..."
            data-testid="link-input"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              if (status.kind !== 'idle') setStatus({ kind: 'idle', text: '' });
            }}
          />
        </label>
        <button className="btn" type="button" data-primary={ready ? '' : undefined} disabled={status.kind === 'busy' || link.trim() === ''} data-testid="link-lookup" onClick={() => void lookup()}>
          Look up song
        </button>
      </div>
      {status.text && (
        <p role={status.kind === 'bad' ? 'alert' : 'status'} className={status.kind === 'bad' ? 'import-error' : 'muted'} data-testid="link-status">
          {status.text}
        </p>
      )}
      <div className="row add-audio-meta">
        {meta.thumbnail && <img className="add-audio-thumb" src={meta.thumbnail} alt="" width={64} height={64} referrerPolicy="no-referrer" data-testid="link-thumb" />}
        <div className="import-grid grow">
          <label className="field stack">
            Title
            <input className="text-input" data-testid="link-title" value={meta.title} maxLength={120} onChange={(e) => setMeta({ title: e.target.value })} />
          </label>
          <label className="field stack">
            Artist
            <input className="text-input" data-testid="link-artist" value={meta.artist} maxLength={80} onChange={(e) => setMeta({ artist: e.target.value })} />
          </label>
        </div>
      </div>
    </section>
  );
}

function FileCard({ error, onFile }: { error: string | null; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="card" data-testid="add-audio-file">
      <div className="title-help">
        <h2>2. Your recording</h2>
        <HelpBubble id="addAudio.file" />
      </div>
      <p>Choose an m4a, mp3 or wav file. It works best with a solo piano or a simple recording.</p>
      <p data-testid="audio-privacy">Your recording stays on this device and is never saved. Only the song Keyfall makes from it is kept.</p>
      <div className="row">
        <label className="btn big" data-primary="" data-testid="audio-pick">
          Choose recording
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept={AUDIO_ACCEPT}
            data-testid="audio-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (input.current) input.current.value = '';
              if (f) onFile(f);
            }}
          />
        </label>
        <a className="btn" href={hrefFor.songs()}>
          Back to songs
        </a>
      </div>
      {error && (
        <p role="alert" className="import-error" data-testid="audio-error">
          {error}
        </p>
      )}
    </section>
  );
}

const STAGE_TEXT = {
  decoding: 'Reading your recording',
  'loading-model': 'Getting the listener ready',
  listening: 'Listening',
  finishing: 'Writing out the notes',
} as const;

function ListeningCard({ state, onCancel }: { state: Extract<ListenState, { phase: 'decoding' | 'running' }>; onCancel: () => void }) {
  const stage = state.phase === 'decoding' ? 'decoding' : state.stage;
  const determinate = stage === 'listening';
  const pct = state.phase === 'running' ? Math.round(state.fraction * 100) : 0;
  return (
    <section className="card" data-testid="add-audio-listening">
      <div role="status">
        <h2 data-testid="listen-stage" data-stage={stage}>
          {STAGE_TEXT[stage]}
          {determinate ? ` ${pct}%` : '...'}
        </h2>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? pct : undefined}
        data-testid="listen-bar"
        data-indeterminate={determinate ? undefined : ''}
      >
        <div className="progress-fill" style={determinate ? { width: `${pct}%` } : undefined} />
      </div>
      <p className="muted">This can take a minute for a long song. Everything happens on this device.</p>
      <div className="row">
        <button className="btn big" type="button" data-primary="" data-testid="listen-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function MacCard({ fallback, onTryAnyway, onCancel }: { fallback: Fallback; onTryAnyway: () => void; onCancel: () => void }) {
  return (
    <section className="card" data-tone="warn" role="alert" data-testid="add-audio-mac" data-reason={fallback.reason}>
      <h2>This works best on the Mac</h2>
      <p data-testid="mac-reason">{fallback.message}</p>
      <p>Open Keyfall on a Mac and add the song there. It shows up here once Keyfall has synced it.</p>
      <div className="row">
        {fallback.canTryAnyway ? (
          <>
            <button className="btn big" type="button" data-primary="" data-testid="mac-try-anyway" onClick={onTryAnyway}>
              Try anyway
            </button>
            <button className="btn" type="button" data-testid="mac-cancel" onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn big" type="button" data-primary="" data-testid="mac-choose-another" onClick={onCancel}>
              Choose another recording
            </button>
            <a className="btn" href={hrefFor.songs()}>
              Back to songs
            </a>
          </>
        )}
      </div>
    </section>
  );
}

function ReviewStep({ events, seconds, meta, onRestart }: { events: NoteEvent[]; seconds: number; meta: Meta; onRestart: () => void }) {
  const [choices, setChoices] = useState<ReviewChoices>({ version: 'beginner', bpm: null, key: null, trimSec: null });
  const [review, setReview] = useState<Review | null>(null);
  const [detectedKey, setDetectedKey] = useState<{ tonic: number; mode: Mode } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taps = useRef<number[]>([]);
  const title = meta.title.trim() || stemOf(meta.fileName) || 'My song';
  const roundedSeconds = Math.max(1, Math.ceil(seconds));
  const run = useRef(0);

  // Each change re-arranges the notes already heard; the model is not run again.
  useEffect(() => {
    const id = ++run.current;
    buildReview(events, choices, { title, composer: meta.artist })
      .then((r) => {
        if (id !== run.current) return;
        setReview(r);
        setError(null);
        if (!choices.key) setDetectedKey({ tonic: r.arrangement.key.tonic, mode: r.arrangement.key.mode });
      })
      .catch((e: unknown) => {
        if (id === run.current) setError(e instanceof ImportError ? e.message : 'Keyfall could not arrange that recording.');
      });
  }, [events, choices, title, meta.artist]);

  const patch = (p: Partial<ReviewChoices>) => setChoices((c) => ({ ...c, ...p }));

  if (!review) {
    return error ? (
      <section className="card" data-tone="warn" role="alert" data-testid="review-failed">
        <h2>No song could be made</h2>
        <p>{error}</p>
        <div className="row">
          <button className="btn big" type="button" data-primary="" data-testid="review-restart" onClick={onRestart}>
            Choose another recording
          </button>
        </div>
      </section>
    ) : (
      <div role="status" className="muted" data-testid="review-arranging">
        Arranging...
      </div>
    );
  }

  const arr = review.arrangement;
  const [trimFrom, trimTo] = choices.trimSec ?? [0, roundedSeconds];
  const keyValue = choices.key ? `${choices.key.tonic}-${choices.key.mode}` : '';

  const controls = (
    <div className="add-audio-controls" data-testid="review-controls">
      <fieldset className="import-split" aria-labelledby="legend-version">
        <legend id="legend-version">
          <span className="title-help">
            Version
            <HelpBubble id="addAudio.version" />
          </span>
        </legend>
        {(['beginner', 'full'] as Version[]).map((v) => (
          <label className="radio" key={v}>
            <input type="radio" name="version" data-testid={`version-${v}`} checked={choices.version === v} onChange={() => patch({ version: v })} />
            {v === 'beginner' ? 'Beginner: a simpler tune and a plain left hand' : 'Full: closer to the recording'}
          </label>
        ))}
      </fieldset>

      <fieldset className="import-split" aria-labelledby="legend-tempo">
        <legend id="legend-tempo">
          <span className="title-help">
            Tempo
            <HelpBubble id="addAudio.tempo" />
          </span>
        </legend>
        <div className="row">
          <NumField value={arr.bpm} min={BPM_RANGE[0]} max={BPM_RANGE[1]} label="Tempo (beats per minute)" testId="tempo-input" onCommit={(n) => patch({ bpm: clampBpm(n) })} />
          <span className="muted">bpm</span>
          <button
            className="btn"
            type="button"
            data-testid="tempo-tap"
            onClick={(e) => {
              taps.current = [...taps.current, e.timeStamp].slice(-16);
              const bpm = tapBpm(taps.current);
              if (bpm !== null) patch({ bpm });
            }}
          >
            Tap tempo
          </button>
          <button className="btn" type="button" data-testid="tempo-half" onClick={() => patch({ bpm: halveBpm(arr.bpm) })}>
            Half
          </button>
          <button className="btn" type="button" data-testid="tempo-double" onClick={() => patch({ bpm: doubleBpm(arr.bpm) })}>
            Double
          </button>
          {choices.bpm !== null && (
            <button className="btn small" type="button" data-testid="tempo-reset" onClick={() => patch({ bpm: null })}>
              Use detected ({Math.round(arr.estimatedBpm)})
            </button>
          )}
        </div>
        <p className="muted" data-testid="tempo-note">
          Detected {Math.round(arr.estimatedBpm)} bpm.{arr.confidence < 0.3 ? ' Keyfall is not sure about this one: tap along to set it.' : ''}
        </p>
      </fieldset>

      <fieldset className="import-split" aria-labelledby="legend-key">
        <legend id="legend-key">
          <span className="title-help">
            Key
            <HelpBubble id="addAudio.key" />
          </span>
        </legend>
        <label className="field">
          Key for the left hand
          <select
            data-testid="key-select"
            value={keyValue}
            onChange={(e) => {
              const [tonic, mode] = e.target.value.split('-');
              patch({ key: e.target.value ? { tonic: Number(tonic), mode: mode as Mode } : null });
            }}
          >
            <option value="">{detectedKey ? `Detected: ${keyLabel(detectedKey)}` : 'Detected'}</option>
            {KEY_CHOICES.map((k) => (
              <option key={`${k.tonic}-${k.mode}`} value={`${k.tonic}-${k.mode}`}>
                {keyLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="import-split" aria-labelledby="legend-trim">
        <legend id="legend-trim">
          <span className="title-help">
            Trim
            <HelpBubble id="addAudio.trim" />
          </span>
        </legend>
        <div className="row">
          <label className="field">
            From (seconds)
            <NumField value={trimFrom} min={0} max={Math.max(0, trimTo - 1)} label="Trim start (seconds)" testId="trim-start" wide onCommit={(n) => patch({ trimSec: [n, trimTo] })} />
          </label>
          <label className="field">
            To (seconds)
            <NumField value={trimTo} min={trimFrom + 1} max={roundedSeconds} label="Trim end (seconds)" testId="trim-end" wide onCommit={(n) => patch({ trimSec: [trimFrom, n] })} />
          </label>
          {choices.trimSec && (
            <button className="btn small" type="button" data-testid="trim-whole" onClick={() => patch({ trimSec: null })}>
              Use whole song
            </button>
          )}
        </div>
        <p className="muted">The recording is {roundedSeconds} seconds long.</p>
      </fieldset>
      {error && (
        <p role="alert" className="import-error" data-testid="review-error">
          {error}
        </p>
      )}
    </div>
  );

  const initial: Initial = { title, composer: meta.artist, splitMode: 'groups', splitMidi: 60, level: 1, levelOverridden: false };
  return (
    <ImportForm
      analysis={review.analysis}
      initial={initial}
      heading="Made from your recording"
      saveLabel="Add to my songs"
      controls={controls}
      onCancel={onRestart}
      onSave={async (v) => {
        const file = arrangementToFile(review.arrangement, { title: v.title, composer: v.composer });
        const bytes = file.bytes.slice().buffer;
        const analysis = await analyseFile(file.fileName, bytes);
        const row = await saveNewImport(getDb(), analysis, file.fileName, bytes, v);
        window.location.hash = hrefFor.play(row.id);
      }}
    />
  );
}

/** Add song: an optional Spotify link, a recording, listening, then a review where the player fixes the guesses and saves. */
export function AddAudioScreen() {
  const [meta, setMetaState] = useState<Meta>({ title: '', artist: '', thumbnail: undefined, fileName: '' });
  const setMeta = (m: Partial<Meta>) => setMetaState((cur) => ({ ...cur, ...m }));
  const listener = useMemo(
    () =>
      new Listener({
        decode: (f) => decodeAudio(f),
        transcribe: (pcm, o) => currentTranscriber()(pcm, o),
        isPhone: isPhone(),
        now: clock,
        paceLimitSec: currentPaceLimitSec,
      }),
    [],
  );
  const state = useSyncExternalStore(listener.subscribe, listener.getState);
  // Leaving the screen stops the run and frees the worker.
  useEffect(() => () => listener.cancel(), [listener]);

  const showCard = state.phase === 'fallback' || (state.phase === 'running' && state.fallback);
  return (
    <AppLayout active="play">
      <main className="main" data-testid="add-audio-screen">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Keyfall</div>
            <h1 className="title">Add a song</h1>
          </div>
        </header>
        {(state.phase === 'idle' || state.phase === 'failed') && (
          <>
            <LinkCard meta={meta} setMeta={setMeta} />
            <FileCard
              error={state.phase === 'failed' ? state.message : null}
              onFile={(f) => {
                setMeta({ fileName: f.name });
                listener.start(f);
              }}
            />
          </>
        )}
        {showCard && (
          <MacCard
            fallback={state.phase === 'fallback' ? state.fallback : (state as Extract<ListenState, { phase: 'running' }>).fallback!}
            onTryAnyway={() => listener.tryAnyway()}
            onCancel={() => listener.cancel()}
          />
        )}
        {!showCard && (state.phase === 'decoding' || state.phase === 'running') && <ListeningCard state={state} onCancel={() => listener.cancel()} />}
        {state.phase === 'done' && <ReviewStep key={meta.fileName} events={state.notes} seconds={state.seconds} meta={meta} onRestart={() => listener.cancel()} />}
      </main>
    </AppLayout>
  );
}
