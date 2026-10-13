import { barBeats, type LoopSpan } from '../engine/loop';
import type { Mode } from '../engine/judge';
import type { PlaySession } from '../engine/session';
import type { Song } from '../engine/song';
import { TimedSession } from '../engine/timed';
import { WaitSession } from '../engine/wait';
import type { NoteEvent } from '../midi/parse';
import { LOOKAHEAD_BEATS } from './highwayDraw';

/** The two choices that decide which session a play screen builds. */
export interface SessionSetup {
  mode: Mode;
  speedPct: number;
}

/**
 * Build the session the Play screen plays. The screen and the every-song autoplay test both call this, so the lead-in,
 * the latency and the loop handling cannot drift apart.
 */
export function createPlaySession(song: Song, setup: SessionSetup, opts: { latencyMs: number; loop?: LoopSpan }): PlaySession {
  const common = {
    hands: 'both' as const,
    leadInBeats: Math.max(LOOKAHEAD_BEATS, barBeats(song)),
    loop: opts.loop,
  };
  if (setup.mode === 'wait') return new WaitSession(song, common);
  return new TimedSession(song, { ...common, mode: setup.mode, speed: setup.speedPct / 100, latencyMs: opts.latencyMs });
}

/** One MIDI event into a session: a key press starts a ready song, otherwise it is judged. Releases do nothing. */
export function feedNote(session: PlaySession, e: NoteEvent, nowMs: number): void {
  if (e.type !== 'noteOn') return;
  if (session.status === 'ready') session.start(nowMs);
  else session.noteOn(e.midi, nowMs);
}
