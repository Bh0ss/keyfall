import { describe, expect, it } from 'vitest';
import { arrange } from '../src/arrange/arrange';
import { arrangementToFile } from '../src/arrange/toImport';
import type { Version } from '../src/arrange/types';
import { autoFingersFor } from '../src/engine/fingering';
import { analysePositions } from '../src/engine/positions';
import { analyseFile } from '../src/import/analyse';
import { buildSong, suggestLevel } from '../src/import/build';
import { ImportError } from '../src/import/limits';
import { parseMusicXml } from '../src/songs/musicxml';
import { bundledSong } from './fixtures/audio';
import { eventsOf } from './fixtures/events';

const SONGS = [
  ['ode-to-joy', [4, 4]],
  ['when-the-saints', [4, 4]],
  ['fur-elise', [3, 4]],
] as const;
const VERSIONS: Version[] = ['beginner', 'full'];

/** Per measure and voice, the sum of the durations of the non-chord notes, in the file's divisions. */
function barFill(xml: string): { divisions: number; fills: number[][] } {
  const divisions = Number(/<divisions>(\d+)/.exec(xml)![1]);
  const fills = [...xml.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g)].map((m) => {
    const perVoice = new Map<string, number>();
    for (const n of m[1]!.matchAll(/<note>([\s\S]*?)<\/note>/g)) {
      if (n[1]!.includes('<chord/>')) continue;
      const voice = /<voice>(\d+)/.exec(n[1]!)![1]!;
      perVoice.set(voice, (perVoice.get(voice) ?? 0) + Number(/<duration>(\d+)/.exec(n[1]!)![1]));
    }
    return [...perVoice.values()];
  });
  return { divisions, fills };
}

describe.each(SONGS)('arrange %s from a perfect transcription', (stem, ts) => {
  const song = bundledSong(stem);
  const events = eventsOf(song, 30);
  const barDivs = (ts[0] * 16) / ts[1]; // sixteenths per bar (divisions are 4 per quarter)

  it.each(VERSIONS)('%s: both hands, in range, 88-key, deterministic, MusicXML bytes identical on a rerun', (version) => {
    const a = arrange(events, { version, timeSignature: ts as unknown as [number, number] });
    expect(a.notes.some((n) => n.hand === 'right')).toBe(true);
    expect(a.notes.some((n) => n.hand === 'left')).toBe(true);
    expect(a.notes.every((n) => n.midi >= 21 && n.midi <= 108 && n.startBeat >= 0 && n.durationBeats > 0)).toBe(true);
    const rh = a.notes.filter((n) => n.hand === 'right');
    const lh = a.notes.filter((n) => n.hand === 'left');
    const [rLo, rHi] = version === 'beginner' ? [60, 79] : [55, 84];
    expect(rh.every((n) => n.midi >= rLo && n.midi <= rHi)).toBe(true);
    expect(lh.every((n) => n.midi >= 36 && n.midi <= (version === 'beginner' ? 54 : 64))).toBe(true);
    if (version === 'beginner') {
      // The top line is single notes: no two right-hand notes start together.
      expect(new Set(rh.map((n) => n.startBeat)).size).toBe(rh.length);
    }
    const f1 = arrangementToFile(a, { title: 'T', composer: 'C' });
    const f2 = arrangementToFile(arrange(events, { version, timeSignature: ts as unknown as [number, number] }), { title: 'T', composer: 'C' });
    expect(Buffer.from(f1.bytes).equals(Buffer.from(f2.bytes))).toBe(true);
    expect(f1.fileName).toBe('T.musicxml');
  });

  it.each(VERSIONS)('%s: the MusicXML round-trips through parseMusicXml with full bars in both staves', (version) => {
    const a = arrange(events, { version, timeSignature: ts as unknown as [number, number] });
    const { bytes } = arrangementToFile(a, { title: 'Round trip', composer: 'Nobody' });
    const xml = new TextDecoder().decode(bytes);
    const { fills } = barFill(xml);
    expect(fills).toHaveLength(a.bars);
    for (const bar of fills) for (const f of bar) expect(f).toBe(barDivs);
    const back = parseMusicXml(xml, { id: 'x', level: 1, source: 'imported' });
    expect(back.timeSignature).toEqual(ts);
    expect(back.bpm).toBe(a.bpm);
    const key = (n: { midi: number; startBeat: number; durationBeats: number; hand: string }) => `${n.hand}:${n.startBeat}:${n.midi}:${n.durationBeats}`;
    expect(back.notes.map(key).sort()).toEqual(a.notes.map(key).sort());
  });

  it.each(VERSIONS)('%s: goes through the import pipeline (hands from the two staves, level, fingering, hand positions)', async (version) => {
    const a = arrange(events, { version, timeSignature: ts as unknown as [number, number] });
    const file = arrangementToFile(a, { title: 'Pipeline', composer: 'Nobody' });
    const analysis = await analyseFile(file.fileName, file.bytes);
    expect(analysis.groupHands).toEqual(['right', 'left']);
    const built = buildSong(analysis, 'imp-1', { title: 'Pipeline', composer: 'Nobody', splitMode: 'groups', splitMidi: 60, level: suggestLevel(analysis, { splitMode: 'groups', splitMidi: 60 }) });
    expect(built.song.hands).toBe('both');
    expect(built.song.notes.length).toBe(a.notes.length);
    // Auto-fingering and hand-position analysis work on the result, unchanged code.
    const fingers = autoFingersFor(built.song.notes);
    expect(built.song.notes.every((n) => fingers.has(n.id) && fingers.get(n.id)! >= 1 && fingers.get(n.id)! <= 5)).toBe(true);
    const map = analysePositions(built.song.notes, (n) => fingers.get(n.id));
    expect(map.spans.length).toBeGreaterThan(0);
  });

  it('the beginner version is no harder than the full one', async () => {
    const level = async (version: Version) => {
      const f = arrangementToFile(arrange(events, { version, timeSignature: ts as unknown as [number, number] }), { title: 'L', composer: '' });
      const an = await analyseFile(f.fileName, f.bytes);
      return suggestLevel(an, { splitMode: 'groups', splitMidi: 60 });
    };
    const rank = (l: number | 'expert') => (l === 'expert' ? 6 : l);
    expect(rank(await level('beginner'))).toBeLessThanOrEqual(rank(await level('full')));
  });
});

