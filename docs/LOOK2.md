# LOOK2: EQUILIBRIUM's new look (phase A)

Evidence: [docs/look2/](look2/) (before/after at 1920x1080 and 1280x800, beauty shots, a 10 s capture `trip-10s.mp4`). Branch `look2`; run L00 to play the slice (`CB_LOOK2=0` brings the 0.9 look back).

Owner, 2026-11-22: *"does it even have graphics? can we make it much much more realistic looking?"*, *"the equilibrium player should feel like dexter or something"*, *"you probably need to work on separate design languages for each game"*. The 0.9 look (low-poly isometric plant on a slab, a beige 1970s console) is rejected. The engine, levels and tests stay.

## The fantasy
**The manager's reading of "Dexter", stated as an interpretation:** the boy genius with a vast secret laboratory. The player is a brilliant chemist-engineer in their own spectacular lab hall, and the plant it commands. They are not a clerk in a control room. Every apparatus is impressive and answers to them; the chemistry shows in the world.

One outcome for phase A: the owner plays Night Shift (L00) and says "that is a real plant, and it is mine".

## References (what we take)
| Work | Take |
|---|---|
| *Dexter's Laboratory* (the owner's reference) | Scale and ownership: a hall far bigger than a person, apparatus as wonder, the genius commands it. Not its cartoon drawing. |
| *Control* (Remedy, 2019) | A high brutalist hall: concrete, haze, practical lights, light shafts; clean sans type placed in the world. |
| *Half-Life: Alyx* / Black Mesa labs | Believable industrial lab detail at arm's length: flanges, bolts, labels, wet floors, hazard paint, gauges you can read. |
| *Satisfactory* | Walking freely through a plant at human scale; pipe runs with supports; outdoor industry at dusk to the horizon. |
| *Iron Man* (2008), the workshop | The UI: luminous glass readouts anchored to the object they describe; a diagram floats beside the machine. |

