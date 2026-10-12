/**
 * Generated import fixtures: original arrangements of the traditional tune "Frere Jacques"
 * (public domain), written in code so no music file is checked in. Used by the unit tests and the e2e tests.
 */
import { deflateRawSync } from 'node:zlib';
import * as toneMidi from '@tonejs/midi';

// Playwright loads this file as plain Node ESM, where the CommonJS package has only a default export.
const Midi: typeof toneMidi.Midi = (toneMidi as unknown as { default?: typeof toneMidi }).default?.Midi ?? toneMidi.Midi;
type Midi = toneMidi.Midi;

export interface FixtureNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
}

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, C3 = 48, G2 = 43;

/** Melody in the treble register (4 bars of 4/4). */
export const MELODY: FixtureNote[] = [
  ...[C4, D4, E4, C4].map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
  ...[C4, D4, E4, C4].map((midi, i) => ({ midi, startBeat: 4 + i, durationBeats: 1 })),
  { midi: E4, startBeat: 8, durationBeats: 1 },
  { midi: F4, startBeat: 9, durationBeats: 1 },
  { midi: G4, startBeat: 10, durationBeats: 2 },
  { midi: E4, startBeat: 12, durationBeats: 1 },
  { midi: F4, startBeat: 13, durationBeats: 1 },
  { midi: G4, startBeat: 14, durationBeats: 2 },
];

/** Bass notes in the low register, one per two bars. */
export const BASS: FixtureNote[] = [
  { midi: C3, startBeat: 0, durationBeats: 8 },
  { midi: G2, startBeat: 8, durationBeats: 8 },
];

export const FIXTURE_BPM = 120;
export const FIXTURE_TITLE = 'Frere Jacques';
export const FIXTURE_COMPOSER = 'Traditional';
export const FIXTURE_NOTE_COUNT = MELODY.length + BASS.length;
const PPQ = 480;

function writeTrack(midi: Midi, notes: FixtureNote[], name: string, jitterTicks: number) {
  const track = midi.addTrack();
  track.name = name;
  notes.forEach((n, i) => {
    // A small human-style wobble, so the importer has something to quantise.
    const wobble = jitterTicks ? ((i % 3) - 1) * jitterTicks : 0;
    track.addNote({ midi: n.midi, ticks: Math.max(0, Math.round(n.startBeat * PPQ) + wobble), durationTicks: Math.round(n.durationBeats * PPQ) - 20, velocity: 0.7 });
  });
}

function baseMidi(title: string): Midi {
  const midi = new Midi();
  midi.header.setTempo(FIXTURE_BPM);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.name = title;
  return midi;
}

/** Melody and bass together in one track: the importer has to split at middle C. */
export function oneTrackMidi(): Uint8Array {
  const midi = baseMidi(FIXTURE_TITLE);
  writeTrack(midi, [...MELODY, ...BASS].sort((a, b) => a.startBeat - b.startBeat), 'Piano', 14);
  return midi.toArray();
}

/** Bass track first, melody second: the split must go by the pitch of each track, not by order. */
export function twoTrackMidi(): Uint8Array {
  const midi = baseMidi(FIXTURE_TITLE);
  writeTrack(midi, BASS, 'Bass', 0);
  writeTrack(midi, MELODY, 'Melody', 0);
  return midi.toArray();
}

const STEP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

function xmlNote(n: FixtureNote, staff: number): string {
  const type = ({ 1: 'quarter', 2: 'half', 4: 'whole' } as Record<number, string>)[n.durationBeats] ?? 'quarter';
  return (
    `<note><pitch><step>${STEP[n.midi % 12]}</step>${SHARP[n.midi % 12] ? '<alter>1</alter>' : ''}<octave>${Math.floor(n.midi / 12) - 1}</octave></pitch>` +
    `<duration>${n.durationBeats}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff></note>`
  );
}

const SCORE_HEAD = (title: string, composer: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="3.1">' +
  `<work><work-title>${title}</work-title></work>` +
  (composer ? `<identification><creator type="composer">${composer}</creator></identification>` : '') +
  '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>';

const TEMPO = `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${FIXTURE_BPM}</per-minute></metronome></direction-type><sound tempo="${FIXTURE_BPM}"/></direction>`;

/** The same piece as score-partwise MusicXML: one part, two staves (treble and bass). */
export function musicXml(): string {
  const bars: string[] = [];
  for (let m = 0; m < 4; m++) {
    const start = m * 4;
    const right = MELODY.filter((n) => n.startBeat >= start && n.startBeat < start + 4);
    const left = { ...BASS[Math.floor(m / 2)]!, durationBeats: 4 };
    const attrs =
      m === 0
        ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>' +
          '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' +
          TEMPO
        : '';
    bars.push(`<measure number="${m + 1}">${attrs}${right.map((n) => xmlNote(n, 1)).join('')}<backup><duration>4</duration></backup>${xmlNote(left, 2)}</measure>`);
  }
  return `${SCORE_HEAD(FIXTURE_TITLE, FIXTURE_COMPOSER)}<part id="P1">${bars.join('')}</part></score-partwise>`;
}

/** The same piece on a single staff (no hand information): the split has to go by pitch. */
export function singleStaffMusicXml(): string {
  const bars: string[] = [];
  for (let m = 0; m < 4; m++) {
    const start = m * 4;
    const melody = MELODY.filter((n) => n.startBeat >= start && n.startBeat < start + 4);
    const bass = { ...BASS[Math.floor(m / 2)]!, durationBeats: 4 };
    const attrs =
      m === 0
        ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' + TEMPO
        : '';
    bars.push(`<measure number="${m + 1}">${attrs}${xmlNote(bass, 1)}<backup><duration>4</duration></backup>${melody.map((n) => xmlNote(n, 1)).join('')}</measure>`);
  }
  return `${SCORE_HEAD(`${FIXTURE_TITLE} (one staff)`, '')}<part id="P1">${bars.join('')}</part></score-partwise>`;
}

// --- minimal zip writer (for .mxl) ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
  /** 0 = stored, 8 = deflate (default). */
  method?: 0 | 8;
  /** Override the size written in the headers (to build lying archives). */
  declaredSize?: number;
}

export function makeZip(files: ZipFile[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const method = f.method ?? 8;
    const body = method === 8 ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const name = enc.encode(f.name);
    const size = f.declaredSize ?? f.data.length;
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(local, body);
    central.push(cen);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The piece as compressed MusicXML (.mxl): container.xml points at the score. */
export function mxl(): Uint8Array {
  const enc = new TextEncoder();
  return makeZip([
    { name: 'mimetype', data: enc.encode('application/vnd.recordare.musicxml'), method: 0 },
    {
      name: 'META-INF/container.xml',
      data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score/frere.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),
    },
    { name: 'score/frere.xml', data: enc.encode(musicXml()) },
  ]);
}

/** A zip whose one entry inflates to `bytes` of zeros; with `lie` its headers claim only 100 bytes. */
export function zipBomb(bytes: number, lie = true): Uint8Array {
  return makeZip([{ name: 'bomb.xml', data: new Uint8Array(bytes), declaredSize: lie ? 100 : undefined }]);
}
