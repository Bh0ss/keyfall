import { ConnectionScreen } from './ui/ConnectionScreen';
import { virtualInputEnabled } from './midi/virtual';

export function App() {
  return <ConnectionScreen virtualInput={virtualInputEnabled(import.meta.env.DEV, window.location.search)} />;
}
