import { describe, expect, it } from 'vitest';
import { HOLD_MS, parentHash, resolveCommand, swallowsNote, type NavScope } from '../src/nav/actions';
import { COMMAND_NOTES, COMMANDS, commandForNote, isCommandNote, songUsesCommandNotes } from '../src/nav/commands';
import { UNITS } from '../src/learn/units';
import { getSongs } from '../src/songs/catalog';
import { parseRoute } from '../src/ui/useRoute';

const menu: NavScope = { kind: 'menu' };
const route = (hash: string) => parseRoute(hash);

describe('command keys', () => {
  it('are the five lowest white keys: A0 back, B0 previous, C1 select, D1 next, E1 home', () => {
    expect(COMMAND_NOTES).toEqual({ back: 21, prev: 23, select: 24, next: 26, home: 28 });
    expect(COMMANDS.map((c) => c.note)).toEqual(['A0', 'B0', 'C1', 'D1', 'E1']);
    for (const c of COMMANDS) expect(commandForNote(c.midi)).toBe(c.command);
  });

  it('nothing else is a command, including the black keys and the notes beside them', () => {
    for (const m of [20, 22, 25, 27, 29, 30, 60, 108]) {
      expect(commandForNote(m), String(m)).toBeNull();
      expect(isCommandNote(m)).toBe(false);
    }
  });

  it('no bundled song uses a command note, so they are on for every bundled song', () => {
    for (const s of getSongs()) expect(songUsesCommandNotes(s.notes), s.id).toBe(false);
  });

  it('a song with any command note turns them off for that song', () => {
    expect(songUsesCommandNotes([{ midi: 60 }, { midi: 21 }])).toBe(true);
    expect(songUsesCommandNotes([{ midi: 28 }])).toBe(true);
    expect(songUsesCommandNotes([{ midi: 29 }, { midi: 30 }])).toBe(false);
    expect(songUsesCommandNotes([])).toBe(false);
  });

  it('no Learn lesson asks for a command note, so lessons can ignore them', () => {
    for (const u of UNITS) {
      expect(u.notes.filter(isCommandNote), u.id).toEqual([]);
      expect(u.keyboard[0], `${u.id} keyboard`).toBeGreaterThan(28);
      for (const l of u.lessons) {
        const midis = [...(l.song?.notes ?? []).flatMap((n) => [n.midi, n.left?.midi ?? 0]), ...(l.pattern ? [l.pattern.midi] : [])];
        expect(midis.filter(isCommandNote), `${u.id}/${l.id}`).toEqual([]);
      }
    }
  });
});

describe('what the keys do in a menu', () => {
  it('B0 and D1 move the selection, C1 presses it', () => {
    expect(resolveCommand('prev', menu, route('#/'))).toEqual({ type: 'focus', dir: 'prev' });
    expect(resolveCommand('next', menu, route('#/songs'))).toEqual({ type: 'focus', dir: 'next' });
    expect(resolveCommand('select', menu, route('#/stats'))).toEqual({ type: 'activate' });
  });

  it('A0 goes back one level, E1 goes Home', () => {
    expect(resolveCommand('back', menu, route('#/songs'))).toEqual({ type: 'go', hash: '#/' });
    expect(resolveCommand('back', menu, route('#/play/mary-had-a-little-lamb'))).toEqual({ type: 'go', hash: '#/songs' });
    expect(resolveCommand('home', menu, route('#/settings'))).toEqual({ type: 'go', hash: '#/' });
  });

  it('A0 and E1 do nothing on Home', () => {
    expect(resolveCommand('back', menu, route('#/'))).toEqual({ type: 'none' });
    expect(resolveCommand('home', menu, route('#/'))).toEqual({ type: 'none' });
  });

  it('back walks Learn: lesson, unit, path, Home', () => {
    expect(parentHash(route('#/learn/unit-2/note-flash'))).toBe('#/learn/unit-2');
    expect(parentHash(route('#/learn/unit-2'))).toBe('#/learn');
    expect(parentHash(route('#/learn'))).toBe('#/');
  });

  it('back from Results, Import and Play lands on Songs; from Stats, Settings and Keyboard on Home', () => {
    for (const h of ['#/results/x', '#/import', '#/import/imp-1', '#/add/audio', '#/play/x']) expect(parentHash(route(h)), h).toBe('#/songs');
    for (const h of ['#/stats', '#/settings', '#/credits', '#/keyboard', '#/songs']) expect(parentHash(route(h)), h).toBe('#/');
  });
});

