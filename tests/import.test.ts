import 'fake-indexeddb/auto';
import { Midi } from '@tonejs/midi';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyseFile } from '../src/import/analyse';
import { buildSong, suggestLevel } from '../src/import/build';
import { estimateDifficulty, measureSong } from '../src/import/difficulty';
import { ImportError, MAX_FILE_BYTES, MAX_NOTES, formatOf } from '../src/import/limits';
import { unpackMxl } from '../src/import/mxl';
import { saveNewImport, updateImport } from '../src/import/save';
import { assignHands, canSplitByGroups, defaultSplit, handByPitch, noteName } from '../src/import/split';
import type { ImportChoices } from '../src/import/types';
import { findPlayableSong, findSong, getAllSongs, hasApproximateSheet, importedRecord, loadLibrary } from '../src/songs/library';
import { getSongs } from '../src/songs/catalog';
import { parseMusicXml } from '../src/songs/musicxml';
import { KeyfallDb } from '../src/storage/db';
import { allImportedSongs, deleteImportedSong } from '../src/storage/songs';
import {
  BASS, FIXTURE_BPM, FIXTURE_COMPOSER, FIXTURE_NOTE_COUNT, FIXTURE_TITLE, MELODY, makeZip, musicXml, mxl, oneTrackMidi, singleStaffMusicXml, twoTrackMidi, zipBomb,
} from './fixtures/generate';

const choices = (over: Partial<ImportChoices> = {}): ImportChoices => ({
  title: FIXTURE_TITLE, composer: FIXTURE_COMPOSER, splitMode: 'pitch', splitMidi: 60, level: 1, ...over,
});

const rejects = async (name: string, bytes: Uint8Array) => {
  const err = await analyseFile(name, bytes).then(() => null, (e: unknown) => e);
  expect(err, name).toBeInstanceOf(ImportError);
  return (err as ImportError).message;
};

describe('format detection', () => {
  it('accepts .mid .midi .musicxml .xml .mxl in any case and nothing else', () => {
    expect(formatOf('a.mid')).toBe('midi');
    expect(formatOf('A.MIDI')).toBe('midi');
    expect(formatOf('a.musicxml')).toBe('musicxml');
    expect(formatOf('a.XML')).toBe('musicxml');
    expect(formatOf('a.mxl')).toBe('mxl');
    expect(formatOf('a.pdf')).toBeNull();
    expect(formatOf('midi')).toBeNull();
  });
});

describe('one-track MIDI: split at middle C', () => {
  it('reads metadata, tempo, time signature and every note', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    expect(a).toMatchObject({ format: 'midi', title: FIXTURE_TITLE, bpm: FIXTURE_BPM, timeSignature: [4, 4], skipped: 0 });
    expect(a.notes).toHaveLength(FIXTURE_NOTE_COUNT);
    expect(a.groups).toHaveLength(1);
    expect(canSplitByGroups(a)).toBe(false);
    expect(defaultSplit(a)).toEqual({ mode: 'pitch', splitMidi: 60 });
  });

  it('splits at middle C by default: C4 and above right, below left', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    const { song } = buildSong(a, 'imp-1', choices());
    expect(song.hands).toBe('both');
    expect(song.notes.filter((n) => n.hand === 'right')).toHaveLength(MELODY.length);
    expect(song.notes.filter((n) => n.hand === 'left').map((n) => n.midi).sort()).toEqual(BASS.map((b) => b.midi).sort());
    expect(handByPitch(60, 60)).toBe('right');
    expect(handByPitch(59, 60)).toBe('left');
  });

  it('honours an adjustable split point', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    const handsAt = (splitMidi: number) => {
      const { song } = buildSong(a, 'imp-1', choices({ splitMidi }));
      return { right: song.notes.filter((n) => n.hand === 'right').length, hands: song.hands };
    };
    const above = (m: number) => a.notes.filter((n) => n.midi >= m).length;
    expect(handsAt(65).right).toBe(above(65));
    expect(handsAt(65).right).toBe(4); // F4 and G4 in bars 3 and 4
    expect(handsAt(21)).toEqual({ right: FIXTURE_NOTE_COUNT, hands: 'right' });
    expect(handsAt(108)).toEqual({ right: 0, hands: 'left' });
    expect(handsAt(44).right).toBe(above(44));
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(21)).toBe('A0');
  });

  it('snaps the wobbly MIDI timing to the 16th grid and numbers the bars', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    expect(a.notes.some((n) => n.startBeat % 0.25 !== 0)).toBe(true); // the fixture really is off-grid
    const { song } = buildSong(a, 'imp-1', choices());
    for (const n of song.notes) {
      expect((n.startBeat * 4) % 1).toBe(0);
      expect((n.durationBeats * 4) % 1).toBe(0);
      expect(n.measure).toBe(Math.floor(n.startBeat / 4) + 1);
    }
    const starts = song.notes.filter((n) => n.hand === 'right').map((n) => n.startBeat);
    expect(starts).toEqual(MELODY.map((m) => m.startBeat));
    expect(song.notes.at(-1)!.measure).toBe(4);
    expect(song.notes.map((n) => n.id)).toEqual(song.notes.map((_, i) => `imp-1-${i + 1}`));
  });

  it('generates an approximate MusicXML that parses back to the same notes', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    const built = buildSong(a, 'imp-1', choices());
    expect(built.approximate).toBe(true);
    const again = parseMusicXml(built.song.musicXml!, { id: 'imp-1', level: 1 });
    const key = (s: { notes: { midi: number; startBeat: number; durationBeats: number; hand: string; measure: number }[] }) =>
      s.notes.map((n) => [n.midi, n.startBeat, n.durationBeats, n.hand, n.measure].join('/')).sort();
    expect(key(again)).toEqual(key(built.song));
  });
});

