import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { LATENCY_CLICKS, LATENCY_INTERVAL_MS, deviceKey, medianOffset } from '../engine/latency';
import { midi } from '../midi/engine';
import { useNavScope } from '../nav/store';
import { getDb } from '../storage/db';
import { clearLatency, saveLatency, savedLatency } from '../storage/latency';
import { AccountPanel } from './AccountPanel';
import { AppLayout } from './AppLayout';
import { KeyLegend } from './PianoLegend';
import { profiles, useActiveProfile } from './profileStore';
import { playSound } from './sounds';
import { audioContext, outputLatencyMs, scheduleClick } from './audio';
import { useMidi } from './useMidi';
import { hrefFor } from './useRoute';

type Phase =
  | { name: 'idle' }
  | { name: 'running'; beat: number; taps: number }
  | { name: 'done'; offsetMs: number; matched: number }
  | { name: 'failed'; reason: string };

const LEAD_MS = 1500;

function fmt(ms: number): string {
  const r = Math.round(ms * 10) / 10;
  return `${r > 0 ? '+' : ''}${r} ms`;
}

/** Play the clicks, collect taps, save the median offset. Returns a cancel function. */
function startLatencyCheck(device: string, onPhase: Dispatch<SetStateAction<Phase>>, onSaved: (offsetMs: number) => void): () => void {
  const ctx = audioContext();
  if (!ctx) {
    onPhase({ name: 'failed', reason: 'This browser has no Web Audio, so the clicks cannot play.' });
    return () => undefined;
  }
  const t0 = performance.now();
  const heardLater = outputLatencyMs();
  const clicks: number[] = [];
  const taps: number[] = [];
  const timers: number[] = [];
  for (let i = 0; i < LATENCY_CLICKS; i++) {
    const after = LEAD_MS + i * LATENCY_INTERVAL_MS;
    scheduleClick(after / 1000, i === 0);
    clicks.push(t0 + after + heardLater);
    timers.push(window.setTimeout(() => onPhase({ name: 'running', beat: i + 1, taps: taps.length }), after));
  }
  const off = midi.subscribeNotes((e) => {
    if (e.type !== 'noteOn') return;
    taps.push(performance.now());
    onPhase((p) => (p.name === 'running' ? { ...p, taps: taps.length } : p));
  });
  const stop = () => {
    timers.forEach((t) => window.clearTimeout(t));
    off();
  };
  onPhase({ name: 'running', beat: 0, taps: 0 });
  timers.push(
    window.setTimeout(
      () => {
        stop();
        const result = medianOffset(clicks, taps);
        if (!result) {
          onPhase({ name: 'failed', reason: 'Not enough taps matched the clicks. Tap one key on every click and try again.' });
          return;
        }
        void saveLatency(getDb(), device, result.offsetMs).then(() => {
          onSaved(result.offsetMs);
          onPhase({ name: 'done', offsetMs: result.offsetMs, matched: result.matched });
        });
      },
      LEAD_MS + LATENCY_CLICKS * LATENCY_INTERVAL_MS + 400,
    ),
  );

  return stop;
}

function Preference({ id, title, text, on, onChange }: { id: string; title: string; text: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="pref">
      <div className="pref-text">
        <strong id={`${id}-label`}>{title}</strong>
        <span id={`${id}-hint`}>{text}</span>
      </div>
      <button
        className="switch"
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        data-testid={`pref-${id}`}
        onClick={() => onChange(!on)}
      >
        <span className="switch-knob" aria-hidden="true" />
        <span className="switch-text">{on ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

/** Per-profile preferences: piano navigation, sounds and motion. */
function PreferencesCard() {
  const profile = useActiveProfile();
  const s = profile.settings;
  const save = (patch: Parameters<typeof profiles.saveSettings>[1]) => void profiles.saveSettings(profile.id, patch);
  return (
    <section className="card" data-testid="prefs-card">
      <h2>Preferences for {profile.name}</h2>
      <Preference
        id="pianoNav"
        title="Piano navigation"
        text="The five lowest white keys work the menus. They only pause and resume during a song, and switch off for a song that uses them."
        on={s.pianoNav !== false}
        onChange={(on) => save({ pianoNav: on })}
      />
      <KeyLegend />
      <Preference
        id="sound"
        title="Sounds"
        text="Soft chimes for menus, Learn answers and finishing a song. The metronome is separate."
        on={s.sound !== false}
        onChange={(on) => {
          save({ sound: on });
          if (on) setTimeout(() => playSound('select'), 50);
        }}
      />
      <Preference
        id="reduceMotion"
        title="Reduce animation"
        text="Stops the celebrations and slides. Keyfall also follows your device's reduce-motion setting."
        on={s.reduceMotion === true}
        onChange={(on) => save({ reduceMotion: on })}
      />
    </section>
  );
}

export function SettingsScreen() {
  const snapshot = useMidi();
  const device = deviceKey(snapshot.devices.name);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [saved, setSaved] = useState<number | null>(null);
  const cleanup = useRef<() => void>(() => undefined);
  // While the clicks play, any key is a tap: the piano navigation keys step aside.
  useNavScope(phase.name === 'running' ? { kind: 'suspended' } : { kind: 'menu' });

  useEffect(() => () => cleanup.current(), []);

  useEffect(() => {
    let live = true;
    void savedLatency(getDb(), device).then((v) => live && setSaved(v));
    return () => {
      live = false;
    };
  }, [device]);

  const run = () => {
    cleanup.current();
    cleanup.current = startLatencyCheck(device, setPhase, setSaved);
  };

  const reset = () => {
    void clearLatency(getDb(), device).then(() => {
      setSaved(null);
      setPhase({ name: 'idle' });
    });
  };

  return (
    <AppLayout active="settings">
      <main className="main">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Settings</div>
            <h1 className="title">Settings</h1>
          </div>
          <a className="btn" href={hrefFor.home()}>
            Home
          </a>
        </header>
        <PreferencesCard />
        <AccountPanel />
        <section className="card" data-testid="latency-card">
          <h2>Latency check</h2>
          <p>
            Eight clicks play. Tap any one key on the keyboard in time with each click. Keyfall measures how late the keyboard reaches the game and
            subtracts that from every note you play.
          </p>
          <p className="muted">
            Device: <strong>{snapshot.devices.name ?? 'No keyboard (shared setting)'}</strong> · Saved offset:{' '}
            <strong data-testid="latency-saved">{saved === null ? 'none' : fmt(saved)}</strong>
          </p>
          <div className="row">
            <button className="btn" data-primary type="button" data-testid="latency-start" disabled={phase.name === 'running'} onClick={run}>
              {phase.name === 'running' ? 'Listening...' : 'Start latency check'}
            </button>
            {saved !== null && (
              <button className="btn" type="button" data-testid="latency-reset" onClick={reset}>
                Reset to 0 ms
              </button>
            )}
          </div>
          <div role="status" aria-live="polite" data-testid="latency-status" data-phase={phase.name}>
            {phase.name === 'running' && (
              <p>
                <span data-testid="latency-beat">
                  {phase.beat}/{LATENCY_CLICKS}
                </span>{' '}
                clicks · <span data-testid="latency-taps">{phase.taps}</span> taps
              </p>
            )}
            {phase.name === 'done' && (
              <p data-testid="latency-result" data-offset={phase.offsetMs}>
                Your offset is {fmt(phase.offsetMs)} ({phase.matched} taps matched). Saved for this device.
              </p>
            )}
            {phase.name === 'failed' && <p role="alert">{phase.reason}</p>}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
