import { summarizeInputs, type DeviceSummary, type InputInfo } from './devices';
import { parseMidiMessage, type NoteEvent } from './parse';
import { applyNoteEvent, emptyPressed, type PressedKeys } from './pressed';

export type MidiAccessState = 'idle' | 'requesting' | 'ready' | 'unsupported' | 'denied' | 'error';

export interface MidiSnapshot {
  access: MidiAccessState;
  devices: DeviceSummary;
  pressed: PressedKeys;
}

export interface MidiNavigator {
  requestMIDIAccess?: (options?: MIDIOptions) => Promise<MIDIAccess>;
}

export interface MidiEngine {
  getSnapshot(): MidiSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeNotes(listener: (event: NoteEvent) => void): () => void;
  connect(): Promise<void>;
  /** Virtual input: same pipeline as real MIDI. */
  press(midi: number, velocity?: number): void;
  release(midi: number): void;
  releaseAll(): void;
}

const noDevices = summarizeInputs([]);

export function createMidiEngine(nav: MidiNavigator): MidiEngine {
  let snapshot: MidiSnapshot = { access: 'idle', devices: noDevices, pressed: emptyPressed };
  const listeners = new Set<() => void>();
  const noteListeners = new Set<(event: NoteEvent) => void>();

  const set = (patch: Partial<MidiSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  };

  const handleNote = (event: NoteEvent) => {
    const pressed = applyNoteEvent(snapshot.pressed, event);
    if (pressed !== snapshot.pressed) set({ pressed });
    noteListeners.forEach((l) => l(event));
  };

  const syncInputs = (access: MIDIAccess) => {
    const infos: InputInfo[] = [];
    access.inputs.forEach((input) => {
      // Assign every time: idempotent, and covers inputs that appear later.
      input.onmidimessage = (e) => {
        const event = e.data ? parseMidiMessage(e.data) : null;
        if (event) handleNote(event);
      };
      infos.push({
        id: input.id,
        name: input.name ?? 'MIDI device',
        manufacturer: input.manufacturer ?? '',
        state: input.state,
      });
    });
    const devices = summarizeInputs(infos);
    // A device that just disconnected can no longer send note-off; drop held keys.
    const lost = snapshot.devices.connected && !devices.connected;
    set({ devices, pressed: lost ? emptyPressed : snapshot.pressed });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeNotes(listener) {
      noteListeners.add(listener);
      return () => noteListeners.delete(listener);
    },
    async connect() {
      if (!nav.requestMIDIAccess) {
        set({ access: 'unsupported' });
        return;
      }
      set({ access: 'requesting' });
      try {
        const access = await nav.requestMIDIAccess({ sysex: false });
        access.onstatechange = () => syncInputs(access);
        set({ access: 'ready' });
        syncInputs(access);
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        set({ access: denied ? 'denied' : 'error' });
      }
    },
    press(midi, velocity = 80) {
      handleNote({ type: 'noteOn', midi, velocity, channel: 0 });
    },
    release(midi) {
      handleNote({ type: 'noteOff', midi, velocity: 0, channel: 0 });
    },
    releaseAll() {
      if (snapshot.pressed.size > 0) set({ pressed: emptyPressed });
    },
  };
}

export const midi = createMidiEngine(typeof navigator === 'undefined' ? {} : navigator);
