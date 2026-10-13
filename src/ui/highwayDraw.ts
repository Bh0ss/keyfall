import type { HandZones, Shift, Zone } from '../engine/positions';
import type { Hand, SongNote } from '../engine/song';
import type { PlaySession } from '../engine/session';
import type { PressedKeys } from '../midi/pressed';
import type { Layout } from './highwayLayout';
import { noteName } from './keyboardLayout';

/** Beats visible above the hit line. The session lead-in matches this. */
export const LOOKAHEAD_BEATS = 6;

const PAD_X = 24;
const HIT_LINE_OFFSET = 14;

const HAND = {
  right: { fill: 'rgba(77, 168, 255, 0.22)', border: '#4DA8FF', ink: '#DCEBFF', key: '#CFE4FF' },
  left: { fill: 'rgba(183, 140, 255, 0.22)', border: '#B78CFF', ink: '#EADFFF', key: '#E2D2FF' },
} satisfies Record<Hand, Record<string, string>>;

const ZONE = {
  right: { tint: 'rgba(77, 168, 255, 0.34)', faint: 'rgba(77, 168, 255, 0.16)', line: '#4DA8FF', tag: 'RH' },
  left: { tint: 'rgba(183, 140, 255, 0.34)', faint: 'rgba(183, 140, 255, 0.16)', line: '#B78CFF', tag: 'LH' },
} satisfies Record<Hand, Record<string, string>>;

const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Hand-position help to draw: the zones to shade and the shift cue that is showing. */
export interface HelpState {
  zones: Record<Hand, HandZones>;
  cue: Shift | null;
}

export interface HighwayState {
  layout: Layout;
  session: PlaySession;
  beat: number;
  pressed: PressedKeys;
  labels: boolean;
  /** Per-pitch label switch for label fade; the keyboard strip keeps its key names. */
  noteLabel?: (midi: number) => boolean;
  /** Milliseconds, for the waiting pulse. */
  now: number;
  /** Hand-position help; absent when it is off or the song has nothing to show. */
  help?: HelpState;
  /** The key under the thumb (MIDI) for a note; with it the finger label also names the position. */
  positionOf?: (noteId: string) => number | undefined;
}

export function keyboardHeight(h: number): number {
  return Math.min(196, Math.round(h * 0.28));
}

export function hitLineY(h: number): number {
  return h - keyboardHeight(h) - HIT_LINE_OFFSET;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawNotes(ctx: CanvasRenderingContext2D, w: number, h: number, s: HighwayState) {
  const { layout, session, beat } = s;
  const lineY = hitLineY(h);
  const ppb = lineY / LOOKAHEAD_BEATS;
  const waiting = session.status === 'waiting';
  const pending = new Set(session.pendingNotes().map((n) => n.id));
  const areaW = w - PAD_X * 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, lineY + HIT_LINE_OFFSET);
  ctx.clip();
  for (const n of session.song.notes) {
    if (!layout.has(n.midi)) continue;
    const bottom = lineY - (n.startBeat - beat) * ppb;
    const top = bottom - n.durationBeats * ppb;
    if (bottom < -4 || top > lineY + HIT_LINE_OFFSET) continue;
    if (beat >= n.startBeat + n.durationBeats) continue;
    drawNote(ctx, n, PAD_X, areaW, top, bottom, s, waiting && pending.has(n.id));
  }
  ctx.restore();
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  n: SongNote,
  padX: number,
  areaW: number,
  top: number,
  bottom: number,
  s: HighwayState,
  isWaitTarget: boolean,
) {
  const lane = s.layout.laneOf(n.midi);
  const x = padX + lane.x * areaW + 3;
  const w = Math.max(6, lane.w * areaW - 6);
  const y = Math.min(top + 3, bottom - 34);
  const hgt = bottom - 3 - y;
  const colours = HAND[n.hand];
  const hit = s.session.isHit(n.id);
  const missed = s.session.isMissed(n.id);
  const played = s.session.isPlayed(n);

  ctx.save();
  if (hit) {
    ctx.shadowColor = 'rgba(245, 165, 36, 0.75)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#F5A524';
    ctx.strokeStyle = '#FFD27A';
  } else if (missed) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255, 107, 90, 0.22)';
    ctx.strokeStyle = '#FF6B5A';
  } else if (!played) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = colours.fill;
    ctx.strokeStyle = colours.border;
  } else {
    if (isWaitTarget) {
      const pulse = 0.5 + 0.5 * Math.sin(s.now / 160);
      ctx.shadowColor = colours.border;
      ctx.shadowBlur = 12 + 14 * pulse;
    }
    ctx.fillStyle = colours.fill;
    ctx.strokeStyle = isWaitTarget ? '#FFFFFF' : colours.border;
  }
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, hgt, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (!s.labels || w < 12 || s.noteLabel?.(n.midi) === false) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hit ? '#1A1206' : colours.ink;
  const name = noteName(n.midi).replace(/\d+$/, '');
  const size = w >= 36 ? 20 : 13;
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.fillText(name, x + w / 2, bottom - 3 - 17);
  if (n.finger !== undefined && hgt >= 52 && w >= 26) {
    ctx.font = `700 12px ${MONO}`;
    const anchor = s.positionOf?.(n.id);
    const finger = anchor !== undefined && w >= 44 ? `${n.finger} · ${noteName(anchor).replace(/\d+$/, '')}` : String(n.finger);
    ctx.fillText(finger, x + w / 2, bottom - 3 - 38);
  }
  ctx.restore();
}