describe('two-track MIDI: split by track', () => {
  it('offers the track split and gives the higher track the right hand whatever the order', async () => {
    const a = await analyseFile('frere2.mid', twoTrackMidi());
    expect(a.groups.map((g) => g.label)).toEqual(['Bass', 'Melody']);
    expect(a.groupHands).toEqual(['left', 'right']);
    expect(defaultSplit(a).mode).toBe('groups');
    const { song } = buildSong(a, 'imp-2', choices({ splitMode: 'groups' }));
    expect(song.notes.filter((n) => n.hand === 'right')).toHaveLength(MELODY.length);
    expect(song.notes.filter((n) => n.hand === 'left')).toHaveLength(BASS.length);
  });

  it('can still be split by pitch instead, and the choice changes the result', async () => {
    const a = await analyseFile('frere2.mid', twoTrackMidi());
    const byPitch = assignHands(a, a.notes, 'pitch', 66);
    const byTrack = assignHands(a, a.notes, 'groups', 66);
    expect(byPitch).not.toEqual(byTrack);
  });

  it('ignores empty and percussion tracks when counting', async () => {
    const midi = new Midi(twoTrackMidi());
    midi.addTrack();
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 100 });
    const a = await analyseFile('x.mid', midi.toArray());
    expect(a.groups).toHaveLength(2);
    expect(a.notes).toHaveLength(FIXTURE_NOTE_COUNT);
  });

  it('falls back to a pitch split with three or more tracks', async () => {
    const midi = new Midi(twoTrackMidi());
    midi.addTrack().addNote({ midi: 72, ticks: 0, durationTicks: 480 });
    const a = await analyseFile('x.mid', midi.toArray());
    expect(a.groups).toHaveLength(3);
    expect(a.groupHands).toBeUndefined();
    expect(defaultSplit(a).mode).toBe('pitch');
  });
});

describe('MusicXML', () => {
  it('two staves: split by staff, metadata from the file, own sheet kept', async () => {
    const xml = musicXml();
    const a = await analyseFile('frere.musicxml', new TextEncoder().encode(xml));
    expect(a).toMatchObject({ format: 'musicxml', title: FIXTURE_TITLE, composer: FIXTURE_COMPOSER, bpm: FIXTURE_BPM, timeSignature: [4, 4], groupNoun: 'staff' });
    expect(a.groupHands).toEqual(['right', 'left']);
    expect(defaultSplit(a).mode).toBe('groups');
    const built = buildSong(a, 'imp-3', choices({ splitMode: 'groups' }));
    expect(built.approximate).toBe(false);
    expect(built.song.musicXml).toBe(xml);
    expect(built.song.notes.filter((n) => n.hand === 'right')).toHaveLength(MELODY.length);
    expect(built.song.notes.filter((n) => n.hand === 'left')).toHaveLength(4); // one whole note per bar
    expect(built.song.source).toBe('imported');
  });

  it('one staff: split at middle C and adjustable', async () => {
    const a = await analyseFile('one.xml', new TextEncoder().encode(singleStaffMusicXml()));
    expect(a.groupHands).toBeUndefined();
    expect(defaultSplit(a)).toEqual({ mode: 'pitch', splitMidi: 60 });
    const mid = buildSong(a, 'imp-4', choices());
    expect(mid.song.notes.filter((n) => n.hand === 'left').map((n) => n.midi).sort()).toEqual([43, 43, 48, 48]);
    const low = buildSong(a, 'imp-4', choices({ splitMidi: 44 }));
    expect(low.song.notes.filter((n) => n.hand === 'left').map((n) => n.midi)).toEqual([43, 43]);
  });

  it('falls back to the file name when the score has no title', async () => {
    const xml = musicXml().replace(/<work>.*<\/work>/, '');
    const a = await analyseFile('my_nice-song.musicxml', new TextEncoder().encode(xml));
    expect(a.title).toBe('my nice song');
  });

  it('decodes UTF-16 files', async () => {
    const xml = musicXml().replace('Traditional', 'Beethoven Ünder');
    const u16 = new Uint8Array(2 + xml.length * 2);
    u16[0] = 0xff;
    u16[1] = 0xfe;
    for (let i = 0; i < xml.length; i++) {
      u16[2 + i * 2] = xml.charCodeAt(i) & 0xff;
      u16[3 + i * 2] = xml.charCodeAt(i) >> 8;
    }
    const a = await analyseFile('u.musicxml', u16);
    expect(a.composer).toBe('Beethoven Ünder');
  });
});

