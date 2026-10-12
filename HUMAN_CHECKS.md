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

## Phase 4: Learn on the FP-30X

Needs the piano connected (Phase 0 check passing). Use a Beginner profile you have not used for Learn yet (a new profile starts at Unit 1).

1. Open http://localhost:5173/keyfall/ and pick the profile. On Home, the Learn tile reads "Unit 1 · Keyboard map". Click Continue.
   - Good: the Learn path lists ten units; 1 is open, 2 to 5 say Locked, 6 to 10 say Coming soon.
2. Unit 1: click Start on "Find the key". A key name (like E4) appears with a hint about the black keys. Press that white key on the piano.
   - Good: the key on screen turns green, "Correct" shows, and the next key name appears after a moment. A wrong key turns red, shows the right one, and waits for Next.
3. Click "Take the test" and answer 20 prompts. Keyboard labels are hidden here.
   - Good: 18 or more right shows "Unit 1 passed"; 17 or fewer shows "Not quite yet" and the unit stays open. Missed notes appear under "Needs review" and come up more often.
4. Unit 2: put your right thumb on middle C (finger 1) and fingers 2 to 5 on D to G. Do "Find the key" (the finger number is shown) and "Note flash" (a note on the staff).
   - Good: the staff note matches the key you press; the on-screen keyboard marks it.
5. Unit 2 optional lessons: "Rhythm tap" (4 clicks count you in, then tap middle C on each dot) and "Mini song: Hot Cross Buns" (press the notes in order, finger numbers under each note).
   - Good: rhythm tap says how many taps landed on the beat (it allows 200 ms); the mini song only advances on the right key and counts wrong keys.
6. Take the Unit 2 test and pass it.
   - Good: the result says "Unlocked: Ode to Joy". Open Play, Pick a song: Ode to Joy is playable. Jingle Bells still says "Pass Unit 3 · Treble staff to unlock".
7. Unit 3 (treble staff) and Unit 5 (bass staff): do the note flash, read the Memory trick card, then the unit test.
   - Good: treble notes sit on the right line or space; after Unit 3 Jingle Bells unlocks.
8. Unit 4 (bass clef position): put your left little finger on the C below middle C (finger 5 on C, thumb on G). Do Find the key, Note flash and the mini song "Au Clair de la Lune".
   - Good: bass staff notes match the keys; the mini song plays with the left hand.
9. Switch to an Advanced profile (avatar button on Home).
   - Good: Learn still starts at Unit 1; songs behind Units 2 to 4 stay locked until those units are passed (only songs behind Units 6 to 9 open for Advanced profiles, and none of those are bundled yet).

## Phase 5: Sheet music, split view, Expert and the new songs

Needs the piano connected. Use an Advanced profile (Clair de Lune and the Nocturne are open to Advanced profiles; Units 6 to 9 songs too).

1. Open a song you know (Ode to Joy or Minuet in G), choose Start, and click Sheet in the top bar.
   - Good: the score fills the screen, an amber cursor bar moves along with the song and the staff scrolls so the cursor stays about a quarter of the way in from the left. The notes under the cursor are readable from the music rest (about a metre away) and the bar numbers are visible.
2. Play the song on the piano from the sheet. Hit most notes, miss a few on purpose.
   - Good: notes you hit turn green as you play them; notes you miss or skip turn coral just after the cursor passes. The cursor does not drift from the notes you hear over a whole song.
3. Click Split.
   - Good: the score is on top and the falling notes and keyboard below; both stay in time. Reload the page: Split is remembered for your profile.
4. Choose Expert, then Start, with Sheet or Split.
   - Good: note names are off by default, the timing windows feel tighter than Full (about half), and the score is still readable.
5. Clair de Lune and the Nocturne, as the sheet-view test for the Captain's wife. Open each on her Advanced profile, Full or Expert, in Sheet view.
   - Good: she can read the score from the screen at the piano and play along without the falling notes; the cursor moves at a musical pace (Clair de Lune is set at a dotted quarter of 60, the Nocturne at a quarter of 66); the dense passages (the arpeggios in Clair de Lune, the runs and tuplets in the Nocturne) are legible. Note anything that looks wrong against her printed copy: accidental spelling can differ in Clair de Lune, Für Elise, Minuet and Greensleeves, which were converted from MIDI.
6. Saints (Unit 4, Beginner profile): play the bridge ("Oh Lord I want to be in that number") and the ending.
   - Good: the tune is the one you know; tell me if the bridge notes are wrong.
7. Für Elise, Minuet in G, Greensleeves and Canon in D on the Advanced profile.
   - Good: each plays through to the end; the tune is recognisable and the tempo is comfortable (Für Elise 72, Minuet 112, Greensleeves 96, Canon 72 quarter notes a minute); tell me which need a different tempo.

## Phase 6: Song import

Needs the piano connected and a MusicXML or MIDI file of a piece you own (for example one bought as MusicXML from a sheet-music shop, or exported from MuseScore). Keep the file out of the repository.

1. Open Play, choose "Import a song", and choose your MusicXML file (try `.musicxml`, `.xml` and `.mxl` if you have them).
   - Good: title and composer are filled in from the file; hand counts show a sensible right/left split (two staves are split by staff); the difficulty estimate looks fair for the piece, and you can change it. "Add to my songs" puts it in the song list with an "Imported" tag.
2. Play it in Wait mode on the piano, then in Full mode. Open the Sheet view.
   - Good: the notes fall in the right lanes with the right hand blue and the left hand purple; the sheet is your file's own score (no "Approximate" label) and the cursor follows the music.
3. Import a MIDI file (a one-track piano file if you have one). On the import screen move the split point until the left hand takes the bass notes (try the "Middle C" button first, then adjust). Save it, then play it.
   - Good: the hand counts change as you move the split; after saving, the left-hand notes are purple and the right-hand notes blue; notes you hold or repeat do not stick or double up. Open Sheet: it carries the label "Approximate score, generated from MIDI" and reads like a rough copy of the music.
4. Choose Edit on the imported song, fix the split point, change the title, save, and play it again.
   - Good: the new hands apply, the song keeps its earlier scores, and a second profile (switch with the avatar button) sees and can play the same imported song.
5. Try a bad file (a PDF renamed to `.mid`, or a very large file).
   - Good: a short, plain message appears and nothing breaks.
