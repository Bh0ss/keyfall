import { useEffect, useRef } from 'react';
import { Accidental, Annotation, Beam, Dot, Formatter, GhostNote, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow';
import { keySigById, alteredLetters, type KeySig } from '../../learn/keysig';
import { symbolById, vexDuration } from '../../learn/rhythm';
import { barAccidentals, clefFor, vexSpelled, type Clef, type Spell } from '../../learn/staff';
import type { MiniSong, MiniSongNote } from '../../learn/units';

const SCALE = 1.3;
const INK = '#1E2430';
const TONES = { idle: INK, correct: '#1F9D63', wrong: '#E0442F', next: '#F5A524', done: '#1F9D63' } as const;
export type Tone = keyof typeof TONES;

function style(note: StaveNote | GhostNote, tone: Tone): void {
  const c = TONES[tone];
  note.setStyle({ fillStyle: c, strokeStyle: c });
  // Signs and dots are separate drawn parts; colour them with the note.
  for (const m of note.getModifiers()) m.setStyle({ fillStyle: c, strokeStyle: c });
}

/** A fresh SVG context scaled for the lesson card. */
function open(el: HTMLDivElement, width: number, height: number) {
  el.innerHTML = '';
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(width * SCALE, height * SCALE);
  const ctx = renderer.getContext();
  ctx.scale(SCALE, SCALE);
  return ctx;
}

function sign(note: StaveNote, accidental: '#' | 'b' | 'n' | undefined, index = 0): void {
  if (accidental) note.addModifier(new Accidental(accidental), index);
}

function sigOf(keySig?: KeySig) {
  return keySig ? { kind: keySig.kind, letters: alteredLetters(keySig) } : undefined;
}

/** One note on a staff, drawn with VexFlow. Black keys carry a sharp or flat; a key signature can be drawn after the clef. */
export function NoteStaff({ midi, tone = 'idle', clef = clefFor(midi), spell = 'sharp', keySig }: { midi: number; tone?: Tone; clef?: Clef; spell?: Spell; keySig?: KeySig }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const W = 320;
    const ctx = open(el, W, 150);
    const stave = new Stave(10, 30, W - 20);
    stave.addClef(clef);
    if (keySig && keySig.kind !== 'none') stave.addKeySignature(keySig.vex);
    stave.setContext(ctx).draw();
    const pitch = vexSpelled(midi, spell);
    const note = new StaveNote({ keys: [pitch.key], duration: 'q', clef });
    sign(note, pitch.accidental);
    style(note, tone);
    const voice = new Voice({ numBeats: 1, beatValue: 4 });
    voice.addTickables([note]);
    new Formatter().joinVoices([voice]).format([voice], 140);
    voice.draw(ctx, stave);
  }, [midi, tone, clef, spell, keySig]);
  const acc = vexSpelled(midi, spell).accidental;
  return <div className="staff" ref={host} role="img" aria-label={`A note on a music staff${acc ? (acc === '#' ? ', sharp' : ', flat') : ''}`} data-testid="staff" data-accidental={acc} />;
}

/** A treble staff with only a key signature, for naming the key. */
export function SignatureStaff({ keySig }: { keySig: KeySig }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const W = 320;
    const ctx = open(el, W, 150);
    const stave = new Stave(10, 30, W - 20);
    stave.addClef('treble');
    if (keySig.kind !== 'none') stave.addKeySignature(keySig.vex);
    stave.setContext(ctx).draw();
  }, [keySig]);
  return <div className="staff" ref={host} role="img" aria-label="A key signature on a music staff" data-testid="staff" />;
}