## Palette and light
Night (02:40, as the level's story says). Concrete greys and brushed stainless as the base; warm sodium high-bays (about 2000 K, amber) overhead; cool white LED strips on the gantries; one teal accent (#2EC4B6) reserved for the player's instruments; heat runs dull red to orange to white on the converter; amber and red only for alarms. Moonlit night and the plant's own lights through a glass wall. Volumetric haze in the hall, wet concrete floor with reflections, ACES/filmic tonemap, glow, SSAO, SDFGI on the top tier.

## The scene (vertical slice: L00 Night Shift, the ammonia loop)
Why L00: it is the first thing the owner plays; it is the ammonia loop the brief suggests; it has a temperature the player moves (the cooler dial) and a real failure in the engine (the cooling-water pump trips, the converter heats, the interlock cuts the feed and the loop goes to flare). Nothing in the engine changes.
- **The hall:** a 60 m concrete hall, 20 m high, steel trusses, gantry walkway, a crane rail. The loop stands in it at pilot scale: feed bottles, recycle compressor (vibrates), fired preheater (flame through peep ports), trim cooler (shell and tube with cooling-water lines and its CW pump), the converter (a tall stainless pressure vessel with a sight port and catalyst beds you can see in x-ray), the ammonia separator (cold: frost, a sight glass showing liquid ammonia), splitter, purge line out to the flare.
- **The bench:** a lab bench at the front of the hall with glassware: a sample bulb of converter gas bubbling through water with phenolphthalein, pink as deep as the outlet's ammonia fraction (ammonia is a base; the indicator is real chemistry).
- **Outside:** a glass wall onto the plant at night: cooling towers with plumes, pipe racks, the flare stack, lights to the horizon, a night HDRI sky.
- **Chemistry in the world:** converter shell glow and heat shimmer follow its outlet temperature; the CW pump stops and the cooler's water line runs hot when the pump trips; frost and the sight-glass level on the separator; the flare grows when the interlock dumps the loop; amber beacons turn on alarm; the pink bulb follows ammonia.

## Camera
Free orbit, pan and zoom around a focus point: wide (the whole hall and the window), loop, converter, a single gauge, the bench, outside. Smooth; limits that never show an edge (the hall is closed and the outside runs to a horizon). X-ray (X) makes the converter shell glass so the beds and their glow show. Keys: drag or WASD to move, wheel to zoom, 1-6 focus points, X x-ray. Pad: sticks orbit and pan, triggers zoom.

## UI language
A brilliant inventor's instruments, not a clerk's console. Dark glass panels with a soft blur, thin luminous teal and white lines, crisp sans type (Archivo, already in the repo), numbers in tabular figures, 16 px floor. Readouts are anchored to the equipment with a leader line (outlet T, NH3 %, approach to equilibrium; cooler outlet vs dial and CW state; separator liquid flow; flare state). The equilibrium diagram (X_eq against T for the converter's own feed and pressure, the operating point moving on it, light-off and sinter bands, the Q/K needle) floats beside the converter. One command panel holds the cooler temperature dial and the shift clock and speed. Coach lines arrive as a short line with the speaker's name. Status uses dots, not big labels; no ALL-CAPS chips. The end card is glass too, not paper.

## Quality tiers (one game)
| Tier | When | What |
|---|---|---|
| Ultra | Forward+ on a discrete GPU (the RTX 4090) | SDFGI, SSR, SSAO, SSIL, volumetric fog, glow, DOF on close-ups, shadows, full particles, full resolution |
| High | Mobile renderer, or forced | SSAO, depth fog, glow, half particles, moon shadow only, 3D at 77 % (FSR) |
| Compat | Integrated GPUs, OpenGL compatibility (Xvfb CI, old GPUs, phones) | Lights and materials, glow, few particles, no shadows or far lights, 3D at 60 %. Tests run here. |
Auto-detected (look2/look2.gd); `CB_QUALITY` forces one.

Measured (L00, wide view, scene + HUD, vsync off, `CB_FRAMETIME=1`):
| GPU | Tier | 1280x800 | 1920x1080 | 2560x1440 |
|---|---|---|---|---|
| RTX 4090 (Forward+, PRIME offload; nvidia-smi lists the godot process) | Ultra | - | 4.9 ms avg, 5.0 p95 (GPU 2.1) | 5.4 ms avg, 6.5 p95 (GPU 3.1) |
| Radeon iGPU in the Ryzen 9 9900X (2 CU, RADV) | High | 76 ms | - | - |
| same | Compat | 30 ms (GPU 25) | - | - |
The 2-CU iGPU is about a quarter of a Steam Deck's GPU; the Deck itself is not measured.

## Assets
CC0 only, recorded in [ASSETS.md](ASSETS.md): Poly Haven HDRI and textures (concrete, brushed and painted metal, at 1k), ambientCG where Poly Haven lacks one, procedural geometry and shaders written here. Repo growth is kept small (1k maps, compressed on import).

## How the levels map onto scenes (phase B onward)
| Chapter | Scene |
|---|---|
| 0 Night Shift | The process hall at night (this slice) |
| 1 The Bench, 3 The Wall (L10-L14) | The bench in the hall: glassware; L14's brown N2O4 in a glass flask is the next showcase (the colour is the equilibrium) |
| 2 Fire | The boiler house off the hall |
| 4 Speed, 5 The Loop | Pilot rigs in the hall |
| 6 Containment | A bunkered reactor cell with blast glass |
| 7 The Works | The plant outside at dusk |
| 8 The Control Room | A gallery above the hall: the genius's instrument wall |
| 9 Turnaround | The plant in shutdown: scaffolds, blinds, permits on the vessels |
| 10 Hydraulics | The pump house |
| Career | The plant from the gallery, seasons and years |

## Decisions (phase A)
- **Slice = L00 Night Shift.** First thing the owner plays; ammonia loop; a temperature the player moves; a failure already in the engine (pump trip, interlock, flare). L14 (the brown N2O4 flask, colour = equilibrium) is the next showcase, cut from phase A.
- **The gantry in front of the glass is cut.** It hid the plant outside. Light from it stays as fill.
- **Integrated GPUs default to Compat**, not High (measured 28 ms vs 76 ms).
- **Four flows that assert the 0.9 console in L00** (console, fix1, fix2, instruments) run with `CB_LOOK2=0`; their assertions are unchanged. The slice's L00 is covered by `look2_flow` and by `layout_flow` (which runs with the slice on).
- **Hot steel, not a lamp.** After the critique the shell emission, the converter's red light and the flare light were cut: at the trip the shell reads as hot red-cast steel; the catalyst beds (x-ray) carry the bright heat.
- **The world stages the two story beats** (camera to the cooler and pump when the water trips; to the flare through the glass when the interlock fires). `CB_STAGE=0` turns it off for fixed screenshots.

## Risks
- **Building in a realistic hall.** Most levels place and pipe units on a grid. The hall needs a "drafting floor" mode (a projected grid and ghost equipment) that keeps the look. Not in the slice; it is the largest phase-B cost.
- **Fidelity vs our means.** No artists; procedural geometry plus CC0 textures. The bar is a good modern indie sim, not a big studio.
- **Performance on low tiers.** The compat tier must stay playable on the Deck and phones; tested under Xvfb only so far.
- **Readability.** A realistic scene can bury the teaching. The anchored readouts and the diagram carry the numbers; the world carries the feeling.
- **Two looks at once** until phase B ends (the slice level in LOOK2, the rest in 0.9).

## Cost to bring the whole game to this look (estimate)
| Work | Agent hours |
|---|---|
| Realistic model library for the ~25 engine unit types (ports, footprint fit, live states), replacing the 0.9 low-poly models | 25-35 |
| The drafting floor: placing and piping units in the hall in 3D (projected grid, ghosts, pipe routing on racks); the genius's blueprint table (raised after Mateo's critique) | 35-50 |
| Scenes: bench and glassware (ch1, ch3 incl. L14 colour), boiler house, reactor cell, plant at dusk, control gallery, turnaround dressing, pump house, Career view | 55-65 |
| Instruments and screens in the new UI language (equilibrium window, Semenov, X-T staircase, heat ledger, loop panel, boards, notebook, brief, end card, Works map, title, pause, settings) | 30-40 |
| Performance (merge ~1,350 draw calls, MultiMesh bolts and rungs, bake procedural shaders to textures, LOD) and a Steam Deck run | 10-15 |
| QA: layout and text-floor flows per scene, pad pass, shots per level, critiques | 15-20 |
| **Total** | **170-225** |
About 50-60 Sonnet builder sessions plus about 10 Opus review sessions; with our shared 5-hour limit, roughly 12-16 windows if EQUILIBRIUM has the slot alone. Asset gaps: textures for aluminium cladding, glass-lined enamel, refractory brick and grating; no CC0 models fit our equipment (procedural stays the plan); all sound (motor hum, pumps, flare roar, steam) is missing.

## Critique (phase A, independent, scored before the fix pass)
| Critic | Scores | Strongest point |
|---|---|---|
| Sigrid Halvorsen, art director | materials/light 4, place/scale 3, composition 4, UI 6, consistency 5, overall 4 | No establishing shot of the hall; panels bury the world; wrong materials per object; the failure read as pink plastic |
| Dagny Voss, fun critic | fun 4, clarity 6, tension 4, return-tomorrow 2, genius 3 | One dial, no cost: any late turn wins and the plant returns to its starting numbers |
| Mateo Arriaga, game designer | fantasy 4 | A handsome diorama with a night operator; the verb is a 2D widget and the coach gives orders; the drafting floor is under-costed and is the centre of the fantasy |
Fixed once (commit after a9280bd): establishing view, no cards during the brief or wide view, staged beats, handwheel on the cooler, dial vs outlet on the cooler card, frozen Approach row dropped, materials (flat paint, finer steel, muted yellow, hot steel not pink, round gauges, grey bench). Not fixed, and why: the dial has no cost, the coach instructs, no second fault, no score per run (all level design or engine text: phase A keeps the engine and level unchanged; they go to the phase-B gate); no sound (later layer); the drafting floor (phase B; Mateo's view that it is under-costed is accepted: raise it to 35-50 h). Not re-scored after the fix pass.

## Round 2 (owner not yet replied; one more pass on the same branch)

Scope from the studio manager, in order: the fantasy (L14 private lab), panels off the world, light and composition, the low tier, fix1 and fix25.

**L14 The Brown Gas, the private lab (look2/flask_lab.gd).** A tall hall with polished panels, a gallery, glassware racks, benches with distillation glass, a coil and a glass column. The hero is a glass gas cylinder with a screw piston on a lit dais, drawn 1.5x so it reads (the HUD carries the true litres). Copper heating coil, a cooling coil, a gauge on an arm, a V handwheel on the crosshead, a T wheel on the console, a frosted dewar of liquid N2O4 with cold vapour, an argon bottle, a fume hood.
- The brown is the engine's NO2 concentration at the flask outlet (y_NO2 P / R T), relative to the notebook flask. Absorbance a = 1 - exp(-1.1 c). Turning V moves the piston and darkens the gas at once by V_old / V_new; RUN gives the new equilibrium. Measured in the capture: 1.00, 2.00 at the turn, 1.78 after the run, 0.67 with argon at constant P.
- Temperature does not shift this flask. L14 uses the book's fixed K (book_K; src/sim/units/lab_flask.ts line 28), so T changes only the gauge. The heater glows above 400 K and the cooling coil frosts below 285 K, but the colour does not fake a shift. A temperature-driven shift needs the level on real K: phase B.
- No liquid inside the cylinder: the engine treats the flask as all gas. Liquid shows only in the feed dewar.
- The slice closes the 0.9 paper notebook; the brief and the Call Kp input live in the HUD.

**Panels.** Readouts are small tags (dot, name, one value, a leader). One card opens on hover, pick or camera focus. The equilibrium diagram docks top-right and enlarges on click. The brief sits lower-left. The camera row is gone (keys instead).

**Control in the world.** L00: drag the lit handwheel on the cooler; release commits the set point; the HUD dial mirrors it. L14: drag the V wheel on the crosshead and the T wheel on the console; RUN commissions. Both worlds emit control_changed; the HUD commits it exactly as the dial does.

**Light and composition (L00).** The opening frames the converter as the hero: a cool key from above through haze, sodium high-bays with visible cones, a wetter floor. The red purge line that crossed the opening is grey and out of frame. Outdoors: tower leg rings and lips, column platforms, caged ladders, risers and beacons, tank stairs and girders (MultiMesh).

**Low tier (Radeon iGPU in the Ryzen 9 9900X, 2 CU, compat, 1280x800).**

| View | avg ms | p95 ms | fps |
|---|---|---|---|
| L00 opening | 26.6 | 28.3 | 37.6 |
| L00 outside | 18.3 | 18.3 | 54.7 |
| L14 opening | 25.1 | 25.8 | 39.9 |   (after the compat fill light; 20.6 ms without it)

Traded on compat: no SDFGI, SSR, SSIL, SSAO, volumetric fog or shadows; distance fog instead; no reflection probe; far omni lights off (emissive bulbs stay); outdoor structure hidden; particles at 30 %; 3D at 60 % with FSR, HUD at full resolution. Phase A was 30.0 ms at the same view.

**fix1_flow and fix25_flow.** Cause: both start levels in the saved mode (user://settings.cfg last_mode). They were written in engineer mode. With a saved "learner" they fail, deterministically, at every tag back to v0.4.0 with the current toolchain (Godot 4.7.2 since 11-01, Node 26.8.1 since 10-24, core f63c22e unchanged). In learner mode the L00 plant survives the test's own cooler set point (won at tick 95, no trip, so no 100x flow drop), and on L25 the coach gives its own catalyst words because the step lines up with the next checklist row (the aligned rule in src/engine/queries/level.ts, same commit as the test). Fix: both pin CbSettings.last_mode = "engineer" (persist is already off, so the user's file is untouched); assertions unchanged. Open item for phase B: fix25's coach check is vacuous in engineer mode (no coach there) and contradicts the aligned rule in learner mode; it needs a designer's call, not a quiet edit.

**Tests.** 44 of 44 Godot flows OK, look2_flow 49 checks (L00 and L14), layout_flow 0 failures. Engine (src/) unchanged against master.

**Evidence (round 2).** docs/look2/r2-*.jpg and docs/look2/flask-shift-10s.mp4 (book, halve V, run, argon at constant P, on the 4090 at 1080p, 30 fps).

**Critique (round 2, new shots only, scored once).**

| Critic | Score | Phase A | Strongest point |
|---|---|---|---|
| Sigrid (art) | 5 | 4 | L00 reads as a real plant but in uniform amber haze; L14 is a stage in a black void, not a boy's lab; vessels wear the same blotch noise |
| Mateo (design) | 4 | - | Still an exam: "Exam Bridge", a textbook problem, a coach giving orders, a +/- form that beats the wheels; fixed K makes the heater a dead verb |

Fixed after scoring (one pass): heater band moved below the glass and a light box put behind the cylinder (Sigrid: brown only reads against white); NO2 coverage curve for linear blending (the gas was faint); compat fill light on the dais (L14 compat was near black); brief above the command panel at 1280x800 (that overlap in her shots predates the fix).
Not fixed, for phase B: Mateo's fantasy and control points (retitle and reframe L14 as the player's own question, wheels and a RUN lever as the only controls, a twin reference flask, real K so heat drives the colour, open challenges that add apparatus to the hall); Sigrid's material pass (steel and cladding instead of blotch noise, a real fired heater), a darker L00 night, an establishing L14 view with real depth and fewer neon strips.

**Not done.** The "dial has no cost" level-design finding is for the phase B gate. Real-mouse drags and hover expansion are tested by synthetic events only. The L14 end card and retry were not played through.

## Phase B (11-22 to 11-23): round 3, chapter 3 in the new look, the release

Lead: Ingrid Solheim (Game Lead). One helper at a time; critics once.

### Decision records

**D-B1. L14 becomes "Two Flasks", the player's own experiment (Mateo, round 2 critique).**
Decided: the form is retired. The player works the wheels (T, V), a RUN lever, an argon valve and a piston clamp in the 3D world. A twin flask stands beside it at the book's numbers. The flask uses real N2O4 data (NIST-JANAF), so heating darkens the gas. The book's K is used only for the Call-Kp. Win: the three Le Chatelier tests (halve V; argon at constant V; argon at constant P). Stars: the Kp call; finding the book's temperature (T* = 406.5 K, where the real flask reads the book's 9.15 bar).
Why: the round 2 build was an exam with a form that beat the wheels, and with a fixed K the heater did nothing.
Disagreed: Priya (PM) wanted to keep fixed K and the HUD fields to save time. Overruled: the coordinator's order requires real K and wheel-only controls.
Engine: src/levels/l14.ts. Tests moved on purpose in ch3.test.ts and f25_truth.test.ts; EQ-NC-024 now runs on the twin.

**D-B2. L00's dial has a cost.**
Decided: the cooler's controller is slow on this loop, 1 % of its 150-1500 K range per second (13.5 K/s). A turn made too late trips the interlock, and the night is lost (`spec.lost`, with a retry).
Why: in round 2 a turn at any time won the level.
Calibration (seed 1003, 650 K turn): learner mode is saved up to about 58 s and is at Critical from about 46 s; engineer mode is saved up to about 38 s and trips from about 42 s. Pinned in levels.test.ts.

**D-B3. fix25 follows Mateo's decision.**
Learner mode: the checklist line shows while a part row is open. After the pipes, the coach points at a packed bed with "catalyst" text. Engineer mode: no coach (`_engineer_quiet` asserts it). No test checks nothing.

**D-B4. Chapter 3 is the released new-look chapter (Priya).**
L10-L13 keep the classic build view as a "drafting table". Once commissioned, the player's own flowsheet stands in a hall (look2/gen_world.gd): one model per unit type and pipes on a rack. Beds and converters glow by outlet temperature: dark below light-off, white past the sinter limit. Boilers steam. B (pad X) flips between the two views, and a banner says which view is showing. L14 is the full new look.
Chapter 3 opens from the start and has its own title-screen strip. The Works Map labels each chapter NEW LOOK (00 and 03) or classic.
Why: one whole chapter, played end to end, beats five half-converted ones.
Cut, and written here: a 3D build mode for L10-L13. The hall is a view, not an editor.

**D-B5. L00's catalyst lights off at 643 K (Anjali, domain).**
Anjali found that the engineer-mode save needed an inlet near 450 K, about 190 K below light-off. The converter now carries L13's light-off rule (Tmin 643 K), and the expert saves at 650 K.
Star 2 changed from "never Critical" to "keep the catalyst lit: cooler not below 370 C". Engineer mode now spends time at Critical even at the best lit set point; the test asserts zero Critical in learner mode only.
Goldens: no trajectory golden moved (`src/__golden__/trajectories.json` is untouched).

**Texture fix (coordinator).** Mipmaps and VRAM compression for every 3D texture, with normal maps as RGTC. Set in project.godot `[importer_defaults]` and in the tracked `.import` files. The screen-space roughness limiter is on (0.35). AA per tier: ultra MSAA 2x + TAA; high FSR2 0.77; compat FSR1 0.6 + FXAA. `godot/tests/textures_flow.gd` fails on regression (56 checks).

**Anjali's chemistry fixes (L14).**
- Test 3 counts only at the flask's own no-argon pressure, within 0.5 %. A 20 bar argon run is a pressure change, and the tests now say so.
- The piston draws the engine's volume.
- The lesson says the book's 9.15 bar is invented; real N2O4 reads 8.83 bar(a).
- The colour curve is called "fraction absorbed", with k = 1.1 chosen for legibility.
- The twin's gauge and NO2 come from the engine.

**Naledi's framing fixes.**
- The clamp holds the flask's own pressure at the current wheels. Her finding: one stored value broke the coached order. look2_flow now drives that order through the world's controls.
- RUN flushes debounced wheel turns.
- Why? asks for a prediction instead of giving the answer.
- bar(a) is explained.
- L00's cue is the CW PUMP lamp, not a sound the build does not have.
- Not done: hiding Why? until a test has run. The predict-first wording does the same job.

**Pad.** D-pad left/right picks a world control (a ring marks it, and a line names it and its value). Up/down turns a wheel. A pulls RUN, works the valve or the clamp, or opens the keypad for the Call box. LB/RB step the camera presets; the sticks and triggers move the camera. X flips the views in chapter 3. godot/tests/pad3_flow.gd drives all of it with real joypad events.

## Phase C (11-23): 0.11.0

### Decision records

**D-C1. L14's win is finding the book's flask, with ten runs (Mateo, carried over).**
- **Goal:** the 1 L flask, with no argon and the clamp on, reads the book's 9.15 bar within 0.5 % (T* = 406.5 K).
- **Lab time:** ten runs. The tenth run without the find loses ("Lab time is up").
- **Stars:** the find; all three Le Chatelier tests (they are the instruments now, not the goal); the Kp call.
- **Coach:** a "find" step after the tests ("bracket it: one run too cold, one too hot, then split the gap").
- **HUD:** shows "Runs left: n of 10", amber at 3 or fewer.
- **Tests:** ch3.test.ts and f25_truth.test.ts changed on purpose.
- **Not done:** gating each run behind a "darker or lighter?" prediction.
- **Disagreed:** Priya wanted this moved to 0.12, to spend the layer on first contact. Overruled, because the coordinator ordered it for this layer, and it is engine and HUD work that does not compete with the chapter 1 art.

**D-C2. Chapter 1, The Bench, is the next chapter in the new look (Priya).**
- **Why:** it is what a player meets right after L00. Chapter 2 is reachable only through chapter 1 (PREREQ {2: 1}), so a new-look chapter 2 would sit behind classic screens.
- **How:** it reuses GenWorld (the drafting table plus the hall). New models: the burner (with the blower folded in), the stack, the flue analyser and the cylinder feeds; a QC-lab setting.
- **Strongest case against (Priya's own):** a bench mole balance is the least spectacular thing we have. Her answer: lit burners in L02 and L03, with the flame following duty.
- **Cut:** a 3D build mode; a separate blower model.
- **Priya's gate:**
  1. A fresh persona wins L00 and L01-L04, once pad-only and once with a mouse.
  2. The drafting table works by pad, with a joypad flow test, and the silent failed drags get a regression test.
  3. The burner flame follows duty, and the analyser reads O2 and CO2 in the world. Sigrid scores the chapter 1 hall at least 6.
  4. Sounds for commission, flame, trip and win. No human has listened; this is said plainly instead of naming a listener.
  5. The printout appears within 3 s of GOAL MET, or shows progress.

**D-C3. L00's light-off rule and a save at or above 650 K (Anjali's model note) are verified, not rebuilt.**
- **Where it was built:** D-B5 (0.10.0) built both. The converter's light-off is `L00_LIGHTOFF = 643` K.
- **Star 2 (`catalystLit`):** the current T and the lowest set point both stay at or above 643 K.
- **The save:** dialling 650 K saves the plant in Learner up to about 58 s, and in Engineer up to about 38 s.
- **Tests that hold it:** `l00_lowset.test.ts` and the 650 K calibration in `levels.test.ts`. Both pass in 0.11.0.
- **This layer:** nothing new to build.

**D-C4. Chapter 1 shares the process hall; there is no separate QC-lab room in 0.11.0.**
- **What ships:** L01-L04 join the drafting table and the generated hall (`GEN_LEVELS`), and the Works Map marks chapter 1 as new look.
- **New models (`gen_world.gd`):**
  - The burner box, with the forced-draft blower folded in and a flame that follows the outlet temperature.
  - The stack, with a sampling platform and the flue analyser cabinet. Its screen reads the engine's own stack composition: `y_O2`, `y_CO2`, `y_SO2` and `y_CO` in mol %, newly exposed in `INFO_KEYS`.
- **Why one room:** the burner house and the boiler house (L02, L03) are hall jobs. A bench QC lab for L01 and L04 would be a second room, built and lit from nothing.
- **Cut, written here:** the QC-lab room, for a later layer.

**D-C5. The hall flip moves from pad X to R3 (right stick press).**
- **Why:** the drafting table by pad uses X to turn a part. On a gen level, Look2 took X first, so the table could not be played by pad there.
- **The new binding:** R3 shows the hall. While the hall is up and the table hidden, X also returns to the table.
- **Tests:** pad3_flow changed on purpose. It now also checks that X on the table does not flip.
- **Strongest case against:** R3 is hard to discover. The banner names it ("B or pad R3 (right stick press): the hall").

**D-C6. The L14 T wheel steps 1 K by pad and by scroll (it was 5 K).**
- **Why:** with D-C1 the goal is the book's flask, and only 406 K (-0.28 %) and 407 K (+0.24 %) read 9.15 bar within 0.5 %; 405 K is -0.82 %. At 5 K steps from 400 K a pad player could not win.
- **Tests:** pad3_flow changed on purpose: two steps up is now 402 K, not 410 K. look2_flow now reaches the goal with six pad turns.

**D-C7. Root causes of the load-sensitive tests (order item 6). The tests are made robust, and no assertion is loosened.**
- **engine.test "commission time p95 < 25 ms":**
  - **Cause:** it timed the wall clock. Under a parallel suite the worker is descheduled, and the wait was counted (57 to 936 ms seen).
  - **Fix:** it now times this thread's CPU (`process.threadCpuUsage`). The bound is still 25 ms.
  - **Evidence:** in the same full-suite run, wall p95 was 51.6 ms and CPU p95 was 6.0 ms.
- **pad_build_flow (new this layer):**
  - **Cause:** in a full flow run it failed 71 checks. It passed alone, under a 30 % CPU quota, and beside copies of itself, so the cause is not slowness. Another game's session was serving a machine-global virtual Xbox pad (core/qa/pad.py, uinput, "Microsoft X-Box 360 pad"). Every Godot process sees it, so with pad input on, the other session's presses landed in the flow.
  - **Fix:** `scripts/flows.sh` sets the SDL ignore list for the pad's ids. pad_build_flow and pad3_flow check that no joypad is connected, and fail loudly naming it if one is.
  - **Evidence:** without the list, pad3 fails on that check with ["Xbox 360 Controller"]. With it, both pass.
- **build_guide_flow:** not explained yet.
  - **What is known:** it failed only in full flow runs (L26: the Call it tap did not open the keypad, then a cascade). It passed alone, under a 25 % CPU quota, and three copies in parallel. It passed in today's full run.
  - **Ruled out:** the virtual pad, because pad input is off in that flow and the core drops joypad events then.
  - **Next:** the check message now names the control under the cursor when the tap misses, so the next failure says what took the click.

**D-C8. L14's lab time drops from ten runs to six, shared with the tests (Mateo's critique, changed by me).**
- **Why:** Mateo scored L14's tension at 3. The playtester found the flask in two runs. The start reading plus "hotter reads higher" make ten runs a stroll, so nothing in the level forced a decision.
- **Mateo's number was five.** Five makes full stars demand a first-try T*: a baseline, three tests and then one shot at the find.
- **Six** leaves one bracketing miss for a full-star player. A careless player has to choose between the tests star and the find.
- **Tests:** ch3.test.ts and f25_truth.test.ts changed on purpose. The any-order test now fits its proof in six runs; the expert solver uses five.
- **Not done:** Mateo's cut of the three test lines from the L14 checklist. They stay, because they are a star's instructions.

