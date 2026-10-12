import { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, type CursorOptions } from 'opensheetmusicdisplay';
import type { PlaySession } from '../engine/session';
import type { Song } from '../engine/song';
import { applyTone, buildNoteMap, cursorIndexAt, type NoteEntry, type SheetTone } from './sheetSync';

const INK = '#F2F0EA';
const CURSOR: CursorOptions = { type: 0, color: '#F5A524', alpha: 0.55, follow: false };

interface Cursor {
  stamps: number[];
  xs: number[];
}

/**
 * Scrolling score (OpenSheetMusicDisplay): one long line of music, a cursor that follows
 * the song clock, and notes that turn green when hit and coral when missed.
 */
export default function SheetView({ song, session, compact, approximate }: { song: Song; session: PlaySession; compact?: boolean; approximate?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [measures, setMeasures] = useState(0);
  const [mapped, setMapped] = useState(0);
  const sync = useRef<{ osmd: OpenSheetMusicDisplay; cursor: Cursor; entries: NoteEntry[] } | null>(null);

  // Load and render once per song.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !song.musicXml) return;
    let live = true;
    host.innerHTML = '';
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
      drawCredits: false,
      drawMeasureNumbers: true,
      renderSingleHorizontalStaffline: true,
      followCursor: false,
      defaultColorMusic: INK,
      defaultColorNotehead: INK,
      defaultColorStem: INK,
      defaultColorRest: INK,
      defaultColorLabel: INK,
      cursorsOptions: [CURSOR],
    });
    osmd
      .load(song.musicXml)
      .then(() => {
        if (!live) return;
        osmd.zoom = compact ? 0.8 : 1.3;
        osmd.render();
        const cursor = osmd.cursor;
        cursor.show();
        cursor.cursorElement.dataset.testid = 'sheet-cursor';
        const stamps: number[] = [];
        const xs: number[] = [];
        cursor.reset();
        while (!cursor.iterator.EndReached) {
          stamps.push(cursor.iterator.currentTimeStamp.RealValue * 4);
          xs.push(parseFloat(cursor.cursorElement.style.left) || 0);
          cursor.iterator.moveToNext();
          cursor.update();
        }
        cursor.reset();
        cursor.update();
        const entries = buildNoteMap(osmd, song);
        sync.current = { osmd, cursor: { stamps, xs }, entries };
        setMeasures(osmd.GraphicSheet.MeasureList.length);
        setMapped(entries.length);
        setState('ready');
      })
      .catch(() => live && setState('error'));
    return () => {
      live = false;
      sync.current = null;
      try {
        osmd.clear();
      } catch {
        /* the host was already torn down */
      }
      host.innerHTML = '';
    };
  }, [song, compact]);

  // Follow the clock: cursor step, scroll position, note colours.
  useEffect(() => {
    if (state !== 'ready') return;
    let raf = 0;
    let curIdx = 0;
    let lastBeat = -Infinity;
    let low = 0;
    const applied = new Map<string, SheetTone>();
    const frame = (now: number) => {
      const s = sync.current;
      const scroller = scrollRef.current;
      if (s && scroller) {
        const beat = session.beatAt(now);
        const { stamps, xs } = s.cursor;
        if (beat < lastBeat - 1) {
          for (const e of s.entries) applyTone(e, 'idle');
          applied.clear();
          low = 0;
        }
        lastBeat = beat;
        const idx = cursorIndexAt(stamps, beat);
        if (idx !== curIdx) {
          if (idx < curIdx) {
            s.osmd.cursor.reset();
            curIdx = 0;
          }
          while (curIdx < idx) {
            s.osmd.cursor.iterator.moveToNext();
            curIdx++;
          }
          s.osmd.cursor.update();
        }
        const x0 = xs[idx] ?? 0;
        const x1 = xs[idx + 1] ?? x0;
        const t0 = stamps[idx] ?? 0;
        const t1 = stamps[idx + 1] ?? t0 + 1;
        const frac = beat <= t0 ? 0 : Math.min(1, (beat - t0) / Math.max(1e-6, t1 - t0));
        const target = x0 + (x1 - x0) * frac - scroller.clientWidth * 0.25;
        scroller.scrollLeft = Math.max(0, target);
        let advance = true;
        for (let i = low; i < s.entries.length; i++) {
          const e = s.entries[i]!;
          if (e.startBeat > beat + 2) break;
          if (applied.has(e.id)) {
            if (advance) low = i + 1;
            continue;
          }
          const tone: SheetTone = session.isHit(e.id) ? 'hit' : session.isMissed(e.id) ? 'miss' : 'idle';
          if (tone !== 'idle') {
            applyTone(e, tone);
            applied.set(e.id, tone);
            if (advance) low = i + 1;
          } else if (e.startBeat < beat - 4) {
            if (advance) low = i + 1;
          } else advance = false;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state, session]);

  return (
    <div className="sheet" data-testid="sheet" data-state={state} data-measures={measures} data-mapped={mapped} data-compact={compact ? 'true' : undefined}>
      {approximate && (
        <div className="sheet-approx" data-testid="sheet-approximate">
          Approximate score, generated from MIDI. Notes are snapped to sixteenths and spelled with sharps.
        </div>
      )}
      {state === 'loading' && <div className="sheet-note">Setting the score...</div>}
      {state === 'error' && <div className="sheet-note">The score could not be drawn.</div>}
      <div className="sheet-scroll" ref={scrollRef}>
        <div ref={hostRef} className="sheet-host" />
      </div>
    </div>
  );
}
