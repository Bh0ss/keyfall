import { ConnectionScreen } from './ui/ConnectionScreen';
import { PlayScreen } from './ui/PlayScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { SongPicker } from './ui/SongPicker';
import { useRoute } from './ui/useRoute';
import { virtualInputEnabled } from './midi/virtual';

export function App() {
  const route = useRoute();
  if (route.name === 'songs') return <SongPicker />;
  if (route.name === 'settings') return <SettingsScreen />;
  if (route.name === 'play') return <PlayScreen songId={route.songId} />;
  return <ConnectionScreen virtualInput={virtualInputEnabled(import.meta.env.DEV, window.location.search)} />;
}