**D-C9. L14's job needs one argon test on record as well as the book's reading (Naledi, against Mateo).**
- **Naledi (severe):** after D-C1 and D-C8 the win was a one-dial bisection on T with no equilibrium idea in it. The tests cost runs, so a learner chasing the win had good reason to skip them, and the end card did not teach them.
- **Mateo's opposite proposal:** cut the three test lines from the checklist.
- **Decision:** I side with Naledi. The game exists to teach, and her gate keeps Mateo's tension: one argon test plus at most five runs to find T*.
- **How it works:**
  - `jobDone` = the book's flask AND argon at constant V or at constant P on record, in either order.
  - A find without an argon test says "Now show why" and names the test.
  - The coach's argon steps are not skipped until the job is done, and the "why" step is skipped when fewer than two tests ran.
  - The lesson now states the three Le Chatelier outcomes. The dead goal strings are removed.
- **Tests:** ch3.test.ts adds "the find alone does not win" and "a T-only bisection loses at run six". f25_truth.test.ts changed on purpose.

## 0.12 (art, text, flaky flows)

**D-12-1. The hall's hero camera stands on the hero's side of the pipe rack (Sigrid's re-score: L03 2.5, "the camera sits inside a stack rail").**
- **Cause:** the 0.11 hero view always looked from the rack side, with the eye at about 3.1 m, between the rack's two levels. L03's burner stands behind the rack, so a beam filled the frame.
- **Now:** in front of the rack, the camera is low and on the open side. Behind the rack, with the wall close, it takes a raised three-quarter view from the open side; the sight line passes about 0.6 m over the rack.
- **Hero choice:** levels with no glowing unit (L04) frame their reactor.
- **Other art changes in the same pass, worst first from Sigrid's list:**
  - the burner's fan set is one machine on a skid: volute, outlet duct, flanged throat, finned motor, coupling guard;
  - the stack is weathered steel with weld seams, plate seams, a heat tint, soot and anchor bolts;
  - the hall floor's noise contrast is halved;
  - the crane's "orange cube" is a hook block on visible twin ropes.
- **Commit note:** these changes went into commit 7b20d75 under the helper's notebook message: it staged the whole tree. Helpers now stage by path.
