import { describe, expect, it } from 'vitest';
import type { Song, SongNote } from '../src/engine/song';
import { WaitSession } from '../src/engine/wait';

let n = 0;
const note = (midi: number, startBeat: number, durationBeats = 1, hand: SongNote['hand'] = 'right'): SongNote => ({
  id: `n${++n}`,
  midi,
  startBeat,
  durationBeats,
  hand,
  measure: 1 + Math.floor(startBeat / 4),
});

const song = (notes: SongNote[]): Song => ({
  id: 's',
  title: 'T',
  composer: 'C',
  source: 'bundled',
  level: 1,
  hands: 'right',
  bpm: 60, // 1 beat = 1000 ms
  timeSignature: [4, 4],
  notes,
});

const opts = { leadInBeats: 2 };

describe('WaitSession', () => {
  it('starts in ready, runs from the lead-in, and holds at the first note', () => {
    const s = new WaitSession(song([note(60, 0), note(62, 1)]), opts);
    expect(s.status).toBe('ready');
    s.start(0);
    expect(s.status).toBe('playing');
    s.update(1000);
    expect(s.beatAt(1000)).toBeCloseTo(-1);
    s.update(2500);
    expect(s.status).toBe('waiting');
    expect(s.beatAt(9000)).toBe(0);
    expect(s.waitingFor()).toEqual([60]);
  });

  it('a wrong key does not release the song and is counted', () => {
    const s = new WaitSession(song([note(60, 0)]), opts);
    s.start(0);
    s.update(2100);
    expect(s.noteOn(61, 2500)).toBe('wrong');
    expect(s.status).toBe('waiting');
    expect(s.stats().wrong).toBe(1);
    expect(s.stats().correct).toBe(0);
  });

  it('the correct key resumes the clock and records time to press', () => {
    const s = new WaitSession(song([note(60, 0), note(62, 1)]), opts);
    s.start(0);
    s.update(2000); // reached note 0 exactly
    expect(s.status).toBe('waiting');
    expect(s.noteOn(60, 3200)).toBe('correct');
    expect(s.status).toBe('playing');
    expect(s.stats().correct).toBe(1);
    expect(s.stats().avgTimeToPressMs).toBeCloseTo(1200, -1);
    // the clock continues from beat 0 at the moment of the press
    expect(s.beatAt(3700)).toBeCloseTo(0.5);
    s.update(4300);
    expect(s.status).toBe('waiting');
    expect(s.waitingFor()).toEqual([62]);
  });

  it('a chord needs every note; order does not matter', () => {
    const s = new WaitSession(song([note(60, 0), note(64, 0), note(67, 0)]), opts);
    s.start(0);
    s.update(2000);
    expect(s.waitingFor()).toEqual([60, 64, 67]);
    expect(s.noteOn(67, 2100)).toBe('correct');
    expect(s.status).toBe('waiting');
    expect(s.waitingFor()).toEqual([60, 64]);
    s.noteOn(60, 2200);
    expect(s.status).toBe('waiting');
    s.noteOn(64, 2300);
    expect(s.status).toBe('playing');
    expect(s.stats().correct).toBe(3);
  });

  it('accepts a correct key slightly early and does not stop for it', () => {
    const s = new WaitSession(song([note(60, 0), note(62, 2)]), opts);
    s.start(0);
    expect(s.noteOn(60, 1500)).toBe('correct'); // 0.5 beat early
    s.update(2500);
    expect(s.status).toBe('playing');
    expect(s.stats().avgTimeToPressMs).toBe(0);
  });

  it('ignores keys when the next note is far away', () => {
    const s = new WaitSession(song([note(60, 0)]), { leadInBeats: 4, earlyWindowBeats: 1 });
    s.start(0);
    expect(s.noteOn(60, 100)).toBe('ignored');
    expect(s.stats().correct).toBe(0);
    expect(s.stats().wrong).toBe(0);
  });

  it('finishes after the last note has played out, with every note counted', () => {
    const s = new WaitSession(song([note(60, 0, 2)]), opts);
    s.start(0);
    s.update(2000);
    s.noteOn(60, 2000);
    s.update(3000);
    expect(s.status).toBe('playing');
    s.update(4100);
    expect(s.status).toBe('finished');
    expect(s.stats()).toMatchObject({ total: 1, correct: 1, wrong: 0 });
    expect(s.noteOn(60, 5000)).toBe('ignored');
  });

  it('pause freezes everything, including a pending wait, and resume restores it', () => {
    const s = new WaitSession(song([note(60, 0)]), opts);
    s.start(0);
    s.pause(1000);
    expect(s.status).toBe('paused');
    expect(s.noteOn(60, 1500)).toBe('ignored');
    s.resume(5000);
    expect(s.beatAt(5000)).toBeCloseTo(-1);
    s.update(6000);
    expect(s.status).toBe('waiting');
    s.pause(6500);
    s.resume(9000);
    expect(s.status).toBe('waiting');
    expect(s.noteOn(60, 9500)).toBe('correct');
    expect(s.stats().avgTimeToPressMs).toBeCloseTo(1000, -1);
  });

  it('with one hand selected, the other hand plays itself and never blocks', () => {
    const s = new WaitSession(
      song([note(48, 0, 1, 'left'), note(60, 1), note(48, 2, 1, 'left')]),
      { ...opts, hands: 'right' },
    );
    s.start(0);
    s.update(2000);
    expect(s.status).toBe('playing');
    s.update(3000);
    expect(s.waitingFor()).toEqual([60]);
    expect(s.stats().total).toBe(1);
  });

  it('tracks which notes were hit', () => {
    const a = note(60, 0);
    const b = note(62, 1);
    const s = new WaitSession(song([a, b]), opts);
    s.start(0);
    s.update(2000);
    s.noteOn(60, 2000);
    expect(s.isHit(a.id)).toBe(true);
    expect(s.isHit(b.id)).toBe(false);
  });

  it('an empty song finishes when the lead-in ends', () => {
    const s = new WaitSession(song([]), opts);
    s.start(0);
    s.update(2000);
    expect(s.status).toBe('finished');
  });

  it('notifies subscribers and bumps its version on state changes', () => {
    const s = new WaitSession(song([note(60, 0)]), opts);
    let calls = 0;
    const off = s.subscribe(() => calls++);
    const v0 = s.version;
    s.start(0);
    s.update(2000);
    s.noteOn(60, 2100);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(s.version).toBeGreaterThan(v0);
    off();
    const c = calls;
    s.pause(2200);
    expect(calls).toBe(c);
  });
});

