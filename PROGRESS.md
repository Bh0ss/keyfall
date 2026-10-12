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

## Phase 3: Profiles and results

### Built

- Storage (`src/storage/`, Dexie, database `keyfall`, schema version 1): `profiles`, `scores`, `attempts`, `noteStats`, `latency`, `meta`. Every row has a stable string `id` and `updatedAt` so the Phase 8 sync queue can be added as a new table in a version 2 upgrade without touching these. Repositories are plain functions that take the db (`profiles.ts`, `scores.ts`, `attempts.ts`, `noteStats.ts`, `latency.ts`, `migrate.ts`), so Vitest runs them against `fake-indexeddb`.
  - Profiles: name (trimmed, 1-24 chars, unique case-insensitively), colour, Beginner/Advanced, per-profile settings (note labels on/fade/off, difficulty, practice speed, metronome, count-in).
  - Scores: one best per profile, song and mode; `recordScore` keeps the maximum (a lower or equal score never replaces it, in a transaction). Attempts keep the full miss log, grade counts, hit offsets, Wait figures and placeholder XP.
  - Note stats: per profile and pitch, the current consecutive-hit streak plus totals.
  - Latency: per device in Dexie. The Phase 2 localStorage key `keyfall.latency.v1` is copied across once at startup (flag in `meta`, Dexie rows win) and then removed.
