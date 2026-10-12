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