describe('the arrangement is our own, not the recording', () => {
  it('the left hand is not the transcribed left hand: at most a third of its (pitch, start) pairs coincide', () => {
    for (const [stem, ts] of SONGS) {
      const events = eventsOf(bundledSong(stem), 30);
      const a = arrange(events, { version: 'full', timeSignature: ts as unknown as [number, number] });
      const spb = 60 / a.bpm;
      const raw = new Set(events.filter((e) => e.midi < 60).map((e) => `${e.midi}:${Math.round(((e.startSec - a.grid.downbeatSec) / spb) * 4)}`));
      const lh = a.notes.filter((n) => n.hand === 'left');
      const same = lh.filter((n) => raw.has(`${n.midi}:${Math.round(n.startBeat * 4)}`)).length;
      expect(same / lh.length).toBeLessThanOrEqual(1 / 3);
    }
  });

  it('the right hand has no more top-line notes than the transcription has notes in the melody band, and is simplified', () => {
    const events = eventsOf(bundledSong('when-the-saints'), 30);
    const a = arrange(events, { version: 'beginner', timeSignature: [4, 4] });
    const top = a.notes.filter((n) => n.hand === 'right');
    expect(top.length).toBeLessThanOrEqual(events.length);
    expect(top.every((n) => n.durationBeats >= 0.5 && (n.startBeat * 2) % 1 === 0)).toBe(true);
  });
});

describe('options', () => {
  const events = eventsOf(bundledSong('ode-to-joy'), 30);

  it('a given tempo (tap) is used as is, and the automatic estimate is still reported', () => {
    const a = arrange(events, { version: 'beginner', timeSignature: [4, 4], bpm: 80 });
    expect(a.bpm).toBe(80);
    expect(Math.abs(a.estimatedBpm - 100)).toBeLessThan(3);
  });

  it('a given downbeat moves the bar lines', () => {
    const a = arrange(events, { version: 'beginner', timeSignature: [4, 4], bpm: 100, downbeatSec: -0.6 });
    expect(a.grid.downbeatSec).toBe(-0.6);
    expect(a.notes.filter((n) => n.hand === 'right')[0]!.startBeat).toBe(1);
  });

  it('trim keeps only the notes inside the chosen seconds', () => {
    const a = arrange(events, { version: 'beginner', timeSignature: [4, 4], trimSec: [6, 12] });
    const secs = a.melody.map((n) => a.grid.downbeatSec + n.startBeat * (60 / a.bpm));
    expect(Math.min(...secs)).toBeGreaterThanOrEqual(6 - 0.3);
    expect(Math.max(...secs)).toBeLessThanOrEqual(12 + 0.3);
    expect(a.bars).toBeLessThan(arrange(events, { version: 'beginner', timeSignature: [4, 4] }).bars);
  });

  it('says so in plain words when there is nothing to arrange or the time signature cannot be written', () => {
    expect(() => arrange([], { version: 'full', timeSignature: [4, 4] })).toThrow(ImportError);
    expect(() => arrange([{ midi: 3, startSec: 0, durationSec: 1, amplitude: 1 }], { version: 'full', timeSignature: [4, 4] })).toThrow(/No notes/);
    expect(() => arrange(events, { version: 'full', timeSignature: [5, 7] })).toThrow(ImportError);
    expect(() => arrange(events, { version: 'full', timeSignature: [4, 4], trimSec: [100, 200] })).toThrow(/No notes/);
  });
});

describe('arrangementToFile', () => {
  it('makes a safe file name and keeps the title in the score', async () => {
    const a = arrange(eventsOf(bundledSong('ode-to-joy'), 10), { version: 'beginner', timeSignature: [4, 4] });
    const f = arrangementToFile(a, { title: '../My <Song>: "x"/y', composer: 'A & B' });
    expect(f.fileName).toMatch(/^[\w -]+\.musicxml$/);
    const an = await analyseFile(f.fileName, f.bytes);
    expect(an.title).toBe('../My <Song>: "x"/y');
    expect(an.composer).toBe('A & B');
  });
});