/** Notes on the grand staff (treble above bass, joined by a brace): middle C and up on top, the rest below. */
export function GrandStaff({ midis, tone = 'idle', spell = 'sharp' }: { midis: number[]; tone?: Tone; spell?: Spell }) {
  const host = useRef<HTMLDivElement>(null);
  const key = midis.join(',');
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const midiList = key.split(',').map(Number);
    const W = 320;
    const ctx = open(el, W, 270);
    const treble = new Stave(30, 20, W - 40);
    const bass = new Stave(30, 130, W - 40);
    treble.addClef('treble').setContext(ctx).draw();
    bass.addClef('bass').setContext(ctx).draw();
    new StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
    new StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();
    new StaveConnector(treble, bass).setType('singleRight').setContext(ctx).draw();
    const voiceFor = (clef: Clef, stave: Stave) => {
      const ms = midiList.filter((m) => clefFor(m) === clef).sort((a, b) => a - b);
      const tickable = ms.length
        ? (() => {
            const note = new StaveNote({ keys: ms.map((m) => vexSpelled(m, spell).key), duration: 'q', clef });
            ms.forEach((m, i) => sign(note, vexSpelled(m, spell).accidental, i));
            style(note, tone);
            return note;
          })()
        : new GhostNote({ duration: 'q' });
      const voice = new Voice({ numBeats: 1, beatValue: 4 });
      voice.addTickables([tickable]);
      return { voice, stave };
    };
    const t = voiceFor('treble', treble);
    const b = voiceFor('bass', bass);
    new Formatter().joinVoices([t.voice]).joinVoices([b.voice]).format([t.voice, b.voice], 140);
    t.voice.draw(ctx, t.stave);
    b.voice.draw(ctx, b.stave);
  }, [key, tone, spell]);
  return <div className="staff" ref={host} role="img" aria-label="Notes on the grand staff" data-testid="staff" />;
}

function rhythmNote(id: number) {
  const s = symbolById(id)!;
  const rest = s.rest;
  const note = new StaveNote({ keys: [rest && s.vex === 'w' ? 'd/5' : 'b/4'], duration: vexDuration(s) });
  if (s.dots) Dot.buildAndAttach([note], { all: true });
  return note;
}

/** Rhythm symbols in 4/4 bars on a one-clef staff. One symbol shows as a single note or rest. */
export function RhythmStaff({ steps, tone = 'idle' }: { steps: number[]; tone?: Tone }) {
  const host = useRef<HTMLDivElement>(null);
  const key = steps.join(',');
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const stepList = key.split(',').map(Number);
    const bars: number[][] = [];
    let cur: number[] = [];
    let beats = 0;
    for (const id of stepList) {
      cur.push(id);
      beats += symbolById(id)!.beats;
      if (beats >= 4) {
        bars.push(cur);
        cur = [];
        beats = 0;
      }
    }
    if (cur.length) bars.push(cur);
    const single = stepList.length === 1;
    const perRow = 2;
    const barW = single ? 220 : 280;
    const rows = Math.ceil(bars.length / perRow);
    const ctx = open(el, barW * Math.min(perRow, bars.length) + 20, rows * 110 + 30);
    bars.forEach((bar, b) => {
      const x = 10 + (b % perRow) * barW;
      const y = 10 + Math.floor(b / perRow) * 110;
      const stave = new Stave(x, y, barW);
      if (b % perRow === 0) stave.addClef('treble');
      if (b === 0 && !single) stave.addTimeSignature('4/4');
      stave.setContext(ctx).draw();
      const notes = bar.map((id) => {
        const n = rhythmNote(id);
        style(n, tone);
        return n;
      });
      const total = bar.reduce((a, id) => a + symbolById(id)!.beats, 0);
      const voice = new Voice({ numBeats: Math.max(1, Math.ceil(total)), beatValue: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables(notes);
      const beams = Beam.generateBeams(notes);
      new Formatter().joinVoices([voice]).format([voice], stave.getX() + stave.getWidth() - stave.getNoteStartX() - 12);
      voice.draw(ctx, stave);
      beams.forEach((bm) => bm.setContext(ctx).draw());
    });
  }, [key, tone]);
  return <div className="staff" ref={host} role="img" aria-label="Written rhythm" data-testid="rhythm-staff" />;
}

function durationOf(beats: number): string {
  if (beats === 1.5) return 'qd';
  if (beats === 3) return 'hd';
  return ({ 0.5: '8', 1: 'q', 2: 'h', 4: 'w' } as Record<number, string>)[beats] ?? 'q';
}

