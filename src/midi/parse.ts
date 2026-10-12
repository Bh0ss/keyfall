export interface NoteEvent {
  type: 'noteOn' | 'noteOff';
  midi: number;
  velocity: number;
  channel: number;
}

/** Parse one raw MIDI message. Returns null for anything that is not a note message. */
export function parseMidiMessage(data: ArrayLike<number>): NoteEvent | null {
  if (data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const midi = data[1] & 0x7f;
  const velocity = data[2] & 0x7f;
  if (status === 0x90) {
    // Note-on with velocity 0 is note-off by MIDI convention.
    return { type: velocity === 0 ? 'noteOff' : 'noteOn', midi, velocity, channel };
  }
  if (status === 0x80) return { type: 'noteOff', midi, velocity, channel };
  return null;
}
