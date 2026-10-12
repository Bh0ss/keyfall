import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { midi } from './midi/engine';
import { installVirtualInput, virtualInputEnabled } from './midi/virtual';
import './ui/tokens.css';
import './ui/app.css';

if (virtualInputEnabled(import.meta.env.DEV, window.location.search)) installVirtualInput(midi);
void midi.connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