/** A whole mini song, one measure per box. `index` is the next note to play. Rests, dots, signs, a key signature and a left-hand staff are drawn when the song has them. */
export function SongStaff({ song, index }: { song: MiniSong; index: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const grand = song.notes.some((n) => n.left);
    const sig = song.keySig ? keySigById(song.keySig) : undefined;
    const clef = clefFor(song.notes.find((n) => !n.rest)!.midi);
    const bars: MiniSongNote[][] = [];
    let cur: MiniSongNote[] = [];
    let beats = 0;
    for (const n of song.notes) {
      cur.push(n);
      beats += n.beats;
      if (beats >= song.beatsPerBar) {
        bars.push(cur);
        cur = [];
        beats = 0;
      }
    }
    const perRow = 2;
    const barW = 360;
    const rowH = grand ? 250 : 130;
    const rows = Math.ceil(bars.length / perRow);
    el.innerHTML = '';
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(barW * perRow + 20, rows * rowH + 20);
    const ctx = renderer.getContext();
    let flat = 0;
    const tone = (i: number): Tone => (i < index ? 'done' : i === index ? 'next' : 'idle');
    bars.forEach((bar, b) => {
      const x = 10 + (b % perRow) * barW;
      const y = 10 + Math.floor(b / perRow) * rowH;
      const first = b % perRow === 0;
      const stave = new Stave(x, y, barW);
      const lower = grand ? new Stave(x, y + 110, barW) : null;
      if (first) {
        stave.addClef(grand ? 'treble' : clef);
        lower?.addClef('bass');
        if (sig && sig.kind !== 'none') {
          stave.addKeySignature(sig.vex);
          lower?.addKeySignature(sig.vex);
        }
      }
      stave.setContext(ctx).draw();
      lower?.setContext(ctx).draw();
      if (lower && first) {
        new StaveConnector(stave, lower).setType('brace').setContext(ctx).draw();
        new StaveConnector(stave, lower).setType('singleLeft').setContext(ctx).draw();
      }
      const accidentals = barAccidentals(
        bar.filter((n) => !n.rest).map((n) => ({ midi: n.midi, spell: n.spell })),
        sigOf(sig),
      );
      let played = 0;
      const upper: (StaveNote | GhostNote)[] = [];
      const low: (StaveNote | GhostNote)[] = [];
      const clefHere: Clef = grand ? 'treble' : clef;
      for (const n of bar) {
        const dur = durationOf(n.beats);
        const t = tone(flat++);
        if (n.rest) {
          const r = new StaveNote({ keys: [clefHere === 'bass' ? 'd/3' : 'b/4'], duration: `${dur}r`, clef: clefHere });
          if (n.beats === 1.5 || n.beats === 3) Dot.buildAndAttach([r], { all: true });
          style(r, t);
          upper.push(r);
          if (grand) low.push(new GhostNote({ duration: dur }));
          continue;
        }
        const spell = n.spell ?? (sig?.kind === 'flat' ? 'flat' : 'sharp');
        const pitch = vexSpelled(n.midi, spell);
        const sn = new StaveNote({ keys: [pitch.key], duration: dur, clef: clefHere });
        const acc = accidentals[played++];
        sign(sn, acc);
        if (n.beats === 1.5 || n.beats === 3) Dot.buildAndAttach([sn], { all: true });
        if (n.finger) sn.addModifier(new Annotation(String(n.finger)).setVerticalJustification(Annotation.VerticalJustify.BOTTOM), 0);
        style(sn, t);
        upper.push(sn);
        if (grand) {
          if (n.left) {
            const lp = vexSpelled(n.left.midi);
            const ln = new StaveNote({ keys: [lp.key], duration: dur, clef: 'bass' });
            if (n.left.finger) ln.addModifier(new Annotation(String(n.left.finger)).setVerticalJustification(Annotation.VerticalJustify.BOTTOM), 0);
            style(ln, t);
            low.push(ln);
          } else {
            low.push(new GhostNote({ duration: dur }));
          }
        }
      }
      const voiceOf = (items: (StaveNote | GhostNote)[]) => {
        const v = new Voice({ numBeats: song.beatsPerBar, beatValue: 4 });
        v.addTickables(items);
        return v;
      };
      const vu = voiceOf(upper);
      const beams = Beam.generateBeams(upper.filter((n): n is StaveNote => n instanceof StaveNote));
      const voices = [vu];
      const fmt = new Formatter().joinVoices([vu]);
      let vl: Voice | null = null;
      if (grand) {
        vl = voiceOf(low);
        fmt.joinVoices([vl]);
        voices.push(vl);
      }
      fmt.format(voices, stave.getX() + stave.getWidth() - stave.getNoteStartX() - 20);
      vu.draw(ctx, stave);
      if (vl && lower) vl.draw(ctx, lower);
      beams.forEach((bm) => bm.setContext(ctx).draw());
    });
  }, [song, index]);
  return <div className="staff staff-song" ref={host} role="img" aria-label={`${song.title} on a music staff`} data-testid="song-staff" />;
}