describe('.mxl (zipped MusicXML)', () => {
  it('unpacks the rootfile named in container.xml and imports like the plain file', async () => {
    const plain = await analyseFile('a.musicxml', new TextEncoder().encode(musicXml()));
    const zipped = await analyseFile('a.mxl', mxl());
    expect(zipped.format).toBe('mxl');
    expect(zipped.notes).toEqual(plain.notes);
    expect(zipped.title).toBe(plain.title);
    expect(zipped.musicXml).toBe(musicXml());
  });

  it('finds the score without a container.xml, and reads stored (uncompressed) entries', async () => {
    const enc = new TextEncoder();
    const zip = makeZip([{ name: 'score.xml', data: enc.encode(musicXml()), method: 0 }]);
    expect(await unpackMxl(zip)).toBe(musicXml());
  });

  it('refuses an archive with no score, a damaged one, and not-a-zip', async () => {
    const enc = new TextEncoder();
    expect(await rejects('a.mxl', makeZip([{ name: 'readme.txt', data: enc.encode('hi') }]))).toMatch(/No score/);
    const good = mxl();
    expect(await rejects('a.mxl', good.subarray(0, good.length - 40))).toMatch(/damaged|not a zip/);
    expect(await rejects('a.mxl', enc.encode('PK this is not a zip at all, just text'))).toMatch(/damaged|not a zip/);
  });

  it('zip-bomb guard: refuses an archive that lies about its size, and one that admits it', async () => {
    const cap = 30 * 1024 * 1024;
    const liar = zipBomb(cap + 1024 * 1024, true);
    expect(liar.length).toBeLessThan(200_000);
    expect(await rejects('bomb.mxl', liar)).toMatch(/expands to more than/);
    expect(await rejects('bomb.mxl', zipBomb(cap + 1024 * 1024, false))).toMatch(/expands to more than/);
  });
});

