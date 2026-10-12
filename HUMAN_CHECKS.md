# Human checks

## Phase 0: real FP-30X lights the keys

Needs the piano paired over Bluetooth to the MacBook (see the Connect your FP-30X steps on the screen).

1. In a terminal in the project folder run `npm run dev`.
2. Open http://localhost:5173/keyfall/ in Chrome.
3. When Chrome asks to use your MIDI devices, choose Allow.
4. Look at the chip at the top right.
   - Good: green chip reading "FP-30X connected" (with "· Bluetooth" when Chrome reports it).
   - Bad: "No keyboard found". Check the piano is on and connected in Audio MIDI Setup, then wait a few seconds; no reload should be needed.
5. Press middle C (the C just left of the two black keys near the centre of the piano).
   - Good: the C4 key on the on-screen keyboard lights amber, the label C4 appears at the top right of the keyboard strip, and the key goes back to normal when you let go.
6. Play a chord and a black key.
   - Good: each held key lights, black keys turn solid amber, all release cleanly.
7. Press the lowest and highest keys on the piano.
   - Good: the far-left and far-right keys light.
8. Turn the piano off, then on again.
   - Good: the chip changes to "No keyboard found" and back to connected without reloading the page.
9. Optional: press A, W, S, E, D on the computer keyboard.
   - Good: C4, C#4, D4, D#4, E4 light (debug piano, dev server only).
