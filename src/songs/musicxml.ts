import type { Hand, Song, SongNote } from '../engine/song';
import { child, childText, descendants, parseXml, type XmlElement } from './xml';

export interface SongMeta {
  id: string;
  level: Song['level'];
  title?: string;
  composer?: string;
  source?: Song['source'];
  unlockedBy?: string;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const round = (n: number) => Math.round(n * 1e6) / 1e6;

function midiOf(note: XmlElement): number | null {
  const pitch = child(note, 'pitch');
  if (!pitch) return null;
  const pc = STEP_PC[childText(pitch, 'step') ?? ''];
  const octave = Number(childText(pitch, 'octave'));
  const alter = Number(childText(pitch, 'alter') ?? 0);
  if (pc === undefined || !Number.isFinite(octave) || !Number.isFinite(alter)) return null;
  const midi = 12 * (octave + 1) + pc + Math.round(alter);
  return midi >= 21 && midi <= 108 ? midi : null;
}

function fingerOf(note: XmlElement): SongNote['finger'] {
  const f = Number(descendants(note, 'fingering')[0]?.text);
  return f >= 1 && f <= 5 && Number.isInteger(f) ? (f as 1 | 2 | 3 | 4 | 5) : undefined;
}

function tempoOf(root: XmlElement): number {
  const sound = descendants(root, 'sound').find((s) => Number(s.attrs.tempo) > 0);
  if (sound) return Number(sound.attrs.tempo);
  const pm = Number(descendants(root, 'per-minute')[0]?.text);
  return pm > 0 ? pm : 100;
}

/** Convert a score-partwise MusicXML document to the Song model. */
export function parseMusicXml(xml: string, meta: SongMeta): Song {
  const root = parseXml(xml);
  if (root.name !== 'score-partwise') throw new Error('Not a MusicXML score-partwise document');
  const parts = root.children.filter((c) => c.name === 'part');

  const raw: Omit<SongNote, 'id'>[] = [];
  let timeSignature: [number, number] | undefined;

  parts.forEach((part, partIndex) => {
    const staves =
      Math.max(1, ...descendants(part, 'staves').map((s) => Number(s.text) || 1));
    const handOf = (staff: number): Hand =>
      staves > 1 ? (staff <= 1 ? 'right' : 'left') : partIndex === 0 ? 'right' : 'left';

    let divisions = 1;
    let measureStart = 0;
    const openTies = new Map<string, Omit<SongNote, 'id'>>();

    part.children
      .filter((c) => c.name === 'measure')
      .forEach((measure, measureIndex) => {
        let pos = measureStart;
        let maxPos = pos;
        let lastStart = pos;
        for (const el of measure.children) {
          if (el.name === 'attributes') {
            const d = Number(childText(el, 'divisions'));
            if (d > 0) divisions = d;
            const time = child(el, 'time');
            const beats = Number(time && childText(time, 'beats'));
            const unit = Number(time && childText(time, 'beat-type'));
            if (!timeSignature && beats > 0 && unit > 0) timeSignature = [beats, unit];
          } else if (el.name === 'backup') {
            pos -= (Number(childText(el, 'duration')) || 0) / divisions;
          } else if (el.name === 'forward') {
            pos += (Number(childText(el, 'duration')) || 0) / divisions;
          } else if (el.name === 'note') {
            if (child(el, 'grace')) continue;
            const dur = (Number(childText(el, 'duration')) || 0) / divisions;
            const isChord = !!child(el, 'chord');
            const start = isChord ? lastStart : pos;
            if (!isChord) {
              lastStart = start;
              pos += dur;
            }
            const midi = child(el, 'rest') ? null : midiOf(el);
            if (midi !== null) {
              const staff = Number(childText(el, 'staff')) || 1;
              const ties = el.children.filter((c) => c.name === 'tie').map((t) => t.attrs.type);
              const key = `${staff}:${midi}`;
              const open = openTies.get(key);
              if (ties.includes('stop') && open && Math.abs(open.startBeat + open.durationBeats - start) < 1e-6) {
                open.durationBeats = round(open.durationBeats + dur);
                if (!ties.includes('start')) openTies.delete(key);
              } else {
                const note: Omit<SongNote, 'id'> = {
                  midi,
                  startBeat: round(start),
                  durationBeats: round(dur),
                  hand: handOf(staff),
                  finger: fingerOf(el),
                  measure: measureIndex + 1,
                };
                if (note.finger === undefined) delete note.finger;
                raw.push(note);
                if (ties.includes('start')) openTies.set(key, note);
              }
            }
            maxPos = Math.max(maxPos, pos);
          }
          maxPos = Math.max(maxPos, pos);
        }
        measureStart = maxPos;
      });
  });

  raw.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const notes: SongNote[] = raw.map((n, i) => ({ id: `${meta.id}-${i + 1}`, ...n }));
  const hasRight = notes.some((n) => n.hand === 'right');
  const hasLeft = notes.some((n) => n.hand === 'left');

  const composer =
    descendants(root, 'creator').find((c) => c.attrs.type === 'composer')?.text ?? meta.composer ?? 'Unknown';
  return {
    id: meta.id,
    title: meta.title ?? descendants(root, 'work-title')[0]?.text ?? descendants(root, 'movement-title')[0]?.text ?? 'Untitled',
    composer: meta.composer ?? composer,
    source: meta.source ?? 'bundled',
    level: meta.level,
    hands: hasRight && hasLeft ? 'both' : hasLeft ? 'left' : 'right',
    bpm: tempoOf(root),
    timeSignature: timeSignature ?? [4, 4],
    notes,
    musicXml: xml,
    ...(meta.unlockedBy !== undefined ? { unlockedBy: meta.unlockedBy } : {}),
  };
}