function drawKeyboard(ctx: CanvasRenderingContext2D, w: number, h: number, s: HighwayState) {
  const { layout, session, pressed } = s;
  const kh = keyboardHeight(h);
  const top = h - kh;
  const areaW = w - PAD_X * 2;
  const keyH = kh - 16;
  const n = layout.whites.length;
  const kw = areaW / n;
  const pendingByMidi = new Map<number, SongNote>();
  for (const note of session.pendingNotes()) pendingByMidi.set(note.midi, note);

  ctx.fillStyle = '#0B0E13';
  ctx.fillRect(0, top, w, kh);

  layout.whites.forEach((midi, i) => {
    const x = PAD_X + i * kw;
    const down = pressed.has(midi);
    const target = pendingByMidi.get(midi);
    if (down) {
      const g = ctx.createLinearGradient(0, top, 0, top + keyH);
      g.addColorStop(0, '#FFD27A');
      g.addColorStop(1, '#F5A524');
      ctx.fillStyle = g;
    } else ctx.fillStyle = target ? HAND[target.hand].key : '#F4F1EA';
    roundRect(ctx, x + 1, top, kw - 2, keyH, [0, 0, Math.min(10, kw / 2), Math.min(10, kw / 2)]);
    ctx.fill();
    if (s.labels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = down ? '#1A1206' : '#5A6272';
      ctx.font = `800 ${kw >= 36 ? 20 : 11}px ${DISPLAY}`;
      if (kw >= 36 || midi % 12 === 0) ctx.fillText(noteName(midi).replace(/\d+$/, ''), x + kw / 2, top + keyH - 26);
      if (target?.finger !== undefined) {
        ctx.font = `700 12px ${MONO}`;
        ctx.fillStyle = '#1E2430';
        ctx.fillText(String(target.finger), x + kw / 2, top + keyH - 10);
      }
    }
  });

  for (const b of layout.blacks) {
    const x = PAD_X + b.x * areaW;
    const bw = b.w * areaW;
    const down = pressed.has(b.midi);
    const target = pendingByMidi.get(b.midi);
    ctx.fillStyle = down ? '#F5A524' : target ? HAND[target.hand].border : '#161A22';
    ctx.strokeStyle = down ? '#FFC35C' : '#2A303B';
    ctx.lineWidth = 1;
    roundRect(ctx, x, top, bw, keyH * 0.58, [0, 0, 7, 7]);
    ctx.fill();
    ctx.stroke();
    if (s.labels && target?.finger !== undefined) {
      ctx.fillStyle = '#0B0E13';
      ctx.font = `700 12px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(target.finger), x + bw / 2, top + keyH * 0.58 - 8);
    }
  }
}

/** The x extent of a zone on the keyboard strip, clipped to the keys on screen; null when none of it is visible. */
function zoneExtent(s: HighwayState, zone: Zone, w: number): { x0: number; x1: number } | null {
  const { whites } = s.layout;
  const first = whites.findIndex((m) => m >= zone.lo);
  let last = -1;
  whites.forEach((m, i) => {
    if (m <= zone.hi) last = i;
  });
  if (first < 0 || last < first) return null;
  const kw = (w - PAD_X * 2) / whites.length;
  return { x0: PAD_X + first * kw, x1: PAD_X + (last + 1) * kw };
}

/**
 * Shade a hand's five-key zone. The current zone is a solid tint with a solid bar underneath; the next zone is
 * a dashed outline with a dashed bar and "next" in the tag, so the two differ in shape and text, not only in colour.
 */
function drawZone(ctx: CanvasRenderingContext2D, w: number, h: number, s: HighwayState, zone: Zone, kind: 'current' | 'next') {
  const ext = zoneExtent(s, zone, w);
  if (!ext) return;
  const kh = keyboardHeight(h);
  const top = h - kh;
  const keyH = kh - 16;
  const c = ZONE[zone.hand];
  const width = ext.x1 - ext.x0;
  ctx.save();
  ctx.fillStyle = kind === 'current' ? c.tint : c.faint;
  ctx.fillRect(ext.x0 + 1, top, width - 2, keyH);
  ctx.strokeStyle = c.line;
  ctx.fillStyle = c.line;
  if (kind === 'next') {
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(ext.x0 + 2, top + 1.5, width - 4, keyH - 3);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ext.x0 + 2, top + keyH + 3);
    ctx.lineTo(ext.x1 - 2, top + keyH + 3);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillRect(ext.x0 + 1, top + keyH + 1, width - 2, 4);
  }
  ctx.font = `700 11px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(kind === 'next' ? `${c.tag} next` : c.tag, ext.x0 + 3, top + kh - 2);

  // The anchor key (under the thumb) glows; the next one pulses.
  const a = s.layout.whites.indexOf(zone.anchor);
  if (a >= 0) {
    const kw = (w - PAD_X * 2) / s.layout.whites.length;
    const pulse = kind === 'next' ? 0.55 + 0.45 * Math.sin(s.now / 180) : 1;
    ctx.globalAlpha = pulse;
    ctx.shadowColor = c.line;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    if (kind === 'next') ctx.setLineDash([4, 3]);
    roundRect(ctx, PAD_X + a * kw + 2.5, top + 1.5, kw - 5, keyH - 3, [0, 0, 6, 6]);
    ctx.stroke();
  }
  ctx.restore();
}

/** The shift marker: a dashed line across the highway at the shift note, an arrow along it and the label. */
function drawShiftMarker(ctx: CanvasRenderingContext2D, w: number, h: number, s: HighwayState, cue: Shift) {
  const lineY = hitLineY(h);
  const ppb = lineY / LOOKAHEAD_BEATS;
  const y = lineY - (cue.beat - s.beat) * ppb;
  if (y < -40 || y > lineY + HIT_LINE_OFFSET) return;
  const areaW = w - PAD_X * 2;
  const c = ZONE[cue.hand];
  const xOf = (midi: number) => {
    const { lo, hi } = s.layout.range;
    const clamped = Math.min(hi, Math.max(lo, midi));
    const lane = s.layout.laneOf(clamped);
    return PAD_X + (lane.x + lane.w / 2) * areaW;
  };
  const fx = xOf(cue.fromAnchor);
  const tx = xOf(cue.toAnchor);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, lineY + HIT_LINE_OFFSET);
  ctx.clip();
  ctx.strokeStyle = c.line;
  ctx.fillStyle = c.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(w - PAD_X, y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Arrow from where the hand is to where it goes.
  const dir = tx >= fx ? 1 : -1;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(fx, y);
  ctx.lineTo(tx - dir * 8, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx, y);
  ctx.lineTo(tx - dir * 16, y - 10);
  ctx.lineTo(tx - dir * 16, y + 10);
  ctx.closePath();
  ctx.fill();
  // Label pill above the target lane.
  const text = `${cue.direction === 'right' ? '▶' : '◀'} ${cue.label}`;
  const pillW = Math.min(areaW, text.length * 9 + 28);
  const px = Math.min(w - PAD_X - pillW, Math.max(PAD_X, tx - pillW / 2));
  const py = Math.max(4, y - 40);
  ctx.fillStyle = '#0B0E13';
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pillW, 30, 15);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 15px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px + pillW / 2, py + 16);
  ctx.restore();
}

/** Draw one frame of the highway and keyboard. Coordinates are CSS pixels. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, s: HighwayState): void {
  const lineY = hitLineY(h);
  const areaW = w - PAD_X * 2;
  const n = s.layout.whites.length;

  ctx.fillStyle = '#0B0E13';
  ctx.fillRect(0, 0, w, h);

  // Lane lines, one per white key.
  ctx.fillStyle = '#181D27';
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(PAD_X + (i * areaW) / n) - 0.5, 0, 1, lineY + HIT_LINE_OFFSET);

  drawNotes(ctx, w, h, s);

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#F5A524';
  ctx.fillRect(0, lineY, w, 2);
  ctx.restore();

  if (s.help?.cue) drawShiftMarker(ctx, w, h, s, s.help.cue);

  drawKeyboard(ctx, w, h, s);

  if (s.help) {
    for (const hand of ['left', 'right'] as const) {
      const { current, next } = s.help.zones[hand];
      if (current) drawZone(ctx, w, h, s, current, 'current');
      if (next) drawZone(ctx, w, h, s, next, 'next');
    }
  }
}
