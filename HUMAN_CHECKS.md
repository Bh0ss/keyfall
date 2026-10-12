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

## Phase 2: scoring, latency check, metronome, count-in, loop on the FP-30X

Needs the piano connected. Run `npm run dev` and open http://localhost:5173/keyfall/ in Chrome.

### Latency check

1. Open Songs, then Settings (or go to http://localhost:5173/keyfall/#/settings).
2. Click "Start latency check". Eight clicks play, one every 0.75 s after a short pause.
3. Tap one piano key right on each click (use the same key).
   - Good: the counter climbs 1/8 to 8/8, then "Your offset is +NN ms (8 taps matched). Saved for this device." Bluetooth MIDI usually lands somewhere around +10 to +60 ms. Repeat twice; the results should be within about 15 ms of each other.
   - Bad: "Not enough taps matched" means you missed several clicks; try again.
4. Leave the page and open a song in Full: the setup panel shows "Latency offset: +NN ms".

### Full mode scoring

1. Play, Mary Had a Little Lamb, pick Full, press Start (or any key). One bar of count-in clicks, then the notes fall.
2. Play it slightly early or late on purpose and then cleanly.
   - Good: a grade pops up for each note (Perfect, Great, Good or Miss), the combo multiplier steps up every 10 hits (x2 after 10 in a row, up to x4), a wrong key or missed note drops it back to x1, missed notes turn coral.
   - Good: at the end the summary shows score, accuracy, stars (70 / 85 / 95%), notes hit and longest streak. A clean run is 4800.
3. After the latency check, notes you feel are exactly on time should read Perfect. If everything reads early or late, run the latency check again.

### Practice at 70% speed

1. Choose Practice, then 70%, Start.
   - Good: the song runs noticeably slower, timing windows feel roomy (Perfect is +/-100 ms), the header says "Practice 70%".
2. Try Expert: windows are tight (Perfect +/-25 ms) and note names start off.

### Metronome, count-in and loop

1. In the setup panel turn Metronome on, keep Count-in on, press Start.
   - Good: four count-in clicks (higher pitch on the first), then a click on every beat, matching the notes' pulse.
2. Turn Count-in off and Metronome off: silent start.
3. Turn A-B loop on, pick bars 1 to 2, Start (Wait or Practice).
   - Good: only those two bars are playable (the rest is dimmed), the passage repeats after the last note, with a bar of count-in clicks if Count-in is on. The score restarts for the loop each pass.
4. Wait mode still holds the song at every note, with no timing grade.

## Phase 3: two profiles, Results and Practice my mistakes on the FP-30X

Needs the piano connected. Run `npm run dev` and open http://localhost:5173/keyfall/ in Chrome.

1. The first time, the screen says "Welcome to Keyfall". Create a profile: type a name, pick a colour, choose Beginner, press Create profile.
   - Good: Home opens with "Ready to play, <name>?", the green piano chip, and an "Up next" card.
2. Press the round avatar button at the top right, then New profile. Create the second player as Advanced.
   - Good: the picker shows both players; choosing one returns to Home with that name.
3. As the first player, open Mary Had a Little Lamb, choose Full, press Start and play it on the piano, making a few deliberate mistakes (a wrong key, a note left out, a couple played late).
   - Good: when it ends, "See results" appears. Press it.
4. On Results look for:
   - Score, accuracy ("N of 26 notes"), longest streak, stars and "+N XP".
   - Timing: Perfect / Great / Good / Miss bars, a small early-to-late histogram, and a line saying whether you tend to play early or late (it should match how you felt).
   - Where it went wrong: the notes you missed most, the bar strip with red bars where the mistakes were, and the sentence under it.
   - High scores: your score listed (marked as a new personal best).
5. Press Practice my mistakes.
   - Good: Practice mode, 70%, "A-B loop" on, and the bars shown are where you made mistakes (at most 4 bars). Start it and the passage repeats.
6. Switch to the second player (avatar button), play the same song in Full, then open their Results.
   - Good: the high-score board shows both players, highest score first, each with their mode and stars.
7. Close the browser tab, open the page again.
   - Good: the picker appears (it asks every launch), and after choosing a player the Results/Stats/Home still show the earlier scores (they are saved on this computer).
8. Open Stats from the left rail.
   - Good: songs played, runs finished, average accuracy, best score per song and the accuracy trend match what you played.
9. Note labels: on the Play screen press "Note names" until it reads "Fade". Play Mary in Wait mode cleanly a few times (about 10 clean hits of each note in a row).
   - Good: labels on notes you have mastered disappear first; a mistake on a note brings its label back.
10. Run the latency check once (Settings in the left rail), then reload the page.
   - Good: the saved offset is still there (it is now stored in the browser database rather than the old setting).
