import { useEffect, useRef } from 'react';
import { Annotation, Beam, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { clefFor, vexKey, type Clef } from '../../learn/staff';
import type { MiniSong } from '../../learn/units';

const SCALE = 1.3;
const INK = '#1E2430';
const TONES = { idle: INK, correct: '#1F9D63', wrong: '#E0442F', next: '#F5A524', done: '#1F9D63' } as const;
export type Tone = keyof typeof TONES;

function style(note: StaveNote, tone: Tone): void {
  const c = TONES[tone];
  note.setStyle({ fillStyle: c, strokeStyle: c });
}

/** One note on a staff, drawn with VexFlow. */
export function NoteStaff({ midi, tone = 'idle', clef = clefFor(midi) }: { midi: number; tone?: Tone; clef?: Clef }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    const W = 320;
    const H = 150;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(W * SCALE, H * SCALE);
    const ctx = renderer.getContext();
    ctx.scale(SCALE, SCALE);
    const stave = new Stave(10, 30, W - 20);
    stave.addClef(clef).setContext(ctx).draw();
    const note = new StaveNote({ keys: [vexKey(midi)], duration: 'q', clef });
    style(note, tone);
    const voice = new Voice({ numBeats: 1, beatValue: 4 });
    voice.addTickables([note]);
    new Formatter().joinVoices([voice]).format([voice], 140);
    voice.draw(ctx, stave);
  }, [midi, tone, clef]);
  return <div className="staff" ref={host} role="img" aria-label="A note on a music staff" data-testid="staff" />;
}

const DURATION: Record<number, string> = { 0.5: '8', 1: 'q', 2: 'h', 4: 'w' };

/** A whole mini song on one staff, one measure per box. `index` is the next note to play. */
export function SongStaff({ song, index }: { song: MiniSong; index: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    const clef = clefFor(song.notes[0]!.midi);
    const bars: typeof song.notes[] = [];
    let cur: typeof song.notes = [];
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
    const rows = Math.ceil(bars.length / perRow);
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(barW * perRow + 20, rows * 130 + 20);
    const ctx = renderer.getContext();
    let flat = 0;
    bars.forEach((bar, b) => {
      const x = 10 + (b % perRow) * barW;
      const y = 10 + Math.floor(b / perRow) * 130;
      const stave = new Stave(x, y, barW);
      if (b % perRow === 0) stave.addClef(clef);
      stave.setContext(ctx).draw();
      const notes = bar.map((n) => {
        const sn = new StaveNote({ keys: [vexKey(n.midi)], duration: DURATION[n.beats] ?? 'q', clef });
        if (n.finger) sn.addModifier(new Annotation(String(n.finger)).setVerticalJustification(Annotation.VerticalJustify.BOTTOM), 0);
        style(sn, flat < index ? 'done' : flat === index ? 'next' : 'idle');
        flat++;
        return sn;
      });
      const voice = new Voice({ numBeats: song.beatsPerBar, beatValue: 4 });
      voice.addTickables(notes);
      const beams = Beam.generateBeams(notes);
      new Formatter().joinVoices([voice]).format([voice], barW - (b % perRow === 0 ? 80 : 40));
      voice.draw(ctx, stave);
      beams.forEach((bm) => bm.setContext(ctx).draw());
    });
  }, [song, index]);
  return <div className="staff staff-song" ref={host} role="img" aria-label={`${song.title} on a music staff`} data-testid="song-staff" />;
}
