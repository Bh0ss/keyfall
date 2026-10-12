import { describe, expect, it, vi } from 'vitest';
import { createMidiEngine, type MidiNavigator } from '../src/midi/engine';

type Listener = (e: unknown) => void;

function fakeInput(id: string, name: string, state: 'connected' | 'disconnected' = 'connected') {
  return { id, name, manufacturer: 'Roland', state, onmidimessage: null as Listener | null };
}

function fakeAccess(initial: ReturnType<typeof fakeInput>[]) {
  const inputs = new Map(initial.map((i) => [i.id, i]));
  const access = {
    inputs,
    onstatechange: null as Listener | null,
    add(i: ReturnType<typeof fakeInput>) {
      inputs.set(i.id, i);
      access.onstatechange?.({ port: i });
    },
    remove(id: string) {
      const i = inputs.get(id)!;
      i.state = 'disconnected';
      access.onstatechange?.({ port: i });
    },
  };
  return access;
}

const nav = (access: unknown): MidiNavigator => ({ requestMIDIAccess: () => Promise.resolve(access as never) });

describe('midi engine', () => {
  it('reports unsupported when requestMIDIAccess is missing', async () => {
    const engine = createMidiEngine({});
    await engine.connect();
    expect(engine.getSnapshot().access).toBe('unsupported');
  });

  it('reports denied on NotAllowedError and error otherwise', async () => {
    const denied = createMidiEngine({
      requestMIDIAccess: () => Promise.reject(new DOMException('no', 'NotAllowedError')),
    });
    await denied.connect();
    expect(denied.getSnapshot().access).toBe('denied');
    const broken = createMidiEngine({ requestMIDIAccess: () => Promise.reject(new Error('boom')) });
    await broken.connect();
    expect(broken.getSnapshot().access).toBe('error');
  });

  it('listens to every input and lights keys from raw messages, including velocity-0 note-off', async () => {
    const a = fakeInput('a', 'FP-30X');
    const b = fakeInput('b', 'Other');
    const engine = createMidiEngine(nav(fakeAccess([a, b])));
    await engine.connect();
    a.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]) });
    b.onmidimessage!({ data: new Uint8Array([0x90, 64, 70]) });
    expect([...engine.getSnapshot().pressed.keys()].sort()).toEqual([60, 64]);
    a.onmidimessage!({ data: new Uint8Array([0x90, 60, 0]) });
    expect([...engine.getSnapshot().pressed.keys()]).toEqual([64]);
  });

  it('updates devices on statechange without reconnecting, and attaches new inputs', async () => {
    const access = fakeAccess([]);
    const engine = createMidiEngine(nav(access));
    await engine.connect();
    expect(engine.getSnapshot().devices.connected).toBe(false);
    const piano = fakeInput('p', 'FP-30X');
    access.add(piano);
    expect(engine.getSnapshot().devices).toMatchObject({ connected: true, name: 'FP-30X' });
    piano.onmidimessage!({ data: new Uint8Array([0x90, 72, 80]) });
    expect(engine.getSnapshot().pressed.has(72)).toBe(true);
    access.remove('p');
    expect(engine.getSnapshot().devices.connected).toBe(false);
  });

  it('releases held notes when the device disconnects', async () => {
    const access = fakeAccess([fakeInput('p', 'FP-30X')]);
    const engine = createMidiEngine(nav(access));
    await engine.connect();
    access.inputs.get('p')!.onmidimessage!({ data: new Uint8Array([0x90, 60, 80]) });
    access.remove('p');
    expect(engine.getSnapshot().pressed.size).toBe(0);
  });

  it('virtual press/release use the same pipeline and notify subscribers', () => {
    const engine = createMidiEngine({});
    const onNote = vi.fn();
    const onChange = vi.fn();
    engine.subscribeNotes(onNote);
    engine.subscribe(onChange);
    engine.press(60);
    expect(engine.getSnapshot().pressed.get(60)).toBe(80);
    expect(onNote).toHaveBeenCalledWith({ type: 'noteOn', midi: 60, velocity: 80, channel: 0 });
    engine.release(60);
    expect(engine.getSnapshot().pressed.size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('keeps the snapshot reference stable when nothing changed', () => {
    const engine = createMidiEngine({});
    const before = engine.getSnapshot();
    engine.release(60);
    expect(engine.getSnapshot()).toBe(before);
  });
});
