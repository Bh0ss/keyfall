import { describe, expect, it } from 'vitest';
import { summarizeInputs, type InputInfo } from '../src/midi/devices';

const input = (over: Partial<InputInfo>): InputInfo => ({
  id: 'a',
  name: 'FP-30X',
  manufacturer: 'Roland',
  state: 'connected',
  ...over,
});

describe('summarizeInputs', () => {
  it('reports no device when there are no inputs', () => {
    expect(summarizeInputs([])).toEqual({ connected: false, name: null, transport: null, count: 0 });
  });

  it('ignores inputs that are disconnected', () => {
    expect(summarizeInputs([input({ state: 'disconnected' })]).connected).toBe(false);
  });

  it('uses the first connected input name', () => {
    const s = summarizeInputs([input({ id: 'x', state: 'disconnected', name: 'Old' }), input({ name: 'FP-30X' })]);
    expect(s).toMatchObject({ connected: true, name: 'FP-30X', count: 1 });
  });

  it('detects bluetooth from the name or manufacturer when present', () => {
    expect(summarizeInputs([input({ name: 'FP-30X Bluetooth' })]).transport).toBe('Bluetooth');
    expect(summarizeInputs([input({ manufacturer: 'Apple Bluetooth' })]).transport).toBe('Bluetooth');
  });

  it('leaves transport null when it cannot be detected', () => {
    expect(summarizeInputs([input({})]).transport).toBeNull();
  });

  it('cleans transport and generic MIDI words out of the display name', () => {
    const s = summarizeInputs([input({ name: 'FP-30X MIDI Bluetooth' })]);
    expect(s).toMatchObject({ name: 'FP-30X', transport: 'Bluetooth' });
    expect(summarizeInputs([input({ name: 'FP-30X MIDI' })]).name).toBe('FP-30X');
    expect(summarizeInputs([input({ name: 'MIDI' })]).name).toBe('MIDI');
  });
});