- Profile picker on every launch (the choice lives in sessionStorage, so a new tab or window asks again, a reload does not). Create and edit profiles (name, six colours, level). The avatar button on Home returns to the picker.
- Screens (match the canvas): left navigation rail (Home, Learn, Play, Stats, Settings); Home (greeting, connection chip kept, avatar, Up next card, Learn card, song tiles with the profile's stars); Results (score, accuracy, longest streak, stars, +XP, Timing card with grade bars plus a 25 ms offset histogram and the early/late coaching line, Where it went wrong with most-missed notes, per-bar miss strip and summary line, Practice my mistakes, high-score board for the song across all profiles, Retry, Songs); Stats (songs played, runs, average accuracy, XP, best score per song, accuracy trend, most-missed notes). Routes: `#/` Home, `#/keyboard` the old connection screen, `#/songs`, `#/play/<id>`, `#/results/<attemptId>`, `#/stats`, `#/settings`.
- Play screen: finishing a song saves the attempt, the high score and the per-pitch stats once, then the end card shows See results, Retry and Songs. Wait mode now has a result too (see Decisions). Mode, speed, metronome, count-in and note-label mode are remembered per profile. Note names cycle On, Fade, Off.
- Label fade: a label is hidden for a pitch the profile has hit correctly 10 times in a row (any miss resets the streak). Applies to the labels and finger numbers on the falling notes.
- Practice my mistakes: opens the song in Practice mode, 70% (or the profile's practice speed), A-B loop on the densest window of at most 4 bars that holds your misses.
- Engine additions: `ScoreSummary` gained `hitNoteIds`, `missedNoteIds`, `hitOffsets`; `PlaySession.summary()` (Wait implements it); `src/engine/fade.ts`, `src/engine/results.ts` (pure aggregations).

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 20 files, 330 tests |
| `npm run build` | exit 0, JS bundle 336.84 kB |
| `npm run test:e2e` | exit 0, 41 tests, including the two-profile high-score board persisting after reload |

New unit tests: repositories (profiles, high-score max rule, note stats, latency, migration, saving a run) on fake-indexeddb, fade rule, results aggregations, practice range, Wait summary, highway label fade drawing. New e2e (`e2e/profiles.spec.ts`): two profiles play (autoplay at +0 ms and +75 ms) and both are on the high-score board after a reload, a lower score does not replace the best, Results contents and Practice my mistakes, Wait results, picker/edit/duplicate names, Home, per-profile settings, fade streaks written by a finished run.

### Decisions

- **Phase 3 owns Home and Results; the old connection screen moved to `#/keyboard`.** Home carries the connection chip; "Setup help" there opens the keyboard screen at the setup steps.
- **Learn is a placeholder.** The canvas has a Learn nav item and a "Continue · Learn" tile; both are present and disabled ("Coming soon") until Phase 4. The canvas "6-day streak" chip is left out (daily streak is Phase 9).
- **XP is a placeholder:** 4 per note hit plus 25 per star, stored on the attempt. Levels, "XP to next level" and badges are Phase 9; the Results tile says so.
- **Wait mode scoring:** a note counts when it was played without a wrong key pressed first; 100 points each; accuracy = those notes over all notes (so stars mean something); longest streak = longest run of such notes; each wrong key goes in the miss log as `wrong-key`. Results shows First try / Retried bars instead of timing grades.
- **High-score key:** profile + song + mode (Practice keeps one best across speeds and records the speed). The board lists every profile's rows, highest first. A tie keeps the earlier achiever. Looped runs never reach the board (they also never finish, because a loop repeats).
- **Fade rule is per pitch, not per note instance:** the label is the note name, so the streak is "this pitch hit correctly N times running". Notes not judged in a run (other hand, outside a loop) do not count either way. Streaks update when a run finishes, not during the run.
- **Picker on every launch** is implemented as "once per tab session" (sessionStorage). Deleting a profile is not offered (a delete would have to sync as a tombstone; Phase 8).
- **Per-profile defaults:** Beginner starts on Wait with labels on; Advanced starts on Full with labels on fade.
- **Latency stays per device, not per profile** (it describes the keyboard and Bluetooth link, not the player).
- **Autoplay waits up to 1.5 s for a song screen** that is still loading from storage, instead of rejecting at once; with no song open it still rejects ("no song is open").
- **Settings writes are fire-and-forget** to IndexedDB (the in-memory profile updates immediately); a reload within a few milliseconds of a click could lose that one change.

### Adapted tests (assertions unchanged unless noted)

- `e2e/play.spec.ts`, `e2e/scoring.spec.ts`, `e2e/connection-screen.spec.ts`: every `page.goto` became `gotoApp(page, ...)` (new `e2e/helpers.ts`), which creates a profile when the picker is in the way; the connection-screen tests open `/#/keyboard` instead of `/`.
- `e2e/scoring.spec.ts` latency check: the stored-value assertions now read IndexedDB (`readStore`) instead of localStorage (same expectations: the median is stored for `default`, the reset empties the store, a failed check stores nothing). The "calibrated latency" test additionally asserts the old localStorage key was migrated away.
- `e2e/scoring.spec.ts` metronome test: settings now persist per profile, so before the third segment it asserts count-in is still off from the earlier toggle and switches it back on; the expected 8 clicks are unchanged.
- `tests/latency.test.ts`: the localStorage get/save/clear tests moved to `tests/storage.test.ts` against Dexie (same behaviours: per device, default 0, clear one device); the file keeps `medianOffset`, `deviceKey` and tests the legacy parser.

### Deferred

- XP levels, badges, daily streak (Phase 9). Learn (Phase 4). Supabase auth and sync of profiles, scores, attempts (Phase 8; tables already carry ids and `updatedAt`).
- Hand picker UI, sheet view, phone layout (unchanged).
- A looped session never finishes, so Practice my mistakes runs are not recorded as attempts.
- Deleting a profile.

## Phase 4: Learn

### Built

- Learn logic (`src/learn/`, pure, no React or storage imports except one type): `units.ts` (ten units as data: 1 to 5 playable, 6 to 10 `comingSoon`; taught notes, finger numbers, mnemonics, lessons, mini songs, rhythm pattern), `pass.ts` (90% over 20 prompts, integer maths so 18 of 20 passes), `review.ts` (queue entry rules, 3 right in a row to leave, weights), `generate.ts` (weighted prompt picker), `run.ts` (`LearnRun` for key finder and note flash, `MiniSongRun`), `rhythm.ts` (tap judge), `staff.ts` (VexFlow key names, clef, "2nd line" wording), `unlocks.ts` (song unlock rule incl. Advanced override, unit status, next unit).
- Storage: Dexie schema version 2 adds `learnProgress` (per profile and unit: passed, passedAt, best result, attempts, finished practice lessons) and `reviewQueue` (per profile and pitch: streak, misses, active). Rows have stable string ids (`profileId:unitId`, `profileId:midi`) and `updatedAt`; cleared review notes stay as `active: false` rows so Phase 8 sync sees the change. Version 1 tables are untouched. Repository: `src/storage/learn.ts`.
- Screens (`src/ui/learn/`, code-split with `React.lazy` because VexFlow is large): Learn path column from the canvas (all ten units with state), unit detail (blurb, what it unlocks, Memory trick card, lessons, best result), lesson runner for key finder and note flash (prompt count, accuracy, streak, progress bar, cream prompt card with a VexFlow staff or a big key name, short on-screen keyboard that turns green, red or amber, "Needs review" card, Show the answer), mini song runner (whole song on a staff with finger numbers, next note highlighted), rhythm tap runner (4-click count-in, dots, tapped with the key), pass, fail and done screens. The rail Learn item and the Home Learn tile are live (tile shows the next unit).
- Units: 1 Keyboard map (key finder), 2 Middle C position (key finder, note flash, rhythm tap, mini song "Hot Cross Buns"), 3 Treble staff (note flash, mnemonics), 4 Bass clef position (key finder, note flash, mini song "Au Clair de la Lune", left hand), 5 Bass staff (note flash, mnemonics). Each has a 20-prompt unit test; passing it passes the unit. Units open in order.
- Unlocks: songs carry `unlockedBy` (a unit id). Home, the song list and a direct `#/play/<id>` link all honour it (`SongGate`); locked songs show "Pass Unit N · name to unlock".
- Catalog: Ode to Joy (Unit 2) and Jingle Bells (Unit 3) added now (see Decisions); each 16 bars, right hand, C position, finger numbers on every note.

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 24 files, 385 tests |
| `npm run build` | exit 0, main JS 381.96 kB, lazy Learn chunk 1,143.49 kB (696.97 kB gzip) |
| `npm run test:e2e` | exit 0, 49 tests (41 existing, 8 new in `e2e/learn.spec.ts`) |

New unit tests (`tests/learn-rules.test.ts`, `learn-run.test.ts`, `learn-storage.test.ts`, `learn-staff.test.ts`, plus Ode and Jingle in `musicxml.test.ts`): pass threshold (20 of 20, 18 of 20 pass; 17 of 20 and runs shorter than 20 fail), review queue (miss enters, 3 right in a row leaves, a miss mid-way resets, re-entry, weights fall as the streak builds), prompt weighting (a queued note appears more than 1.8x as often as before, a cleared one back to normal), unlock rules (open songs, unit-gated, Advanced override only for Units 6 to 9, `advanced` sentinel), unit order and next unit, generators only use taught notes (every prompt lesson of Units 1 to 5, 300 prompts each, every taught note shows up, never the same note twice in a row, earlier-unit review notes allowed, untaught ones never), `LearnRun` and `MiniSongRun` behaviour, mini songs use only taught notes and run 4 to 8 bars, rhythm judge, staff positions, Dexie repositories on fake-indexeddb.

New e2e: Learn entry points and unit states; Unit 1 passed with `__keyfall.press` answering from the target on screen (20 of 20 stored in IndexedDB); 17 of 20 fails and does not pass the unit, 18 of 20 passes; a miss writes the review queue; **Ode to Joy locked on Home, song list and direct link, still locked after Unit 1 only, unlocked after Unit 2 (Jingle Bells still locked), and the unlocked song autoplays to the end**; Advanced profile keeps Unit 2 songs locked; Unit 3 note flash draws a VexFlow staff, Unit 3 passes and unlocks Jingle Bells, Unit 4 draws a bass staff; mini song and rhythm tap play through.

### Decisions

- **Catalog entries instead of flagged stubs.** Ode to Joy and Jingle Bells are real bundled songs now (Beethoven and Pierpont, public domain, arranged by me in MusicXML with fingers), so the unlock is proven end to end including playing the song. Jingle Bells is a simplified two-section arrangement (chorus tune). Saints (Unit 4) and the Unit 6 to 9 songs stay for Phase 5; the unlock rule already covers them through `unlockedBy`.
- **Advanced override is literal:** only songs behind Units 6 to 9 open for Advanced profiles, as CLAUDE.md says; songs behind Units 2 to 4 still need those units. It is one set in `src/learn/unlocks.ts` if you want Advanced to skip those too. The sentinel `unlockedBy: 'advanced'` is supported for Clair de Lune in Phase 5.
- **Unit pass = one 20-prompt unit test** that mixes the unit's prompt kinds. Other lessons are practice (10 or 15 prompts, no pass state, keyboard labels shown). The test hides the key labels so it is a real test. Practice lessons still feed the review queue.
- **Rhythm tap is wired as an optional Unit 2 lesson** (CLAUDE.md puts rhythm in Unit 6, which is "coming soon"); without that the lesson type would have been unreachable. Taps match within 200 ms of the click as heard (output latency added); 6 of 8 counts as done. Mini songs are optional too. Optional lessons never gate a unit.
- **Review queue weighting:** a note in the pool weighs 1; queued notes add 2 x (3 minus current streak), so 7, 5, 3 then back to 1 after the third right answer. Queued notes from earlier units (already taught) can appear in later units' prompts; untaught notes never do. The same note never comes twice in a row. Review writes happen after every answer; unit progress at the end of a run.
- **Units go in order**; Unit 1 is always open. A direct link to a locked unit shows "Locked".
- **One attempt per prompt:** the first key decides. A wrong key (or Show the answer) counts as a miss and waits for Next or Enter; a right key advances after 400 ms.
- **Mini songs** are played note by note in order (no timing), shown on a staff with VexFlow; they do not use the falling-notes engine.
- **VexFlow 5** (`vexflow` dependency) in a lazy chunk (about 1.1 MB, mostly bundled music fonts), loaded only on Learn screens.
- **Debug aid:** `data-target-midi` on the prompt card (and `data-tap-times` on rhythm tap) is rendered only when the virtual input is enabled (dev or `?debug=1`).
- **Staff notes** use the clef by pitch: middle C and up treble, below bass.

### Adapted tests (assertions unchanged unless noted)

- `tests/musicxml.test.ts` "lists Mary and Twinkle...": filters the catalog to songs with no `unlockedBy` first (the catalog now also holds the two gated songs); same expectations on those two. A new test covers Ode to Joy and Jingle Bells.
- `e2e/profiles.spec.ts` Home test: the Learn tile no longer says "Coming soon" (asserts "Unit 1"), and the songs summary reads "2 of 4 unlocked" instead of "2 of 2" (the Home placeholders from Phase 3 became the real feature).

### Deferred

- Units 6 to 10 content (data and "coming soon" only). Saints and the remaining bundled songs: Phase 5.
- Learn progress sync with Supabase (rows are ready): Phase 8. XP and badges for Learn: Phase 9.
- Mid-run quitting keeps review-queue changes but loses the half-finished run (no resume).
- Black keys, accidentals and rests are not drawn by the staff helpers (not needed until Unit 7).
- `?debug=1` is needed to drive Learn from tests in a production build, as for Play.

## Phase 5: Sheet music and songs

### Built

- Sheet view (`src/ui/SheetView.tsx`, `src/ui/sheetSync.ts`): OpenSheetMusicDisplay renders the song's MusicXML as one long line of music on the dark surface (light ink). A cursor (amber bar) steps through the score with the song clock, the line scrolls so the cursor sits a quarter of the way in (eased between cursor stops), and each note turns green (#6FE3A8) when hit and coral (#FF6B5A) when missed (set on the note's SVG group, `data-tone="hit|miss"`). Drawn notes are paired with song notes by start time and pitch; a loop wrap or retry clears the colours. Measure numbers are drawn. OSMD is lazy-loaded (`React.lazy`, own chunk) like VexFlow.
- Views on Play: a Falling / Sheet / Split control in the header (`view-falling`, `view-sheet`, `view-split`). Split puts the score above the highway and keyboard. The choice is remembered per profile (`settings.view`, optional field, no schema change). Expert is unchanged from Phase 2 (tight windows, labels off by default) and has the sheet view like every mode.
- Songs: the other seven bundled songs plus the Captain's Nocturne (11 files in `src/songs/`, catalog entries with levels and unlocks as in the spec table: Saints Unit 4, Minuet Unit 6, Greensleeves Unit 7, Für Elise Unit 8, Canon Unit 9, Clair de Lune and the Nocturne `advanced`). Units 6 to 9 songs open for Advanced profiles through the existing rule. Saints has finger numbers on every note. Repeats are written out. `src/songs/NOTICE.md` records provenance and the one non-PD-licensed file.
- Home song count now reads "of 11".

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 25 files, 404 tests |
| `npm run build` | exit 0, main JS 1,335.39 kB (133.86 kB gzip), lazy SheetView chunk 1,371.17 kB (355.35 kB gzip), lazy Learn chunk 1,143.49 kB |
| `npm run test:e2e` | exit 0, 75 tests (49 existing, 26 new in `e2e/songs.spec.ts`), 6.1 min |

New unit tests (`tests/bundled-songs.test.ts`, 19 tests): the catalog lists 11 songs with the right levels, hands and unlocks; every file has sane notes (21-108, positive lengths, no same-hand same-pitch overlap, finite end); levels 1 to 3 have fingers on every note; the Minuet repeats are written out (bars 1 and 17, 33 and 49 match, 64 bars); Nocturne bar 57 hands and its 1080 scored notes; Advanced and Beginner unlock rules for the new songs; loader fixtures for triplets, two voices on one staff, and a tied chord across a bar line.

New e2e (`e2e/songs.spec.ts`): all 11 songs autoplayed to the end in Full mode at 100% accuracy (hits equal total notes, accuracy "100.0%", presses equal notes; the Clair de Lune and Nocturne runs take about 3.5 minutes each, in parallel workers); sheet view for each of the 11 (OSMD SVG present, `data-measures` equals the bars in the MusicXML, mapped notes above 20, cursor visible); hit and miss colouring (green count equals hits, coral count equals misses, fill colours are the token values) with the cursor moving; split view layout and per-profile memory across a reload; Expert (labels off, sheet view); unlock rules for the new songs (Advanced vs Beginner).

How songs were unlocked in e2e: an Advanced profile with Units 2, 3 and 4 recorded as passed (learnProgress rows written into IndexedDB, since Units 2 to 4 are not covered by the Advanced override); Units 6 to 9 songs, Clair de Lune and the Nocturne open by rule.

### Decisions

- **Sources: converted from public-domain Mutopia Project files, not written from memory.** Subagent arrangements written from memory proved unreliable (Clair de Lune came back as an invention, Minuet and Für Elise had guessed sections), so Clair de Lune (Keith OHara typesetting of E. Fromont 1905), Minuet in G (Mutopia anna-magdalena-04, Bach-Gesellschaft edition), Für Elise (Mutopia fur_Elise_WoO59, Breitkopf 1888) and Greensleeves (Mutopia GreensleevesAcc, the 3/4 accordion arrangement; its bass is oom-pah chords) were converted from the MIDI exports of those PD typesettings with a scratch script (positions on a 32nd grid, bars from the MIDI time signature, hand = track, up to two voices per hand, ties across bars, pitch spelled from the key signature). Scratch only, not in the repo. Consequences: note names and rhythms are the real piece; accidental spelling can differ from the printed score (for example Gb vs F#), tuplets are written as dotted values, ornaments and clef changes are not shown, and the left-hand staff always uses the bass clef (Clair de Lune bar 1 sits high on it).
- **Clair de Lune:** all 72 bars, 9/8, key D-flat then C-sharp minor then D-flat as in the source, tempo set to quarter = 90 (dotted quarter 60; the MIDI said 60 quarters). About 3.6 minutes.
- **Für Elise (opening):** bars 1 to 61 of the unfolded MIDI (A theme with its repeats and the first return, the F major / C major episode, the retransition and the A theme again), plus a closing bar (A4 over A2+A3). 62 bars, 3/8, tempo 72 (quarter notes, source marking), bar 1 holds the pickup after a rest. Bars 25 and 29 carry small ornaments that snapped to the 32nd grid.
- **Minuet in G:** A, A, B, B written out, 64 bars, 3/4, tempo 112.
- **Saints and Canon in D are my own arrangements** (traditional tune; the Canon is a piano reduction of the ground with eight RH variations, 33 bars, tempo 72), as the spec says. Saints: 14 bars, fingers on every note, left hand C3 to G3. The bridge melody ("Oh Lord I want to be in that number") is from memory and worth a check at the piano; the Canon variations 2 to 8 are idiomatic patterns over the real ground, not Pachelbel's exact violin lines.
- **11th song, a requested addition beyond the spec's list of ten (CLAUDE.md unchanged): Chopin, Nocturne in E minor, Op. 72 No. 1 (posth.), full, 57 bars, 4/4, tempo 66, Expert, both hands, `unlockedBy: 'advanced'` (same rule as Clair de Lune), id `chopin-nocturne-op72-1`.** Encoded by another agent from the PD Joseffy / G. Schirmer 1915 edition scan (IMSLP / Wikimedia Commons, PD) with pitches, rhythms and ornaments verified against and in places taken from the Mutopia Project typesetting by Benjamin Esham, **licensed CC BY-SA 4.0** (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=509). This one file is therefore a CC BY-SA 4.0 adaptation (attribution in the file's `<rights>` and `src/songs/NOTICE.md`; the licence applies to that file, separate from the app code). Full source notes are in `/tmp/normandy-keyfall/shared/nocturne/SOURCE.md` (scratch). Bar 57 had the final E2 on the right-hand staff as engraved; the staves were swapped so E2 is left hand and the E3-G#3-E4 chord is right hand (checked with the loader in a unit test and validated against the MusicXML DTD). The 19 grace notes are displayed in the sheet view but not scored (the loader skips them); 1080 notes are scored. Bar 17 has one engraved unison between the hands (F#4 held in the right hand, re-struck in the left).
- **Loader unchanged.** Grace notes, ties, chords and multiple voices were already handled; new unit tests cover triplets, voices and ties across bars. Bars are still assumed to start at beat 0 with no pickup, so pickups are written as rests plus the pickup notes in bar 1.
- **Sheet geometry:** single horizontal line (`renderSingleHorizontalStaffline`), zoom 1.3 in sheet view and 0.8 in split. Light ink on the dark surface so the specified green and coral read clearly.
- **Wait-mode and loop** drive the sheet through the same session (`beatAt`, `isHit`, `isMissed`).
- **Song data is bundled in the main chunk** (about 1 MB of MusicXML as text), so the main JS grew from 382 kB to 1.3 MB (134 kB gzip).

### Adapted tests (assertions unchanged unless noted)

- `e2e/profiles.spec.ts` Home test and `e2e/learn.spec.ts` "Ode to Joy unlocks only after Unit 2": the song count text changed from "2 of 4 unlocked" / "3 of 4 unlocked" to "of 11" because the catalog has 11 songs now; same expectations otherwise.
- Note: when the whole e2e suite ran under load, up to four Learn tests (which answer 20 prompts in a row) timed out; the same tests also fail on the Phase 4 commit in that situation (checked with the work stashed), and each passes when run alone. The final full run passed all 75.

### Deferred

- Sheet view colours only the first note of a tied chain (continuations have no partner) and does not light wrong-key presses.
- Pitch spelling, clefs and ornaments of the converted songs follow the MIDI, not the printed score (see Decisions). Fingers only for levels 1 to 3.
- Lazy-loading the song data to shrink the main chunk.
- The Nocturne's CC BY-SA 4.0 status: keep with attribution (as ruled), or re-derive from the scan alone.

## Phase 6: Song import

### Built

- Import pipeline (`src/import/`), all pure and unit-tested on generated fixtures:
  - `limits.ts` (caps, accepted extensions, `ImportError` for messages fit for the player), `analyse.ts` (file to `ImportAnalysis`: MIDI via `@tonejs/midi`, MusicXML via the existing loader, `.mxl` via `mxl.ts`), `zip.ts` and `mxl.ts` (own small zip reader), `split.ts` (hands), `quantise.ts` (16th grid), `toMusicXml.ts` (generated MusicXML for MIDI), `difficulty.ts` (estimate), `build.ts` (analysis plus the player's choices to a `Song`), `save.ts` (store and update).
  - Hand split: with exactly two tracks (MIDI, empty and percussion tracks ignored) or two staves/parts (MusicXML), split by track or staff, the higher-pitched track is the right hand whatever the order. Otherwise, or by choice, split at a note: at or above is right hand, below is left; default middle C (60), adjustable 21 to 108.
  - Difficulty: blend of notes per second (35%), range (35%), chord density (10%) and hand independence (20%), cut into Level 1 to 5 and Expert. The player can override it or go back to the estimate.
  - Title and composer come from the file (MIDI header name, "Composer:" meta text, MusicXML work-title/creator); a generic MIDI name ("Track 1", "Piano") falls back to the file name. Both are editable on the import and edit screens.
  - MIDI imports: notes are snapped to the 16th grid (the falling notes and the sheet agree), a same-pitch note is cut when struck again, and a MusicXML is generated (grand staff, C major, sharps, up to four voices per hand, ties over bar lines). The sheet view labels it "Approximate score" (`sheet-approximate`). MusicXML imports keep their own score and note timing.
- Storage: Dexie version 3 adds `songs` (`ImportedSongRecord`: `id` = `imp-` + uuid, `updatedAt`, the built `Song`, `format`, `fileName`, `approximate`, split settings, `levelOverridden`, `source` = the original file bytes, `createdAt`, optional `deletedAt`). The original bytes are kept so the split can be changed later and Phase 8 can upload the file as is to the private `songs` bucket; no Supabase code was added. `src/songs/library.ts` mirrors the table in memory so screens can look songs up synchronously (`getAllSongs`, `findSong`, `findPlayableSong`, `useLibrary`); `App` loads it before the app renders.
- UI (`src/ui/ImportScreen.tsx`, routes `#/import` and `#/import/<songId>`): Songs gets an "Import a song" button; the import screen has the file input, the form (title, composer, hands, split point as slider plus number plus note name plus "Middle C" reset, live hand counts, difficulty with estimate, facts, approximate note) and "Add to my songs". Imported songs show "Imported" and an Edit button in the list; the edit screen re-reads the stored file, can change everything, and removes a song (soft delete, scores stay in Stats). Imports appear on Home and Songs for every profile, are open (no unlock), play in every mode and view, and are scored, saved and shown in Results and Stats like any song. The screen is lazy-loaded (own 53 kB chunk), so the main chunk is 1,330 kB, slightly under Phase 5.
- Untrusted input: 10 MB file cap, 30 MB inflated cap for `.mxl` (declared sizes checked first, then the real output is counted as it streams, so an archive that lies is cut off), 60,000 note cap, 15,000 beat cap, every parse in try/catch with a friendly message, XML with `<!ENTITY` declarations refused, control characters stripped from titles, no network request is made for a file (an e2e test records requests), nothing is evaluated.

### Checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 27 files, 446 tests (404 before, 42 new in `tests/import.test.ts` and `tests/import-sheet.test.ts`) |
| `npm run build` | exit 0, main JS 1,330.04 kB (132.71 kB gzip), ImportScreen chunk 53.12 kB, SheetView chunk 1,371.38 kB, Learn chunk 1,143.54 kB |
| `npm run test:e2e` | exit 0, 92 tests passed (75 existing, 17 new in `e2e/import.spec.ts`), 6.3 min, no retries, no flaky tests |

New unit tests: format detection; one-track MIDI (metadata, middle C split, adjustable split point at 65, 21, 108 and 44, snapping to 16ths and bar numbers, ids, generated MusicXML parses back to identical notes); two-track MIDI (bass track first still becomes the left hand, pitch split as an alternative, empty and percussion tracks ignored, three tracks fall back to pitch); MusicXML (two staves by staff and the file's own sheet kept, one staff by pitch, title from the file name, UTF-16); `.mxl` (container.xml rootfile, no container, stored entries, no score, damaged, not a zip, zip bomb that lies about its size and one that admits it); refusals (wrong type, empty, oversize, garbage MIDI and XML, not MusicXML, `score-timewise`, no notes, entity declarations, too many notes, notes outside the keys, control characters); metadata and edits; 3/4 bar numbering; difficulty (every bundled song within one level of its spec level, Mary is Level 1, Clair de Lune is Expert, monotonic in speed, range, chords and independence, override); quantiser rules; generated MusicXML round trips (odd lengths, ties over bars, chords, rests, overlapping notes in voices, 3/4, 6/8, empty); storage and library (save, reload, edit keeps the id, soft delete). The fixtures are generated in `tests/fixtures/generate.ts` (an original four-bar arrangement of the traditional tune "Frere Jacques" as one-track MIDI with human-style timing wobble, two-track MIDI, two-staff MusicXML, one-staff MusicXML, and `.mxl`; also a zip writer and a zip-bomb builder).

New e2e (`e2e/import.spec.ts`, all through the real file input): each of the five fixtures is imported, saved, found in the song list as "Imported", and autoplayed to the end in Full mode at 100% accuracy (hits equal the note count); the sheet view of the MIDI import renders four bars, maps all 16 notes and shows the "Approximate" label, the MusicXML import shows no label; split controls (middle C default, 65 and 21 change the hand counts, Middle C resets, two-track defaults to track split, pitch option); title, composer and level editing with the estimate and "Use estimate", the stored row has `id`, `updatedAt`, `levelOverridden`; another profile sees, plays and scores an import, it survives a reload, Results, Stats and Home name it; edit keeps the song and its scores, remove hides it while Stats still names it; bad files (garbage MIDI, 11 MB file, a 40 MB zip bomb, a PDF, an HTML file named .xml) get friendly messages and the screen keeps working; the input accepts only the five types; no external network request.

### Decisions

- **`.mxl` unzip: own 100-line reader plus the browser's `DecompressionStream('deflate-raw')`, no dependency.** `.mxl` is a plain zip with deflate or stored entries; a zip library would add 50 to 100 kB for that, and its default unzip would inflate the whole archive before any size check. Reading the central directory ourselves lets us cap the declared size, then count real output while streaming. `DecompressionStream` exists in Chrome 80+ and Safari 16.4+ (Web MIDI Browser on iPhone is WebKit-based); without it the error says to export as `.musicxml`. ZIP64 and encrypted archives are not supported (friendly error).
- **Limits:** file 10 MB, inflated 30 MB, 60,000 notes, 15,000 beats. A large orchestral score above that gets a message, not a hang. The XML reader is the regex reader from Phase 1; the 30 MB cap bounds its worst case.
- **Hand rules:** two tracks (not counting empty or percussion ones) or two staves/parts select the track/staff split, everything else the pitch split. The higher track by mean pitch is the right hand. A MusicXML with three or more parts follows the Phase 1 loader (part 1 right hand, the rest left hand) and is offered as a staff split; the pitch split is always available.
- **Split point semantics:** notes at or above the split point are right hand, so the default 60 puts middle C in the right hand.
- **MIDI timing is quantised in the Song itself, not just in the sheet** (to 0.25 beat). The sheet view pairs drawn notes with song notes by start and pitch, so the two must agree; the cost is that swing or triplet MIDI is straightened. MIDI tempo changes are not followed (the first tempo is used for the whole song; note positions stay right in beats). A MIDI time signature whose bar is not a whole number of sixteenths (such as 7/32) is written as 4/4.
- **Generated sheet limits ("approximate"):** sharps only, key signature C, no beaming, no tuplets (they become 16ths), at most four voices per hand (a note that cannot fit is left out of the sheet but still played), and a grand staff with the right hand on the treble and the left on the bass clef whatever the pitch.
- **Difficulty estimate calibration:** weights and cut points were fitted loosely to the 11 bundled songs (each lands within one level of its spec level; Greensleeves, Für Elise, Canon and the Nocturne are off by one). It is an estimate; the player overrides it and the override sticks.
- **Imported songs are open to everyone** (`unlockedBy` unset), including Beginner profiles, and are shared by all profiles on the device. The song id is `imp-<uuid>`, stable across edits, so scores survive an edit. Removing is a soft delete (`deletedAt`) so Phase 8 sync can carry it; old scores and Stats still show the title.
- **Original file kept in the record** (up to 10 MB per song in IndexedDB) for re-splitting and for the Phase 8 upload.
- **Learn e2e flake, root cause and fix (see the next section).**

### Flaky Learn e2e tests: root cause and fix

- **Cause:** not timing, not a lazy chunk, not worker contention. The Learn specs did not stub Web MIDI (unlike the Play, Scoring, Profiles and Songs specs), so Chromium handed every test page the real, paired FP-30X. Notes played on the real piano reached the Learn prompts of whichever tests were running. A page-side log of raw MIDI messages showed the piano sending note-on/note-off every second or so during the run, and the stuck screens (which failed with "That was E2. It's B4." and similar at random prompts, while the test waited for the next prompt in `asking` state) were a stray note answering a prompt wrong, after which the unit waits for Next. It only looked like load: a full run is long enough for the piano to be played at some point, and a single short run often is not. It also explains why the failures reproduce at the Phase 4 commit.
- **Fix:** `isolateMidi(page)` in `e2e/helpers.ts` (the same empty `requestMIDIAccess` stub the other specs inline), called from a `beforeEach` in `e2e/learn.spec.ts` and `e2e/import.spec.ts`. No assertion changed, nothing skipped. Verified: `learn.spec.ts` with `--repeat-each=3 --workers=8` (24 runs) passed, and the full suite passed with the piano still sending notes.
- **Earlier failing run for the record:** the first full run in this phase failed the same four Learn tests (2.0 min timeouts each) before the fix and passed 88 of 92.

### Adapted tests (assertions unchanged)

- `e2e/learn.spec.ts`: added the MIDI isolation `beforeEach` described above and the `isolateMidi` import; no expectation changed.
- `tsconfig.json`: added `node` to `types` (and `@types/node` as a dev dependency) so the e2e files can use `Buffer` and the fixture generator can use `node:zlib`; no source file changed behaviour.

### Deferred

- Phase 8: upload of the stored file and the song row to the private `songs` bucket and the `imported_songs` table (the record already has `id`, `updatedAt`, `deletedAt`, `source`).
- Following MIDI tempo changes, tuplets and triplets in the quantiser, key signature detection and flat spelling in the generated sheet.
- Drag-and-drop onto the import screen; importing several files at once.
- Preview of the split on the keyboard (hand counts are shown, not a picture).
- Hand picks per measure (pieces where the hands cross a lot need a split point per passage).
