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
