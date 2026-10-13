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
   - Good: the Learn path lists eleven units; 1 is open, 2 to 11 say Locked.
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
   - Good: Learn still starts at Unit 1; songs behind Units 2 to 4 stay locked until those units are passed (only songs behind Units 6 to 8 and Unit 10 open for Advanced profiles, and none of those are bundled yet).

## Phase 5: Sheet music, split view, Expert and the new songs

Needs the piano connected. Use an Advanced profile (Clair de Lune and the Nocturne are open to Advanced profiles; the songs behind Units 6 to 8 and Unit 10 too).

1. Open a song you know (Ode to Joy or Minuet in G), choose Start, and click Sheet in the top bar.
   - Good: the score fills the screen, an amber cursor bar moves along with the song and the staff scrolls so the cursor stays about a quarter of the way in from the left. The notes under the cursor are readable from the music rest (about a metre away) and the bar numbers are visible.
2. Play the song on the piano from the sheet. Hit most notes, miss a few on purpose.
   - Good: notes you hit turn green as you play them; notes you miss or skip turn coral just after the cursor passes. The cursor does not drift from the notes you hear over a whole song.
3. Click Split.
   - Good: the score is on top and the falling notes and keyboard below; both stay in time. Reload the page: Split is remembered for your profile.
4. Choose Expert, then Start, with Sheet or Split.
   - Good: note names are off by default, the timing windows feel tighter than Full (about half), and the score is still readable.
5. Clair de Lune and the Nocturne, as the sheet-view test for an advanced player. Open each on an Advanced profile, Full or Expert, in Sheet view.
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

## Phase 7: iPhone in Web MIDI Browser

Needs the iPhone with the Web MIDI Browser app and the FP-30X. The Pages URL is https://bh0ss.github.io/keyfall/ (the Actions run for the latest push must be green first).

