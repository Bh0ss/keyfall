import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from '../src/midi/parse';

describe('parseMidiMessage', () => {
  it('reads note-on with pitch, velocity and channel', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'noteOn', midi: 60, velocity: 100, channel: 0 });
  });

  it('treats note-on with velocity 0 as note-off', () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ type: 'noteOff', midi: 60, velocity: 0, channel: 0 });
  });

  it('reads note-off and keeps its release velocity', () => {
    expect(parseMidiMessage([0x80, 72, 33])).toEqual({ type: 'noteOff', midi: 72, velocity: 33, channel: 0 });
  });

  it('extracts the channel from the low nibble for both message kinds', () => {
    expect(parseMidiMessage([0x95, 61, 80])?.channel).toBe(5);
    expect(parseMidiMessage([0x8f, 61, 0])?.channel).toBe(15);
  });

  it('accepts a Uint8Array like MIDIMessageEvent.data', () => {
    expect(parseMidiMessage(new Uint8Array([0x91, 21, 127]))).toEqual({
      type: 'noteOn',
      midi: 21,
      velocity: 127,
      channel: 1,
    });
  });

  it.each([
    ['control change', [0xb0, 64, 127]],
    ['pitch bend', [0xe0, 0, 64]],
    ['program change (2 bytes)', [0xc0, 5]],
    ['active sensing', [0xfe]],
    ['timing clock', [0xf8]],
    ['truncated note-on', [0x90, 60]],
    ['empty', []],
  ])('ignores %s', (_label, bytes) => {
    expect(parseMidiMessage(bytes)).toBeNull();
  });
});
