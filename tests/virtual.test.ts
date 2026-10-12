import { describe, expect, it } from 'vitest';
import { KEY_TO_MIDI, midiForKeyEvent } from '../src/midi/virtual';

describe('computer-keyboard piano', () => {
  it('maps A W S E D F T G Y H U J K to C4 through C5', () => {
    const keys = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];
    expect(keys.map((k) => KEY_TO_MIDI[k])).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]);
  });

  it('is case-insensitive and ignores unmapped keys', () => {
    expect(midiForKeyEvent({ key: 'A', ctrlKey: false, metaKey: false, altKey: false })).toBe(60);
    expect(midiForKeyEvent({ key: 'z', ctrlKey: false, metaKey: false, altKey: false })).toBeNull();
  });

  it('ignores browser shortcuts such as Cmd+A', () => {
    expect(midiForKeyEvent({ key: 'a', ctrlKey: false, metaKey: true, altKey: false })).toBeNull();
  });
});

import { virtualInputEnabled } from '../src/midi/virtual';

describe('virtualInputEnabled', () => {
  it('is on in dev, and in production only with ?debug=1', () => {
    expect(virtualInputEnabled(true, '')).toBe(true);
    expect(virtualInputEnabled(false, '')).toBe(false);
    expect(virtualInputEnabled(false, '?debug=0')).toBe(false);
    expect(virtualInputEnabled(false, '?x=1&debug=1')).toBe(true);
  });
});