1. Disconnect the piano from the Mac (turn Bluetooth MIDI off in the Mac's Audio MIDI Setup, or quit the Mac browser) so the phone can take it. Open Web MIDI Browser on the iPhone and connect the FP-30X inside the app (its Bluetooth MIDI device list), not in iOS Settings.
   - Good: the app lists the FP-30X as connected.
2. In Web MIDI Browser, open https://bh0ss.github.io/keyfall/ and allow MIDI access when asked. Bookmark the page in the app.
   - Good: Home loads, the chip reads "FP-30X connected · Bluetooth", and the bottom tab bar (Home, Learn, Play, Stats, Settings) works in portrait.
3. Open a song in portrait.
   - Good: a full-screen "Turn your phone sideways" prompt appears instead of the highway.
4. Turn the phone to landscape on the music rest and play Mary Had a Little Lamb in Wait mode.
   - Good: only about one octave of keys is shown and they line up with the piano; the header is slim; the notes and your key presses light up with no visible lag; the Start, Pause and result buttons are easy to hit with a thumb; nothing is hidden under the notch or the home bar.
5. Finish a song and open Results, then go back and open Learn and Stats in landscape.
   - Good: every screen scrolls and nothing is cut off. If notes feel late, run Settings, Latency check once on the phone (offsets are stored per device).

## Extra songs: try the 18 added songs

Needs the piano and the dev server or the Pages site. Units 1 to 5 must be passed (or use the Learn test) to unlock the Unit 5 songs; Arabesque and The Entertainer need Unit 10 (open on Advanced profiles).

1. Open Songs and play each one in Wait mode, then once in Full mode. Look for wrong-sounding notes, odd note lengths, and hand or finger numbers that make no sense.
   - Level 1 (open): Row, Row, Row Your Boat; London Bridge Is Falling Down; Frere Jacques; Yankee Doodle; Oh! Susanna; Happy Birthday to You.
   - Level 2 (open): Amazing Grace; Brahms' Lullaby; Auld Lang Syne; Scarborough Fair.
   - Level 4 (Unit 5): Musette in D (Bach); Old French Song (Tchaikovsky); Melody and The Happy Farmer (Schumann); Prelude in C (Bach); Sonatina in C, Op. 36 No. 1 (Clementi).
   - Level 5 (Unit 10): Arabesque (Burgmueller); The Entertainer (Joplin).
2. Folk tunes that were arranged from memory or a rough reference. Play along and compare with a recording, and note anything that sounds off:
   - London Bridge, bars 7 and 8: the rhythm (D G half notes, then E C half notes) is a reading of "My fair lady".
   - Amazing Grace, bar 2: A eighth, G sixteenth, F sixteenth on "grace". The usual hymn may have a single note.
   - Auld Lang Syne, bar 2: a B3 neighbour note that the common 4/4 version does not have.
   - Scarborough Fair: the rhythm (the reference was rubato), and whether A natural minor (F natural) is acceptable or the tune should be Dorian (F sharp).
3. The classical pieces have no finger numbers. Check that the Schumann pieces' left hand and the Arabesque and Sonatina runs are playable at the set tempos, and that the sheet view looks right (the Sonatina is in cut time; it may show 4/4).

## Phase 8: sign in and sync between the Mac and the iPhone

Needs the household account (<household email> and its password), the Mac, and the iPhone in Web MIDI Browser. Use the Pages site on both (https://bh0ss.github.io/keyfall/) once the Actions run for the Phase 8 push is green.

1. On the Mac, open Settings. Under Account, enter the household email and password and press Sign in.
   - Good: the card changes to "Signed in as ..." and the status reads "Synced" within a few seconds. The Home screen shows a green "Synced" chip beside the keyboard chip.
2. Play Mary Had a Little Lamb in Full mode to the end on the Mac with your profile.
   - Good: Results shows your score. Within about 3 seconds the Account status shows a fresh "Synced" time.
3. On the iPhone, open the site in Web MIDI Browser. On the profile picker, use Sync across devices to sign in with the same account (or Settings if you already have a profile there).
   - Good: your profiles appear on the picker without creating them again. Open your profile, then Stats and the Mary song list.
   - Good: Stats and the Mary high-score board show the score from the Mac.
4. Import a small .mid or .musicxml on the iPhone (Play, Import). On the Mac, wait up to a minute (or press Sync now in Settings), then open Songs.
   - Good: the imported song appears on the Mac and plays. Remove it on the Mac; after the next sync it disappears from the iPhone too.
5. Play the same song on the iPhone with a lower score than the Mac's.
   - Good: the high score on both devices stays at the higher one.
6. Turn the iPhone offline (airplane mode), play a song, turn it back on.
   - Good: the game works offline; once online again the new run reaches the Mac within a minute.
7. Sign out on the iPhone (Settings, Sign out).
   - Good: the game still works and keeps all local data; the chip reads "Not syncing".

## Learn Units 6 to 10 on the FP-30X

Needs the piano connected. Use a Beginner profile that has passed Units 1 to 5 (or pass them first). Each unit opens when the one before it is passed. The path order is 8 Both hands, 9 Moving around the keyboard, 10 Eighth notes, 11 Key signatures; this section covers 6 to 8, 10 and 11 (Unit 9 has its own check under "v1.1: Learn content").

1. Unit 6 (Rhythm basics): open "Read the rhythm". A quarter, half or whole note or rest is drawn; click the button for its name or its beat count.
   - Good: a wrong button turns red, shows the answer and waits for Next; the symbol shows under "Needs review" until you get it right 3 times in a row.
2. Unit 6, "Rhythm tap: quarters and halves", then "rests and a whole note". Put your right hand on middle C. Four clicks count you in, then the metronome clicks every beat; tap C only where a note starts (the staff shows the pattern).
   - Good: a half note is one tap for two clicks; on a rest you stay silent; the card says how many taps landed on the beat (the window is 200 ms). A tap on a rest counts as an extra tap. Tell me if the taps feel early or late against the clicks (the piano's Bluetooth delay shows up here; run the latency check in Settings first).
3. Unit 6, "Mini song: Rest Stop". Play it with your right hand, fingers as shown.
   - Good: the rests are skipped by the screen; the notes only advance on the right key. Take the unit test.
   - Good: 18 of 20 passes and "Unlocked: Minuet in G" shows; Minuet in G is playable on Play.
4. Unit 7 (Sharps and flats): "Find the black key" shows names like F♯4 or G♭4 and a hint (sharp is the black key to the right, flat to the left). Press the black key. "Note flash" draws the note with a ♯ or ♭ sign.
   - Good: the key you press matches the staff sign; the feedback names the key both ways (F♯ also G♭). Play "Mini song: Black Key Lullaby" (black keys only, fingers 2 and 3, then 2, 3 and 4). Take the test.
   - Good: "Unlocked: Greensleeves".
5. Unit 8 (Both hands): "Grand staff note flash" shows a note on either staff. "Both hands together" shows one note in the bass staff and one or two in the treble staff; press them at the same time (left hand and right hand).
   - Good: pressing one key waits; the screen only judges when all keys are down within about a half second; a wrong key turns red and shows the set. Pressing the keys one after the other with a release in between does not count.
   - Good: "Mini song: Hands Together" asks for left and right keys together on steps with two notes, and one hand on the others. Take the test: "Unlocked: Für Elise (opening)".
6. Unit 10 (Eighth notes and dotted rhythms; pass Unit 9, Moving around the keyboard, first): "Read the rhythm", then the two tap lessons (eighth pairs, dotted quarters). Tap C on each note; the metronome plays every beat (60 a minute).
   - Good: two taps in one click for a pair of eighths, one long tap for a dotted quarter then an eighth that lands halfway through the next click; the card reports the taps on the beat. Tell me if 60 a minute feels too fast or slow for the eighths.
   - Good: "Mini song: Row, Row, Row Your Boat" plays note by note. Test: "Unlocked: Canon in D".
7. Unit 11 (Key signatures): "Name the key" shows only a key signature; pick the major key. "Play it in the key" shows a signature and a white-key note on the staff; press the key that note really is (for example F in G major is F♯).
   - Good: the key you must press matches the signature (G: F♯; D: F♯ C♯; A: F♯ C♯ G♯; F: B♭; B♭: B♭ E♭; E♭: B♭ E♭ A♭). Play the scale lesson (F major, up and down) and "Mini song: Sharp Eyes" (G major) with the fingers shown. Take the test.
   - Good: Unit 11 passes with no song unlocked.
8. Switch to an Advanced profile.
   - Good: the songs behind Units 6 to 8 and Unit 10 are open; Unit 11 has no song. The Learn path still starts at Unit 1 and the units still open in order.

## Phase 9: piano navigation, iPad, sounds, streak and badges

1. Piano navigation at the keyboard (Mac, Chrome, FP-30X connected). Open Keyfall. The first-run card "Steer Keyfall from the piano" lists A0 Back, B0 Previous, C1 Select, D1 Next, E1 Home (the five lowest white keys).
   - Good: press D1; an amber ring appears on the first control. Keep pressing D1 and B0: the ring moves one control at a time through the page. C1 presses it. A0 goes back one level (Songs to Home, a lesson to its unit to the Learn path to Home), E1 goes Home from anywhere.
   - Good: reach Stats, Settings, Songs, Learn and a lesson using only the five keys, and play a Learn prompt on the piano while the five low keys never count as answers.
   - Good: on Songs pick Mary with D1 and C1; on the setup card D1 and C1 pick a mode and press Start. While the song plays, C1 pauses and C1 resumes. A0, B0, D1 and E1 do nothing then, and are not counted as wrong keys. Play the song to the end.
   - Good: on Results C1 is Retry, D1 is Practice my mistakes (only when there were misses) and A0 is Songs.
   - Bad: the ring is invisible, a low key starts a song, or a low key counts as a wrong key in a song.
   - Hold test: on the keyboard check screen (Settings > Home > Keyboard check) A0 to E1 only light up when tapped; holding one for about a second acts as its command.
   - Also check Settings > Preferences > Piano navigation switch: with it off the low keys do nothing anywhere and count as normal keys.
2. iPad, both orientations, in the Web MIDI Browser app with the piano paired.
   - Landscape (about 1180 wide): the full layout as on the Mac, rail on the left, all HUD controls on one row.
   - Portrait (about 820 wide): Play does not show "turn your phone sideways". The header is two rows (title and view buttons, then three stats), falling notes fill the screen with the keyboard at the bottom, and Split view puts the score above the falling notes. Home, Learn, Stats and Settings stack in one column.
   - Good: keys line up with the piano in both orientations, everything is reachable by touch (every control is at least 44 px), and rotating mid-song keeps playing. Tell me if the portrait header feels cramped.
3. Sounds and animation feel.
   - Settings > Sounds: on, then menu moves (D1/B0) tick softly, C1 chimes, finishing a song plays a cadence, a chime per star and a sparkle for a level or badge. Learn answers chime (right) or sink gently (wrong). Nothing plays while a song runs. Off silences everything; the metronome stays separate.
   - Good: the sounds are quiet next to the real piano and never harsh. Tell me if any is too loud, long or annoying.
   - Animations: stars pop in one at a time on the end card, the level-up and badge cards slide in, the XP bar fills. Settings > Reduce animation (or the iPad's Reduce Motion setting) stops all of it.
4. Streak, XP and badges.
   - Home shows Level, title, XP bar, the daily streak and "n of 17 badges". Finish a song: the end card and Results show "+XP", a level up when earned and any new badge (Opening Night, Full Marks, Flawless, ...). Passing a Learn unit adds 150 XP.
   - Good: play on two days in a row and the streak reads 2-day; skip a day and it resets after the day is missed (it says "play today to keep it" while it is still alive). Stats lists all 17 badges, earned ones lit.
   - Sign in on a second device: level, streak and badges match (they are worked out from the synced runs and Learn progress).

## Phase 9 Part B: after the security hardening goes live

Open https://bh0ss.github.io/keyfall/ on the Mac and on the iPhone or iPad (Web MIDI Browser).

1. Play a song, open its sheet view, and sign in on Settings.
   - Good: everything looks and works as before (fonts, sheet music, sign-in, sync status). The site now restricts what it may load, so a blank sheet or a stuck sign-in would mean the policy blocked something; tell me which screen.
2. Import a MIDI or MusicXML file, then check it appears on your other device.
   - Good: it syncs. Files other than MIDI and MusicXML cannot be stored in your account any more.

## v1.1: Hand-position help

Open Keyfall on the Mac with the FP-30X connected, Beginner profile, Settings > Hand-position help on.

1. Play Frere Jacques in Wait mode.
   - Good: about a bar before bar 7 a pill appears at the top ("Shift left, ring → C, bar 7") and a dashed line with an arrow falls down the highway with the notes. The keys under the right hand (C4 to G4) are tinted with a solid bar and "RH" underneath, and the key under the thumb has a white glow. The target position (G3 to D4) shows a dashed outline with "RH next".
   - Good: the song holds on the first note of the new position and the cue stays up until you play it; then the tint moves to the new position.
   - Bad: the cue is hard to see from the bench, the shading hides which key to play, or the dashed and solid zones look alike.
2. Song setup > Shift drill on, then Start. Good: only the two notes before, the shift note and two notes after loop; Next shift and Previous shift step through a song with several shifts (try Yankee Doodle or Amazing Grace).
3. Settings > Position names on notes on. Good: notes show a finger number and the key under the thumb ("3 · C"). Tell me if the moves feel too early or too late, or if it flags moves that a teacher would not call a hand move.

## v1.1: Auto-fingering

Open Keyfall on the Mac with the FP-30X connected, Advanced profile (every song is unlocked), Settings > Auto finger numbers on.

1. Open Minuet in G (no fingers in the score) and the Falling view with note names on.
   - Good: each falling note and the key under it show a finger in parentheses and italic, like (3). Fingers that come from a score (open Frere Jacques) are plain digits. Open Sheet view: the same (3) marks sit above right-hand notes and below left-hand ones.
   - Bad: the marks are hard to tell from printed fingering, or they crowd the staff.
2. Play the first two lines of Minuet in G, then The Entertainer, using the fingers shown.
   - Good: a teacher would accept most of them, and the hand rarely has to move to a new position (the shift cue should be occasional, not constant).
   - Tell me which fingers feel wrong (thumb on a black key, an awkward crossing, a same finger on two keys in a quick run). The model is a cost table in src/engine/fingering.ts and is easy to adjust.
3. Song setup > Auto fingers off, then Start. Good: no parentheses anywhere, and no shift cue or shaded positions for a song with no fingers in its score. The switch is remembered for the profile, and Settings > Auto finger numbers shows the same state.

## v1.1: Learn content

Open Keyfall on the Mac with the FP-30X connected, a fresh Beginner profile, Learn.

1. Open Unit 1, then Unit 2, and read each card.
   - Good: the keyboard, posture, hands and staff pictures are clear from the bench, the words are plain, and Skip intro and Got it close the panel; "Show the unit intro" brings it back. The posture and finger-number cards match what you were taught.
   - Bad: anything is hard to read from a metre away, or a picture is confusing.
2. Open Unit 9, Moving around the keyboard (pass Units 1 to 8 first; it sits right after Both hands), and do "C, F and G, eyes off" at the piano.
   - Good: you can find C, F and G by feel from the black-key groups with the screen keyboard hidden, and the keyboard appearing after each press confirms where the key was.
3. Play the two shift drills, Hill Climb and Three Homes, with the fingers shown.
   - Good: the moves are comfortable at a slow tempo and the finger numbers tell you where to put your thumb. Tell me if a shift feels too far or the finger number is wrong.

## v1.1: Help bubbles and tips tour

Open Keyfall on the Mac with the FP-30X connected and a fresh Beginner profile.

1. Home shows "Tip 1 of 6" at the top. Read all six tips from a metre away.
   - Good: the text is readable, the tips match how you use the app, Skip tour hides it for good (also after a reload), and Settings > Show the tips tour again brings it back.
   - Bad: a tip is wrong or confusing, or the card is in the way.
2. With the piano only: press D1 until a small (i) button is selected (Settings is a good place), then press C1.
   - Good: the bubble shows as soon as the (i) is selected, C1 closes it, C1 again reopens it, D1 moves on and the bubble goes away. The bubble text is readable and never covers the control you are about to press.
3. On the Results screen, press B0 repeatedly.
   - Good: the selection steps through the (i) buttons and each one shows its bubble; C1 on the screen's normal buttons still retries, D1 still opens Practice my mistakes.
4. Open any song's setup and read the Difficulty, Shift drill and "Shift marker and shaded keys" bubbles.
   - Good: a first-time player would understand each; the shift marker text matches what you see on the highway.
   - Tell me any wording that is unclear or wrong.

## v1.2 I1: Transcription engine (iPhone, optional early look)

Nothing is visible in the app yet. This is a one-minute probe of the riskiest unverified thing: does the model run in a worker on the phone?

1. After the build is deployed, open `https://bh0ss.github.io/keyfall/?debug=1` in Web MIDI Browser on the iPhone and, from the Mac with Safari's Web Inspector attached, run `await window.__keyfall.transcribe(new Uint8Array(await (await fetch('some-small.wav')).arrayBuffer()))` against any short WAV you can serve.
   - Good: `{ ok: true, info: { backend: 'webgl' } }` with a note list.
   - Also useful: `{ ok: false, kind: 'unsupported' }` means the phone will get the "use the Mac" card later. Tell me which you see.

## v1.2 I2: Arranger on a real recording (Mac, after I4 makes it reachable)

The arranger is dark and only tested on synthetic audio, which is easy. Once the add-song flow exists:

1. Take a real recording of a solo piano piece you know (your own, or any you have the right to use) and run it through the flow in Beginner and Full. Play the result: is the right hand the tune you expected, is the left hand sensible under it?
2. Repeat with a full-band recording with a vocal. Expect worse. Note whether the tune is recognisable and whether the tempo and key guesses were wrong (the tap-tempo control should fix the tempo).
3. Record what you found in the PROGRESS v1.2 section next to the synthetic F1 table.

## v1.2 I3: Spotify link lookup

- After deploy, from the live site with `?debug=1`, run `await window.__keyfall.spotifyLookup('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')` in the console: expect `ok: true`, a title, and `thumbnailLoaded: true` with no CSP error in the console. Also try a region you use: if the thumbnail host is not `image-cdn-fa`/`image-cdn-ak.spotifycdn.com` it shows no thumbnail (by design) and the host should be reported.

## v1.2 I4: Add song screen (Mac and iPhone; reach it at `#/add/audio`, nothing links to it yet)

1. On the Mac in Chrome, open `https://bh0ss.github.io/keyfall/#/add/audio` after deploy. Paste a real Spotify track link, press Look up song, then choose a real recording (solo piano first).
   - Good: the title and cover appear, the artist stays empty for you to type, the progress goes Reading, Getting the listener ready, Listening with a moving bar, then Writing out the notes (a short, unnumbered bar), then the review.
   - Bad: the bar sits full for several seconds, the cover is missing for a track you know has one (tell me the image host in the console), or the review never appears.
2. On the review, try each control against the recording: Beginner and Full, Tap tempo along with the music, Half and Double, the Key list, Trim. Then Add to my songs and play the song in Wait mode.
   - Good: each change updates the note counts at once, the saved song plays and syncs to a second device.
   - Tell me which guesses were wrong (tempo, key) and whether Half, Double or Key fixed them.
3. Press Cancel in each stage (Reading, Listening, Writing out the notes) and start again.
   - Good: Cancel always returns to the two cards immediately, and the next run works.
4. With the piano only (A0 back, B0 previous, C1 select, D1 next): paste a link by keyboard, then reach Look up song, Choose recording, the review controls and Add to my songs.
   - Good: a thick ring shows on whatever is selected, including Choose recording.
5. On the iPhone in Web MIDI Browser: open the same page and choose a short recording (under a minute), then one over 4 minutes.
   - Good: the short one either completes or shows "This works best on the Mac" with a reason; the long one shows the Mac card straight away. Tell me which card text you saw and whether Cancel works on the phone.
