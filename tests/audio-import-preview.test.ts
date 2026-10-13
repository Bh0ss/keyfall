import { afterEach, describe, expect, it } from 'vitest';
import { buildPreviewSong, buildReview } from '../src/audioImport/review';
import { clearDraft, holdDraft, isHeld, leaveAddAudio, peekDraft, release, type ReviewDraft } from '../src/audioImport/draft';
import { parentHash } from '../src/nav/actions';
import { analyseFile } from '../src/import/analyse';
import { buildSong } from '../src/import/build';
import { arrangementToFile } from '../src/arrange/toImport';
import { clearPreviewSong, findPlayableSong, getAllSongs, isPreviewId, loadPlayableSong, setPreviewSong } from '../src/songs/library';
import { hrefFor, parseRoute } from '../src/ui/useRoute';
import { bundledSong } from './fixtures/audio';
import { eventsOf } from './fixtures/events';

const events = eventsOf(bundledSong('ode-to-joy'), 30);
const base = { version: 'beginner', bpm: null, key: null, trimSec: null } as const;
const form = { title: 'Ode', composer: 'Someone', splitMode: 'groups', splitMidi: 60, level: 2, levelOverridden: true } as const;

afterEach(() => {
  clearPreviewSong();
  clearDraft();
});

describe('buildPreviewSong', () => {
  it('is the song the save would make, under a preview- id', async () => {
    const review = await buildReview(events, base, { title: 'Ode', composer: 'Someone' });
    const song = await buildPreviewSong(review.arrangement, form);
    expect(isPreviewId(song.id)).toBe(true);
    const file = arrangementToFile(review.arrangement, { title: 'Ode', composer: 'Someone' });
    const saved = buildSong(await analyseFile(file.fileName, file.bytes.slice().buffer), 'imp-x', form).song;
    expect(song.notes.map((n) => [n.midi, n.startBeat, n.durationBeats, n.hand])).toEqual(saved.notes.map((n) => [n.midi, n.startBeat, n.durationBeats, n.hand]));
    expect(song.title).toBe('Ode');
    expect(song.level).toBe(2);
    expect(song.musicXml).toBeDefined();
  });
});

describe('the library preview slot', () => {
  it('serves the preview song to findPlayableSong and loadPlayableSong, but never lists it', async () => {
    const review = await buildReview(events, base, { title: 'Ode', composer: 'Someone' });
    const song = await buildPreviewSong(review.arrangement, form);
    const before = getAllSongs();
    expect(findPlayableSong(song.id)).toBeUndefined();
    setPreviewSong(song);
    expect(findPlayableSong(song.id)?.title).toBe('Ode');
    expect(await loadPlayableSong(song.id)).toBe(song);
    expect(getAllSongs()).toBe(before);
    clearPreviewSong();
    expect(findPlayableSong(song.id)).toBeUndefined();
    expect(await loadPlayableSong(song.id)).toBeUndefined();
  });

  it('refuses a song whose id is not a preview id', async () => {
    const review = await buildReview(events, base, { title: 'Ode', composer: 'Someone' });
    const song = await buildPreviewSong(review.arrangement, form);
    expect(() => setPreviewSong({ ...song, id: 'imp-1' })).toThrow();
  });
});

describe('the review draft', () => {
  const draft = (): ReviewDraft => ({ events, seconds: 30, meta: { title: 'Ode', artist: 'Someone', thumbnail: undefined, fileName: 'a.wav' }, choices: { ...base, bpm: 90 }, form });

  it('comes back only after being held for a preview, and every choice is intact', () => {
    expect(peekDraft()).toBeNull();
    holdDraft(draft());
    expect(isHeld()).toBe(true);
    expect(peekDraft()).toEqual(draft());
    release();
    expect(isHeld()).toBe(false);
    expect(peekDraft()).toBeNull();
  });

  it('leaving the flow without a preview in flight drops the draft and the preview slot', () => {
    holdDraft(draft());
    release();
    leaveAddAudio();
    expect(peekDraft()).toBeNull();
  });

  it('leaving the screen for the preview keeps the draft', () => {
    holdDraft(draft());
    leaveAddAudio();
    expect(peekDraft()).toEqual(draft());
  });
});

describe('preview routes', () => {
  it('round-trips the preview flag and sends back to Add song', () => {
    const href = hrefFor.play('preview-draft', { preview: true });
    expect(href).toBe('#/play/preview-draft?preview=1');
    const r = parseRoute(href);
    expect(r).toMatchObject({ name: 'play', songId: 'preview-draft', preset: { preview: true } });
    expect(parentHash(r)).toBe('#/add/audio');
    expect((parseRoute('#/play/x') as { preset: { preview?: boolean } }).preset.preview).toBeFalsy();
    expect(parentHash(parseRoute('#/play/x'))).toBe('#/songs');
  });
});
