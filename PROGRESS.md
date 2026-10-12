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

- Latency calibration (Phase 2).

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
