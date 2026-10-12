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
- `autoplay` is Phase 1+ and is not implemented.

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

- `__keyfall.autoplay` (Phase 1+).
- Latency calibration (Phase 2).
