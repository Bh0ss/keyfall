# Progress

## Phase 0: Foundation

### Built

- Theme tokens from the Visual design table as CSS custom properties (`src/ui/tokens.css`), plus the few derived tints the canvas uses (chip backgrounds, key colours). Fonts Bricolage Grotesque, DM Sans and JetBrains Mono are bundled with `@fontsource` (latin subsets), so they work offline.
- MIDI layer (`src/midi/`):
  - `parse.ts`: raw message to note event. Note-on velocity 0 is note-off. Channel from the low nibble. Non-note and truncated messages are ignored.
  - `pressed.ts`: immutable pressed-key state (midi to velocity).
  - `devices.ts`: connected input summary (display name, connected, transport when detectable).
  - `engine.ts`: `requestMIDIAccess`, listens to every input, handles `statechange` (devices appear and disappear without a reload, held keys drop on disconnect), and states: unsupported, denied, error, ready. External store for React plus a note subscription for later phases.
  - `virtual.ts`: `window.__keyfall.press(midi, velocity = 80)` and `release(midi)` feed the same pipeline as real MIDI. Computer-keyboard piano (A W S E D F T G Y H U J K = C4 to C5). Enabled in dev and with `?debug=1`; not installed otherwise.
- Connection screen (`src/ui/`): status chip ("FP-30X connected · Bluetooth" or "No keyboard found") with a Setup help link, setup steps, graceful cards for unsupported browser (Safari), blocked permission (with Try again), unexpected error and no device, and an on-screen 88-key keyboard that lights amber while keys are held.
- `autoplay` was not implemented in Phase 0; it arrived in Phase 1 (below).

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 7 files, 39 tests |
| `npm run build` | exit 0 |
| `npm run test:e2e` | exit 0, 11 tests |

E2E presses notes through `__keyfall.press` (white keys, black keys, chords, range ends, release), checks computer-keyboard A lights C4, and covers the no-keyboard chip, device name and disconnect without reload, denied and unsupported states.

### Decisions

