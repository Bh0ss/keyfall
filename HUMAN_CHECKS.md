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

## Phase 1: play Mary in Wait mode on the FP-30X

Needs the piano connected (Phase 0 check passing).

1. Run `npm run dev` and open http://localhost:5173/keyfall/ in Chrome.
2. Click "Play a song", then Play on "Mary Had a Little Lamb".
3. Click Start (or just press any key on the piano).
   - Good: blue notes fall toward the amber line, each labelled with its note name and a finger number, and sit above the matching key on the keyboard strip.
4. When the first note (E) reaches the line, leave it alone for a few seconds.
   - Good: the song stops, the header says "Waiting for E4", the E key is tinted with finger 3 on it.
5. Press a wrong key.
   - Good: nothing moves; "Wrong keys" goes to 1.
6. Press the E key on the piano.
   - Good: the note flashes amber, the song continues, "Correct" goes to 1/26 and "Avg press time" shows how long you took.
7. Play the whole song, following the finger numbers (right hand, fingers 3 2 1 2 3 3 3 ...).
   - Good: it stops at every note, never runs ahead of you; playing a key slightly before the note arrives still counts.
8. Try the Pause button and Note names toggle mid-song.
   - Good: pause freezes the notes (a pending wait comes back after Resume); labels vanish and return.
9. At the end: "Song complete" shows 26 of 26 notes. Retry starts over. Also try Twinkle Twinkle Little Star.
   - Check the fingering feels playable (pinky on G and A); tell me if it should change.
10. Judge the motion: notes should fall smoothly, no stutter, no visible lag between a key press and the key lighting.
