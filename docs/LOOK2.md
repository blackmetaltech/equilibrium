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
| RTX 4090 (Forward+, PRIME offload; nvidia-smi lists the godot process) | Ultra | - | 4.8 ms avg, 5.0 p95 (GPU 2.1) | 5.0 ms avg, 5.6 p95 (GPU 3.2) |
| Radeon iGPU in the Ryzen 9 9900X (2 CU, RADV) | High | 76 ms | - | - |
| same | Compat | 28 ms | - | - |
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
- **The shell glow is capped at dull red.** A bare vessel at about 620 °C glows dull red in the dark, not orange-white; the catalyst beds (x-ray) carry the brighter heat.

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
| The drafting floor: placing and piping units in the hall in 3D (projected grid, ghosts, pipe routing on racks) | 20-30 |
| Scenes: bench and glassware (ch1, ch3 incl. L14 colour), boiler house, reactor cell, plant at dusk, control gallery, turnaround dressing, pump house, Career view | 55-65 |
| Instruments and screens in the new UI language (equilibrium window, Semenov, X-T staircase, heat ledger, loop panel, boards, notebook, brief, end card, Works map, title, pause, settings) | 30-40 |
| Performance (merge ~1,350 draw calls, MultiMesh bolts and rungs, bake procedural shaders to textures, LOD) and a Steam Deck run | 10-15 |
| QA: layout and text-floor flows per scene, pad pass, shots per level, critiques | 15-20 |
| **Total** | **155-205** |
About 45-55 Sonnet builder sessions plus about 10 Opus review sessions; with our shared 5-hour limit, roughly 12-16 windows if EQUILIBRIUM has the slot alone. Asset gaps: textures for aluminium cladding, glass-lined enamel, refractory brick and grating; no CC0 models fit our equipment (procedural stays the plan); all sound (motor hum, pumps, flare roar, steam) is missing.
