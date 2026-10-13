/**
 * Synthetic audio fixtures: a bundled public-domain song rendered with an additive-sine "piano", written in code so
 * no audio file is checked in. Used by the transcription tests (Node) and the e2e tests (as WAV bytes).
 */
import { readFileSync } from 'node:fs';
import { BUNDLED_ENTRIES } from '../../src/songs/entries.ts';
import { parseMusicXml } from '../../src/songs/musicxml.ts';
import type { Song } from '../../src/engine/song.ts';

export const FIXTURE_RATE = 22050;

/** A bundled song by file stem (for example 'ode-to-joy'), parsed from the repo's MusicXML. */
export function bundledSong(stem: string): Song {
  const entry = BUNDLED_ENTRIES.find((e) => e.file === stem);
  if (!entry) throw new Error(`no bundled song ${stem}`);
  return parseMusicXml(readFileSync(new URL(`../../src/songs/${stem}.musicxml`, import.meta.url), 'utf8'), entry.meta);
}

export interface RefNote {
  midi: number;
  startSec: number;
  durationSec: number;
  hand: 'right' | 'left';
}

/** The song's notes in seconds, those starting before `seconds`. */
export function referenceNotes(song: Song, seconds = Infinity): RefNote[] {
  const spb = 60 / song.bpm;
  return song.notes
    .map((n) => ({ midi: n.midi, startSec: n.startBeat * spb, durationSec: n.durationBeats * spb, hand: n.hand }))
    .filter((n) => n.startSec < seconds);
}

function render(buf: Float32Array, sr: number, midi: number, t: number, d: number, gain: number): void {
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const start = Math.floor(t * sr);
  const len = Math.floor((d + 0.15) * sr);
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const s = i / sr;
    const env = Math.min(1, s / 0.005) * Math.exp(-s * 3) * (s > d ? Math.exp(-(s - d) * 30) : 1);
    let v = 0;
    for (let h = 1; h <= 6; h++) if (f0 * h < sr / 2) v += Math.sin(2 * Math.PI * f0 * h * s) / (h * h);
    buf[start + i]! += v * env * gain;
  }
}

/**
 * Mono samples in [-1, 1]: the notes that start in the first `seconds`, six harmonics at 1/h^2, 5 ms attack,
 * exponential decay. `mix` adds a beat-synchronous noise burst and a parallel pad a major third below the right hand,
 * a crude stand-in for a full mix. Deterministic.
 */
export function synthesize(song: Song, opts: { seconds: number; sampleRate?: number; mix?: boolean }): Float32Array {
  const sr = opts.sampleRate ?? FIXTURE_RATE;
  const notes = referenceNotes(song, opts.seconds);
  const spb = 60 / song.bpm;
  const end = Math.min(opts.seconds, Math.max(...notes.map((n) => n.startSec + n.durationSec))) + 1;
  const buf = new Float32Array(Math.ceil(end * sr));
  for (const n of notes) render(buf, sr, n.midi, n.startSec, n.durationSec, 0.25);
  if (opts.mix) {
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    for (let b = 0; b * spb < end; b++) {
      const s0 = Math.floor(b * spb * sr);
      for (let i = 0; i < 0.08 * sr && s0 + i < buf.length; i++) buf[s0 + i]! += rnd() * 0.3 * Math.exp((-i / sr) * 40);
    }
    for (const n of notes.filter((x) => x.hand === 'right')) render(buf, sr, n.midi - 4, n.startSec, n.durationSec, 0.12);
  }
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < buf.length; i++) buf[i]! /= peak * 1.1;
  return buf;
}

/** 16-bit PCM mono WAV. */
export function toWav(pcm: Float32Array, sampleRate = FIXTURE_RATE): Uint8Array {
  const out = new Uint8Array(44 + pcm.length * 2);
  const v = new DataView(out.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  tag(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i]!)) * 32767), true);
  return out;
}

/** Read back what toWav wrote (tests only). */
export function fromWav(bytes: Uint8Array): { sampleRate: number; pcm: Float32Array } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint32(40, true) / 2;
  return { sampleRate: v.getUint32(24, true), pcm: Float32Array.from({ length: n }, (_, i) => v.getInt16(44 + i * 2, true) / 32767) };
}
