import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { LATENCY_CLICKS, LATENCY_INTERVAL_MS, deviceKey, medianOffset } from '../engine/latency';
import { midi } from '../midi/engine';
import { getDb } from '../storage/db';
import { clearLatency, saveLatency, savedLatency } from '../storage/latency';
import { AppLayout } from './AppLayout';
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

export function SettingsScreen() {
  const snapshot = useMidi();
  const device = deviceKey(snapshot.devices.name);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [saved, setSaved] = useState<number | null>(null);
  const cleanup = useRef<() => void>(() => undefined);

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
            <h1 className="title">Latency check</h1>
          </div>
          <a className="btn" href={hrefFor.home()}>
            Home
          </a>
        </header>
        <section className="card" data-testid="latency-card">
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