- **Keyboard range: full 88 keys (MIDI 21 to 108).** It always fits the width, so nothing scrolls and every note the FP-30X can send is visible. The Phase 7 phone layout will narrow the range to what a song uses.
- **44 px targets:** applied to every interactive control (chip, Setup help, Try again). The 88 piano keys are indicators, not buttons, and are about 21 px wide at 1280 px; 44 px white keys would need 2300 px.
- **Transport detection:** Web MIDI has no transport field. "Bluetooth" is shown only when the port name or manufacturer says so; otherwise the chip says just "connected". The display name has "MIDI" and "Bluetooth" stripped ("FP-30X MIDI Bluetooth" shows as "FP-30X"). Observed on this Mac: the FP-30X shows up as a Bluetooth port and the chip reads "FP-30X connected · Bluetooth".
- **Canvas match:** Home chip colours and shape, header type scale (Bricolage 34 px, DM Sans body), card surface (#1A1F2B, #2A303B, 20 px radius), amber primary button, and the Play-screen keyboard (stage #0B0E13, white keys #F4F1EA with rounded bottoms, black keys #161A22 at 58% height, pressed key gradient #FFD27A to #F5A524). The Home nav rail is left out until there are other screens.
- **Production visibility:** `__keyfall` and the computer-keyboard piano are not installed in a production build unless the URL has `?debug=1`.
- **Playwright and real hardware:** Chromium on a Mac with the piano paired sees the real FP-30X, so e2e tests stub `requestMIDIAccess` when they need a known device list. Granting needs both `midi` and `midi-sysex`.
- **Label contrast:** key labels use #5A6272 on #F4F1EA (about 5.3:1), darker than the canvas muted grey (#6B7383, about 4.2:1), to hold 4.5:1.

### Deferred

- Latency calibration (built in Phase 2).

## Phase 1: Play engine

### Built

- Song model (`src/engine/song.ts`): `Hand`, `SongNote`, `Song` exactly as in CLAUDE.md.
- Clock (`src/engine/clock.ts`): `beatsToMs` / `msToBeats` at the song bpm and a `Clock` with `resume`, `pause`, `seek`, `setSpeed`. Time is passed in (performance.now() in the app), the requestAnimationFrame loop is in the Play screen.
- Wait mode (`src/engine/wait.ts`, `WaitSession`): the song holds at each note or chord until every pitch is pressed (any order). Wrong keys are counted and never release the song; the clock resumes at the moment of the correct press. Stats are correct keys, wrong keys and time to press (average, total). No timing grade. Pause and resume (a pending wait survives a pause), early presses accepted up to one beat ahead, per-hand play (the other hand auto-plays visually; no UI yet, constructor option).
- MusicXML loader (`src/songs/musicxml.ts`, own small XML reader in `src/songs/xml.ts`, no dependency): divisions to beats, chords, rests, backup/forward, ties merged, grace notes skipped, staff to hand, `<fingering>` 1-5, measure numbers, tempo from `<sound tempo>` or the metronome mark, time signature, title and composer.
- Bundled songs (`src/songs/*.musicxml`, `src/songs/catalog.ts`): Mary Had a Little Lamb (26 notes, 8 bars, 96 bpm) and Twinkle Twinkle Little Star (42 notes, 12 bars, 90 bpm), arranged by me, right hand, level 1, finger numbers on every note, open from the start.
- Canvas note highway and keyboard on one canvas (`src/ui/highwayLayout.ts`, `src/ui/highwayDraw.ts`, `src/ui/PlayScreen.tsx`): lanes aligned to the keys below, notes coloured by hand (right #4DA8FF, left #B78CFF) with name labels and finger numbers, amber hit line, hit notes glow amber, the note the song is waiting on pulses, pending keys tinted and showing the finger number, pressed keys light amber. Header with back button, title, Correct / Wrong keys / Avg press time, Note names toggle, pause, progress bar, Start / Paused / Song complete overlays (Retry, Songs).
- Minimal flow: `#/` is still the connection screen (now with a "Play a song" button), `#/songs` is the song list, `#/play/<id>` is the Play screen.
- Virtual input (`src/midi/autoplay.ts`, wired in `src/midi/virtual.ts`): `window.__keyfall.autoplay(profile)` with the same debug gating as press and release. `AccuracyProfile = { offsetMs, jitterMs, wrongKeyRate, missRate, hesitationMs, holdFraction, seed }`, all optional, deterministic per seed. `planAutoplay(song, profile)` is the pure plan; `runAutoplay` plays it through the MIDI engine against the open song and resolves with `{ presses, wrongPresses }`. Rejects if no song is open.

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 12 files, 84 tests |
| `npm run build` | exit 0 |
| `npm run test:e2e` | exit 0, 17 tests |

New unit tests: loader (XML reader, fixtures with chords, ties, backup, two staves, grace notes, Mary and Twinkle note counts, pitches, beats, measures, fingers), clock, WaitSession (hold, wrong key, chords, early press, finish, pause, hands), autoplay plan and a full Wait run with virtual time, highway layout. New e2e: song list to Play, Wait mode holds and only the right key releases, canvas hit line pixel and at least 45 fps, autoplay completes Mary 26/26 (then Retry resets), autoplay with offset, jitter, wrong keys and hesitations still finishes, autoplay without a song rejects.

### Decisions

- **Own XML reader instead of DOMParser or a dependency.** The loader must run in Vitest (node, no jsdom) and later in import code; about 80 lines covers MusicXML.
- **Repeats and multiple voices:** repeat signs are not expanded; all voices are read. Bundled songs do not use repeats.
- **Measure number** is the 1-based index of the `<measure>` element, not its `number` attribute, so pickup bars and odd numbering cannot produce 0 or duplicates.
- **Hand from staff:** with `<staves>` above 1, staff 1 is right and staff 2 is left; with separate single-staff parts, part 1 is right and the rest left.
- **Twinkle fingering:** C position with the pinky on both G and A (1 1 5 5 5 5 5, 4 4 3 3 2 2 1). Not the most elegant, but it stays on fingers 1-5 without a hand shift for a beginner. Revisit if it feels wrong at the piano.
- **Labels: on and off only.** Fade needs per-profile hit stats (Phase 3), so the Note names toggle has two states for now.
- **One canvas for highway and keyboard** so lanes line up with keys by construction. The Play keyboard shows only the song's range (C3 to C5 for Mary, 15 white keys, like the canvas); the 88-key strip stays on the connection screen.
- **Lead-in:** the song starts 6 beats before beat 0 so notes fall in from the top (matches the visible window).
- **Early presses:** a correct key up to 1 beat before a note is accepted and the song does not stop for it (time to press counts as 0). Further ahead it is ignored, not counted wrong.
- **Wait-mode autoplay timeline:** the plan is on the song's nominal timeline and anchored to when the song reaches beat 0. `missRate` in Wait mode means a hesitation of `hesitationMs` (the song waits for the player), because skipping a note would deadlock Wait. Hesitation delays that note and everything after, matching how the song stalls. Phase 2 can reinterpret `missRate` as a skipped note for timed modes.
- **Wrong autoplay keys** are a neighbour 1-2 semitones away, never a pitch of the target chord, pressed 100 ms before the correct key.
- **Routing:** hash routes (`#/songs`, `#/play/<id>`) so GitHub Pages needs no rewrite rules; Home arrives in Phase 3.
- **Finish:** Wait mode ends when the last note has played out its length after being hit, not at the moment it is pressed.

### Deferred

- Fade label mode (Phase 3, needs profile stats).
- Timing judge, speeds, combo, count-in, loop, metronome (Phase 2); score and accuracy in the HUD are Wait stats only for now.
- Hand picker UI (engine option exists), sheet view, phone layout (Phase 5 and 7).

## Phase 2: Scoring

### Built

- Judge (`src/engine/judge.ts`, pure): window table (Perfect 50, Great 100, Good 150 ms at Full; Practice x2, Expert x0.5), `gradeFor`, points 100/70/40, `multiplierFor` (x1 to x4, +1 per 10 consecutive hits), `starsFor` (70/85/95%), `ScoreBoard` (per-note ledger, streak, longest streak, miss log, summary), `maxScore`.
- Timed session (`src/engine/timed.ts`, `TimedSession`): Practice, Full and Expert. The clock never waits; each press is judged against the nearest unplayed note of that pitch, notes nobody plays expire as misses, speed is applied to the clock, the calibrated latency is subtracted from every hit time, optional A-B loop. Miss log entries: `{ noteId, midi, pressedMidi, measure, kind: early | late | wrong-key, offsetMs }`, ready for Results in Phase 3 (`session.summary().misses`).
- `PlaySession` interface (`src/engine/session.ts`) shared by `WaitSession` and `TimedSession`, so the Play screen, highway and autoplay drive either. Wait mode is unchanged (no timing grade) and gained the A-B loop.
- Play UI: setup panel on the ready overlay (difficulty Wait / Practice / Full / Expert, Practice speed 50-90%, metronome, count-in, A-B loop by measure, link to the latency check), HUD with Score / Streak and multiplier / Accuracy, grade pop-up (Perfect / Great / Good / Miss), missed notes in coral, end-of-song summary (score, accuracy, stars, notes hit, longest streak, grade counts). Expert starts with note names off.
- Metronome and count-in (`src/engine/metronome.ts` pure scheduling, `src/ui/audio.ts` Web Audio oscillator clicks, scheduled 120 ms ahead from the animation loop). Count-in is one bar of clicks before the first judged beat (before the loop start when looping).
- Latency check (`#/settings`, `src/ui/SettingsScreen.tsx`, `src/engine/latency.ts`): 8 clicks at 80 bpm, tap one key per click, median of (tap - click) stored per device name in localStorage, reset button. Play shows the active offset; the engine subtracts it.
- Autoplay: timed sessions run at the session speed (offset and jitter stay in real ms); `missRate` skips notes in timed modes (Wait keeps hesitation).

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 16 files, 282 tests |
| `npm run build` | exit 0 |
| `npm run test:e2e` | exit 0, 32 tests |

Unit tests: every grade boundary (inside, exactly at, just outside +/-50/100/150 for Full, +/-100/200/300 Practice, +/-25/50/75 Expert; early and late; at 100%, 70% and 50% speed through `TimedSession`), every multiplier step (9 to 10 x2, 19 to 20 x3, 29 to 30 x4, cap, reset on miss), stars thresholds, accuracy, miss log, latency subtraction, loop wrap, metronome scheduling, latency median and storage, timed autoplay plans. E2E (autoplay through the real Play screen, expected values computed from the spec in the test): offset 0 gives 26 Perfect and exactly 4800; +75 ms gives 26 Great and 3360; -125 ms gives 26 Good and 1920; +200 ms gives 26 late misses and 0; Expert +40 ms is Great; Practice 70% +90 ms is Perfect and takes the slower song time; a seeded wrong-key plus skipped-note profile matches the exact score, hits, accuracy, longest streak and stars; wrong keys alone keep 100% accuracy but cut the score; a stored 80 ms latency turns +80 ms into Perfect; count-in and metronome click counts; Wait-mode A-B loop; latency check end to end (8 taps, stored, reset) and the too-few-taps error.

### Decisions

- **Multiplier timing:** a hit scores with the multiplier earned by the streak before it, so the 11th consecutive hit is the first at x2 (x1 for hits 1-10, x2 for 11-20, x3 for 21-30, x4 from 31). `multiplierFor(streak)` is x2 at a streak of 10. A clean Mary run (26 notes) is 4800.
- **Accuracy and wrong keys:** accuracy is hits over total notes. A wrong key resets the streak and is logged, but does not remove a hit (the note stays playable). A note nobody plays, or a right key outside the Good window, is a miss.
- **Miss zone:** a right-pitch press up to 1.5x the Good window outside the note is an early/late miss that consumes the note (logged with its offset); further out it is a wrong-key. A note expires, as a "late" miss with `offsetMs: null`, 1.5x the Good window after its time.
- **Window edges are inclusive** (exactly 50 ms is Perfect). Offsets are rounded to 1e-6 ms so float error cannot push a press off an edge.
- **Windows are real milliseconds** at any speed (a 70% Practice run still has +/-100 ms Perfect).
- **Speed:** Practice only (50-90%, user picks, default 70). Full and Expert are fixed at 100% per the spec table. The prompt's human check mentioned "Full at 70%"; it is written as Practice at 70% in HUMAN_CHECKS.md.
- **Looping:** bars are assumed to start at beat 0 with no pickup (measure m starts at (m-1) x beats per bar). The loop is chosen on the setup panel before Start, not mid-song. Each pass re-judges the loop: score, hits and accuracy come from the latest result per note (the ledger), streak continues, the miss log keeps every pass.
- **Count-in default on, metronome default off**, in every mode. The count-in is the last bar of the 6-beat lead-in. Clicks come from the animation loop with a 120 ms look-ahead, so they are a few ms looser than a sample-accurate scheduler; fine for a metronome.
- **Latency storage:** localStorage key `keyfall.latency.v1`, `{ [deviceName]: offsetMs }`, device `default` when no keyboard is connected. Moves to Dexie in Phase 3. Offset = tap time minus the moment the click is heard (audio output latency added); positive means late. The offset is read when a Play screen opens, so recalibrate, then reopen the song.
- **Autoplay `missRate`:** skipped note in timed modes (never pressed), hesitation in Wait (as decided in Phase 1). Autoplay offsets and jitter are real ms at any speed.
- **Presses before Start** only start the song (Wait and timed), they are not judged.
- **Note names toggle** stays in the header only; the setup panel does not repeat it.

### Deferred

- Results screen (histogram, most-missed notes, high scores, Practice my mistakes), XP: Phase 3. The miss log and `ScoreSummary` are ready for it.
- Persisting settings (mode, speed, loop) per profile: Phase 3.
- Hand picker UI, fade labels, sheet view, phone layout: unchanged from Phase 1.
- Mid-song loop changes and pickup-bar loop alignment.