describe('what the keys do while a song is open', () => {
  const play = (status: 'ready' | 'playing' | 'waiting' | 'paused' | 'finished', blocked = false): NavScope => ({ kind: 'play', blocked, status });

  it('while the song runs C1 pauses and resumes and nothing else does anything', () => {
    for (const status of ['playing', 'waiting', 'paused'] as const) {
      expect(resolveCommand('select', play(status), route('#/play/x'))).toEqual({ type: 'toggle-pause' });
      for (const c of ['back', 'prev', 'next', 'home'] as const) expect(resolveCommand(c, play(status), route('#/play/x')), `${status} ${c}`).toEqual({ type: 'none' });
    }
  });

  it('before the start and after the end they are the normal menu keys', () => {
    expect(resolveCommand('back', play('ready'), route('#/play/x'))).toEqual({ type: 'go', hash: '#/songs' });
    expect(resolveCommand('select', play('ready'), route('#/play/x'))).toEqual({ type: 'activate' });
    expect(resolveCommand('next', play('finished'), route('#/play/x'))).toEqual({ type: 'focus', dir: 'next' });
  });

  it('a song that uses command notes gets no commands at all, and the notes count as notes', () => {
    for (const status of ['ready', 'playing', 'paused', 'finished'] as const) {
      for (const c of ['back', 'prev', 'select', 'next', 'home'] as const) expect(resolveCommand(c, play(status, true), route('#/play/x'))).toEqual({ type: 'none' });
    }
    expect(swallowsNote(true, play('playing', true), 21)).toBe(false);
    expect(swallowsNote(true, play('playing', false), 21)).toBe(true);
  });
});

describe('results and suspended screens', () => {
  const results: NavScope = { kind: 'results', retryHref: '#/play/x?mode=full', practiseHref: '#/play/x?mode=practice&from=2&to=3&speed=70' };

  it('C1 retry, D1 practise my mistakes, A0 Songs, E1 Home', () => {
    expect(resolveCommand('select', results, route('#/results/a'))).toEqual({ type: 'go', hash: '#/play/x?mode=full' });
    expect(resolveCommand('next', results, route('#/results/a'))).toEqual({ type: 'go', hash: '#/play/x?mode=practice&from=2&to=3&speed=70' });
    expect(resolveCommand('back', results, route('#/results/a'))).toEqual({ type: 'go', hash: '#/songs' });
    expect(resolveCommand('home', results, route('#/results/a'))).toEqual({ type: 'go', hash: '#/' });
  });

  it('B0 steps through the (i) help buttons, since the other keys are taken; a focused button shows its bubble', () => {
    expect(resolveCommand('prev', results, route('#/results/a'))).toEqual({ type: 'focus', dir: 'next', only: '.help-btn' });
  });

  it('D1 does nothing when there is nothing to practise', () => {
    expect(resolveCommand('next', { kind: 'results', retryHref: '#/play/x' }, route('#/results/a'))).toEqual({ type: 'none' });
  });

  it('the latency check hears every key: commands do nothing and are not hidden', () => {
    const s: NavScope = { kind: 'suspended' };
    for (const c of ['back', 'prev', 'select', 'next', 'home'] as const) expect(resolveCommand(c, s, route('#/settings'))).toEqual({ type: 'none' });
    expect(swallowsNote(true, s, 24)).toBe(false);
  });

  it('the keyboard check lights every key: no immediate command, nothing hidden; holding is handled by the screen', () => {
    const s: NavScope = { kind: 'keycheck' };
    for (const c of ['back', 'prev', 'select', 'next', 'home'] as const) expect(resolveCommand(c, s, route('#/keyboard'))).toEqual({ type: 'none' });
    expect(swallowsNote(true, s, 21)).toBe(false);
    expect(HOLD_MS).toBeGreaterThanOrEqual(500);
  });

  it('with the setting off nothing is swallowed', () => {
    expect(swallowsNote(false, menu, 24)).toBe(false);
    expect(swallowsNote(true, menu, 24)).toBe(true);
    expect(swallowsNote(true, menu, 60)).toBe(false);
  });
});

describe('add song route', () => {
  it('#/add/audio is its own route and hrefFor round-trips', async () => {
    const { hrefFor } = await import('../src/ui/useRoute');
    expect(parseRoute('#/add/audio')).toEqual({ name: 'addAudio' });
    expect(parseRoute(hrefFor.addAudio())).toEqual({ name: 'addAudio' });
    expect(parseRoute('#/add/other')).toEqual({ name: 'home' });
  });
});
