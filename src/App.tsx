import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { PianoNav } from './ui/PianoNav';
import { CreditsScreen } from './ui/CreditsScreen';
import { ConnectionScreen } from './ui/ConnectionScreen';
import { HomeScreen } from './ui/HomeScreen';
import { PlayScreen } from './ui/PlayScreen';
import { ProfilePicker } from './ui/ProfilePicker';
import { ResultsScreen } from './ui/ResultsScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SongPicker } from './ui/SongPicker';
import { StatsScreen } from './ui/StatsScreen';
import { initProfiles, useProfiles } from './ui/profileStore';
import { useRoute, type Route } from './ui/useRoute';
import { SongGate } from './ui/SongGate';
import { virtualInputEnabled } from './midi/virtual';
import { loadLibrary, useLibrary } from './songs/library';
import { getDb } from './storage/db';
import { initSync } from './sync/controller';

const LearnRoutes = lazy(() => import('./ui/learn/LearnRoutes'));
// The MIDI parser is only needed when a file is imported.
const ImportScreen = lazy(() => import('./ui/ImportScreen').then((m) => ({ default: m.ImportScreen })));
const AddAudioScreen = lazy(() => import('./ui/AddAudioScreen').then((m) => ({ default: m.AddAudioScreen })));

/** Keyboard users jump past the navigation rail to the screen's own content. */
function skipToContent() {
  const main = document.querySelector('main');
  if (!main) return;
  main.setAttribute('tabindex', '-1');
  main.focus();
}

/** Shown while a lazily loaded screen downloads, so the page is never blank. */
function LoadingShell({ testId, what }: { testId: string; what: string }) {
  return (
    <div className="shell" data-testid={testId}>
      <main className="main" role="status">
        <p className="muted">Loading {what}...</p>
      </main>
    </div>
  );
}

function Routes() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  return <ErrorBoundary resetKey={hash}>{renderRoute(useRoute())}</ErrorBoundary>;
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function renderRoute(route: Route) {
  switch (route.name) {
    case 'songs':
      return <SongPicker />;
    case 'learn':
      return (
        <Suspense fallback={<LoadingShell testId="learn-loading" what="Learn" />}>
          <LearnRoutes unitId={route.unitId} lessonId={route.lessonId} />
        </Suspense>
      );
    case 'import':
      return (
        <Suspense fallback={<LoadingShell testId="import-loading" what="the importer" />}>
          <ImportScreen songId={route.songId} />
        </Suspense>
      );
    case 'addAudio':
      return (
        <Suspense fallback={<LoadingShell testId="add-audio-loading" what="Add song" />}>
          <AddAudioScreen />
        </Suspense>
      );
    case 'stats':
      return <StatsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'credits':
      return <CreditsScreen />;
    case 'results':
      return <ResultsScreen attemptId={route.attemptId} />;
    case 'play':
      return (
        <SongGate songId={route.songId}>
          <PlayScreen songId={route.songId} preset={route.preset} />
        </SongGate>
      );
    case 'keyboard':
      return <ConnectionScreen virtualInput={virtualInputEnabled(import.meta.env.DEV, window.location.search)} />;
    default:
      return <HomeScreen />;
  }
}

/** Nothing renders until a profile is chosen for this session. */
export function App() {
  return (
    <>
      <PianoNav />
      <Screens />
    </>
  );
}

function Screens() {
  const state = useProfiles();
  const library = useLibrary();
  useEffect(() => {
    void initProfiles();
  }, []);
  useEffect(() => {
    if (state.status === 'ready') {
      void loadLibrary(getDb());
      initSync();
    }
  }, [state.status]);

  if (state.status === 'loading' || (state.status === 'ready' && state.activeId && !library.ready)) return <div className="shell" data-testid="app-loading" />;
  if (state.status === 'error') {
    return (
      <div className="shell">
        <main className="main">
          <section className="card" data-tone="warn" role="alert" data-testid="storage-error">
            <h2>Keyfall can&apos;t save on this device</h2>
            <p>The browser blocked its local storage ({state.error}). Allow site data for this page, leave private browsing, then reload.</p>
          </section>
        </main>
      </div>
    );
  }
  if (!state.activeId) return <ProfilePicker />;
  return (
    <div className="app-root" data-testid="app-ready">
      <button className="skip-link" type="button" onClick={skipToContent}>
        Skip to content
      </button>
      <Routes />
    </div>
  );
}
