import { Midi } from '@tonejs/midi';
import { parseMusicXml } from '../songs/musicxml';
import { MAX_BEATS, MAX_FILE_BYTES, MAX_NOTES, ImportError, clean, formatOf, type ImportFormat } from './limits';
import { unpackMxl } from './mxl';
import type { DraftNote, ImportAnalysis } from './types';

function titleFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return clean(base) || 'Imported song';
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

function analyseMidi(bytes: Uint8Array, fileName: string): ImportAnalysis {
  let midi: Midi;
  try {
    midi = new Midi(bytes);
  } catch {
    throw new ImportError('This does not look like a valid MIDI file.');
  }
  const ppq = midi.header.ppq;
  if (!(ppq > 0)) throw new ImportError('This MIDI file uses a timing format Keyfall cannot read (SMPTE time code).');

  const notes: DraftNote[] = [];
  const groups: ImportAnalysis['groups'] = [];
  let skipped = 0;
  for (const track of midi.tracks) {
    if (track.instrument.percussion || track.channel === 9 || track.notes.length === 0) continue;
    const group = groups.length;
    let count = 0;
    for (const n of track.notes) {
      if (n.midi < 21 || n.midi > 108) {
        skipped++;
        continue;
      }
      if (notes.length >= MAX_NOTES) throw new ImportError(`This file has more than ${MAX_NOTES.toLocaleString('en-US')} notes, which is more than Keyfall will import.`);
      const start = n.ticks / ppq;
      if (start > MAX_BEATS) throw new ImportError('This piece is longer than Keyfall will import.');
      notes.push({ midi: n.midi, startBeat: start, durationBeats: Math.max(n.durationTicks / ppq, 0), group });
      count++;
    }
    if (count > 0) groups.push({ label: clean(track.name, 40) || `Track ${groups.length + 1}`, noteCount: count });
  }
  if (notes.length === 0) throw new ImportError('No playable notes were found in this MIDI file.');

  const meanPitch = (g: number) => {
    const ns = notes.filter((n) => n.group === g);
    return ns.reduce((a, n) => a + n.midi, 0) / ns.length;
  };
  const ts = midi.header.timeSignatures[0]?.timeSignature;
  const timeSignature: [number, number] = ts && ts[0]! > 0 && ts[1]! > 0 ? [ts[0]!, ts[1]!] : [4, 4];
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? 120);
  const fromMeta = clean(midi.header.name, 80);
  const composerMeta = midi.header.meta
    .map((m) => /^composer\s*[:-]\s*(.+)$/i.exec(m.text.trim())?.[1])
    .find((c) => !!c);
  const generic = /^(track\s*\d*|piano|untitled|new song|acoustic grand piano|midi)$/i;
  return {
    format: 'midi',
    title: fromMeta && !generic.test(fromMeta) ? fromMeta : titleFromFile(fileName),
    composer: clean(composerMeta, 80) || 'Unknown',
    bpm: Number.isFinite(bpm) && bpm >= 20 && bpm <= 400 ? bpm : 120,
    timeSignature,
    notes,
    groups,
    ...(groups.length === 2 ? { groupHands: (meanPitch(0) >= meanPitch(1) ? ['right', 'left'] : ['left', 'right']) as ['right' | 'left', 'right' | 'left'] } : {}),
    skipped,
    groupNoun: 'track',
  };
}

function analyseMusicXml(xml: string, fileName: string, format: ImportFormat): ImportAnalysis {
  if (/<!ENTITY/i.test(xml)) throw new ImportError('This MusicXML file declares custom entities, which Keyfall does not open.');
  let parsed;
  try {
    parsed = parseMusicXml(xml, { id: 'draft', level: 1, source: 'imported' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/score-partwise/.test(msg)) throw new ImportError('This XML file is not a MusicXML score (Keyfall reads score-partwise MusicXML).');
    throw new ImportError('This MusicXML file could not be read.');
  }
  if (parsed.notes.length === 0) throw new ImportError('No playable notes were found in this score.');
  if (parsed.notes.length > MAX_NOTES) throw new ImportError(`This score has more than ${MAX_NOTES.toLocaleString('en-US')} notes, which is more than Keyfall will import.`);
  const last = parsed.notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
  if (last > MAX_BEATS) throw new ImportError('This piece is longer than Keyfall will import.');

  const hasRight = parsed.notes.some((n) => n.hand === 'right');
  const hasLeft = parsed.notes.some((n) => n.hand === 'left');
  const notes: DraftNote[] = parsed.notes.map((n) => ({
    midi: n.midi,
    startBeat: n.startBeat,
    durationBeats: n.durationBeats,
    group: n.hand === 'right' ? 0 : 1,
    ...(n.finger !== undefined ? { finger: n.finger } : {}),
  }));
  const count = (g: number) => notes.filter((n) => n.group === g).length;
  const both = hasRight && hasLeft;
  const title = parsed.title === 'Untitled' ? titleFromFile(fileName) : clean(parsed.title, 120);
  return {
    format,
    title,
    composer: clean(parsed.composer, 80) || 'Unknown',
    bpm: Math.round(parsed.bpm),
    timeSignature: parsed.timeSignature,
    notes,
    groups: both
      ? [
          { label: 'Staff 1 (right hand)', noteCount: count(0) },
          { label: 'Staff 2 (left hand)', noteCount: count(1) },
        ]
      : [{ label: hasLeft ? 'Left staff' : 'Single staff', noteCount: notes.length }],
    ...(both ? { groupHands: ['right', 'left'] as ['right', 'left'] } : {}),
    musicXml: xml,
    skipped: 0,
    groupNoun: 'staff',
  };
}

/** Read an imported file into an analysis. Throws ImportError with a message fit for the player. */
export async function analyseFile(fileName: string, input: ArrayBuffer | Uint8Array): Promise<ImportAnalysis> {
  const format = formatOf(fileName);
  if (!format) throw new ImportError('Keyfall imports .mid, .midi, .musicxml, .xml and .mxl files.');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) throw new ImportError('This file is empty.');
  if (bytes.length > MAX_FILE_BYTES) throw new ImportError(`This file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB, which is more than Keyfall will import.`);
  try {
    if (format === 'midi') return analyseMidi(bytes, fileName);
    const xml = format === 'mxl' ? await unpackMxl(bytes) : decodeText(bytes);
    return analyseMusicXml(xml, fileName, format);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('This file could not be read. It may be damaged or not the type its name says.');
  }
}
