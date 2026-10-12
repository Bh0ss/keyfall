import { describe, expect, it } from 'vitest';
import { parseMusicXml } from '../src/songs/musicxml';
import { getSong, getSongs } from '../src/songs/catalog';
import { parseXml } from '../src/songs/xml';

const meta = { id: 't', level: 1 as const };

describe('xml reader', () => {
  it('reads nested elements, attributes, entities, comments and CDATA', () => {
    const root = parseXml(
      `<?xml version="1.0"?><!DOCTYPE x><!-- c --><a k="1" j='b&amp;c'><b>x &lt; y</b><c/><d><![CDATA[<raw>]]></d></a>`,
    );
    expect(root.name).toBe('a');
    expect(root.attrs).toEqual({ k: '1', j: 'b&c' });
    expect(root.children.map((c) => c.name)).toEqual(['b', 'c', 'd']);
    expect(root.children[0]!.text).toBe('x < y');
    expect(root.children[2]!.text).toBe('<raw>');
  });
});

describe('parseMusicXml', () => {
  const two = `<score-partwise><work><work-title>Test</work-title></work>
  <identification><creator type="composer">Anon</creator></identification>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      <direction><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><staff>1</staff>
        <notations><technical><fingering>3</fingering></technical></notations></note>
      <note><chord/><pitch><step>E</step><alter>-1</alter><octave>5</octave></pitch><duration>2</duration><staff>1</staff></note>
      <note><rest/><duration>4</duration><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>6</duration><staff>2</staff>
        <notations><technical><fingering>9</fingering></technical></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><tie type="start"/><staff>1</staff></note>
      <note><grace/><pitch><step>A</step><octave>4</octave></pitch><staff>1</staff></note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><staff>1</staff></note>
    </measure>
  </part></score-partwise>`;

  it('reads metadata, tempo and time signature', () => {
    const s = parseMusicXml(two, meta);
    expect(s.title).toBe('Test');
    expect(s.composer).toBe('Anon');
    expect(s.bpm).toBe(120);
    expect(s.timeSignature).toEqual([3, 4]);
    expect(s.hands).toBe('both');
    expect(s.source).toBe('bundled');
    expect(s.musicXml).toBe(two);
  });

  it('converts divisions to beats, handles chords, rests, backup and staff to hand', () => {
    const s = parseMusicXml(two, meta);
    const m1 = s.notes.filter((n) => n.measure === 1).map((n) => [n.midi, n.startBeat, n.durationBeats, n.hand, n.finger]);
    expect(m1).toEqual([
      [48, 0, 3, 'left', undefined],
      [72, 0, 1, 'right', 3],
      [75, 0, 1, 'right', undefined],
    ]);
  });

  it('merges ties, skips grace notes and starts measure 2 after the full bar', () => {
    const s = parseMusicXml(two, meta);
    const m2 = s.notes.filter((n) => n.measure === 2).map((n) => [n.midi, n.startBeat, n.durationBeats]);
    expect(m2).toEqual([
      [66, 3, 2],
      [67, 5, 1],
    ]);
  });

  it('numbers ids uniquely and orders notes by start then pitch', () => {
    const s = parseMusicXml(two, meta);
    expect(new Set(s.notes.map((n) => n.id)).size).toBe(s.notes.length);
    const starts = s.notes.map((n) => n.startBeat);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('puts separate single-staff parts on right then left hand', () => {
    const xml = `<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part>
      <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;
    const s = parseMusicXml(xml, meta);
    expect(s.notes.map((n) => n.hand)).toEqual(['left', 'right']);
    expect(s.bpm).toBe(100);
  });

  it('rejects input that is not MusicXML', () => {
    expect(() => parseMusicXml('<html/>', meta)).toThrow(/MusicXML/);
  });
});

describe('bundled songs', () => {
  const pitches = (id: string) => getSong(id)!.notes.map((n) => n.midi);

  it('lists Mary and Twinkle, open from the start, level 1, right hand', () => {
    const songs = getSongs();
    expect(songs.map((s) => s.id)).toEqual(['mary-had-a-little-lamb', 'twinkle-twinkle-little-star']);
    for (const s of songs) {
      expect(s.level).toBe(1);
      expect(s.hands).toBe('right');
      expect(s.unlockedBy).toBeUndefined();
      expect(s.source).toBe('bundled');
      expect(s.composer).toBe('Traditional');
    }
  });

  it('Mary: 26 notes, correct pitches, beats, measures and fingers', () => {
    const s = getSong('mary-had-a-little-lamb')!;
    expect(s.title).toBe('Mary Had a Little Lamb');
    expect(s.notes).toHaveLength(26);
    expect(s.bpm).toBe(96);
    expect(pitches(s.id)).toEqual([
      64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67, 64, 62, 60, 62, 64, 64, 64, 64, 62, 62, 64, 62, 60,
    ]);
    expect(s.notes[0]).toMatchObject({ startBeat: 0, durationBeats: 1, measure: 1, hand: 'right', finger: 3 });
    expect(s.notes[6]).toMatchObject({ startBeat: 6, durationBeats: 2, measure: 2 });
    const last = s.notes[25]!;
    expect(last).toMatchObject({ startBeat: 28, durationBeats: 4, measure: 8, finger: 1 });
    expect(new Set(s.notes.map((n) => n.measure))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(s.notes.every((n) => n.finger !== undefined)).toBe(true);
    expect(s.notes.find((n) => n.midi === 67)!.finger).toBe(5);
  });

  it('Twinkle: 42 notes over 12 measures, correct pitches and fingers', () => {
    const s = getSong('twinkle-twinkle-little-star')!;
    expect(s.notes).toHaveLength(42);
    expect(s.notes.at(-1)).toMatchObject({ midi: 60, startBeat: 46, durationBeats: 2, measure: 12 });
    expect(pitches(s.id).slice(0, 14)).toEqual([60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]);
    expect(s.notes.every((n) => n.finger !== undefined)).toBe(true);
    expect(Math.max(...s.notes.map((n) => n.measure))).toBe(12);
  });
});
