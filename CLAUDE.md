# Keyfall

Keyfall is a falling-notes piano game (Guitar Hero style) for a Roland FP-30X digital piano. It teaches a beginner to read and play music, and challenges an experienced player. Two players share it: the owner (beginner, can't read music yet) and his wife (advanced). It runs as a web app in Chrome on a MacBook and in the Web MIDI Browser app on an iPhone. The piano connects over Bluetooth MIDI on both.

Design reference: the "Keyfall Screens" canvas (Home, Play on Mac, Learn, Results, Play on iPhone). Match its look and layout. Overview doc: "Keyfall — Piano Game Overview".

## Ground rules

- Build in the phases below, in order. After each phase: run every check listed for it, update `PROGRESS.md` (what was built, check results, anything deferred), commit with message `Phase N: <summary>`, and push to `main`.
- Never commit secrets. Supabase URL and anon key live in `.env.local` (gitignored) and in GitHub repo variables. Never commit the Supabase service-role key or the database password anywhere.
- Never commit copyrighted music. Bundled songs are public domain only, arranged by you as MusicXML. User-imported songs live only in IndexedDB and the user's private Supabase storage bucket.
- No force pushes, no rewriting pushed history. Deploys happen through GitHub Actions on push to `main`; never push to a `gh-pages` branch.
- You can't touch the real piano. Test everything through the virtual MIDI input (see MIDI). Anything that genuinely needs a human at the piano goes in `HUMAN_CHECKS.md` with exact steps; it never blocks progress.
- The human-only setup (accounts, sign-ins, pairing) is done before the build starts and recorded in `SETUP_STATUS.md`. Don't stop to ask for anything else; make a reasonable decision, log it in `PROGRESS.md` under Decisions, and keep going.
- Use subagents for independent work (song arrangements, Learn content, test writing) when it speeds things up.

## Stack

| Concern | Choice |
| --- | --- |
| App | Vite + React 18 + TypeScript (strict) |
| Note highway | HTML canvas, requestAnimationFrame, 60 fps target |
| Keyboard input | Web MIDI API (`navigator.requestMIDIAccess`) |
| Learn flashcards | VexFlow |
| Sheet music view | OpenSheetMusicDisplay (renders MusicXML) |
| MIDI file parsing | `@tonejs/midi` |
| Metronome and click sounds | Web Audio API (no samples needed) |
| Local data | IndexedDB via Dexie (source of truth, works offline) |
| Sync and auth | Supabase (Postgres, Auth, Storage) via `@supabase/supabase-js` |
| Unit tests | Vitest |
| End-to-end tests | Playwright (Chromium) |
| Hosting | GitHub Pages via GitHub Actions, Vite `base: '/keyfall/'` |

Scripts that must exist: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`.

## Folder layout

```
src/
  midi/        Web MIDI access, device state, virtual MIDI input
  engine/      song model, clock, timing judge, scoring, streaks
  songs/       bundled MusicXML files + catalog.ts
  import/      MIDI and MusicXML import, hand split, difficulty estimate
  learn/       unit definitions, lesson generators, review queue
  storage/     Dexie schema and repositories
  sync/        Supabase client, auth, sync queue
  ui/          screens, components, theme tokens
tests/         Vitest unit tests
e2e/           Playwright tests
supabase/      migrations (SQL) and config
```

## Song model

Every song, bundled or imported, is converted to this shape. All engine code works only from it.

```ts
type Hand = 'right' | 'left';
interface SongNote {
  id: string;
  midi: number;        // 21–108
  startBeat: number;   // from song start, in quarter-note beats
  durationBeats: number;
  hand: Hand;
  finger?: 1 | 2 | 3 | 4 | 5;
  measure: number;     // 1-based bar number, used for error reports and loops
}
interface Song {
  id: string;
  title: string;
  composer: string;
  source: 'bundled' | 'imported';
  level: 1 | 2 | 3 | 4 | 5 | 'expert';
  hands: 'right' | 'left' | 'both';
  bpm: number;
  timeSignature: [number, number];
  notes: SongNote[];
  musicXml?: string;   // present for MusicXML songs; generated best-effort for MIDI imports
  unlockedBy?: string; // learn unit id, or undefined if open from the start
}
```

## MIDI

- Listen to every input. Note-on with velocity 0 counts as note-off. Handle `statechange` so connecting or disconnecting the piano mid-session updates the UI without a reload.
- Connection status chip on Home ("FP-30X connected · Bluetooth" / "No keyboard found") with a help link to the setup steps.
- Virtual MIDI input (always built, hidden in production unless `?debug=1`):
  - `window.__keyfall.press(midi, velocity = 80)` and `window.__keyfall.release(midi)` feed the same pipeline as real MIDI.
  - `window.__keyfall.autoplay(accuracyProfile)` plays the current song with chosen timing offsets and mistakes, for e2e tests.
  - A computer-keyboard piano (A W S E D F T G Y H U J K = C4 to C5) for manual testing without the piano.
- Latency calibration: Settings › Latency check plays 8 metronome clicks; the player taps one key in time; store the median offset per device. The engine subtracts it from every hit time.

## Timing and scoring

| Grade | Window (Full) | Points |
| --- | --- | --- |
| Perfect | ±50 ms | 100 |
| Great | ±100 ms | 70 |
| Good | ±150 ms | 40 |
| Miss / wrong key | outside ±150 ms or wrong pitch | 0, streak resets |

- Practice mode doubles the windows; Expert halves them. Wait mode has no timing grade: the song pauses until the correct key is pressed; score counts correct keys and time to press.
- Combo multiplier: +1 every 10 consecutive hits, from ×1 to a cap of ×4.
- Stars: 1 at 70% accuracy, 2 at 85%, 3 at 95%. Accuracy = hits / total notes.
- Log every miss: note, measure, early/late/wrong-key, and offset in ms.
- Results screen: score, accuracy, longest streak, stars, XP gained, timing histogram, most-missed notes, measures with the most misses, average early/late offset, high-score board for the song (both profiles), and buttons: Practice my mistakes (loops the worst measures in Practice mode), Retry, Songs.

## Modes and settings

- Difficulties: Wait, Practice (50–90% speed, user picks), Full (100%), Expert (100%, tight windows, labels off by default, sheet view available).
- Hands: right, left, both; the hand not being played can auto-play visually.
- Note labels: on, fade (hides labels for notes the profile has hit correctly 10 times in a row), off. Finger numbers shown with labels when the song has them.
- Views: falling notes (default), sheet music (scrolling OSMD score with a moving cursor and live note colouring), split.
- Practice tools: A–B loop by measure, metronome, 1-bar count-in, speed control.
- Phone layout: when the viewport is under 900 px wide and landscape, show only the key range the song uses (at least one octave), compact HUD, large hit targets. Portrait shows a "turn your phone sideways" prompt.

## Learn path

Units 1–5 ship in version 1; 6–10 are defined in data and marked "coming soon".

1. Keyboard map (find C by the black-key groups) — key finder
2. Middle C position, right hand C–G — key finder, note flash, mini song
3. Treble staff lines and spaces — note flash, mnemonics (Every Good Boy Does Fine, FACE)
4. Bass clef position, left hand — key finder, note flash, mini song
5. Bass staff lines and spaces — note flash, mnemonics (Good Boys Do Fine Always, All Cows Eat Grass)
6. Rhythm basics · 7. Sharps and flats · 8. Both hands · 9. Eighth notes and dotted rhythms · 10. Key signatures

Lesson types: note flash (staff note shown, press it), key finder (name shown, press it), rhythm tap (one key, in time with a pattern), mini song (4–8 bars using only taught notes). A unit passes at 90% over 20 prompts. Missed notes enter a review queue and appear more often until answered right 3 times in a row.

## Bundled songs (all public domain, arrange them yourself)

| Song | Composer | Level | Hands | Unlocked by |
| --- | --- | --- | --- | --- |
| Mary Had a Little Lamb | Traditional | 1 | Right | open |
| Twinkle Twinkle Little Star | Traditional | 1 | Right | open |
| Ode to Joy | Beethoven | 2 | Right | Unit 2 |
| Jingle Bells | Pierpont | 2 | Right | Unit 3 |
| When the Saints Go Marching In | Traditional | 3 | Both | Unit 4 |
| Minuet in G | Petzold | 4 | Both | Unit 6 |
| Greensleeves | Traditional | 4 | Both | Unit 7 |
| Für Elise (opening) | Beethoven | 5 | Both | Unit 8 |
| Canon in D | Pachelbel | 5 | Both | Unit 9 |
| Clair de Lune | Debussy | Expert | Both | open on any profile marked Advanced |

Songs locked behind units 6–9 are unlocked for Advanced profiles. Include finger numbers for levels 1–3. Validate every file loads, parses and plays to the end with the virtual autoplay.

## Song import

- Play › Import accepts `.mid`, `.midi`, `.musicxml`, `.xml`, `.mxl`.
- Hand split: by track or staff when there are two; otherwise split at middle C with an adjustable split point on the import screen.
- Difficulty estimate from notes per second, range, chord density and hand independence; user can override.
- Title and composer from file metadata, editable.
- MIDI imports get a best-effort generated MusicXML for the sheet view (quantised to 16ths), labelled "approximate".
- Stored in IndexedDB and uploaded to the user's private Supabase Storage bucket so it appears on every device.

## Profiles, auth and sync

- One household account signs in with email and password (not magic links: on the iPhone a link opens Safari, outside Web MIDI Browser). Inside it, multiple player profiles (name, colour, Beginner/Advanced, settings).
- Profile picker on launch; switch from the avatar button on Home.
- IndexedDB is the source of truth; a sync queue pushes changes to Supabase when online and pulls on launch and every 60 s while open. Last-write-wins per record, except high scores, which keep the max.
- Supabase tables (all with row-level security: `household_id = auth.uid()`): `profiles`, `scores`, `attempts` (miss logs as JSON), `learn_progress`, `imported_songs` (metadata + storage path). Storage bucket `songs`, private, same rule by path prefix.
- The app works fully signed-out and offline; sign-in only adds sync.

## Visual design

From the canvas: dark stage background, warm amber for hits and primary actions, blue for right-hand notes and Learn, green for correct, coral for misses.

| Token | Value |
| --- | --- |
| bg | #0E1116 (Play: #0B0E13) |
| surface | #1A1F2B, border #2A303B |
| text | #F2F0EA, muted #9AA3B2 |
| accent (hits, primary) | #F5A524 |
| right hand / Learn | #4DA8FF |
| left hand | #B78CFF |
| correct | #6FE3A8 |
| miss | #FF6B5A |
| Fonts | Bricolage Grotesque (display), DM Sans (body), JetBrains Mono (numbers) |

Keys at least 44 px tap targets, text contrast 4.5:1, everything readable from about a metre away on the music rest.

## Phases and acceptance checks

Every phase also requires: `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` exit 0, and `PROGRESS.md` updated.

0. **Foundation.** Scaffold, theme tokens, MIDI layer with virtual input, a connection screen with an on-screen keyboard that lights up on input. Checks: Playwright test presses notes through `__keyfall.press` and sees the right keys light up. Human check: real FP-30X lights the keys (add to `HUMAN_CHECKS.md`).
1. **Play engine.** Song model, MusicXML loader, clock, canvas note highway with lanes and labels, Wait mode, Mary and Twinkle. Checks: unit tests for the loader and clock; e2e autoplay completes Mary in Wait mode.
2. **Scoring.** Timing judge, all difficulties and speeds, combo, streak, accuracy, miss log, latency calibration, metronome, count-in, loop. Checks: unit tests for every grade boundary and multiplier step; e2e autoplay with known offsets produces the expected score.
3. **Profiles and results.** Dexie storage, profiles, Home, Results with error report and Practice my mistakes, high scores, Stats. Checks: e2e creates two profiles, plays as each, and sees both on the high-score board after a reload.
4. **Learn.** Units 1–5, all lesson types, review queue, unlocks. Checks: e2e passes Unit 1 with virtual input and Ode to Joy unlocks only after Unit 2.
5. **Sheet music and songs.** OSMD sheet view with cursor and note colouring, split view, Expert mode, all 10 bundled songs. Checks: e2e autoplays every bundled song to the end in Full mode with 100% accuracy; sheet view renders for each.
6. **Song import.** All formats, hand split, difficulty estimate, edit screen. Checks: unit tests with generated fixture files (one-track MIDI, two-track MIDI, MusicXML); e2e imports each fixture and plays it.
7. **Deploy and iPhone.** GitHub Actions workflow deploying to Pages, phone layout, portrait prompt. Checks: the Actions run succeeds and the live URL returns 200 and loads the app; Playwright run against the live URL with an iPhone-landscape viewport passes. Human check: play on the iPhone in Web MIDI Browser.
8. **Sync.** Supabase migrations applied, auth, sync queue, imported-song storage. Checks: e2e signs in with the test account, records a score in one browser context and sees it in a second fresh context; RLS test confirms a second test account can't read the first one's rows.
9. **Polish.** XP and levels, daily streak, badges, sound and animation pass, empty states, error states, accessibility pass. Checks: Lighthouse accessibility ≥ 90 on Home and Play; full e2e suite green on the live URL.

## Files you maintain

- `PROGRESS.md` — phase log, check results, Decisions section.
- `HUMAN_CHECKS.md` — things to try at the piano, with steps and what "good" looks like.
- `SETUP_STATUS.md` — written during setup; lists every credential and account step and its state. Never contains secret values.
