import { describe, expect, it } from 'vitest';
import { applyNoteEvent, emptyPressed } from '../src/midi/pressed';

describe('pressed-key state', () => {
  it('starts empty', () => {
    expect(emptyPressed.size).toBe(0);
  });

  it('holds a note from note-on until note-off, remembering velocity', () => {
    const down = applyNoteEvent(emptyPressed, { type: 'noteOn', midi: 60, velocity: 90, channel: 0 });
    expect(down.get(60)).toBe(90);
    const up = applyNoteEvent(down, { type: 'noteOff', midi: 60, velocity: 0, channel: 0 });
    expect(up.has(60)).toBe(false);
  });

  it('tracks several notes independently (chords)', () => {
    let s = emptyPressed;
    for (const midi of [60, 64, 67]) s = applyNoteEvent(s, { type: 'noteOn', midi, velocity: 80, channel: 0 });
    s = applyNoteEvent(s, { type: 'noteOff', midi: 64, velocity: 0, channel: 0 });
    expect([...s.keys()].sort()).toEqual([60, 67]);
  });

  it('does not mutate the previous state', () => {
    const a = applyNoteEvent(emptyPressed, { type: 'noteOn', midi: 60, velocity: 80, channel: 0 });
    applyNoteEvent(a, { type: 'noteOff', midi: 60, velocity: 0, channel: 0 });
    expect(a.has(60)).toBe(true);
    expect(emptyPressed.size).toBe(0);
  });

  it('returns the same state for a release of a key that is not held', () => {
    const s = applyNoteEvent(emptyPressed, { type: 'noteOff', midi: 60, velocity: 0, channel: 0 });
    expect(s).toBe(emptyPressed);
  });
});