describe('untrusted input is refused politely', () => {
  it('rejects wrong types, empty and oversize files', async () => {
    expect(await rejects('song.pdf', new Uint8Array([1, 2, 3]))).toMatch(/imports \.mid/);
    expect(await rejects('song.mid', new Uint8Array(0))).toMatch(/empty/);
    expect(await rejects('big.mid', new Uint8Array(MAX_FILE_BYTES + 1))).toMatch(/larger than/);
  });

  it('rejects garbage dressed as MIDI or MusicXML', async () => {
    const enc = new TextEncoder();
    expect(await rejects('x.mid', enc.encode('this is not midi at all'))).toMatch(/MIDI/);
    expect(await rejects('x.musicxml', enc.encode('plain words, no tags'))).toMatch(/could not be read|not a MusicXML/);
    expect(await rejects('x.xml', enc.encode('<html><body>hi</body></html>'))).toMatch(/not a MusicXML score/);
    expect(await rejects('x.xml', enc.encode('<score-timewise version="3.1"></score-timewise>'))).toMatch(/not a MusicXML score/);
    expect(await rejects('x.xml', enc.encode('<score-partwise><part-list/><part id="P1"><measure number="1"/></part></score-partwise>'))).toMatch(/No playable notes/);
  });

  it('rejects XML that declares entities (expansion attacks)', async () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE score-partwise [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]>${musicXml().replace(/^<\?xml[^>]*>\s*/, '')}`;
    expect(await rejects('evil.musicxml', new TextEncoder().encode(evil))).toMatch(/entities/);
  });

  it('rejects a MIDI file with no notes and one with too many', async () => {
    const empty = new Midi();
    empty.addTrack();
    expect(await rejects('empty.mid', empty.toArray())).toMatch(/No playable notes/);
    const many = new Midi();
    const t = many.addTrack();
    for (let i = 0; i <= MAX_NOTES; i++) t.addNote({ midi: 60, ticks: i * 10, durationTicks: 5 });
    expect(await rejects('many.mid', many.toArray())).toMatch(/more than/);
  });

  it('leaves out notes beyond the 88 keys and says how many', async () => {
    const m = new Midi();
    const t = m.addTrack();
    t.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    t.addNote({ midi: 10, ticks: 480, durationTicks: 480 });
    t.addNote({ midi: 120, ticks: 960, durationTicks: 480 });
    const a = await analyseFile('x.mid', m.toArray());
    expect(a.notes).toHaveLength(1);
    expect(a.skipped).toBe(2);
  });

  it('strips control characters and caps long titles', async () => {
    const m = new Midi();
    m.header.name = `Evil\u0000Title\n${'x'.repeat(500)}`;
    m.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    const a = await analyseFile('x.mid', m.toArray());
    expect([...a.title].every((c) => c.charCodeAt(0) >= 32)).toBe(true);
    expect(a.title.length).toBeLessThanOrEqual(80);
  });
});

describe('metadata', () => {
  it('MIDI without a useful name takes the file name; composer from a "Composer:" meta text', async () => {
    const m = new Midi();
    m.header.name = 'Track 1';
    m.header.meta.push({ text: 'Composer: Anon Ymous', type: 'text', ticks: 0 });
    m.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    const a = await analyseFile('Sunny_afternoon-waltz.MID', m.toArray());
    expect(a.title).toBe('Sunny afternoon waltz');
    expect(a.composer).toBe('Anon Ymous');
  });

  it('title and composer are editable and fall back when blanked', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    expect(buildSong(a, 'i', choices({ title: '  My arrangement ', composer: 'Me' })).song).toMatchObject({ title: 'My arrangement', composer: 'Me' });
    expect(buildSong(a, 'i', choices({ title: '  ', composer: '' })).song).toMatchObject({ title: 'Imported song', composer: 'Unknown' });
  });

  it('unusual time signatures: 3/4 bars and 6/8 are numbered by their own length', async () => {
    const m = new Midi();
    m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    const t = m.addTrack();
    for (let i = 0; i < 9; i++) t.addNote({ midi: 60, ticks: i * 480, durationTicks: 400 });
    const a = await analyseFile('w.mid', m.toArray());
    const { song } = buildSong(a, 'w', choices());
    expect(song.timeSignature).toEqual([3, 4]);
    expect(song.notes.map((n) => n.measure)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });
});

describe('difficulty estimate', () => {
  const level = (l: unknown) => (l === 'expert' ? 6 : (l as number));
  const specLevel = (id: string) => level(getSongs().find((s) => s.id === id)!.level);

  it('lands within one level of the spec level for every bundled song, and at the extremes', () => {
    for (const s of getSongs()) {
      const est = estimateDifficulty(s).level;
      expect(Math.abs(level(est) - level(s.level)), `${s.id}: estimated ${est}, spec ${s.level}`).toBeLessThanOrEqual(1);
    }
    expect(estimateDifficulty(getSongs().find((s) => s.id === 'mary-had-a-little-lamb')!).level).toBe(1);
    expect(estimateDifficulty(getSongs().find((s) => s.id === 'clair-de-lune')!).level).toBe('expert');
    expect(specLevel('canon-in-d')).toBe(5);
  });

  it('rises with speed, range, chords and hand independence', () => {
    const base = { bpm: 100, notes: [60, 62, 64, 65].map((midi, i) => ({ id: `${i}`, midi, startBeat: i, durationBeats: 1, hand: 'right' as const, measure: 1 })) };
    const faster = { ...base, bpm: 220 };
    const wider = { ...base, notes: base.notes.map((n, i) => ({ ...n, midi: i % 2 ? 100 : 30 })) };
    const chords = { ...base, notes: base.notes.flatMap((n) => [n, { ...n, id: n.id + 'b', midi: n.midi + 4 }, { ...n, id: n.id + 'c', midi: n.midi + 7 }]) };
    const apart = { ...base, notes: [...base.notes, ...base.notes.map((n) => ({ ...n, id: n.id + 'l', midi: n.midi - 24, startBeat: n.startBeat + 0.5, hand: 'left' as const }))] };
    const together = { ...base, notes: [...base.notes, ...base.notes.map((n) => ({ ...n, id: n.id + 'l', midi: n.midi - 24, hand: 'left' as const }))] };
    const s0 = measureSong(base).score;
    expect(measureSong(faster).score).toBeGreaterThan(s0);
    expect(measureSong(wider).score).toBeGreaterThan(s0);
    expect(measureSong(chords).score).toBeGreaterThan(s0);
    expect(measureSong(apart).independence).toBe(1);
    expect(measureSong(together).independence).toBe(0);
    expect(measureSong(apart).score).toBeGreaterThan(measureSong(together).score);
    expect(measureSong({ notes: [], bpm: 100 }).score).toBe(0);
  });

  it('is suggested for the import and the player can override it', async () => {
    const a = await analyseFile('frere.mid', oneTrackMidi());
    const suggested = suggestLevel(a, { splitMode: 'pitch', splitMidi: 60 });
    expect(suggested).toBeGreaterThanOrEqual(1);
    expect(suggested).toBeLessThanOrEqual(3);
    expect(buildSong(a, 'i', choices({ level: 'expert' })).song.level).toBe('expert');
    expect(buildSong(a, 'i', choices({ level: 4 })).song.level).toBe(4);
  });
});

describe('storage and library', () => {
  let n = 0;
  let db: KeyfallDb;
  beforeEach(() => {
    db = new KeyfallDb(`import-test-${++n}`);
  });
  const saved = { ...choices(), levelOverridden: false };

  it('saves an import with a stable id, updatedAt and the original file, and lists it for every profile', async () => {
    const bytes = oneTrackMidi();
    const a = await analyseFile('frere.mid', bytes);
    const rec = await saveNewImport(db, a, 'frere.mid', bytes.slice().buffer, saved);
    expect(rec.id).toMatch(/^imp-[0-9a-f-]{36}$/);
    expect(rec.song.id).toBe(rec.id);
    expect(rec.updatedAt).toBeGreaterThan(0);
    expect(new Uint8Array(rec.source)).toEqual(bytes);
    const rows = await allImportedSongs(db);
    expect(rows).toHaveLength(1);
    expect(new Uint8Array(rows[0]!.source)).toEqual(bytes);
    expect(getAllSongs().map((s) => s.id)).toContain(rec.id);
    expect(findPlayableSong(rec.id)?.source).toBe('imported');
    expect(hasApproximateSheet(rec.id)).toBe(true);
    expect(getAllSongs().slice(0, getSongs().length).map((s) => s.id)).toEqual(getSongs().map((s) => s.id));
  });

  it('survives a reload: loadLibrary reads the songs back', async () => {
    const xml = new TextEncoder().encode(musicXml());
    const a = await analyseFile('f.musicxml', xml);
    const rec = await saveNewImport(db, a, 'f.musicxml', xml.slice().buffer, { ...saved, splitMode: 'groups' });
    await loadLibrary(new KeyfallDb(db.name));
    expect(findSong(rec.id)?.title).toBe(FIXTURE_TITLE);
    expect(hasApproximateSheet(rec.id)).toBe(false);
  });

  it('edit rebuilds from the stored file, keeps the id, and changes the split and title', async () => {
    const bytes = oneTrackMidi();
    const a = await analyseFile('frere.mid', bytes);
    const rec = await saveNewImport(db, a, 'frere.mid', bytes.slice().buffer, saved);
    const rightAt60 = importedRecord(rec.id)!.song.notes.filter((x) => x.hand === 'right').length;
    const next = await updateImport(db, rec, { ...saved, title: 'Renamed', splitMidi: 66, level: 3, levelOverridden: true });
    expect(next.id).toBe(rec.id);
    expect(next.updatedAt).toBeGreaterThanOrEqual(rec.updatedAt);
    expect(findSong(rec.id)).toMatchObject({ title: 'Renamed', level: 3 });
    const song = importedRecord(rec.id)!.song;
    expect(song.notes.filter((x) => x.hand === 'right').length).toBeLessThan(rightAt60);
    expect(importedRecord(rec.id)).toMatchObject({ splitMidi: 66, levelOverridden: true });
  });

  it('delete is a soft delete: gone from the list, still named for old scores', async () => {
    const bytes = oneTrackMidi();
    const a = await analyseFile('frere.mid', bytes);
    const rec = await saveNewImport(db, a, 'frere.mid', bytes.slice().buffer, saved);
    await deleteImportedSong(db, rec.id);
    await loadLibrary(db);
    expect(getAllSongs().map((s) => s.id)).not.toContain(rec.id);
    expect(findPlayableSong(rec.id)).toBeUndefined();
    expect(findSong(rec.id)?.title).toBe(FIXTURE_TITLE);
    const [row] = await allImportedSongs(db);
    expect(row!.deletedAt).toBeGreaterThan(0);
  });
});
