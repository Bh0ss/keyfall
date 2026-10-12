import { useMemo } from 'react';
import { hrefFor } from './useRoute';
import { midi } from '../midi/engine';
import { KEY_TO_MIDI } from '../midi/virtual';
import { ConnectionChip } from './ConnectionChip';
import { Keyboard } from './Keyboard';
import { noteName } from './keyboardLayout';
import { useMidi } from './useMidi';

const SETUP_ID = 'setup';

function SetupSteps() {
  return (
    <section className="card" id={SETUP_ID} aria-labelledby="setup-title">
      <div className="label">Setup</div>
      <h2 id="setup-title">Connect your FP-30X</h2>
      <ol className="steps">
        <li>Turn the piano on and enable Bluetooth MIDI (hold the Bluetooth button until the light flashes).</li>
        <li>
          Mac: open Audio MIDI Setup, choose Window then Show MIDI Studio, click the Bluetooth icon and connect FP-30X.
        </li>
        <li>Open Keyfall in Chrome and choose Allow when it asks to use your MIDI devices.</li>
        <li>iPhone: use the Web MIDI Browser app, and pair the piano from the piano&apos;s own Bluetooth settings first.</li>
      </ol>
    </section>
  );
}

function StateCard({ access }: { access: string }) {
  if (access === 'unsupported') {
    return (
      <section className="card" data-tone="warn" role="alert" data-testid="state-unsupported">
        <h2>This browser can&apos;t use MIDI</h2>
        <p>Safari doesn&apos;t support Web MIDI. Use Chrome on your Mac, or the Web MIDI Browser app on iPhone.</p>
      </section>
    );
  }
  if (access === 'denied') {
    return (
      <section className="card" data-tone="warn" role="alert" data-testid="state-denied">
        <h2>MIDI access was blocked</h2>
        <p>
          Keyfall needs permission to hear your piano. Click the lock icon in the address bar, set MIDI devices to
          Allow, then try again.
        </p>
        <div className="row">
          <button className="btn" data-primary type="button" onClick={() => void midi.connect()}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  if (access === 'error') {
    return (
      <section className="card" data-tone="warn" role="alert" data-testid="state-error">
        <h2>Couldn&apos;t start MIDI</h2>
        <p>Something went wrong while opening MIDI. Reload the page, or try again.</p>
        <div className="row">
          <button className="btn" data-primary type="button" onClick={() => void midi.connect()}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  return null;
}

export function ConnectionScreen({ virtualInput }: { virtualInput: boolean }) {
  const snapshot = useMidi();
  const { access, devices, pressed } = snapshot;

  const played = useMemo(
    () => [...pressed.keys()].sort((a, b) => a - b).map(noteName).join(' '),
    [pressed],
  );

  const noKeyboard = access === 'ready' && !devices.connected;

  return (
    <div className="shell">
      <main className="main">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Keyfall</div>
            <h1 className="title">Let&apos;s find your keyboard</h1>
          </div>
          <div className="row">
            <ConnectionChip snapshot={snapshot} helpHref={`#${SETUP_ID}`} />
            <a className="btn" data-primary href={hrefFor.songs()}>
              Play a song
            </a>
          </div>
        </header>

        <StateCard access={access} />
        {noKeyboard && (
          <section className="card" data-testid="state-no-device">
            <h2>No keyboard found</h2>
            <p>
              Turn on your piano and connect it over Bluetooth. Keyfall picks it up automatically, with no reload
              needed.
            </p>
          </section>
        )}
        {devices.connected && (
          <section className="card">
            <h2>Play a few keys</h2>
            <p>The keys below light up as you play. If they do, you&apos;re ready.</p>
          </section>
        )}
        {virtualInput && (
          <p className="hint" data-testid="virtual-hint">
            Computer-keyboard piano is on:{' '}
            {Object.entries(KEY_TO_MIDI).map(([k]) => (
              <kbd key={k}>{k.toUpperCase()} </kbd>
            ))}
            play C4 to C5.
          </p>
        )}
        <SetupSteps />
      </main>

      <section className="stage" aria-label="Keyboard">
        <div className="stage-head">
          <span>A0 to C8 · 88 keys</span>
          <span className="played" data-testid="played" aria-live="off">
            {played}
          </span>
        </div>
        <Keyboard pressed={pressed} />
      </section>
    </div>
  );
}
