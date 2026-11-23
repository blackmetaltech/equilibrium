# Changelog

All notable changes to EQUILIBRIUM. The release workflow publishes the section whose heading contains `[x.y.z]`.
Each version is one themed layer (the GIGAWATT pattern). Repos are private; no public release without the owner's go-ahead.

## [0.12.0] - 2026-11-23 · "The Lab at Home" (LOOK2, layer 0.12)
### Changed
- **The lab is the home screen.** The title, the Works map and the briefings live in the private lab. The map and the brief lie on a drafting table as paper.
- **The lab is bigger.** The back wall moved out, with a catwalk along the glass and a tall autoclave in a gantry down the bay. The dais has a control desk.
- **The hall's equipment is rebuilt.** The sulfur burner is a drum on saddles with a burner front and fan. The fired heater has ribs, a breeching and a rain hood. The pipe rack is I-beams in primer and stands behind the plant. Ladders have cages.
- **Each level gets its own camera.** The hero view fits the main unit whole and picks a different unit per level. L04 has its own props.
- **Bed glow follows temperature.** Dull red at 450 °C, orange at 650 °C. A sintered bed throbs red-orange; a sleeping bed is plain steel.
- **Unit names are nameplates** on the units. A screen label shows only for the unit you point at.
- **Chapter 2 builds in the hall.** L05-L08 have their own splitter, gasifier, CO burner, fired heater, exchanger and cooler. L09, the calorimeter exam, is still in the classic look.
- **Plain text.** Briefs open with three short lines. The prompts say click, tap or press A to match your device. The annunciator lists only what is lit. The Works map is in sentence case. No selling words in the text; a test guards it.
- **Larger port dots** (1.6x, 24 px pick radius).
### Fixed
- A white glint on the hall floor in every view (a fill light and the moon's highlight).
- The heat ledger cut its last line; the equilibrium window's labels sat on the operating point and the axis.
- A missing metal texture logged an error on every hall build.
- Flaky tests: fix18 (a clock-seeded Career and an overflowing card), build_guide (clicks during the notebook's settle), fix28 (the shift clock ran before the test parked it).

## [0.11.0] - 2026-11-23 · "The Bench in the new look" (LOOK2 phase C)
### Changed
- **L14 Two Flasks has a goal you can miss.** Find the temperature where your 1 L flask reads the book's 9.15 bar. Run one argon test too, to show what shifts it. You have six runs, the tests included, counted across restarts. All three Le Chatelier tests are a star, and the Kp call is another (D-C1, D-C8, D-C9).
- **Chapter 1 is new look.** L01-L04 use the drafting table and the hall, like chapter 3. The Works Map marks chapter 1 "New look" (D-C2, D-C4).
- **The hall flip is R3 on a pad.** X turns a part on the drafting table now; X still returns from the hall (D-C5).
- **The L14 T wheel steps 1 K by pad and scroll.** At 5 K steps the goal could not be reached by pad (D-C6).
- **Site and README** cut to one or two short sentences per paragraph. The download button names the version.
### Added
- **Vessel models in the hall:** dished heads, clad shells with seams, flanged nozzles, manways, skirts and legs, caged ladders and ring platforms, saddled drums, gate valves and a two-level pipe rack. Pipes lie on the rack.
- **A burner** whose flame follows its outlet temperature, and **a stack with a flue analyser** that reads the engine's O2, CO2, SO2 and CO.
- **Downlights over your plant** in the hall; the cameras frame the plant you drew, low and close.
- **The L14 lab gleams:** a pale polished epoxy floor, white upper walls, a light ceiling with LED lines.
- **The recorder counts down to the printout** on every first run.
- `scripts/desk-gpu.sh`: hand play rendered on the GPU inside the tester's own virtual display.
- **The drafting table by pad alone** (D-C5): the classic build view is playable from the notebook to the win with a gamepad.
- **A pad hand for the plot** (`godot/ui/pad_plot.gd`). Every unit and every free port gets a focus target at its place on the screen. The D-pad moves between them, A on a unit opens its faceplate and puts the focus on its first knob (the D-pad then walks the plate's chips and knobs; a knob used to keep the arrows and never let go), A on a port starts or ends a pipe through the same `port_clicked` the mouse uses (so the piping rules and refusals are the only rules), B puts away the pipe, plate or selection. Mouse players never see it.
- **A part by pad.** LB/RB walk the tray (a folded tray opens first), A takes the part, the D-pad (or the left stick) moves the cursor, A places, X turns, B puts it back. The cursor starts on the nearest free spot, so the ghost is green, not a red slab.
- **Dialogs keep the focus.** In the notebook, a brief or a keypad the focus cannot leave to the tray behind, a D-pad press with nowhere to go scrolls the page, and the right stick scrolls it.
- **The key and the speed dial by pad.** A on the focused key turns it, A on the focused dial steps it, Back steps it. Both dials took focus only if they were built after the first pad press.
- `godot/tests/pad_build_flow.gd`: L01 and L10 played from the notebook to the win with joypad events only. `godot/tests/pipe_drag_flow.gd`: the mouse pipe-drag regression below.
- The flue analyser, the downlights and the plant bed sounds are new; no human has listened to the sound (docs/ASSETS.md).
### Fixed
- A drag from the pipe-in-hand's own outlet did nothing (L03: mixer to burner never connected); `pipe_drag_flow` case 6.
- Editing L14 between runs refunded lab time (runs left went 9 to 10).
- The L14 coach kept asking for the volume test after the goal was met.
- The printout countdown was cut ("MAD", "PRINTOUT IN 18"); it has its own recorder line.
- The hall banner said "nothing built yet" over a drawn plant; it says "not commissioned yet".
- The CLAMP sign was cut by the HUD in the wide view; it shows close up only. The control name line sits on a dark plate.
- L02's Call it says it is graded on your first run.
- The flue analyser says "mol % wet", shows H2O, and reads CO in ppm (Anjali).
- The hall camera spec ignored "plant" when given with other words; "plant" is now a low hero view (Sigrid).
- Flows are isolated from machine gamepads: another session's virtual pad pressed buttons inside the pad flows (`scripts/flows.sh`, D-C7).
- The engine timing test failed under load: it timed the wall clock. It now times the thread's CPU, with the same 25 ms bound.
- The control name line in the new look no longer sits on HUD cards.
- LB/RB on the build screen opened the Codex behind the tray (the shell's drawer switch); the tray's own LB/RB and A also fought each other.
- The placement cursor could not move along one axis with the camera at 45 degrees: sideways and forward input both picked the same axis (a stick or D-pad never went along x). Ties now go by the input's direction.
- Back (speed dial) ran the shell's bare clock change, so the dial and the engine's clock disagreed, and did nothing useful in the hall after commissioning. It goes through the console now.
- A pipe drag with the mouse that did nothing: with a half-made pipe in hand (a click on an outlet) a press on another outlet was refused ("no legal port on that unit") and the release of the drag was ignored. Same-kind ports stay pickable and arm the drag. `pipe_drag_flow.gd` case 2 failed before, passes now. The playtester's exact L11 case was not seen; this is the cause I could reproduce.

## [0.10.1] - 2026-11-23 · "The first screen" (owner review: the title and the Works Map in the new look)
### Changed
- **The title is the new look.** The night plant hall sits behind it, with the camera drifting slowly; the menu is on glass. There is no classic geometry on the first screen.
- **The Works Map is on glass.** Chapters 00 and 03 show a picture of their new-look scene; the others say "classic", quietly.
- **L14 reads better.** The hall is brighter, so the glassware, tanks and bay show. The rig is framed larger, and the flask panel sits bottom-left, off the rig. The clamp handle is labelled CLAMP.
- README and site open on new-look shots.

## [0.10.0] - 2026-11-23 · "The Wall, in the new look" (chapter 3 and the prologue in a 3D hall and lab; the other chapters stay classic and say so)
### Changed
- **L14 is Two Flasks, the player's own experiment (D-B1).** N₂O₄ on NIST-JANAF data sits in a piston flask on your bench, with a twin flask built to the book's numbers beside it. The controls are in the world: T and V wheels, a RUN lever, an argon valve and a piston clamp. The HUD form is retired. Heat darkens the gas. The book's K is used only for the Kp call. Win: the three Le Chatelier tests (halve V; argon at constant V; argon at constant P). Test 3 counts only at the flask's own pressure, within 0.5 %. Stars: the Kp call, and finding the book's temperature (406.5 K, where your flask reads the book's 9.15 bar). The lesson says the book's number is invented and explains bar(a). The coach asks for a prediction before each test.
- **L00 Night Shift has a cost (D-B2, D-B5).** The cooler is slow, 13.5 K/s. A late turn trips the interlock, and the night is lost with a retry. The iron catalyst lights off at 643 K (370 °C), and the expert saves the night at 650 K. Stars: no trip; the catalyst kept lit (the lowest set point of the night counts, so turning back does not undo it); a turn within 10 s. The cue is the CW PUMP lamp.
- **Chapter 3 is the released new-look chapter (D-B4).** In L10-L13 the classic build view is the drafting table. Commission the plant, and your own flowsheet stands in a hall. Beds and converters glow by outlet temperature: dark below light-off, white past the sinter limit. Boiler plumes follow the engine's steam rate. B (or X on a pad) flips between the two views. Chapter 3 opens from the start, with a title-screen strip. The Works Map labels every chapter NEW LOOK or classic.
- **Round 3 of the look.** The L14 lab is a hall: benches of coloured glassware, glass columns, a reactor bay behind glass, a gantry with a hoist, cable trays, a control dais, and the rig on a railed steel plinth. In L00 each vessel has its own finish: the fired heater has heat-resistant paint, a convection section and a burner row; the cooler is green; the converter has cladding bands; the night is darker.
- **Textures.** Mipmaps and VRAM compression for every 3D texture, with normal maps as RGTC. The roughness limiter is on. AA per tier: ultra MSAA 2x + TAA; high FSR2; compat FSR1 + FXAA.
- **RUN flushes a wheel turned just before it.** A fast turn followed by the lever used to run the old value.
### Added
- **Pad for the new-look controls.** D-pad left/right picks a world control (a ring marks it, and a line names it and its value). Up/down turns a wheel. A pulls RUN, works the valve or the clamp, or opens the keypad for the Kp call. LB/RB step the camera presets; the sticks and triggers move the camera.
- `godot/tests/pad3_flow.gd` (real joypad events through L00, L14 and L10). `godot/tests/textures_flow.gd` (fails if a texture loses mipmaps or compression). look2_flow now drives L14's coached order through the world's controls. `src/levels/l00_lowset.test.ts`.
- An `expert` persona that plays the current level's own solver (QA captures). `CB_CAM=endclose` puts the end card away.
### Known gaps
- The chapter 3 hall is a view, not an editor. Building stays on the drafting table.
- Every chapter other than 00 and 03 is in the classic look.
- The low tier on the integrated Radeon runs at about 30 fps (34 ms), paced by vsync, with the GPU at 11-16 ms.
- `engine.test.ts` "commission time p95 < 25 ms" fails when the machine is loaded and passes alone. `build_guide_flow` is timing-sensitive under load and passes alone.

## [0.9.0] - 2026-11-22 · "The plant you can read" (a Career you can trust, the pump house as a plant, 16 px everywhere; the pad pass found the gaps)
### Changed
- **The Career you can trust (F31).** The board fits the window after a resume and after the incident level (long log rows wrap); a call-it is graded against the design at
  the first commission that solves, frozen then (the same fix in L02, L04, L05, L14, L19, L21, L26, L28, L37); the inerts incident is announced as its own card the month
  before it starts (one stop per incident; the 30-press ceiling holds, at most 27); the old purge and the catalyst come from one source on every screen; ACCEPT, BOOK, the
  incident answers and any yearly option that buys or books arm first and confirm, with CANCEL and reserved widths; the strike line counts months past due correctly; the
  incident log row names the right plant.
- **The pump house is the instrument (F33).** L39's suction and discharge lines are drawn at their schedule-40 size and coloured by the velocity guide, with ink bands moving at the
  water's speed; the pump wears its P1-P5 plate and shakes and bubbles when it cavitates; an NPSH sight-glass on the suction line shows available against required with a red
  band under a 1 m margin; the pump and system curves are on a large X-Y plotter with the operating point under the pen; pipe sizes and the pump are rotary selector knobs
  (keyboard and pad focus, click a pipe to pick its knob).
- **The incident as a slip (F33).** YOUR FIX, THE CONTRACTOR and IGNORE IT side by side on green-bar paper (purge, output, gas per tonne, MUSD over the months) on the Career card,
  in the plant after each commission and on the printout.
- Recorder legends are short per level and never cut with "…"; a pre-built level folds the parts tray to a tab; the intercom shows three lines at 1280x800.
- **The plant gets the window (F32).** The parts tray is a small dock at the bottom left that is as wide as its tiles, and it is gone when nothing is left to place; the console is only
  the instrument row. At level open and after a commission the camera frames the equipment's bounding box (footprints and standing heights, projected through the camera's own yaw
  and pitch) so it fills about 90 % of the space above the console; F frames the same way.
- **16 px is the floor (F32).** Every text is 16 px or more on screen at 1920x1080 and at 1280x800: `EqTheme.fs` floors every size, hand-drawn text goes through `EqTheme.ds`
  (floored, squeezed to at most 78 % of its width before it would clip), text the shell builds (Settings) is lifted by `EqTheme.lift`, and the 3D name tags (`Tag3D`) are at least
  17 px at any window height with a heavy dark outline plate. The annunciator, the recorder legends and tape, the key and speed dials, the parts tiles, the control-panel dials and
  the L39 hydraulics board were re-spaced for it.
### Added
- `godot/tests/fix31_flow.gd` (every key and dial inside the window on fresh start, incident, return from the plant and resume, at three sizes) and `fix33_flow.gd`.
- `godot/tests/layout_flow.gd`: walks every screen (title, settings, Works map, pause menu, notebook, printout, faceplates, the Career board with an incident card) and the opening view of every level (including `CAREER_FIX_NH3_INERTS` and L39) at 1920x1080 and 1280x800, and fails on text under 16 px, clipped text, overlapping drawn or Control text, and text outside the window.
### Known gaps
- **Gamepad:** a pad-only pass at 1280x800 (round 12) found the game only partly operable by pad: the notebook's call-it field and scroll, the loop-panel knobs, the key switch,
  the speed dial and the Career's yearly-card choices cannot be reached, and the focus ring is faint on several controls. This is the first item for 0.10.
- No careful human has finished 60 Career months on this build, and there was no Deck Career replay.

## [0.8.0] - 2026-11-22 · "The plant behind the numbers" (an incident you fix in the plant, a new trade, one currency, fast shifts)
### Added
- **Incidents you fix in the plant (F29).** When inerts creep into the ammonia feed, the Career board pins an incident card with three honest answers and their stated
  output, gas per tonne and MUSD: GO TO THE PLANT, CALL THE CONTRACTOR (0.30 MUSD, a safe 4 % purge) or IGNORE IT. GO TO THE PLANT opens the L20 synthesis loop pre-loaded
  with the Career plant's inerts, catalyst activity and prices (`CAREER_FIX_NH3_INERTS`: notes, coach, a call-it on the argon at the converter inlet, goals, printout);
  BACK TO THE CAREER applies the purge you chose to the ammonia plant for three months and logs it ("Purge set to 2.5 % at the plant: inerts …, output back to … %").
  A good purge beats the contractor; a bad one can be worse. A crash inside the plant loses nothing.
- **Chapter 10 · Hydraulics: L39 "Size the Line" (F30).** 60 m³/h of 90 °C condensate up 14 m to a deaerator: pick schedule-40 sizes for both legs, one of five centrifugal
  pumps (head, efficiency and NPSHr curves), an impeller trim and where the pump stands. Darcy-Weisbach with Colebrook friction, the system curve against the pump curve,
  affinity laws, NPSH available against required, and an economic-diameter star (pipe capital against electricity in the region's currency). A side-view picture of the job
  with pipes coloured by velocity and cavitation bubbles, and a live H-Q plot with the operating point and BEP.
- **Career save and resume (F27).** The Career autosaves each month and on every decision and resumes the same month and seed after a crash or quit.
### Changed
- **One currency per money number (F26).** Equipment capital (USD in the cost correlations) is converted once by the region pack's `capexFx` wherever it meets
  region-priced money; L08's star line is derived from the engine for every region, and a test checks that a region with every price x83 gives exactly 83x every money goal.
- **Fast shifts on weak hardware (F28).** Owed ticks are counted from the wall clock and run as one batched engine call (bit-identical results): L08's 30-minute shift at 16x
  takes 110 s under software rendering (was 140-290 s).
- **Career board (F27):** the scroll anchors to what you are reading, keys keep their width through arm/confirm, one strike banner with one line per plant, a booked
  turnaround covers the overdue stop, ending names agree between review and end card, every moved review term is named, and the accept-time capacity check counts booked
  turnaround days.
- The Career is chapter 11 on the Works map.
### Fixed
- Call-it prompts get their level's numbers (L39 showed "{q}"); the prediction note promises a star only on the 18 levels whose star rule is the call; L24's star line had
  lost its 6.6 kmol; a test now fails on any raw placeholder in any level's notes, stars or call-its.

## [0.7.0] - 2026-11-21 · "The Works you run" (rounds 8-9: the Career keeps careful players; what the game says is what the plant does)
### Added
- **Coach audit** (`f23_truth.test.ts`): every coached level is replayed with its reference solver, action by action; a coach step is never shown after it is done,
  before its precondition (commission before the pipes, a read before a run, the vent before there are inerts) or on a fully piped plant. Found and fixed stale steps in
  L03, L04, L08, L10-L14, L16, L18 and L26.
- **The coach follows the build checklist**: while a design row is open on a checklist level the intercom names the next unticked row (round 9: L25 said "commission"
  at 24/26).
- **Wiring** (F20, F25): snap-to-port with pulsing legal ports; a missed drop names the nearest free inlet (also when the click lands near a pipe); smooth wheel zoom,
  right-drag/WASD pan and F/Home to frame the plant; ctrl+z/ctrl+y; Esc drops the tool. **Chained piping**: a pipe dropped on an inlet re-arms from that unit's next
  free outlet, so a train is one click per link; the first part of a checklist level is in hand at the start; "Same catalyst and charge on all beds". L25 is piped in 24
  moves (round 9 counted about 45), L13 in about 21.
- **Design estimates are labelled**: the X-T staircase, the Equilibrium Window and the heat ledger say "design estimate" until a run exists; the heat ledger clears on an
  abort.
- **Star-3 flasks state their numbers** (L05, L06, L08, in the region's currency); L12's flask 2 states its full condition.
- **Career: overlap pricing.** Turnarounds in the same month share one crew pool and one crane (`taGroupDays`): the outages really run longer. BOOK shows the extra days and
- **Overlap pricing.** Turnarounds in the same month share one crew pool and one crane (`taGroupDays`): the outages really run longer. BOOK shows the extra days and
  MUSD ("Overlaps the ammonia turnaround in month 6 ... 26 d instead of 15 d ... 11 extra plant-days, about 1.60 MUSD"), the yearly turnaround/crew cards carry an `overlap`
  term, and the board (card, lever, `suggestTaMonth`) suggests the first month with no other turnaround.
- **Emissions strike warned.** Year-end emissions are projected from the aged state of the plants; from six months out an over-the-cap projection is an EMISSIONS AHEAD banner
  (pinned), a stop on NEXT DECISION / +3 MONTHS, with two levers and their numbers (rates per plant, abatement level). The debottleneck card states one emissions figure.
- **One target**: the yearly target is the Flagship total over five years (28 MUSD a year of 140), in reviews, the endings strip, the course line and Victor's score.
- **Endings say why** on the end card and the verdict ("Two losing years in a row: year 2 -33.2 MUSD, year 3 -10.9 MUSD."); an ENDING AHEAD projection stops a run three months before a year
  end that would sell the Works or shut the site; simultaneous overdue inspections are one stop listing every plant.
- **Annual review as a card** at each year end with "last year's card": the card replayed against the option not taken (same later decisions, same seed) gives what it realised and why.
- **Suggestion follower** policy (`followerDecisions`, `playCareerFollower`): does what the board says. Twelve seeds, Steady or better everywhere.
- **Career: one Flagship** (140 MUSD) everywhere; the third flask is the "reference flask" with this seed's own number. Each yearly card carries a forecast cut to the review
  year and its stated uncertainty, and the review itemises forecast against realised per term and names the term that moved (the year-4 contract replay drew different
  offers: fixed). A booked turnaround covers its plant's inspection warning; BOOK stamps "BOOKED month N"; every cash purchase asks twice; settled offers fold to one line;
  handheld banners are two lines with "more"; benefit lines stop at month 60; offers state the month's capacity and why; INSPECT says what it does not reset.
### Changed
- The intercom starts each new line at its first word, then reads down like a teleprinter; a coach line yields to the step; lines quoted at commission say so.
- L11's contract feeds are never offered for deletion as "unconnected"; a re-placed feed returns as the contract. Compressor POWER IN, Eq Window "@ N bar", L11 lamps,
  L14's knob and 400 K stated in both units, L13 staircase spoiler hidden, the L13 sinter lamp reads "BED NEAR SINTER" in amber; L10 states K once; L12 says the game's
  thermodynamics are heat-capacity corrected; "This cooler does 0 kW".
- BUY CATALYST stays armed until pressed again or CANCELled; BOOK without a charge answers in red; STRIKE AHEAD only when the projected overdue passes 6 months; "due now" clears
  once a booking resets it; one penalty number on offers; the outage with and without the catalyst charge is explained; the card button and its Expected line share one rounding.
- Victor's score now uses the 28 MUSD yearly target (was 40).

## [0.6.0] - 2026-11-20 · "Every level, every persona" (round 7: the whole campaign play-tested; guidance you can follow)
### Added
- **Career: NEXT DECISION ▸** runs months until something needs you (an offer worth taking, an inspection two months out, worn catalyst,
  fouled exchanger, an incident, a big price or gas move, a review, a yearly card), at most 12 a press; a skip player finishes 60 months in
  about 25 presses. Warnings are acknowledged one by one (plant, kind, due month); a booked turnaround covers its plant's warnings; CONTINUE
  ANYWAY acknowledges and runs on in one press.
- **One decision card a year** from six kinds (long contract vs spot, turnaround now vs later, debottleneck, gas hedge, economy catalyst
  grade, contractors vs own crew), five different cards in five years. Every option lists the terms that make up its MUSD and they add up;
  the Learner hint names the option the careful policy would take. Strikes are named (plant, month, cause, "strike N of 3") with a STRIKE
  AHEAD warning; the handheld board pins its action row and the pending card and folds quiet plant cards.
- **"What you have" under every call-it** (all 35 call-it levels): the data, table or formula the call needs, from the engine's own numbers,
  never the answer. Tests: no placeholder, no answer leak, and a hand calculation from the given data lands inside the tolerance for ten
  levels.
- **L22 build checklist** with a safe first knob (meets the goals, not the calibrated best).
- Per-level opening speed (`recommendedSpeed`): first-run levels open at 1x so the light-off is seen.
### Changed
- **The build checklist stays up while the plant runs** until every row is done (round 7: L24's start-up rows vanished at commission, a
  fresh tester tripped three times). After a part row is placed, the next part is put in hand (the plot ignored clicks before).
- **L24**: goal 3.5 kmol (safety first; the Chief Engineer star keeps 6.6 kmol with a 15 K margin); the feed row ticks only at 182; a
  wait row counts down "steady 87 / 120 plant s"; the lit row shows the live temperature; feed knobs read the feed spec (they showed 260.6
  with the feed at 182). Two fresh testers won it on their first try.
- **Notebooks of checklist levels** (L22-L26, L33) are the goal plus one paragraph of why; the numbers live in the checklist rows.
- A run that misses its goals on an open job prints GOALS NOT MET, not RUN ABORTED; a shift that runs its full length safely says so.
- L04 limiting-reagent chip (flask 2 was unearnable); L09 exam rows each grade their own item; L10 cost per tonne without a tank
  ($1,000,000,000/t on the slip); L13 gives the feed gas; L14 the book constants; L12 call tolerance 5 %; L28 starts badly trimmed so one
  knob no longer wins all three flasks; splitter steps of 1 %; L32 bed temperature on its own scale and reachable 3-star tunings printed;
  L38 16-day plan reachable, chip drag fixed, CPM hidden until the call is locked; Esc pauses without losing a run; a second key click
  never starts a second run; fixed keypad; histogram buckets as ranges.
### Known gaps
- Still no real-phone pass: the Pixel shows as "unauthorized" on adb and needs the owner to accept the debugging prompt.
- See docs/CRITIQUE-0.6.md.

## [0.5.0] - 2026-11-20 · "The plant you design" (big builds, a winnable Career, no long waits)
### Added
- **Build checklist** (`buildGuide` on a level spec) for L23 Spirits, L25 and L26 and the L24 start-up: every part, pipe and setting from the
  notebook's build order as live rows that tick from engine state; a row arms the part, pulses the two ports or opens the plate; the next pipe
  pulses by itself. Big builds frame the whole plot; big units show every valid anchor while placing.
- **Career endings.** Sold / Shut / Steady / Flagship strip with what each needs; ONE five-year score (operating margin) on the ledger, strip,
  course line, reviews, end card and histogram; "what would move you" levers with numbers; an alert strip with jump-to-plant; inspection
  warnings two months ahead; +3 MONTHS stops at important events and needs CONTINUE ANYWAY past a warning; BOOK weighs booking now against the
  expected cost of waiting; ACCEPT shows capacity exposure; annual memo as compact tables; the last review shows before the end card.
- **Wall clock.** Every shift level fits 300 s of real time at its recommended speed including 30 s of human latency per step (tested).
### Changed
- L24 start-up: two-stage light-off (110 °C: coolant 52 + feed 215; steady: coolant 25 + feed 235), each pair safe in either order, 16x,
  tested for late and slow hands (peak ≤ 120 °C, no trip); trip set "from 130 down to 125 °C".
- L26 gives the ammonia flammable limits from the engine; every call-it states its tolerance; the printout shows the engine value again.
- Placement uses the engine's unit footprints (the UI had guessed them).
- Playtest rounds 6 and 6b: L23, L25, L26 won from the checklist alone; L24 won; a careful Career reached Flagship (171.3 vs 140 MUSD).
### Known gaps
- No real-phone pass since round 4 (phone disconnected); see docs/CRITIQUE-0.5.md.

## [0.4.0] - 2026-11-19 · "Employable" (depth: control room, turnaround, career; five play-test rounds)
### Added
- **Chapter 8 The Control Room** (L29-L33): PID/FOPDT library with analytic oracles (step response, P-only offset, Ziegler-Nichols,
  IMC), Hold the Line (P vs PI offset), Tune It (bump test → fitted K/τ/θ → IMC), Ratio (H₂:N₂ station), Cascade (bed T on quench flow),
  The Interlock (1oo2/2oo3 voting, spurious trips vs misses). Loop panel: green-bar strip chart, Bakelite tuning knobs, Nixie IAE.
- **Chapter 9 Turnaround** (L34-L38): HAZOP node with simulated deviations and graded worksheet rows, start-up SOP cards with hazard
  consequences, permit to work (double block and bleed, gas test, LOTO), data reconciliation (weighted least squares + gross-error test),
  turnaround planning (CPM, crew/crane levelling). Boards: clipboard worksheet, punched cards on a pegboard, analyst's logsheet,
  magnetic planning board.
- **Career**: five seeded years running the Works: contracts, price walks, catalyst decay, fouling, wear, inspections, turnarounds,
  incidents, emissions caps, investments; annual review by Victor/Noor/Mara; four endings; replayable leaderboard margin.
- Level-local engine hooks: `EqState.lv`, `levelAct`, per-level `tick`, `levelView`.
- Career dashboard (Plant Manager's office): calendar, cash ledger with operating margin vs investments vs net, plant health,
  contract inbox, investments with payback previews, annual review with revenue drivers (volume vs price) and margin drivers.
- Works Map with every chapter and the Career node; stars from the engine's `progress`.
- Phone layout (checked on desktop at 2424x1080): scrolling parts drawer, drag-scroll Works Map, touch camera pad and pinch, pinned
  brief footer, docked inspector, 48 dp targets, keypad DEL, three-line intercom; Steam Deck (1280x800) layout.
- Shift clock with ETA on the recorder; one-click "Delete all unconnected"; always-visible ports in DESIGN; nearest free tile and valid
  anchors when placing big units; feed species tags; interlock RESET; Retry keeps the build, settings and seed; Back to design after a loss.
### Changed
- Play-test fix rounds F3-F10 (rounds 1-5, four personas plus a phone pass): knobs carry display units (bar(a), L), annunciators lit only
  when true, predictions locked once answered and bounded, answers hidden until you call them, one notation per number, raw keys gone.
- L24 start-up recipe rewritten so it wins as written with a human reaction time (tested 0-60 s); L27 relief on the API 520 gauge basis;
  L33 per-scenario peak, lag and point of no return per final element; L37 χ² 7.81 → 5.99 with the dof rule; Career scores operating
  performance, not money spent on recommended investments.
### Known gaps
- Build-heavy levels (L23, L25, L26) are still hard to finish in a play-test; Career not yet won by a tester; L24 light-off takes ~9 min at 1x.
- Phone layout not re-checked on a real phone since round 4. See docs/CRITIQUE-0.4.md.

## [0.3.0] - 2026-11-19 (shipped inside 0.4.0) · "The campaign" (chapters 2-7)
### Added
- **Chapter 2 Fire** (L05-L09): waste-heat boiler shift, burner lining limit + dilution air, Hess's road, pay-once heat recovery,
  bomb vs flow calorimeter bridge.
- **Chapter 3 The Wall** (L10-L14): Le Chatelier with rigorous K, gas contracts with inerts, WGS where pressure does nothing, the SO₂
  staircase, the N₂O₄ flask bridge.
- **Chapter 4 Speed** (L15-L18): rate vs ceiling (interior optimum inlet T), light-off (K2), Cs-promoted catalyst (same K), the
  peroxide oxygen rig bridge.
- **Chapter 5 The Loop** (L19-L23): recycle, purge (argon build-up), refrigerated flash (Raoult), the methanol loop (cooled tubular
  reactor, K3), Spirits (fermenter K8 + NRTL column hitting the azeotrope).
- **Chapter 6 Containment** (L24, L25, L27): runaway CSTR (three steady states, Semenov), DCDA to 99.9 %, relief sizing (API 520/526).
- Instrument bay: Equilibrium Window + balance beam, X-T staircase, Semenov plot, heat ledger (engine queries with oracle tests).
- 3D models for every new unit (boiler, sulfur burner with blackbody glow, multibed with light-off bands, jacketed CSTR, absorber,
  column, fermenter, chiller, reformer, gauze, NO₂ flask, bomb calorimeter, gas burette).
### Changed
- A cold flash drum is priced as refrigeration (L20/L21 references rederived); feed-effluent exchangers close loops; multibed quench
  optional.
### Known gaps
- L26 Inside the Envelope and L28 Feed the World need the gauze burner and reformer units (in progress).
- Two DESIGN numbers disagree with the engine and are documented in the tests (L15 rate ~12 % faster; L19 per-pass conversion ≈ 35 %, not 15 %).

## [0.2.0] - 2026-11-11 (tag v0.2.0) · "Night shift" (chapter 1 + the control room)
### Added
- L00 Night Shift cold open and Chapter 1 The Bench (L01-L04) with cylinder banks, ideal reactor, sulfur burner, unknown fuel, lab notebook.
- The 1970s control-room interface: intercom (Mara/Tomas/Victor/Noor), ISA-18.2 annunciator, chart recorder, DESIGN/COMMISSION/RUN key
  switch, P&ID parts rack, faceplates with Bakelite knobs, lab notebook brief, green-bar printout.
- Cute mode: molecule critters (count ∝ molar flow, size ∝ M^⅓), scenery (flamingos, the QC-lab cat, gulls, the old Works).
### Fixed
- Two playtest fix rounds (F1, F2): delete, Esc order, picking, recorder history, knob clamps, first-run counter, L00 heater ramp.

## [0.1.0] - 2026-11 · core simulation
### Added
- Deterministic engine: species/thermo (Shomate), equilibrium, kinetics, sequential-modular flowsheet with Wegstein, units, economics.
