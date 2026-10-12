import type { Hand } from '../engine/song';

export interface XmlSource {
  title: string;
  composer: string;
  bpm: number;
  timeSignature: [number, number];
  notes: { midi: number; startBeat: number; durationBeats: number; hand: Hand }[];
}

/** Units are sixteenths: `divisions` is 4 per quarter note. */
const U = 4;
const MAX_VOICES = 4;
const CHUNKS: [number, string, boolean][] = [
  [16, 'whole', false],
  [12, 'half', true],
  [8, 'half', false],
  [6, 'quarter', true],
  [4, 'quarter', false],
  [3, 'eighth', true],
  [2, 'eighth', false],
  [1, '16th', false],
];
const STEPS: [string, number][] = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Event {
  start: number;
  end: number;
  midis: number[];
}

/** Whether a time signature gives a whole number of sixteenths per bar (the generator needs that). */
export function barUnitsOf(ts: [number, number]): number | null {
  const u = (ts[0] * 4 * U) / ts[1];
  return Number.isInteger(u) && u > 0 ? u : null;
}

function chunksOf(units: number): [number, string, boolean][] {
  const out: [number, string, boolean][] = [];
  let left = units;
  for (const c of CHUNKS) {
    while (left >= c[0]) {
      out.push(c);
      left -= c[0];
    }
  }
  return out;
}

/** Spread one hand's notes over up to four voices of non-overlapping chords. Notes that cannot fit are left out of the sheet only. */
function voicesOf(notes: XmlSource['notes']): Event[][] {
  const groups = new Map<string, Event>();
  for (const n of notes) {
    const start = Math.round(n.startBeat * U);
    const end = start + Math.max(1, Math.round(n.durationBeats * U));
    const key = `${start}:${end}`;
    const g = groups.get(key) ?? groups.set(key, { start, end, midis: [] }).get(key)!;
    g.midis.push(n.midi);
  }
  const events = [...groups.values()].sort((a, b) => a.start - b.start || b.end - a.end);
  const voices: Event[][] = [];
  for (const ev of events) {
    ev.midis.sort((a, b) => a - b);
    const voice = voices.find((v) => v[v.length - 1]!.end <= ev.start);
    if (voice) voice.push(ev);
    else if (voices.length < MAX_VOICES) voices.push([ev]);
  }
  return voices.length ? voices : [[]];
}

/** Best-effort MusicXML (grand staff, C major, sharps only) for the sheet view of a MIDI import. */
export function toMusicXml(src: XmlSource): string {
  const bar = barUnitsOf(src.timeSignature) ?? 16;
  const [beats, beatType] = barUnitsOf(src.timeSignature) ? src.timeSignature : [4, 4];
  const staves: Event[][][] = [voicesOf(src.notes.filter((n) => n.hand === 'right')), voicesOf(src.notes.filter((n) => n.hand === 'left'))];
  const lastEnd = Math.max(0, ...staves.flatMap((s) => s.flatMap((v) => v.map((e) => e.end))));
  const measures = Math.max(1, Math.ceil(lastEnd / bar));

  const out: string[] = [];
  out.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="3.1">',
    `<work><work-title>${esc(src.title)}</work-title></work>`,
    `<identification><creator type="composer">${esc(src.composer)}</creator><encoding><software>Keyfall import (approximate)</software></encoding></identification>`,
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>',
    '<part id="P1">',
  );

  const note = (midi: number | null, units: number, voice: number, staff: number, chord: boolean, tieStop: boolean, tieStart: boolean, c: [number, string, boolean]) => {
    const parts = ['<note>'];
    if (chord) parts.push('<chord/>');
    if (midi === null) parts.push('<rest/>');
    else {
      const [step, alter] = STEPS[midi % 12]!;
      parts.push(`<pitch><step>${step}</step>${alter ? '<alter>1</alter>' : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`);
    }
    parts.push(`<duration>${units}</duration>`);
    if (tieStop) parts.push('<tie type="stop"/>');
    if (tieStart) parts.push('<tie type="start"/>');
    parts.push(`<voice>${voice}</voice><type>${c[1]}</type>${c[2] ? '<dot/>' : ''}<staff>${staff}</staff>`);
    if (tieStop || tieStart) parts.push(`<notations>${tieStop ? '<tied type="stop"/>' : ''}${tieStart ? '<tied type="start"/>' : ''}</notations>`);
    parts.push('</note>');
    return parts.join('');
  };

  for (let m = 0; m < measures; m++) {
    const ms = m * bar;
    const me = ms + bar;
    out.push(`<measure number="${m + 1}">`);
    if (m === 0) {
      out.push(
        `<attributes><divisions>${U}</divisions><key><fifths>0</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><staves>2</staves>` +
          '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>',
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${src.bpm}</per-minute></metronome></direction-type><sound tempo="${src.bpm}"/></direction>`,
      );
    }
    const lines: string[] = [];
    staves.forEach((voices, si) => {
      voices.forEach((events, vi) => {
        const voice = si * MAX_VOICES + vi + 1;
        const staff = si + 1;
        const inBar = events.filter((e) => e.end > ms && e.start < me);
        if (vi > 0 && inBar.length === 0) return;
        const xml: string[] = [];
        let cursor = ms;
        const rest = (units: number) => {
          for (const c of chunksOf(units)) xml.push(note(null, c[0], voice, staff, false, false, false, c));
        };
        for (const ev of inBar) {
          const ps = Math.max(ev.start, ms);
          const pe = Math.min(ev.end, me);
          if (ps > cursor) rest(ps - cursor);
          const chunks = chunksOf(pe - ps);
          chunks.forEach((c, k) => {
            const tieStop = k > 0 || ev.start < ms;
            const tieStart = k < chunks.length - 1 || ev.end > me;
            ev.midis.forEach((midi, ci) => xml.push(note(midi, c[0], voice, staff, ci > 0, tieStop, tieStart, c)));
          });
          cursor = pe;
        }
        if (cursor < me) rest(me - cursor);
        lines.push(xml.join(''));
      });
    });
    lines.forEach((l, i) => {
      out.push(l);
      if (i < lines.length - 1) out.push(`<backup><duration>${bar}</duration></backup>`);
    });
    out.push('</measure>');
  }
  out.push('</part>', '</score-partwise>');
  return out.join('\n');
}