describe('WaitSession summary', () => {
  /** Press every note on its step, optionally preceding some with a wrong key. */
  function play(wrongBefore: number[]) {
    const notes = [note(60, 0), note(62, 1), note(64, 2), note(65, 3)];
    const s = new WaitSession(song(notes), opts);
    s.start(0);
    let t = 0;
    notes.forEach((nt, i) => {
      t += 3000;
      s.update(t);
      if (wrongBefore.includes(i)) s.noteOn(nt.midi + 1, t);
      s.noteOn(nt.midi, t + 10);
    });
    s.update(t + 5000);
    return { s, notes };
  }

  it('a clean run is all hits: 100 points each, 3 stars, no misses', () => {
    const { s, notes } = play([]);
    expect(s.status).toBe('finished');
    expect(s.summary()).toMatchObject({ score: 400, hits: 4, total: 4, accuracy: 1, stars: 3, longestStreak: 4, misses: [], missedNoteIds: [] });
    expect(s.summary().hitNoteIds).toEqual(notes.map((x) => x.id));
  });

  it('a wrong key before a note makes it a retried note and logs a wrong-key miss', () => {
    const { s, notes } = play([1]);
    const sum = s.summary();
    expect(sum).toMatchObject({ hits: 3, total: 4, accuracy: 0.75, stars: 1, score: 300, longestStreak: 2 });
    expect(sum.missedNoteIds).toEqual([notes[1]!.id]);
    expect(sum.misses).toEqual([{ noteId: notes[1]!.id, midi: 62, pressedMidi: 63, measure: 1, kind: 'wrong-key', offsetMs: null }]);
  });

  it('counts the longest run of notes played without a wrong key', () => {
    const { s } = play([2]);
    expect(s.summary().longestStreak).toBe(2);
  });
});
