import { lazy, Suspense, useEffect } from 'react';
import { ConnectionScreen } from './ui/ConnectionScreen';
import { HomeScreen } from './ui/HomeScreen';
import { PlayScreen } from './ui/PlayScreen';
import { ProfilePicker } from './ui/ProfilePicker';
import { ResultsScreen } from './ui/ResultsScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SongPicker } from './ui/SongPicker';
import { StatsScreen } from './ui/StatsScreen';
import { initProfiles, useProfiles } from './ui/profileStore';
import { useRoute } from './ui/useRoute';
import { SongGate } from './ui/SongGate';
import { virtualInputEnabled } from './midi/virtual';
import { loadLibrary, useLibrary } from './songs/library';
import { getDb } from './storage/db';
import { initSync } from './sync/controller';

const LearnRoutes = lazy(() => import('./ui/learn/LearnRoutes'));
// The MIDI parser is only needed when a file is imported.
const ImportScreen = lazy(() => import('./ui/ImportScreen').then((m) => ({ default: m.ImportScreen })));

function Routes() {
  const route = useRoute();
  switch (route.name) {
    case 'songs':
      return <SongPicker />;
    case 'learn':
      return (
        <Suspense fallback={<div className="shell" data-testid="learn-loading" />}>
          <LearnRoutes unitId={route.unitId} lessonId={route.lessonId} />
        </Suspense>
      );
    case 'import':
      return (
        <Suspense fallback={<div className="shell" data-testid="import-loading" />}>
          <ImportScreen songId={route.songId} />
        </Suspense>
      );
    case 'stats':
      return <StatsScreen />;
    case 'settings':
      return <SettingsScreen />;
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
      <Routes />
    </div>
  );
}
