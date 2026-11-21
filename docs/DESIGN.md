# EQUILIBRIUM: game design document (v0.1)

> "Run the plant that feeds the world."

| | |
|---|---|
| Slug / repo | `equilibrium` (core as `core/` submodule) |
| Android id | `in.ixaxaar.cobanana.equilibrium` · engine port 47903 · Xvfb `:240-:259` |
| Stack | cobanana-core deterministic TS engine (Node sidecar / nodejs-mobile) + Godot 4.7 GDScript front-end |
| Teaches | Class 11-12 Chemistry (NCERT XI ch 1 Some Basic Concepts, ch 5 Thermodynamics, ch 6 Equilibrium; XII ch 3 Chemical Kinetics; rationalised 2023+ numbering, old numbering XI ch 1/6/7, XII ch 4), JEE Main/Advanced and NEET; first- and second-year chemical engineering (material and energy balances, reactors, separations, recycle, process safety) |
| Audience | JEE/NEET aspirants (15-18), ChemE undergrads, Steam sim/puzzle players (Opus Magnum, Factorio, SpaceChem) |
| Status of this doc | Build-ready, **reviewed 2026-11-09** (see `REVIEW.md`; build plan in `BUILD-PLAN.md`). User decisions of PROGRAM.md (neutral `global` region pack, US$, international standards, online leaderboards, English-only with externalised strings, region packs) are applied; the original India-specific content is preserved as the draft `in` region pack in **§11**. Section numbers are referenced by tests and tickets ("§3.4"). Where a value says *calibrated*, the number here is the design intent and `scripts/calibrate-levels.ts` pins the final threshold from the solver bot (§9.6). |

### Key decisions (one line each; details in the section named)
| Decision | Choice | § |
|---|---|---|
| Thermo data | NIST WebBook Shomate (NASA TM-4513 where NIST has none); validated against JANAF to 0.01 kJ/mol | 3.3, 4.1 |
| Thermo detail levels | Rigorous (Cp(T)) default · Textbook (constant ΔH, ΔS) · Book data (problem's own constants, exam bridges) | 3.3 |
| Equation of state | Ideal gas everywhere + a Pitzer virial non-ideality gauge (no effect on results in v0.1; ≤ 7 % NH₃ error at 200 bar documented) | 3.3, 4.1 |
| Equilibrium | Stoichiometric extent formulation, log residuals; Brent for one reaction, damped Newton for 2-3; not Gibbs minimisation | 3.4 |
| Kinetics | Literature rate laws evaluated with the engine's own K(T) so rates vanish exactly at equilibrium (second law by construction) | 3.5, 4.3 |
| Flowsheet solver | Sequential-modular, tear streams, bounded Wegstein, Broyden fallback, structural accumulation pre-check | 3.6 |
| Reactor integration | RK4 with step doubling, backward-Euler switch when stiff; CSTR steady states by scan + Brent, chosen by simulated start-up | 3.5 |
| Dynamics | Quasi-steady network + true ODEs for reactors/relief vessels; dt = 1 plant-s; automatic time dilation on alarms | 3.9 |
| Failures | Every solver returns a coded result with a templated, number-filled teaching message; nothing throws | 3.10 |
| Prices | 2023 USD (CEPCI 797.9, latest verified), US$ display everywhere; Turton bare-module costs; prices, emission limits and benchmarks are **region-pack data** (`global` default) | 4.6, 4.7, 11 |
| Region packs | Chemistry, thermo, kinetics, units and solvers are region-independent (`src/data`, `src/sim`). Currency + formatting, prices, emission/regulatory limits, standards labels, setting/characters/places, exam-bridge sets live in `src/regions/<id>/`; v0.1 ships `global`; `in` is a preserved draft | 11 |
| Leaderboards | Online histograms in v0.1 via `cobanana-scores`; `src/verify.ts` = core `makeVerifier(GAME)` (pure `verify(levelId, solutionCode) → {ok, metrics, reason, ticks, ruleset}`); solution codes are core `CB1` codes carrying the ruleset id `equilibrium:<region>@<packVersion>.<rulesetVersion>` | 8.8 |
| Strings | English only in v0.1; every player-facing string externalised (`src/locales/en/*.ts` via core `@core/i18n`, pack flavour in `RegionPack.strings`); no string literals in `src/sim` | 8.9 |
| World | Isometric 3D plant, drawers over it, Equilibrium Window + balance-beam Q/K gauge as the signature readouts; every level names an in-world **hero readout** and a **juice moment** (§2.7); commissioning plays a 3-second start-up cinematic | 2.7, 5 |
| Opening | **L00 Night Shift** cold open: a running ammonia loop, a cooling-water trip, 90 seconds of real tension before any teaching (§2.6) | 2.6 |
| Scope | 29 levels (L00 + 28) in 7 chapters; **22 must-ship** (L00-L16, L18-L20, L24, L25), 7 stretch; exam bridges are optional side nodes on the Works map; 78 textbook oracles + dual-implementation science fixtures | 2.6, 9, 10 |

How to read it: §1-2 are what the player does, §3-4 are the rules and the data (the equations *are* the game), §5-6 are what it looks like and how you touch it, §7 is how it teaches, §8 is the code shape, §9 is how we prove it is right, §10 is what ships first. Read §3 and §9 before writing any engine code.

---

## 1. Pitch, fantasy, hook

### 1.1 Pitch (one paragraph)
Half the nitrogen in your body passed through a Haber-Bosch reactor. In EQUILIBRIUM you inherit **Kestrel Bay Works**, a tired 1970s chemical complex on a fictional salt-flat coast (the `global` region pack's setting, §11), and bring it back to life one plant at a time: a sulfur burner, a contact-process acid plant, an ammonia loop, a methanol loop, a distillery. You place real units (compressors, packed beds, flash drums, heat exchangers), pipe them together, and set temperatures, pressures and flows. **Every number on screen comes from real thermodynamics and kinetics**: K(T) from NIST data, Temkin-Pyzhev rates on iron, Raoult's law in the flash drum, an energy balance that closes to the watt. Then you run the shift: the cooling-water pump trips, the catalyst ages, the gas you were sold carries argon, and the reactor temperature starts to climb.

### 1.2 Fantasy
You are the shift engineer standing between 200 bar of hydrogen and a crater. The plant is alive: pipes glow with the colour of what flows in them, the converter shines dull orange at 480 °C, the cooling tower breathes, the flare flickers when you purge. The control-room console beeps, a beacon turns amber over the second bed, and you have ninety seconds to decide whether to open the quench or cut the feed. When it goes right, a ticker shows tonnes of fertiliser that will feed a district; when it goes wrong, the post-incident report shows you exactly which curve you crossed.

### 1.3 The hook: turn the knob, watch the curve move
Every reactor carries a live **Equilibrium Window** (§5.4): conversion versus temperature, with the equilibrium curve (thermodynamics: where the reaction *could* go) and the rate band (kinetics: how fast it gets there), and your operating point riding on them. Nudge the temperature up and the point slides right; the rate band climbs, the equilibrium curve falls away (exothermic: Le Chatelier), and somewhere between them there is a best temperature you find with your thumb before anyone tells you its name. Minute three of the game is that discovery. Minute ten is the **staircase**: one adiabatic bed of SO₂ oxidation stalls on the equilibrium line at 70 %, so you add a cooler and a second bed and watch the operating line zig-zag up the curve to 97 %, exactly the diagram in every reaction-engineering textbook, except you built it.

Why it is not a spreadsheet (the #1 risk, §10.4):
- **The world is the interface.** An isometric 3D plant fills the screen; drawers slide over it and never replace it (GIGAWATT lesson). Units glow, steam, frost, shake and alarm; pipes pulse with flow and carry species colour.
- **Time and tension.** Design is calm (paused, reversible); the **shift** is real time with events, alarms, ISA-style priority tones and a Semenov runaway that you can watch building.
- **Failure is spectacular and explained.** Relief valves pop and roar, a runaway CSTR shakes and vents, a loop with no purge visibly greys with argon until the compressor stalls. Then the Why panel tells you, with your numbers, what happened (§7).
- **The stream table exists but is optional.** Engineers can open it; nobody is forced through it. Every number in it is also shown in the world (pipe tooltip, unit card). In Learner mode the Data drawer is not even offered until L05; it unlocks as "the control-room log book".
- **Every level has a hero readout in the world and a juice moment** (§2.7): the thing you watch is a gauge, a glow, a colour, a beam or a plume on the plant, never a cell in a table. Commissioning is a 3-second start-up cinematic (valves crack open, pipes fill with species colour from feed to product, motors spin up, the product counter rolls) and a solve that fails stops the cinematic at the unit that failed, with that unit flashing.
- **Tension from minute one.** L00 is a cold open on a live plant in trouble; chapter 1 levels end with a 30-second "first run" (no events) where the plant visibly runs and the goal meter fills or does not.
- **Hard rules for the build** (asserted in tests/QA, §9.10-9.11): no goal is checkable only in the Data drawer; at most 3 KPI chips in the HUD; every Call-it is entered on an in-world gauge chip; knobs in Inspect are diegetic (rotary dial, valve handwheel, slider styled as a control-room fader) with the number on the dial.

### 1.4 Why it is shareable
- **Histograms per level** (Opus Magnum style) on cost (US$ per tonne), energy (GJ/t) and emissions (t CO₂e/t or kg SO₂/t). Your bar is marked. **v0.1 histograms are online and real** (`cobanana-scores`, §8.8): the server re-runs your solution code through the same deterministic engine, so every bar is a verified plant. Offline, the game shows the last cached histogram; only when no data exists at all does it show a fallback sample of simulated engineers, labelled as such in the chart title.
- **Near-miss replays**: every run records a 60-second ring buffer of the dynamic state. When a reactor gets within 10 % of its trip temperature, or a relief valve lifts, the Report offers a replay: the plant camera, the Semenov plot (heat generated vs heat removed) and the temperature trace, with the moment of closest approach marked ("interlock tripped 0.4 s before the ignition point"). Export as GIF/MP4 (desktop) or a 6-second clip (phone).
- **Plant card**: a postcard render of your plant with its KPIs and a real-world benchmark ("34.2 GJ/t NH₃: best practice ≈ 28, thermodynamic floor ≈ 21"). One button, PNG.
- **Daily Shift** (v0.2): the same seeded event sequence for everyone, one level, one attempt.

### 1.5 Session shapes
| Platform | Typical session | Shape |
|---|---|---|
| Desktop (mouse+kb) | 30-90 min | 2-4 campaign levels, or one Engineer-mode optimisation chase on the histograms; sandbox builds |
| Steam Deck (controller, 1280x800) | 20-45 min | 1-3 levels; the shift phase is designed for the pad (triggers = fine knob, shoulder = cycle units, A = acknowledge alarm) |
| Phone (touch, 2424x1080 landscape) | 5-12 min | one level or one shift; every level's first-pass solution fits on screen without panning; flowsheets capped (§3.11) |

A level's **first pass** is designed to take 4-8 minutes (design 2-4 min, shift 2-4 min at 1x). Optimising for ★★★ and the histogram is open-ended.

---

## 2. Loops, modes, campaign, levels

### 2.1 Core loop (one level)
```
 BRIEF ──▶ DESIGN ──▶ COMMISSION ──▶ READ ──▶ (TUNE ↺) ──▶ SHIFT ──▶ REPORT ──▶ (OPTIMISE ↺ | NEXT)
 card      place units,  steady-state   world +     knobs,      real time,   stars,
           pipe ports,   solve; loop    Equilibrium  re-commis-  events,      histograms,
           set feeds,    "fills"; beam  Window, Why  sion        alarms,      Why, replay,
           Call it       settles        panel                    you act      plant card
```
- **Design** is paused and reversible (undo/redo). Commissioning is instant (≤ 20 ms solve) and can be repeated freely: the tune loop is "change a knob → commission → read the curve", which is where the learning happens. Commission results are not scored; only the shift and the final design are.
- **First run** (L01-L04, L07, L09): a 30-second run of the commissioned plant at cruise with no events, so the plant visibly works, the product counter rolls and the goal meter fills (or a vent roars). No player input needed; it can be skipped.
- **Shift** (L00 and levels from L05 on; L05 is the first full shift): 8 plant-hours compressed to about 4 minutes when quiet (cruise: 1 real s = 2 plant min), automatically slowing to *watch* (1 real s = 10 plant s) on High alarms and to real time on Critical alarms so that a 60-second runaway plays out in 60 real seconds (§3.9); speeds ×1/×4/×16 and pause on top. A seeded event table fires 2-4 events per shift. The player responds with setpoint changes (ramped by actuators), acknowledgements and trips. The steady-state network re-solves around them, reactors and vessels evolve dynamically (§3.9). The shift is where operating judgement and safety are taught and where idle play loses.
- **Report**: stars, goal checks, three histograms, the Why panel, the near-miss replay if any, plant card export.

### 2.2 Secondary loops
1. **Optimisation chase** (Opus Magnum): every level has three metrics with histograms; ★★★ needs the level's primary metric at the "Chief Engineer" threshold. Engineers come back to shave $/t or GJ/t.
2. **Call it** (prediction): one quantity per level, optional, graded with the oracle tolerance (§7.4). A personal "Called it" streak counter; exam bridges require it for ★★★.
3. **Codex collection**: entries unlock from what you meet (unit placed, failure seen, event survived). Counting toward Engineer rank.
4. **Leaderboards**: per level, per metric, per mode, within the same ruleset (§8.8). "Top 10 %" badges on the Works map node; a personal-best ghost bar on the histogram.
5. **Incident file**: each distinct failure type you trigger (runaway, catalyst sintered, loop accumulation, relief lift, emission breach, explosive mixture) is recorded once with its replay. Collecting them is a quiet nudge to explore failure deliberately (productive failure).

### 2.3 Modes
**Learner** (scaffolded: coach, auto-Why, interlock assist, gentler events, costs never fail a goal), **Engineer** (rigorous, costs and emissions can fail goals, player designs interlocks, full events, histograms meaningful), **Sandbox** (all units and species, any feed, events optional, no goals; export stream table as CSV; phone caps still apply). Details in §7.6. Mode can be switched between levels; stars record the mode (★ earned in Learner are shown hollow-gold; Engineer solid).

### 2.4 Meta-progression: the Works map
The Works map is the whole complex in 3D. Each level is a site; completing a chapter **brings a plant back to life on the map** (lights, steam, a ship at the jetty) and lays a pipeline to the next (sulfur burner steam → acid plant; acid plant steam → ammonia compressor drive; ammonia → nitric acid). Exam-bridge levels (L04, L09, L14, L18) are **side nodes** next to their chapter: optional for progression (the critical path never forces an exam problem), counted for Engineer rank and marked with a book icon for students who want exam practice. Unlocks: units and catalysts (per level), Codex entries, cosmetic plant liveries (paint schemes, signage) for ★★★ sets, and **Engineer rank** (Trainee → Shift Engineer → Senior → Process Engineer → Plant Manager → Chief Engineer) from total stars. No currency carried between levels (avoids the economy-balancing trap GIGAWATT fought for weeks); each level has its own budget and prices.

Characters (voices for briefs, coach and the Why panel; never more than two lines at a time). Names, portraits and voice lines are **region-pack data** (§11); these are the `global` pack's cast, deliberately internationally neutral:
- **Dr. Mara Quinn**, chief engineer, mentor. Dry, exact, quotes numbers. ("A catalyst is a faster road, not a different destination.")
- **Tomas Brandt**, night-shift supervisor, 31 years on the site. Practical sayings, warns about events. ("When the cooling water goes quiet, you have about two minutes.")
- **Victor Hale**, plant manager. Money and deadlines. ("Every bar of pressure is a line on my electricity bill.")
- **Dr. Noor Haddad**, safety and environment officer. Sober about incidents; owns the emissions limits and the incident file.

### 2.5 Campaign chapters mapped to the syllabus
| Ch | Title | Plant / setting | Syllabus (NCERT 2023+) | ChemE | Levels |
|---|---|---|---|---|---|
| 1 | The Bench | QC lab and pilot skid; the old boiler house | XI ch 1 Some Basic Concepts: mole, molar mass, stoichiometry, limiting reagent, % yield, empirical formula; gas laws & Dalton (old XI ch 5) | molar vs mass flow, atom balance, extent | L01-L04 |
| 2 | Fire | sulfur burner and waste-heat boiler; the furnace | XI ch 5 Thermodynamics: ΔH, ΔHf°, Hess, ΔU vs ΔH, Gibbs | energy balance, heat duty, adiabatic temperature, heat integration | L05-L09 |
| 3 | The Wall | the ammonia converter (equilibrium), the shift converter, the acid converter, the lab's N₂O₄ vessel | XI ch 6 Equilibrium: K, Q, Kp/Kc, ΔG° = −RT ln K, Le Chatelier (T, P, concentration, inerts), degree of dissociation | equilibrium conversion vs T, multi-bed staging | L10-L14 |
| 4 | Speed | the same converters with real catalysts; the lab H₂O₂ rig | XII ch 3 Chemical Kinetics: rate law, order, Arrhenius, half-life, catalysis | packed-bed kinetics, light-off, optimum temperature | L15-L18 |
| 5 | The Loop | ammonia synthesis loop, methanol loop, distillery | (applies all of the above) | recycle, purge, inert build-up, flash (Raoult), distillation, azeotrope | L19-L23 |
| 6 | Containment | the batch/CSTR house, the acid plant's stack, the nitric plant | XII ch 3 (Arrhenius sensitivity), XI ch 6 (removing product shifts equilibrium) | runaway (Semenov), multiple steady states, relief, DCDA, explosive limits, N₂O | L24-L27 |
| 7 | The Works | integrated ammonia plant from natural gas | everything | heat integration, benchmarks vs world best practice | L28 |

---

### 2.6 Levels (v0.1: 28)

**Conventions for every level.**
- **Stars**: ★ goal met. ★★ goal met plus the level's *operating* condition (usually: no Critical alarm and no High alarm longer than 60 plant-s in the shift; for design-only levels a secondary design condition). ★★★ the level's *primary metric* at or better than the **Chief Engineer** threshold = expert-persona best × 1.03 (or ÷ 1.03 for maximised metrics), pinned by calibration (§9.6); on exam bridges ★★★ = **Called it** within the oracle tolerance.
- **Histograms**: three metrics per level (the primary first). Distributions are seeded by the simulated-engineer population (§9.6) until online data exists.
- **Numbers** marked ≈ are design intent computed with the verified data in `research/levels_calc.py`; the calibration script recomputes and pins them. "Reference solution" is what the solvability bot builds first.
- **Units** list only what is *new* or *available* in the palette for that level; feeds, product tanks, stack and pipes are always available.
- **Shift**: levels with a shift list their event table (seeded; 2-4 events drawn per shift). Levels without one end at commission.
- **Failure modes** list what the player sees and the gist of the Why text; every one has a test that provokes it (§9.7).
- Event types (14): `cw_pump_trip` (cooling U·A × 0.3), `cw_hot_day` (+8 K coolant), `feed_inerts` (+2-5 % inerts), `feed_surge` (+10 % feed), `blower_wear` (−8 % air), `compressor_trip` (flow → 0, restart 60 s), `catalyst_age` (activity −10 %), `catalyst_poison` (activity −40 %, one bed), `fuel_price` (× 2), `demand_spike` (product price × 1.5 for 1 h), `power_dip` (motors −15 % for 30 s), `analyser_fault` (one analyser reads 0: teaches cross-checking with the atom balance), `steam_header_low` (steam credit −50 %), `valve_fails_closed`.

---

#### Prologue

**L00 · Night Shift** (cold open; must-ship; no prior knowledge needed)
- *Setting*: 02:40, the last night before Kestrel Bay Works was mothballed. A running ammonia loop (pre-built: converter, cooler, flash, recycle compressor, purge) hums in the dark; Tomas is on the radio.
- *What happens*: 20 s of calm (camera drifts over the glowing converter, the cooling tower breathes, the coach says one line: "Tap the converter."). The Equilibrium Window opens over the converter with the balance beam level. Then `cw_pump_trip` fires: amber beacon, two-tone alarm, the converter shell warms toward orange, the beam tilts, the clock drops to WATCH. One coach line: "Bring the converter inlet down" with the dial highlighted. The player turns one dial (inlet temperature, or the quench valve); the operating point slides back down the curve, the beam levels, the alarm clears with the *lock* chord. If the player does nothing for 45 s, the interlock trips the loop (red beacon, relief pop, flare roars) — not a failure screen: Tomas says "That's how she went down last time."
- *Payoff*: either way, a title card: "Kestrel Bay Works closed six months later. You're going to bring it back." → Works map, every plant dark except the QC lab.
- *Teaches* (implicitly): the world is the interface; the Equilibrium Window and the beam are the readouts; alarms, time dilation, one dial changes physics. Nothing is explained yet; every term it shows unlocks its Codex entry later.
- *Engine*: the L19/L20 loop at its reference solution + one scripted event (seed fixed). Uses only must-ship units. *Stars*: none (★ for finishing, so the map has a first star). *Histograms*: none. ≤ 2 minutes. Its reference run is also the title-screen demo (autosave off).

#### Chapter 1 · The Bench (NCERT XI ch 1)

**L01 · Moles, Not Kilograms**
- *Brief (Mara)*: "We need 10 kmol of ammonia an hour for the lab. Feeds are metered in kilograms. Don't vent hydrogen; it's the expensive one."
- *Goal*: NH₃ product 170.3 kg/h (10.0 kmol/h) ± 1 %; vented H₂ + N₂ ≤ 1 % of feed.
- *Teaches*: mole vs mass, molar mass, stoichiometric ratio 1:3 by moles (≈ 4.63:1 by mass).
- *Units*: N₂ cylinder bank (kg/h), H₂ bank (kg/h), Mixer, **Ideal reactor** (100 % of the limiting reagent; the card says so), Product tank, Vent.
- *Knobs*: two feed flows (kg/h).
- *Failure modes*: 1:3 *by mass* (e.g. 42.6 kg/h N₂ + 127.7 kg/h H₂) → vent roars, H₂ wasted; Why: "You fed 63.3 kmol/h of H₂ but only 1.52 kmol/h of N₂…". Wrong total → product off target.
- *Reference*: N₂ 140.1 kg/h, H₂ 30.24 kg/h.
- *Stars*: ★★ vented ≤ 0.1 % · ★★★ Called it: H₂ kg/h needed (30.24 ± 1 %). *Histograms*: feed cost $/h, vented kg/h, actions used.
- *Coach*: full (8 steps: place feed, set flow, place reactor, pipe, commission, read the tank, open the stream row, Why).

**L02 · Air Is Mostly Nitrogen**
- *Brief (Tomas)*: "Sulfur in, SO₂ out. The acid plant wants the gas at ten percent. Don't let sulfur fume out of the stack."
- *Goal*: burn ≥ 99.9 % of 3.21 t/h liquid sulfur (100 kmol/h); burner gas 10.0 ± 0.5 mol % SO₂.
- *Teaches*: mole fraction, air = 21 % O₂ / 79 % N₂ (Ar lumped with N₂ in this level, Codex note), limiting vs excess reagent, % excess air.
- *Units*: Sulfur pit (fixed), Air blower (kmol/h; power ∝ flow), **Sulfur burner** (stoichiometric reactor, complete if O₂ suffices).
- *Failure modes*: air < 476 kmol/h → O₂ limiting, yellow sulfur fume at the stack, Why "Air is now the limiting reagent…"; too much air → SO₂ below spec, blower power wasted.
- *Reference*: air 1000 kmol/h → 10.0 % SO₂, 11.0 % O₂ (110 % excess air).
- *Stars*: ★★ SO₂ ≥ 10.0 % (smaller blower) · ★★★ Called it: O₂ mol % in burner gas at your air flow (± 2 %). *Histograms*: blower kW, SO₂ %, excess air %.

**L03 · The Unknown Fuel**
- *Brief (Victor)*: "The new gas supplier won't tell us what's in the line. Fire the boiler at ten percent excess air anyway."
- *Goal*: flue O₂ corresponding to 10 ± 1 % excess air; no CO in the flue.
- *Teaches*: combustion analysis → empirical formula (C:H from CO₂:H₂O), stoichiometric O₂ from a formula.
- *Units*: Fuel line (seeded identity: CH₄ or C₃H₈ in v0.1), Air blower, Boiler burner, **Flue analyser** (reads CO₂, H₂O, O₂, CO in kmol/h).
- *Mechanic*: a test burn at any air flow shows the analyser; CO₂:H₂O = 1:2 (CH₄) or 3:4 (C₃H₈) reveals the fuel.
- *Failure modes*: rich → CO alarm and sooty flame; lean → stack losses (shown as heat out of the stack, MW).
- *Reference*: C₃H₈ 10 kmol/h → O₂ stoich 50, air 261.9 kmol/h for 10 % excess.
- *Stars*: ★★ ≤ 3 test burns · ★★★ Called it: the empirical formula (formula picker). *Histograms*: test burns, stack loss MW, flue O₂ error.

**L04 · Exam Bridge: The Lab Notebook** (oracle EQ-NC-005)
- *Brief (Mara)*: "Old notebook: 2.00 t of N₂ and 1.00 t of H₂ an hour into the ideal reactor. Before you run it, tell me what comes out."
- *Goal*: build it and Call it: NH₃ kg/h and the limiting reagent.
- *Teaches*: limiting reagent, leftover reagent, the NCERT method.
- *Units*: as L01 (Book data mode off: pure stoichiometry needs no thermo).
- *Answer*: NH₃ 2431.8 kg/h (IUPAC masses; the book, with N = 14 and H = 1, prints 2428.6, inside the 0.5 % tolerance; the Report shows both), N₂ limiting, H₂ left ≈ 281.9 kmol/h (568 kg/h).
- *Stars*: ★ correct build · ★★ limiting reagent named · ★★★ Called it NH₃ ± 0.5 %. *Report*: the NCERT-style working beside the engine's stream table.

#### Chapter 2 · Fire (NCERT XI ch 5)

**L05 · Heat for Free** (first shift)
- *Brief (Victor)*: "That burner throws away eight megawatts. Make steam with it."
- *Goal*: export ≥ 7.0 t/h of 40 bar steam; burner gas 9.5-11 % SO₂; gas to the converter at 420 ± 5 °C.
- *Teaches*: ΔH_rxn from ΔHf° (S + O₂ → SO₂: −296.8 kJ/mol), heat duty Q = ξ·(−ΔH), steam raising Q = ṁ·Δh (Δh = 2361 kJ/kg from 105 °C feed water to saturated 40 bar steam).
- *Units*: + **Waste-heat boiler** (gas outlet T knob, steam pressure LP/MP/HP).
- *Shift* (3 min, events: `feed_surge`, `blower_wear`): burner T climbs; respond with air.
- *Failure modes*: boiler outlet below 400 °C → converter-inlet alarm; SO₂ off spec.
- *Reference*: 10 % SO₂ → burner 931 °C, boiler duty 4.93 MW, 7.52 t/h steam; 11 % SO₂ → 1010 °C, 7.98 t/h.
- *Stars*: ★★ no High > 60 s · ★★★ steam value − blower cost (calibrated). Call it (optional): heat released, MW (8.25 ± 1 %). *Histograms*: steam t/h, net $/h, max burner T.

**L06 · Too Hot to Hold**
- *Brief (Noor)*: "The burner lining is rated 1100 °C. Richer gas means a smaller converter, but don't cook the brickwork."
- *Goal*: maximise burner-gas SO₂ % subject to burner outlet ≤ 1100 °C and O₂/SO₂ ≥ 0.8 (downstream needs oxygen).
- *Teaches*: adiabatic temperature rise, heat capacity, dilution: the same heat in less gas means a hotter gas.
- *Units*: as L05 + optional **dilution air** splitter after the burner.
- *Shift* (`blower_wear`, `feed_surge`): less air → hotter; the lining alarm at 1080 °C (High) and 1100 °C (Critical, lining damage counter).
- *Reference*: 12 % SO₂ → 1087 °C, O₂/SO₂ = 0.75 (fails the O₂ rule); 11.5 % ≈ 1050 °C, O₂/SO₂ ≈ 0.83 → passes. Optimum ≈ 11.6-11.7 % (calibrated).
- *Stars*: ★★ no lining damage in the shift · ★★★ SO₂ % at threshold. Call it: T_ad at 10 % SO₂ (931 °C ± 1.5 %). *Histograms*: SO₂ %, peak T, converter cost.

**L07 · Hess's Road** (oracle EQ-NC-017)
- *Brief (Mara)*: "The coke furnace is down. We have a gasifier (coke to CO) and a CO burner. The process heater still needs 10 MW."
- *Goal*: deliver 10.0 ± 0.2 MW to the heater using the two-step route.
- *Teaches*: Hess's law: C → CO (−110.5) + CO → CO₂ (−283.0) = C → CO₂ (−393.5 kJ/mol); path independence shown in the heat ledger.
- *Units*: Coke feed (graphite), Gasifier (partial oxidation, stoichiometric), CO burner, Process heater (sink of heat), later (★★ condition) the repaired direct furnace.
- *Reference*: coke 91.5 kmol/h (10 MW / 393.5 kJ/mol).
- *Failure modes*: forgetting that the gasifier's own heat must also reach the heater (the ledger shows 2.81 MW lost at the gasifier if uncaptured).
- *Stars*: ★★ capture the gasifier heat too · ★★★ Called it: coke kmol/h (± 1 %). *Histograms*: coke t/h, heat captured %, CO slip.

**L08 · Pay Once** (heat integration)
- *Brief (Victor)*: "Our furnace heats 1000 kmol/h of synthesis gas from 40 to 420 °C and throws the flue out at 900 °C. Fix that."
- *Goal*: heat the stream to 420 °C at minimum total cost (fuel + annualised exchanger), with ΔT_min ≥ 20 K and stack ≥ 120 °C (GAME rule stated in the brief).
- *Teaches*: energy balance on a furnace, heat recovery, LMTD, the area-vs-fuel trade-off (interior optimum).
- *Units*: Fired heater (CH₄), + **Heat exchanger** (area knob) as air preheater or feed-effluent.
- *Shift* (`fuel_price`, `cw_hot_day`): the optimum moves; area is fixed during a shift.
- *Stars*: ★★ ΔT_min respected all shift · ★★★ $/h (calibrated). *Histograms*: $/h, fuel MW, HX area.

**L09 · Exam Bridge: Bomb vs Burner** (oracles EQ-NC-016, EQ-NC-019, EQ-NC-021)
- *Brief (Mara)*: "The bomb calorimeter and the flow calorimeter disagree by five kilojoules. Neither is broken."
- *Goal* (each prediction is an **experiment you run**, resolved by a physical animation: the bomb's thermometer climbs, the flow calorimeter's outlet warms, the furnace reaction "switches on" with a colour change): Call it ΔU of CH₄ combustion (to liquid water) from ΔH (Δn_g = −2: ΔU = ΔH + 2RT ≈ ΔH + 4.96 kJ/mol at 298 K), then run both calorimeters to see the 5 kJ gap appear; then the two optional NCERT-style items (heat from 35.2 g CO₂ formation: −314.8 kJ; ΔU of vaporisation of water: 37.69 kJ/mol).
- *Teaches*: ΔH vs ΔU, constant V vs constant P, Δn_g RT; Gibbs: the "spontaneous above T" card (EQ-NC-021, ΔH = 400 kJ, ΔS = 0.2 kJ/K → 2000 K) as a lab furnace you heat until a reaction "switches on".
- *Units*: lab bench: bomb calorimeter, flow calorimeter, lab furnace (fixtures, not placeable units; the bench is a pre-built scene).
- *Stars*: ★ the ΔU prediction within tolerance · ★★ two of three · ★★★ all three. Side node (optional for progression).

#### Chapter 3 · The Wall (NCERT XI ch 6)

**L10 · The Wall**
- *Brief (Victor)*: "Single pass, twenty percent ammonia out of the converter. Every bar of pressure is on my electricity bill."
- *Goal*: converter outlet ≥ 20 mol % NH₃ from 1:3 syngas (1000 kmol/h, supplied at 25 bar), minimum cost (compression + vessel).
- *Teaches*: Le Chatelier for T (exothermic: lower T, more NH₃) and P (Δn = −2: higher P, more NH₃); K(T) falls about 30× from 400 to 550 °C (1.8×10⁻⁴ → 5.7×10⁻⁶ bar⁻², rigorous) in the Equilibrium Window.
- *Units*: Syngas feed, + **Compressor**, + **Equilibrium converter** (isothermal, "ideal catalyst", active only ≥ 380 °C), vessel rating 100/200/300 bar (cost steps).
- *Data (ideal gas, rigorous K)*: y_NH₃ % at 380 °C: 50 bar 19.0, 100 bar 29.1; 400 °C: 50 bar 15.5, 100 bar 24.7; 450 °C: 100 bar 16.0, 200 bar 25.3; 500 °C: 200 bar 17.5, 300 bar 22.9; 550 °C: 300 bar 16.3.
- *Failure modes*: high T + low P: "the wall" (Why: K numbers); P above vessel rating → relief lifts (Critical).
- *Reference*: 380 °C, ≈ 53 bar, 100-bar vessel. (Boundary optimum at the catalyst's lower limit **by design**: the lesson "colder is better for equilibrium" sets up L15, where kinetics makes it wrong. Listed in the calibration exceptions.)
- *Stars*: ★★ 100-bar vessel · ★★★ $/t NH₃. Call it (optional, Textbook mode): K at 450 °C. *Histograms*: $/t, compressor MW, NH₃ %.

**L11 · The Gas You Were Sold**
- *Brief (Tomas)*: "Three suppliers. The cheap one comes with argon and methane in it. Pick, and make your tonnage."
- *Goal*: ≥ 170 kmol/h NH₃ formed in one pass from 1000 kmol/h of gas at 450 °C (P free up to 200 bar), minimum $/t including gas price. (Pure 1:3 at 150 bar makes 174.8 kmol/h; the 5 %-inert gas makes only 160.6 at 150 bar and needs ≈ 175 bar.)
- *Teaches*: inerts at constant P dilute reactants (shift left); the H₂:N₂ ratio that maximises y is the stoichiometric 3; constant-V vs constant-P inert addition (Codex + a lab side-toggle).
- *Data (450 °C, 150 bar)*: pure 1:3 → 21.2 %; with 5 % inerts → 19.1 %; 10 % → 17.2 %; ratio 2.5 → 21.0 %, 4.0 → 20.7 %.
- *Units*: three Feed contracts (prices differ), Compressor, Equilibrium converter.
- *Stars*: ★★ ≤ 150 bar · ★★★ $/t. *Histograms*: $/t, P, gas cost share.

**L12 · Pressure Does Nothing**
- *Brief (Mara)*: "The shift converter makes hydrogen from CO and steam. Someone asked for a bigger compressor. Humour me and try it first."
- *Goal*: CO ≤ 1.0 mol % (dry) at the shift outlet; minimum steam + compression cost.
- *Teaches*: Δn = 0 → pressure has no effect on equilibrium (K_p = K_c); excess reactant (steam) drives conversion; exothermic → lower T better; catalyst windows (HTS ≥ 320 °C, LTS ≥ 190 °C, LTS costs more).
- *Data* (pure CO + steam feed, which is what the level supplies; the brief's "CO-rich gas" is that feed): at 250 °C (LTS): S/CO 1.5 → 1.03 %, 2.0 → 0.54 %; at 350 °C (HTS): 3.0 → 1.12 %, 4.0 → 0.76 %; at 400 °C even S/CO 4 gives 1.30 % (fails).
- *Units*: CO-rich gas feed, Steam feed (ratio knob), optional Compressor, **Equilibrium converter** with catalyst choice.
- *Failure modes*: raising P "to help" → no change, extra MW (the Why text in §7.3).
- *Stars*: ★★ no compressor · ★★★ $/h. Call it: K at 400 °C (12.3 ± 2 %; Textbook mode accepted ± 5 %). *Histograms*: $/h, steam ratio, CO %.

**L13 · The Staircase**
- *Brief (Noor)*: "Ninety-eight percent of the SO₂ must become SO₃, or it goes up the stack. One bed won't do it."
- *Goal*: overall SO₂ conversion ≥ 98.0 % (single absorption); no bed above 630 °C (catalyst sinters).
- *Teaches*: adiabatic operating line vs the equilibrium curve on the X-T diagram; inter-bed cooling; the staircase; why bed inlets sit just above light-off.
- *Units*: burner gas from L05 (10 % SO₂, 11 % O₂), + **Adiabatic equilibrium bed** ×1-4 (ideal V₂O₅: inactive below 410 °C inlet), + **Inter-bed cooler/boiler** (steam credit).
- *Data (rigorous, 1.2 bar)*: inlet 410 °C each bed: 70.6 → 95.7 → 98.95 → 99.16 %; inlet 420 °C: bed 1 exit 621 °C, 69.1 → 94.7 → 98.6 → 98.9 %; inlet 430 °C: bed 1 exit 626 °C, 67.5 → 93.5 → 98.2 %; inlet 440 °C: bed 1 exit 631 °C (sinters).
- *Failure modes*: one bed → stalls at 69 % on the curve; inlet < 410 °C → "catalyst asleep" (X = 0); bed 1 > 630 °C → permanent activity loss.
- *Reference*: 3 beds at 410-415 °C.
- *Stars*: ★★ 3 beds or fewer · ★★★ $/t acid incl. steam credit. Call it: bed-1 exit T at 420 °C inlet (621 °C ± 1 %). *Histograms*: conversion %, $/t, steam t/t.

**L14 · Exam Bridge: The Brown Gas** (oracles EQ-NC-024, -027, -030, -031, -034; Book data)
- *Brief (Mara)*: "A sealed flask, 13.8 grams of N₂O₄, 400 K. The gauge reads 9.15 bar. What is Kp?"
- *Goal*: Call it Kp (85.9 bar with R = 0.083 L bar mol⁻¹ K⁻¹, as the book uses; ± 0.5 %), then three Le Chatelier predictions by doing: halve the volume (colour darkens at once, then partially fades: Q/K = 2 → shift left); add argon at constant V (no change); add argon at constant P (lighter: shift right).
- *Teaches*: degree of dissociation, Kp from total pressure, Q vs K, inert-gas cases, the colour of NO₂ as a real concentration readout.
- *Units*: Lab flask (V knob, T knob, inert valve, constant-P/constant-V toggle), pressure gauge, colour photometer.
- *Report*: the book's working; and "Real N₂O₄ (NIST-JANAF): Kp(400 K) = 51.1 bar; the flask would read 8.83 bar."
- *Stars*: ★★ all three Le Chatelier predictions · ★★★ Called it Kp.

#### Chapter 4 · Speed (NCERT XII ch 3)

**L15 · Rate vs Ceiling** (the hook level)
- *Brief (Mara)*: "Real iron, real speed. One bed, fixed catalyst load. Find the inlet temperature that makes the most ammonia."
- *Goal*: bed outlet ≥ 10.0 mol % NH₃ at 200 bar with the fixed catalyst load; no catalyst above 550 °C.
- *Teaches*: rate (Arrhenius, Ea = 170.6 kJ/mol) vs equilibrium; the optimum inlet temperature; approach to equilibrium η = X/X_eq.
- *Units*: + **Packed bed** (K1 Temkin-Pyzhev, adiabatic), Feed preheater.
- *Data (kinetics check)*: 400 °C inlet, 0.8 L cat per kmol/h → 10.1 % at 513 °C exit; with ample catalyst the bed reaches equilibrium 11.7 % at 538 °C; low inlet (≤ 360 °C) barely lights; high inlet lowers the ceiling and approaches 550 °C.
- *Shift* (`catalyst_age`, `feed_inerts`): the optimum inlet T drifts up as activity falls (real plants raise inlet T over a catalyst's life).
- *Stars*: ★★ no catalyst over-temperature · ★★★ NH₃ % at outlet (calibrated, interior optimum asserted). *Histograms*: NH₃ %, η, max bed T.

**L16 · Light-off**
- *Brief (Tomas)*: "Below about four hundred degrees that catalyst is asleep. Above six-thirty it dies. Run bed one between."
- *Goal*: bed-1 conversion ≥ 60 % with the given catalyst mass, bed max ≤ 620 °C (High) / 630 °C (damage).
- *Teaches*: light-off as an Arrhenius cliff (V₂O₅ apparent Ea 179 kJ/mol near 420 °C), operating window, feed-effluent preheat and the start-up heater (you need heat to make heat).
- *Units*: + **Packed bed** (K2 Eklund), + Feed-effluent HX, + Start-up heater (fired; expensive per hour).
- *Data (isothermal light-off, K2)*: X = 0.08 at 380, 0.16 at 400, 0.29 at 420, 0.94 at 500 °C; adiabatic from 420 °C inlet → 626 °C, X = 0.698 (equilibrium).
- *Shift* (`feed_surge` raising SO₂ to 11 %, `catalyst_age`): outlet T rises with richer gas; lower the inlet.
- *Stars*: ★★ start-up heater off after commission · ★★★ $/t (calibrated). *Histograms*: conversion, peak T, heater MWh.

**L17 · Faster Road, Same Destination** (stretch)
- *Brief (Mara)*: "Caesium-promoted catalyst lights off forty degrees lower. Twice the price. Does it change where the reaction ends up?"
- *Goal*: bed-1 conversion ≥ 74 %.
- *Teaches*: a catalyst changes the rate (and the light-off) but not K; lower inlet → higher adiabatic-equilibrium conversion (inlet 410 °C → 70.6 %; 380 °C → 75.1 %; 370 °C → 76.5 %, rigorous).
- *Units*: catalyst choice V₂O₅ / Cs-V₂O₅.
- *Stars*: ★★ ≥ 75 % · ★★★ $/t. Call it: "K at 600 °C with the new catalyst" (same as before: 10.0 bar⁻½; the trick question students get wrong).

**L18 · Exam Bridge: The Oxygen Rig** (oracles EQ-NC-038, -042, -036/037, -035; Book data)
- *Brief (Noor)*: "The emergency oxygen generator decomposes peroxide. k = 1.15×10⁻³ s⁻¹. How long until 5 g becomes 3 g?"
- *Goal* (a plant goal first, the exam numbers ride on it): the rig must deliver ≥ the calibrated litres of O₂ within 10 minutes at 25 °C to the emergency header without heating (choose a catalyst: none 75 / I⁻ 56.5 / catalase 8-19 kJ/mol; GAME window for catalase: a fixed 15 kJ/mol in v0.1, labelled). Optional Call-its, each checked by running the rig with a visible burette: the time for 5 g → 3 g at k = 1.15×10⁻³ s⁻¹ (444 s ± 0.5 %); Ea from runs at 293 K and 313 K where the rate quadruples (52.9 kJ/mol).
- *Teaches*: first-order integrated law, half-life, Arrhenius two-point form, catalysts lower Ea.
- *Units*: batch rig (T knob, catalyst slot), gas burette (O₂ volume, ideal gas).
- *Stars*: ★ O₂ delivered · ★★ one Call-it · ★★★ both Call-its. Side node.

#### Chapter 5 · The Loop

**L19 · Close the Loop**
- *Brief (Victor)*: "Fifteen percent a pass is a waste of good hydrogen. Send the unreacted gas back."
- *Goal*: overall N₂ conversion ≥ 97 % and ≥ 8.0 t/h NH₃ from 250 kmol/h N₂ + 750 kmol/h H₂ (no inerts yet).
- *Teaches*: recycle; per-pass vs overall conversion; the recycle mass balance; tear streams (Codex: what the solver does; Learner sees the loop fill).
- *Units*: Equilibrium converter (450 °C, 150 bar), + **Ideal NH₃ separator** (removes all NH₃; refrigeration cost per tonne), + **Recycle compressor**, Mixer.
- *Stars*: ★★ recycle compressor ≤ calibrated MW · ★★★ $/t. Call it: recycle flow kmol/h (± 2 %). *Histograms*: $/t, loop flow, overall conversion.

**L20 · The Purge** (exam bridge: Felder/GATE style, oracle EQ-CE-006 scaled × 10)
- *Brief (Tomas)*: "The cheap gas has argon. Close the loop without a way out and see what happens."
- *Part A (bridge)*: fresh 249 N₂ / 748 H₂ / 3 Ar kmol/h, fixed 25 % per-pass N₂ conversion, total NH₃ removal, 5 % purge. Call it: Ar mol % at the reactor inlet (1.69 % ± 0.5 %).
- *Part B (optimise)*: real equilibrium converter (450 °C, 150 bar) and real flash at −20 °C; choose the purge fraction for minimum $/t (H₂ lost in purge vs recycle compression).
- *Teaches*: inert accumulation, purge, steady state as a balance (Ar in = Ar out), the geometric build-up when the purge is small.
- *Data (equilibrium loop, flash −20 °C)*: purge 0.5 % → Ar 15.2 % at inlet, H₂ lost 1.2 %, loop 3945 kmol/h, 8.41 t/h; 1 % → 8.8 %, 2.1 %, 3426, 8.33 t/h; 2 % → 4.8 %, 4.0 %, 3117, 8.17 t/h; 5 % → 2.1 %, 9.1 %, 2807, 7.72 t/h; 10 % → 1.2 %, 16.5 %, 2530, 7.08 t/h. (Direct substitution needs ~2400 passes at 1 % purge: the Wegstein requirement in §3.6 is not optional.)
- *Failure modes*: no purge → `NO_EXIT` before solving, with the Ar arithmetic; tiny purge → `ACCUMULATION` hint with the extrapolated steady state.
- *Stars*: ★★ Part A correct · ★★★ Part B $/t (calibrated interior optimum, expected ≈ 1-3 % purge). *Histograms*: $/t, purge %, H₂ loss %.

**L21 · Cold Enough** (stretch)
- *Brief (Mara)*: "The separator isn't magic. Colder takes more ammonia out, but refrigeration costs."
- *Goal*: ≥ 8.0 t/h NH₃ at minimum $/t with a real flash (Raoult: y_NH₃ = P_sat/P; P_sat −20 °C 1.90 bar, 0 °C 4.29, +20 °C 8.57 bar), the kinetic converter from L15 and the purge from L20.
- *Teaches*: vapour pressure, Raoult's law, flash, NH₃ recycled lowers the per-pass driving force; refrigeration COP.
- *Units*: + **Flash drum** (T, P), + Refrigeration chiller (COP from §3.8).
- *Stars*: ★★ no NH₃ in purge > 3 % · ★★★ $/t. *Histograms*: $/t, separator T, NH₃ in recycle.

**L22 · The Methanol Loop**
- *Brief (Victor)*: "Same idea, different molecule. Copper catalyst, cooled tubes, and it hates anything above 280."
- *Goal*: ≥ X t/h crude methanol (calibrated, ≈ 2 t/h scale), Cu catalyst never above 280 °C (sintering), carbon efficiency ≥ 85 %.
- *Teaches*: multiple reactions (CO₂ hydrogenation + reverse WGS), stoichiometric number SN = (H₂ − CO₂)/(CO + CO₂) ≈ 2, cooled reactor and hot spots, recycle + purge, crude flash.
- *Units*: Syngas (H₂ 70 / CO 10 / CO₂ 5 / inerts 15 %, 70 bar), + **Cooled tubular reactor** (K3; boiling-water coolant T knob 230-270 °C), Flash at 40 °C, Purge, Recycle compressor.
- *Data*: 250 °C, 70 bar, isothermal: equilibrium y_MeOH ≈ 9.9 %; cooled tube hot spot ≈ 298 °C at the default coolant (too hot: the level's tension); adiabatic stalls at +61 K.
- *Shift* (`feed_inerts`, `catalyst_age`, `cw_hot_day`).
- *Stars*: ★★ no sintering · ★★★ $/t. *Histograms*: $/t, hot spot T, carbon efficiency.

**L23 · Spirits** (stretch)
- *Brief (Noor)*: "The distillery makes fuel ethanol from molasses. The fuel blenders pay {price.fuel_ethanol} a litre. They want ninety-nine point five percent." (`{price.*}` / `{limit.*}` placeholders are filled from the region pack; `global`: $0.55/L)
- *Goal*: ≥ calibrated kL/day of 95 % (v/v) ethanol; Part B attempts 99.5 % and must hit the wall.
- *Teaches*: fermentation stoichiometry (0.511 g/g max), yeast temperature window, distillation, the ethanol-water azeotrope (model 94.9 wt %, measured 95.6), why fuel ethanol needs a different separation (Codex: molecular sieves).
- *Units*: **Fermenter** (batch; K8; T, batch time), beer well, **Column** (shortcut + NRTL), steam.
- *Data*: 150 g/L glucose at 32 °C → 90 % used in 22.5 h, 69 g/L ethanol; 42 °C stalls, 45 °C kills the yeast.
- *Failure modes*: `AZEOTROPE_LIMIT`; `YEAST_KILLED` after a `cw_pump_trip`.
- *Stars*: ★★ no yeast loss in the shift · ★★★ $/L. *Histograms*: $/L, kg steam/L, batch h.

#### Chapter 6 · Containment

**L24 · Runaway**
- *Brief (Noor)*: "Propylene glycol reactor. It has two personalities: lazy at 28 °C and productive at 117 °C. Between them is a cliff. The cooling pump is old."
- *Goal*: produce ≥ calibrated kmol PG over the shift; reactor never above 140 °C (vessel design temperature; relief at design pressure).
- *Teaches*: multiple steady states (27.6 °C stable, 63.1 °C unstable, 117.0 °C stable), ignition by warming the coolant above 47.4 °C then cooling back (hysteresis), Semenov heat generation vs removal, loss-of-cooling drift (−70 % U·A → ≈ 152 °C, +20 K in 49 s), interlocks and relief.
- *Units*: **Jacketed CSTR** (K7; liquid full and **pressurised to 6 bar(g)** so the PO/methanol/water charge stays liquid at 117 °C — stated on the unit card; design pressure 10 bar(g), relief set 10 bar(g); V 0.10 m³, 5 m³/h, U·A knob via coolant flow, coolant T knob), + **Trip interlock** (variable, set point, action: cut feed / full coolant / dump), + Relief valve.
- *Shift* (`cw_pump_trip` guaranteed once, `cw_hot_day`, `feed_surge`): time dilation drops to real time on the first Critical.
- *Failure modes*: never ignites (stays at 3 % conversion: "the reactor is on its lazy branch"); runaway to 152 °C → relief lifts or containment loss (v0.1 relief model for this liquid-full vessel: the relief lifts when T reaches 140 °C, a temperature-equivalent set point standing in for the charge's vapour pressure reaching 10 bar(g); GAME simplification, named on the card and in the Codex; containment loss if T > 160 °C with the relief undersized or isolated); trip set too low → nuisance trips (production lost).
- *Stars*: ★★ no relief lift · ★★★ $/kmol with safety margin ≥ 15 K (calibrated). Near-miss replay always offered. *Histograms*: production, peak T, trips.

**L25 · The Last 0.3 Percent**
- *Brief (Noor)*: "The new limit is {limit.so2_standard} kilograms of SO₂ per tonne of acid. Ninety-eight percent will not do." (limits are region-pack data, §11)
- *Goal*: ≤ {limit.so2_standard} kg SO₂/t H₂SO₄ (`global`: 2.0 kg/t, US NSPS; ≈ 99.7 % overall; basis: per tonne of 100 % H₂SO₄ actually produced), 98.5 % acid product.
- *Teaches*: removing a product shifts equilibrium (Le Chatelier by absorption), double contact double absorption, why SO₃ is absorbed in 98 % acid not water (acid mist), the emission ↔ conversion identity (97 % → 20.2 kg/t; 99.7 % → 1.97 kg/t).
- *Units*: kinetic beds (K2) ×4, coolers, + **Intermediate absorber**, Final absorber, Stack analyser.
- *Data (ideal-catalyst bound)*: 3 beds at 420 °C (98.6 %), absorb, 4th bed → 99.98 %; real kinetics land lower (calibrated, expected 99.7-99.9 %).
- *Failure modes*: water absorber → `WATER_ABSORBER_MIST`; emissions alarm.
- *Stars*: ★★ ≤ {limit.so2_strict} kg/t (`global`: 1.3 kg/t ≈ 99.8 %, lower end of EU BAT for existing sulfur-burning DCDA) · ★★★ $/t. *Histograms*: kg SO₂/t, $/t, steam export t/t.

**L26 · Inside the Envelope** (stretch)
- *Brief (Noor)*: "Ammonia burns in air between fifteen and twenty-eight percent. We run at ten. Run the gauze hot enough for NO, and keep the N₂O down."
- *Goal*: NO yield ≥ 95 % at the gauze, NH₃ in air ≤ 11 % (never in the flammable envelope), N₂O ≤ calibrated kg/t with abatement.
- *Teaches*: flammability limits, adiabatic gauze temperature from the NH₃ fraction, selectivity vs temperature, N₂O as a greenhouse gas (GWP 273), NO → NO₂ is faster when cold (negative apparent Ea).
- *Units*: NH₃ vaporiser, Air compressor, **Gauze burner** (K9), Cooler-condenser, simplified absorber (fixed recovery to 60 % HNO₃), N₂O abatement.
- *Failure modes*: mixture in envelope → `EXPLOSIVE_MIXTURE` (incident); gauze too cold → N₂ and N₂O instead of NO.
- *Stars*: ★★ N₂O abated · ★★★ $/t HNO₃. *Histograms*: NO yield, kg N₂O/t, $/t.

**L27 · Blocked Outlet** (stretch)
- *Brief (Tomas)*: "If the outlet valve on that drum ever sticks shut, the gas keeps coming. Size the relief."
- *Goal*: survive `valve_fails_closed` on a 30 bar(g) drum receiving 20 t/h of gas: peak pressure ≤ 110 % of design (API allowable accumulation for a single valve), no containment loss, smallest adequate orifice.
- *Teaches*: ideal-gas pressure build-up dP/dt = (RT/V)·ṅ_in, relief valve set pressure, critical-flow capacity (API 520), standard orifice letters (API 526).
- *Units*: Flash drum, Gas feed, **Relief valve** (set P, orifice letter D…T), Flare.
- *Stars*: ★★ smallest letter that works · ★★★ Called it: required orifice area for **this level's case** (20 t/h, set 30 bar(g); ± 3 %; the 1882 mm² figure in §4.5.1 is the unit-test case, not this level's answer). *Histograms*: orifice, peak P, flare load.

#### Chapter 7 · The Works

**L28 · Feed the World** (stretch; capstone)
- *Brief (all four)*: "Natural gas in, ammonia out. The world's best plants use 28 gigajoules a tonne. The average is 36.6."
- *Goal*: ≥ calibrated t/d NH₃ (pilot scale ≈ 100 t/d) with energy ≤ 36.6 GJ/t (IFA 2008 survey average).
- *Teaches*: everything: SMR equilibrium (endothermic, Δn = +2: low P and high T favour it; S/C ratio), shift, CO₂ removal, the loop, purge burned as fuel, steam integration, benchmarks.
- *Units*: all, + **Reformer** (K5, 750-880 °C), CO₂ removal (fixed recovery, GAME energy per t CO₂, labelled), Methanator (fixed).
- *Data*: SMR at 800 °C, 25 bar, S/C 3 → CH₄ conversion 67.3 % at equilibrium.
- *Stars*: ★★ ≤ 33 GJ/t (top quartile) · ★★★ GJ/t (calibrated). *Histograms*: GJ/t, t CO₂/t (BAT 1.6), $/t. Plant card shows the IFA benchmarks.

**Level → oracle map**: L04 EQ-NC-005 · L07 EQ-NC-017 · L09 EQ-NC-016/019/021 · L12 EQ-CE-027 (WGS K) · L13 EQ-CE-030 (SO₂ at 800 K) · L14 EQ-NC-024/027/030/031/034 · L18 EQ-NC-035/036/037/038/042 · L19-L20 EQ-CE-005/006/032 · L21 EQ-CE-007-010 (flash) · L24 EQ-CE-021/022/024 · L06 EQ-CE-011 (adiabatic flame method) · L15 EQ-CE-020 (adiabatic equilibrium method). Each pairing is asserted by `levels/oracle-map.test.ts` (the level's Call-it quantity is computed by the same engine function the oracle exercises).

### 2.7 Level moments: hero readout, juice, clip (fun-critic pass; binding for the front-end)
Every level names what the player *watches* (an in-world readout, never a table cell), the payoff moment that gets sound + motion, and the 10-second clip it should produce. The M2/M3 acceptance check for a level includes a screenshot of its hero readout and a capture of its juice moment (BUILD-PLAN §M3).

| Level | Hero readout (in world) | Juice moment (sound + motion) | 10-second clip |
|---|---|---|---|
| L00 | converter glow + Equilibrium Window + beam | alarm → one dial → beam levels, *lock* chord; or the trip: relief pop, flare roar | the save, or the trip |
| L01 | Molecule Lens over the mixer: blue dumbbells vs white pairs, ratio visibly 1:3 or not | vent roars and the flare burns a nearly invisible blue (H₂ waste); the NH₃ sphere fills with a counter | mass-ratio vent roar → mole-ratio silence |
| L02 | stack plume colour (yellow sulfur fume vs clear) + burner flame | fume vanishes as air crosses 476 kmol/h; blower pitch tracks flow | sweep the air dial, fume flicks off |
| L03 | flue analyser hut lamp + CO₂:H₂O bar pair on the hut | sooty flame clears to blue at the right air | "it's propane!" reveal |
| L04 | product sphere fill + leftover H₂ flare | flare stays lit: the leftover reagent you predicted | prediction stamp ✓ |
| L05 | waste-heat boiler steam plume + t/h counter | first shift: blower wear alarm, steam plume grows when fixed | plume swells |
| L06 | burner brickwork glow (blackbody ramp) vs the 1100 °C ring | lining alarm, glow backs off from white | glow creeping toward white |
| L07 | heat ledger ribbons from gasifier and CO burner into the heater | ribbons add up to the same 10 MW as the direct furnace | two roads, one total |
| L08 | furnace stack temperature + flame size | stack plume shrinks as the exchanger grows | flame shrinking |
| L09 | bomb thermometer vs flow calorimeter thermometer | the 5 kJ gap opens on two needles | needles diverge |
| L10 | Equilibrium Window (curve falls with T, rises with P) + compressor spin | compressor note rises with each bar; NH₃ curve lifts | drag P, curve lifts |
| L11 | Molecule Lens grey argon balls crowding the converter | the cheap gas greys the pipes | grey creeping in |
| L12 | beam stays level when P doubles; compressor power meter climbs | "nothing happened" sting + MW counter | the compressor for nothing |
| L13 | staircase on the X-T diagram, beds glowing per band | each bed added → the zig-zag climbs, chime per step | the staircase |
| L14 | NO₂ brown colour in the flask | halve V: colour darkens then fades (Q/K = 2 relaxing) | flask colour pulse |
| L15 | Equilibrium Window: rate band vs ceiling, operating point | point finds the sweet spot, bed glow peaks | sweet-spot sweep |
| L16 | bed-1 band lighting up past light-off | catalyst "wakes": band ignites bottom to top | the light-off |
| L18 | gas burette O₂ column | catalyst swap: bubbles explode in the sight glass | catalase fizz |
| L19 | loop pipes filling (recycle animation) | loop fills over 1.5 s; production counter jumps | loop filling |
| L20 | argon bar on the atom ledger + loop pipe greyness | no purge: pipes grey, compressor labours then stalls | the stall |
| L24 | Semenov plot over the CSTR + vessel shake | cooling trip → R line rotates, shake, relief roar or the save | near-miss replay |
| L25 | stack plume + kg/t needle vs the limit line | intermediate absorber → needle drops below the line | needle drop |
| Stretch levels | L17 bed glow at lower inlet · L21 frost on the flash drum · L22 tube hot-spot glow · L23 column temperature ladder hitting the azeotrope wall · L26 gauze glow colour vs flammable envelope · L27 pressure needle vs relief pop · L28 the whole Works lighting up | | |

---

## 3. Simulation model

Principle: **the equation is the rule.** Every unit is a pure function from inlet streams + parameters to outlet streams + results, written from a textbook equation, with its own oracle and property tests. Nothing is tuned for fun inside a unit; fun comes from level design (constraints, prices, events).

### 3.1 State variables and units
- Internal units are SI: amount mol, flow mol/s, T in K, P in Pa, energy J, power W, mass kg, time s. Display units are a UI concern (§8.2).
- A **stream** is `{ n: number[] /* mol/s, indexed by the level's active species list */, T, P, phase?: 'V'|'L'|'VL', vf?: number }` (plain JSON: core state is cloned, hashed and saved; no typed arrays in state. Solvers may use `Float64Array` internally and convert at the boundary).
- **Determinism**: every `exp`, `log`, `pow`, `log10` in `src/sim` goes through core `dmath` (fdlibm); no `Math.exp/log/pow`, no `**` (core `determinism.test.ts` enforces it). This matters doubly here: K(T) spans 30 decades and leaderboard verification re-runs the engine server-side (§8.8). Enthalpy, entropy, mass flow, mole fractions, volumetric flow are *derived* (pure functions of the stream), never stored, so they cannot drift.
- Species are indexed by a per-level **active set** (≤ 12, §3.11); the global database is larger (§4.1). All arrays are sized to the active set.

### 3.2 Species database (decision)
Per species: formula and **element vector** (for the atom matrix), molar mass (IUPAC 2021 standard atomic weights: H 1.008, C 12.011, N 14.007, O 15.999, S 32.06, Cl 35.45, Na 22.990, Ar 39.95), phase data, ΔHf°(298.15 K), S°(298.15 K), Shomate coefficients by range, critical constants (Tc, Pc, ω), normal boiling point, ΔHvap at Tb, Antoine constants (with range), colour and display name. Data and provenance are in §4.1; the catalogue file carries a `source` string on every entry and a test asserts it is non-empty.

### 3.3 Thermodynamics (decision: NIST Shomate rigorous + textbook + book-data modes)
**Rigorous (default):** NIST WebBook **Shomate** polynomials for every gas and for the liquids NIST provides (H₂O(l), H₂SO₄(l)); NASA 7-coefficient polynomials (Burcat / GRI-Mech 3.0) where NIST has no Shomate entry (CH₃OH(g), C₂H₅OH(g)); constant Cp with a cited value where neither exists (glucose(s), broth). With t = T/1000:
```
Cp°  = A + B t + C t² + D t³ + E / t²                         [J/(mol K)]
H°(T) − H°(298.15) = A t + B t²/2 + C t³/3 + D t⁴/4 − E/t + F − H    [kJ/mol]
S°(T) = A ln t + B t + C t²/2 + D t³/3 − E/(2 t²) + G                 [J/(mol K)]
```
Molar enthalpy on the **heat-of-formation basis**: h_i(T) = ΔHf°_i + [H°(T) − H°(298.15)]_i, so reaction heats come out of the energy balance automatically and the Hess's-law test is an identity check (§9.3). Liquids without a liquid polynomial: h_l(T) = h_g(T) − ΔHvap(T) with the Watson correlation ΔHvap(T) = ΔHvap(Tb)·((Tc−T)/(Tc−Tb))^0.38. Ideal mixing (no excess enthalpy) except two flagged lumped heats: SO₃ absorption into ~98 % acid and the H₂SO₄ dilution heat in the absorber unit, computed from ΔHf of H₂SO₄(l) vs SO₃ + H₂O(l).
Standard state P° = 1 bar. Outside a polynomial's valid range the value is extrapolated linearly in Cp from the boundary and the unit raises `PROPERTY_EXTRAPOLATED` (info, not failure).

**Textbook mode** (toggle `thermoDetail`): ΔCp = 0, i.e. ΔH°_rxn and ΔS°_rxn fixed at their 298.15 K values, so ln K(T) = −ΔH°/RT + ΔS°/R (integrated van 't Hoff with constant ΔH, as NCERT and most JEE problems assume). Stream sensible enthalpies still use Cp, so energy balances stay closed; only K(T) changes. Exam-bridge levels default to Textbook so book answers match exactly. The Codex and the Why panel quantify the difference (e.g. NH₃ synthesis K(700 K): constant-ΔH 3.18×10⁻⁴ vs with Cp 8.75×10⁻⁵ from the engine's NIST/JANAF data, a factor 3.6; the textbook-table row of oracle EQ-CE-026 gives 3.08×10⁻⁴ vs 8.56×10⁻⁵ because Smith Table C.1 coefficients differ slightly. Oracles carry their own book data; Codex and Report numbers come from the engine).

**Book data mode** (third detail level, exam bridges only): the level supplies the problem's own constants (K at T, or ΔH and ΔS, or a rate constant), and the engine's machinery (extent solver, ICE, integrated rate law) computes the answer. This is necessary because textbook problems often use illustrative data. Example found while designing L14: the NCERT-style N₂O₄ problem (13.8 g in 1 L at 400 K, total 9.15 bar) implies Kp = 85.9 bar, but NIST-JANAF gives Kp(400 K) = 51.1 bar, i.e. a real vessel would read 8.83 bar. The Report shows both: "Book: 9.15 bar. Real N₂O₄ (NIST): 8.83 bar. Textbook problems sometimes use illustrative numbers; the method is what transfers." `thermoDetail` is therefore `'rigorous' | 'textbook' | 'book'`.

**Equation of state: ideal gas everywhere**, with a **non-ideality gauge**: the engine computes Z for each gas stream from the Pitzer-Abbott second-virial correlation (B⁰ = 0.083 − 0.422/T_r^1.6, B¹ = 0.139 − 0.172/T_r^4.2; Kay's-rule pseudo-criticals) and shows a gauge in Engineer mode: green |Z−1| < 0.05, amber < 0.15, red beyond ("ideal-gas results here are approximate"; Codex: fugacity). The gauge never changes results in v0.1; a Peng-Robinson "Real gas" detail level is v0.2 (§10.3). The magnitude of the error at Haber conditions is documented from Larson-Dodge data in §4.1.

**Vapour-liquid equilibrium:** modified Raoult's law y_i P = x_i γ_i P_i^sat(T), Antoine for P^sat, γ = 1 except the **ethanol-water** and **methanol-water** pairs (NRTL with DECHEMA parameters, §4.5.1); ethanol-water NRTL produces the azeotrope wall in L23 at 94.9 wt % (measured 95.6 %). Non-condensables (H₂, N₂, O₂, Ar, CH₄, CO, CO₂ above their Tc) are treated as Henry's-law gases with very small liquid solubility (K = y/x = H_i/P, H from Sander's compilation; default K = 10⁴ where no value is catalogued) so they essentially stay in the vapour; this keeps Rachford-Rice well-posed.

### 3.4 Chemical equilibrium (decision: stoichiometric extent formulation, not Gibbs minimisation)
**K(T)** = exp(−ΔG°_rxn(T)/RT), ΔG°_rxn = Σ ν_i (h_i − T s_i) from §3.3 (rigorous) or from the 298 K values (textbook). Gas activities a_i = y_i P/P°; pure solids and liquids a = 1.

**Solver**: for the reactor's reactions j = 1..R (R ≤ 3, chosen independent by rank of the stoichiometric matrix at data load; a test asserts independence), unknown extents ξ_j, n_i(ξ) = n_i0 + Σ_j ν_ij ξ_j, residuals
```
f_j(ξ) = Σ_i ν_ij ln a_i(ξ) − ln K_j(T) = 0          (log form: well scaled across 30 orders of magnitude of K)
```
- R = 1: f is strictly monotone **increasing** on the feasible interval (ξ_min, ξ_max) where all n_i > 0: over the gas species, df/dξ = Σ ν_i²/n_i − (Δν_g)²/n_tot,g > 0 (Cauchy-Schwarz; condensed species have a = 1 and drop out). **Brent's method** on that bracket (core root finder) is guaranteed to converge; tolerance |f| < 1e-12.
- R ≥ 2: **damped Newton** (core) on ξ with an analytic Jacobian, fraction-to-boundary step limit (keep every n_i ≥ 0.01·n_i(current)), backtracking line search on ‖f‖², initial guess from sequential single-reaction Brent solves. Converge ‖f‖∞ < 1e-10 within 50 iterations; else return the best iterate with `EQUILIBRIUM_NOT_CONVERGED` (never observed in the convergence fuzz target, §9.4).
- Edge cases handled explicitly: a reactant absent (ξ_max = 0 → no reaction, message "no N₂ in the feed"); a product absent and K huge (ξ → bound, solved in log space via the substitution n_i = exp(u_i) near the bound); all species of one side absent.

**Adiabatic equilibrium**: outer Brent on T for g(T) = H_out(T, ξ_eq(T)) − H_in = 0 on [200 K, 2500 K]. g is monotone increasing for both exo- and endothermic reactions (thermodynamic stability), so the bracket always works. Isothermal: duty Q = H_out − H_in reported.

**Le Chatelier is emergent**, never scripted: arrows and explanations are derived from the sign of Δ(ln Q − ln K) caused by the player's change, evaluated by the same functions (property test §9.3).

### 3.5 Kinetics
Rate laws are data (§4.3) with a `form` discriminator: `temkin` (NH₃), `power_rev` (SO₂/V₂O₅ simplified, WGS), `lhhw` (methanol, Vanden Bussche-Froment), `first_order` (H₂O₂, PO hydrolysis), `luong` (fermentation), `gauze_selectivity` (Ostwald). Rules:
1. **Thermodynamic consistency (second law)**: every reversible rate law is evaluated with the engine's own K(T) from §3.4 (not the paper's K correlation) and written so that r = 0 exactly when Q = K and sign(r) = sign(1 − Q/K). Literature pre-exponentials are refitted where needed so that the forward rate matches the paper over its range (fit error reported in §4.3). Property test: no rate law ever moves a mixture past equilibrium.
2. **Arrhenius** k(T) = A·exp(−Ea/RT), optionally in the reparameterised form k = k_ref·exp(−Ea/R·(1/T − 1/T_ref)) to avoid overflow (the stored form).
3. **Catalysts** multiply the forward pre-exponential by an activity a ∈ (0, 1] (ageing, sintering, poisoning reduce a) and define the operating window [T_lightoff, T_max]. Catalysts never change K (asserted).
4. Rates are per kg catalyst (packed beds) or per m³ (liquid CSTR/batch). Rate laws published per volume of catalyst (K1 Temkin: kmol/(m³_cat h)) are converted with the catalyst entry's **bulk density ρ_b** (kg/m³, §4.4; a required field, provenance-tagged); the bed knob is always catalyst mass, and the UI also shows the volume. Level numbers quoted "per L catalyst" (L15) are converted the same way.

**Packed bed (PFR)**: state y = (ξ_1..ξ_R, T) along catalyst mass W:
```
dξ_j/dW = η_eff · a_cat · r_j(n(ξ), T, P)
dT/dW   = [ Σ_j (−ΔH_j(T)) dξ_j/dW − U a_W (T − T_c) ] / Σ_i n_i Cp_i(T)      (U a_W = 0 adiabatic; isothermal: T fixed, duty integrated)
P constant along the bed in v0.1 (pressure drop given as a fixed ΔP parameter at the outlet; Ergun is v0.2, flagged)
```
Integrator: RK4 with step-doubling error control (rtol 1e-6) on [0, W]; if the step size collapses below W/10⁴ (stiffness near equilibrium at high T), switch to **backward Euler** with a Newton solve per step (finite-difference Jacobian, dimension ≤ 4). Budget ≤ 400 rate evaluations per bed. Output also includes the axial T and X profiles (for the bed glow and the Equilibrium Window path).

**CSTR (liquid, jacketed)**: material and energy balances. Steady states are found by scanning F(T) = G(T) − R(T) on 400 points over [T_c − 10, T_c + ΔT_ad + 50], Brent-polishing every sign change, and classifying stability (slope condition dG/dT < dR/dT plus the 2x2 Jacobian trace/determinant for oscillatory instability). **Which** steady state the plant sits on is decided by integrating the dynamic ODE from the start-up state (feed conditions) for 20 τ: commissioning is a simulated start-up, so the lower or upper branch is reached exactly as a real plant would.

**Batch / fermenter**: ODEs in time (RK4, adaptive). Fermenter: biomass X, substrate S, product P, T; Luong product inhibition μ = μ_max·S/(K_s+S)·(1 − P/P_max)^n · f(T).

### 3.6 Flowsheet solving (decision: sequential-modular + Wegstein, Broyden fallback)
**Decision.** Sequential-modular (SM) with tear streams, bounded **Wegstein** acceleration, and a **Broyden** fallback for multi-tear or oscillating loops. Equation-oriented (EO) with a global damped Newton was considered and rejected for v0.1:
1. *Teachability*: SM evaluates units in flow order, exactly how Felder & Rousseau teach balances and how a player reasons ("what leaves the reactor goes to the condenser"). When something fails, it fails **in a unit**, which has a name, a position in the world and a teaching message. EO fails as "Jacobian singular" over 400 unknowns.
2. *Testability*: each unit is a pure function with its own textbook oracles; the flowsheet solver only composes them.
3. *Robustness at our scale*: ≤ 24 units, ≤ 3 tears. Wegstein converges linear recycle-purge loops in 3-6 iterations where direct substitution needs ~ln(tol)/ln(1−p) (≈ 1800 at a 1 % purge, as the cross-check of oracle EQ-CE-006 showed: 0.95 contraction per pass). EO needs good initial guesses for every unknown; SM only for the tears.
4. *Design specs are the player*: EO shines when a spec ("purge so that inerts ≤ 10 %") must be met simultaneously; in this game the player is the outer loop that turns the knob. The few automatic specs (heater outlet T, splitter ratio) are unit parameters, not flowsheet constraints.
5. *Visualisation*: the tear iteration history *is* the "loop filling" animation (§5.4).

**Algorithm** (`flowsheet/solve.ts`):
1. **Validate topology**: every port connected or explicitly a source/sink; no inlet with two pipes; port phase compatibility (pump: liquid; compressor: vapour). Failures → `TOPOLOGY_*` messages naming the unit and port.
2. **Partition**: Tarjan SCCs on the unit graph; topological order of SCCs.
3. **Tear selection** per SCC: smallest set of streams whose removal makes the SCC acyclic. For ≤ 24 units, enumerate subsets of size 1..3 of the SCC's internal streams (≤ C(40,3) = 9 880 DAG checks, cached per topology hash), break ties preferring streams leaving a splitter and entering a mixer (recycle-like, smooth), then fewest active species.
4. **Accumulation pre-check (structural)**: for each SCC and each species entering it, verify an exit exists: an outlet stream leaving the SCC from a splitter, a separator outlet where the species can partition, or a reaction in the SCC that consumes it. If none: fail **before iterating** with `NO_EXIT(species, scc)` → "Argon enters the loop at 0.30 kmol/h and nothing removes it…" (§7.3). This turns the classic purge lesson into a precise, instant message.
5. **Iterate** the tear vector x = (n_1..n_S, T, P) per tear: start from the warm-start solution if the topology hash is unchanged, else zero flow at feed T/P. Two direct-substitution passes, then **bounded Wegstein** per variable every pass: s = (g(x_k) − g(x_{k−1}))/(x_k − x_{k−1}), q = s/(s − 1) clamped to [−5, 0], x_{k+1} = q·x_k + (1 − q)·g(x_k). Converged when max relative change < 1e-9 (flows, absolute floor 1e-12 mol/s), |ΔT| < 1e-6 K, |ΔP| < 1e-3 Pa, and the atom balance of the whole flowsheet closes to 1e-9. Max 300 passes.
6. **Fallback**: if ‖Δx‖ grows for 8 consecutive passes or the sign of Δx alternates for 12 passes (oscillation), restart from the best iterate with **Broyden's good method** on the full tear vector (dimension ≤ 3 × (12 + 2) = 42), initial Jacobian by forward differences (one loop evaluation per column), backtracking line search, 50 iterations max.
7. **Diagnose** failure from the iteration history: monotone growth of one species with near-constant per-pass gain → `ACCUMULATION(species, gain)`; growth of everything → `LOOP_GAIN_GE_1` (e.g. a splitter recycling 100 %); sustained oscillation → `LOOP_OSCILLATING` (usually a reactor with multiple steady states inside the loop; message points at it); a unit failing inside the loop → that unit's message with "(inside the recycle loop)".
8. Store up to 60 tear snapshots for the Learner animation.

### 3.7 Unit operations (v0.1)
| Unit | Params (player knobs in **bold**) | Model | Failure / info codes |
|---|---|---|---|
| Feed | **flow**, composition (level-fixed or **choice of supplier**), T, P, price | source | — |
| Mixer | — | Σ n; adiabatic: solve T from H; outlet P = min(P_in) | `MIXER_PRESSURE_MISMATCH` (info: higher-P stream throttled) |
| Splitter / purge | **split fraction** ∈ [0,1] | same composition, T, P | `SPLIT_RANGE` |
| Heater / cooler | **outlet T** (or duty), utility (steam, fired, cooling water, refrigerant), ΔP | Q = H_out − H_in; utility feasibility (cooling water cannot cool below 35 °C; refrigerant to −33 °C; LP steam heats to 140 °C; fired heater to 900 °C) | `UTILITY_CANNOT_REACH` |
| Heat exchanger (2 streams) | **area** or **hot outlet T**, counter-current | ε-NTU / LMTD with U from §4.4 by service; ΔT_min check | `TEMPERATURE_CROSS`, `DT_MIN_VIOLATED` |
| Compressor | **outlet P**, stages (1-4, intercooled to 40 °C), η_is = 0.75 (level may offer 0.80 at cost) | ideal-gas isentropic: T₂s from S(T₂s, P₂) = S(T₁, P₁) using Shomate S (not constant γ); W = (h₂s − h₁)/η | `COMPRESSOR_LIQUID_IN`, `DISCHARGE_TOO_HOT` (> 200 °C per stage) |
| Pump | **outlet P**, η = 0.70 | W = V̇ ΔP / η (incompressible) | `PUMP_VAPOUR_IN` |
| Valve | **outlet P** | isenthalpic; ideal gas → T unchanged (Joule-Thomson ignored, flagged) | `VALVE_P_RISE` |
| Stoichiometric reactor | **key reactant conversion** (ch 1-2), T or adiabatic | ξ = X·n_key/|ν_key| per reaction in sequence; limiting-reagent check | `CONVERSION_EXCEEDS_LIMITING` (teaching: names the true limiting reagent) |
| Equilibrium reactor | **T** (isothermal) or adiabatic, P from inlet | §3.4 | `NO_REACTANT`, `EQUILIBRIUM_NOT_CONVERGED` |
| Packed bed (PFR) | **catalyst** type, **catalyst mass**, adiabatic/cooled (**coolant T**, U·a), inlet T from upstream | §3.5 | `BELOW_LIGHTOFF` (info), `CATALYST_OVERTEMP` (damage in shift), `BED_STIFF_SWITCHED` (debug) |
| Multi-bed converter | 2-4 beds, **per-bed catalyst mass**, inter-bed **cooler outlet T** or **quench fraction** | chained PFR + cooler/mixer | as above |
| CSTR (jacketed) | **volume**, **coolant T**, **coolant flow** (→ U·A), feed from upstream | §3.5 + dynamics §3.9 | `MULTIPLE_STEADY_STATES` (info), `RUNAWAY` (shift) |
| Batch reactor / fermenter | **batch time**, **T**, initial charge | ODE §3.5 | `YEAST_KILLED` (> 40 °C), `SUBSTRATE_INHIBITION` |
| Gauze burner (Ostwald) | **gauze T** (via NH₃:air ratio and preheat), gauze area | selectivity map NO/N₂/N₂O vs T (§4.3), adiabatic energy balance | `EXPLOSIVE_MIXTURE` (NH₃ in air within flammability envelope, P-dependent) |
| Flash drum / condenser | **T**, **P** (or duty) | isothermal Rachford-Rice: Σ z_i(K_i − 1)/(1 + β(K_i − 1)) = 0, Newton with bracket on β ∈ [0,1] after checking bubble/dew; single phase handled | `ALL_VAPOUR` / `ALL_LIQUID` (info) |
| Distillation column (shortcut) | **light key recovery**, **heavy key recovery**, **R/R_min** (1.05-3), P | Fenske (N_min), Underwood (R_min; for the non-ideal alcohol-water pairs: R_min from the tangent pinch on the NRTL x-y curve), Gilliland (N); reboiler and condenser duties from V = (R+1)D and latent heats | `AZEOTROPE_LIMIT` (spec above the azeotrope: names it), `RECOVERY_INFEASIBLE` |
| Absorber (SO₃ → H₂SO₄) | acid strength (98-98.5 %), **recovery** (≤ 99.95 %) | fixed-recovery unit with heat of absorption | `WATER_ABSORBER_MIST` (choosing water instead of 98 % acid: teaching message on acid mist) |
| Scrubber / N₂O abatement | type | fixed removal fraction, cost | — |
| Boiler / steam generator | steam pressure (LP/MP/HP) | steam make from duty and steam tables (IAPWS-IF97 saturated values tabulated at 3 pressures) | — |
| Stack + analyser | emission limits from level | concentrations, kg/h, kg/t | `EMISSION_LIMIT` (shift alarm) |
| Relief valve | **set pressure**, **orifice size** (API 526 letters D-T) | opens at set P, critical-flow gas capacity W = C·K_d·A·P₁·√(M/(Z T)) (API 520, simplified: K_b = K_c = 1) | `RELIEF_UNDERSIZED` |
| Product tank / sink | spec (min purity) | accumulates; on-spec/off-spec | `OFF_SPEC` |

### 3.8 Energy balance
Every unit's outlet enthalpy follows from H_out = H_in + Q + W (heat-of-formation basis), so reaction heat needs no special handling. The plant-wide ledger sums feeds, products, utility duties and shaft work; the property test requires closure ≤ 1e-6 relative on every solve and every random flowsheet. Utilities convert duties into cost and site energy: fired heat via fuel LHV and furnace efficiency 0.85; steam from boiler at 0.90; electricity for shaft work (motor efficiency 0.95); refrigeration via COP from a Carnot fraction (COP = 0.5 × T_cold/(T_hot − T_cold)); cooling water by duty. Steam raised by the plant is a credit.

### 3.9 Dynamic layer (shift)
Quasi-steady network + dynamic holdups:
- **Network**: re-solved in steady state (§3.6, warm start) only when a boundary condition changes (event, actuator movement, trip). Debounced to ≤ 1 per 5 plant-seconds **and** ≤ 4 per real second; during an actuator ramp the network is re-solved at the ramp's end and at most every 30 plant-s in between, with display lags hiding the steps.
- **Displayed stream values** relax toward the latest steady state with first-order lags τ = holdup / volumetric flow (clamped 5-300 s), so the plant visibly "responds" instead of jumping.
- **Reactors integrate real ODEs**: CSTR (C_i, T, jacket T) and fermenter (X, S, P, T) with **backward Euler** at dt = 1 s (Newton per step, 2-5 unknowns); packed-bed converters as a lumped bed-temperature ODE per bed, ρ_cat·c_p,cat·dT_bed/dt = (T_ss(W) − T_bed)·(ṁ c_p)/(m_cat c_p,cat), whose steady state equals the PFR profile mean, so thermal inertia (minutes) shows during events. Catalyst damage: if T_bed > T_max for > 30 s, activity a decreases (sintering, permanent within the level: a ← a·exp(−k_s·(T − T_max)·dt)).
- **Vessel pressure** for vessels with relief (flash drums, CSTR headspace): dP/dt = (RT/V_gas)·(ṅ_in − ṅ_out − ṅ_relief) (ideal gas).
- **Runaway** emerges from the CSTR ODE: when cooling degrades the R(T) line rotates; once only the upper steady state remains, T climbs toward it; if the upper state exceeds the vessel's limits (or the relief opens) the incident fires. Interlocks are player-placed trips (Engineer) or automatic at 90 % margin (Learner).
- **Shift clock with automatic time dilation.** Plant events span seconds (a runaway gains 20 K in 49 s, L24) to hours (a fermenter batch), so one fixed time scale cannot work. The shift clock runs at **cruise** (1 real s = 2 plant min) while all is quiet, drops to **watch** (1 real s = 10 plant s) when any High alarm is active or dT/dt of a reactor exceeds 0.2 K/s, and to **real time** (1 real s = 1 plant s) on any Critical alarm until it is acknowledged; Learner mode also auto-pauses on Critical. The player's speed buttons multiply the current scale (×1/×4/×16), but cruise speed is capped at ×1 while a Critical is active. The physics step stays dt = 1 plant s at every scale (the front-end requests `tick(n)` at 10 Hz; n is capped at 200, so the fastest effective scale is 2 000 plant-s per real second), so results are identical whatever the speed (property P21). The HUD shows the scale ("WATCH ×10") and a time-dilation vignette.
- Determinism: dt fixed, RNG seeded per level + shift index, events scheduled from the RNG at shift start (so replays are exact; the near-miss replay just re-runs).

### 3.10 Numerical robustness: failures teach, never crash
Every solver returns `{ ok: true, value, diag } | { ok: false, code, unitId?, species?, data, message }`. The message is built from a template per code with real numbers. Catalogue (all must have a template and a test):

| Code | Typical cause | Message gist |
|---|---|---|
| `TOPOLOGY_OPEN_PORT` | an outlet goes nowhere | "Stream from E-101 outlet goes nowhere…" |
| `TOPOLOGY_PHASE` | gas into a pump | "A pump moves liquids…" |
| `NO_EXIT` | no purge for an inert | "Argon enters the loop… nothing removes it" |
| `ACCUMULATION` | purge too small to converge in budget, or a species barely leaves | "Methane builds up 9 % per pass; it leaves only in the 0.2 % purge. Steady state would hold 40 % CH₄ in the loop" (the engine extrapolates the geometric series to report where it would end) |
| `LOOP_GAIN_GE_1` | splitter recycles everything | "Everything that leaves the loop comes back: there is no way out for anything" |
| `LOOP_OSCILLATING` | multiple steady states inside a loop | "The loop flips between two states because R-201 has two possible steady states…" |
| `CONVERSION_EXCEEDS_LIMITING` | asked for more than the limiting reagent allows | "You asked for 100 % of the N₂, but the H₂ runs out at 64 %…" |
| `NO_REACTANT` | missing reactant | "There is no N₂ in the feed to this reactor" |
| `EQUILIBRIUM_NOT_CONVERGED` | pathological multi-reaction case | "The reactor could not settle; showing the best estimate" (never expected; fuzz-tested) |
| `AZEOTROPE_LIMIT` | distillation beyond the ethanol-water azeotrope | "Ethanol and water boil together at about 95 % by mass: no number of trays gets past it" |
| `TEMPERATURE_CROSS` | HX outlet hotter than hot inlet | "Heat flows from hot to cold: the cold stream cannot leave hotter than 380 °C" |
| `UTILITY_CANNOT_REACH` | cooling water asked for −10 °C | "Cooling water arrives at 30 °C: use refrigeration below 35 °C" |
| `PROPERTY_EXTRAPOLATED` | T beyond the polynomial range | info chip, no failure |
| `NUMERIC_GUARD` | NaN/∞ caught | "Something went off-scale in U-104; values reset to the last good state" + automatic bug report in debug builds (should never fire; persona invariant) |

Guards: all logs/exps go through `safeLog`/`safeExp` with clamping; mole numbers floored at 1e-30 inside logs; every solver has an iteration cap and returns its best iterate; no exceptions escape a unit (caught at the unit boundary, converted to `NUMERIC_GUARD`).

### 3.11 Budgets (phone is the binding platform)
| Quantity | Cap | Why |
|---|---|---|
| Units per flowsheet | 24 (sandbox phone), 32 (sandbox desktop); levels ≤ 16 | solve time, screen space |
| Streams | 40 / 56 | — |
| Active species | 12 | tear vector ≤ 42, array sizes |
| Tear streams | 3 | tear search, Broyden size |
| Reactions per reactor | 3 | Newton size |
| Steady-state solve | ≤ 20 ms p95 on Pixel 9a (nodejs-mobile), ≤ 3 ms desktop, for the largest level (L28) | interactive commission and shift re-solves |
| Shift tick (1 s plant time, excluding network re-solves) | ≤ 0.1 ms desktop, ≤ 0.5 ms phone p95 | cruise is 120 ticks per real second (×16: 1920, capped at 2 000 ticks/s by lowering the speed); the engine runs on its own thread (sidecar / nodejs-mobile), budget ≤ 30 % of one core |
| Network re-solves during a shift | ≤ 4 per real second (coalesced), only when a boundary condition changed | an event or setpoint change, never periodically |
| Leaderboard `verify()` | ≤ 2 s CPU (desktop Node) for the longest level including its full 8-h shift replay | server-side re-run (§8.8) |
| Equilibrium Window query | ≤ 15 ms phone (120 T points × equilibrium solve, cached by (P, feed) hash) | drag interaction |
| Memory | engine heap ≤ 64 MB | nodejs-mobile |
A `bench-solve` script runs every level's reference flowsheet 200 times and fails CI on desktop regressions > 30 %; the phone figure is measured in the Pixel pass.

### 3.12 Simplifications (each gets a Codex entry and is visible where it applies)
1. Ideal gas (no fugacity) at all pressures; non-ideality gauge only.
2. Ideal liquid solutions except ethanol-water and methanol-water (NRTL; ethanol azeotrope 0.7 wt % below measured); no electrolyte thermodynamics (acid dilution lumped).
3. Constant pressure along packed beds (fixed ΔP per unit); no Ergun.
4. Effectiveness factor and catalyst activity lumped into one multiplier; no intraparticle diffusion model.
5. Shortcut distillation (Fenske-Underwood-Gilliland), not stage-by-stage.
6. Absorber and scrubbers as fixed-recovery units.
7. Joule-Thomson effect ignored in valves.
8. Ostwald gauze as an empirical selectivity map (mass-transfer-limited, not a kinetic model).
9. Network dynamics quasi-steady with first-order lags; only reactors and relief vessels are truly dynamic.
10. Non-condensable gases barely dissolve (Henry's law, small constants).
11. Textbook mode: ΔH and ΔS of reaction constant (when selected).
12. Costs from 2001-basis correlations escalated by CEPCI (±30 % accuracy class, as Turton states).

---

## 4. Data catalogues

### 4.0 Provenance rules
Every catalogue entry carries `src` (citation or URL) and `conf`, one of:
- `FETCHED`: read in the primary source (or a NIST/JANAF table parsed by script).
- `F2`: read in a fetched secondary source that quotes the primary.
- `SNIP`: seen only in a search-result summary.
- `GAME`: chosen by us inside literature ranges (calibration). It must say so in the Codex.
- `UNVERIFIED`: recalled. **Not allowed in a release build** for any number that a level goal, an oracle or a Codex statement depends on. A test (`data/provenance.test.ts`) fails if a level references a parameter whose `conf` is `UNVERIFIED`.

The research behind this section, with scripts that regenerate every number, is committed beside this document in `design/equilibrium/research/`: `thermo.md` + `thermo.py` (species, K(T), validation against JANAF), `kinetics.md` + `kinetics_*.py`, `costs.md` + `costs_*.py`, `vle_safety.md` + `vle_*.py`, `oracles_ncert.*`, `oracles_cheme.*`, `crosscheck.md`, `levels_calc.py` (the level numbers quoted in §2.6). Implementers port coefficients **by script from those files** (or from NIST directly), never by retyping.

### 4.1 Species (v0.1: 29 core + 4 auxiliary)
Source of ΔHf°, S°, Shomate: NIST Chemistry WebBook SRD 69 / NIST-JANAF 4th ed. (Chase 1998), parsed by `thermo.py`, reproducing the JANAF tables to ≤ 0.01 kJ/mol (H), ≤ 0.012 J/(mol K) (S), ≤ 0.09 J/(mol K) (Cp). K(T) from these agrees with JANAF log K_f to ±0.3 % (298-1000 K). Critical constants from CoolProp reference EOS unless flagged.

| key | phase | M g/mol | ΔHf° kJ/mol | S° J/(mol K) | Tc K / Pc bar / ω | Tb K | Cp source | conf / notes |
|---|---|---|---|---|---|---|---|---|
| N2 | g | 28.014 | 0 | 191.61 | 126.2 / 34.0 / 0.037 | 77.4 | Shomate | FETCHED |
| H2 | g | 2.016 | 0 | 130.68 | 33.1 / 13.0 / −0.219 | 20.4 | Shomate | FETCHED |
| O2 | g | 31.998 | 0 | 205.15 | 154.6 / 50.5 / 0.022 | 90.2 | Shomate | FETCHED |
| Ar | g | 39.95 | 0 | 154.84 | 150.7 / 48.6 / −0.002 | 87.3 | Shomate | FETCHED |
| CH4 | g | 16.043 | −74.87 | 186.25 | 190.6 / 46.0 / 0.011 | 111.7 | Shomate | FETCHED |
| NH3 | g | 17.031 | −45.90 | 192.77 | 405.6 / 113.6 / 0.256 | 239.8 | Shomate | FETCHED |
| NH3(l) | l | 17.031 | via ΔHvap | | | 239.8 | g − ΔHvap (Watson) | ΔHvap from CoolProp (§4.5) |
| H2O | g | 18.015 | −241.82 | 188.83 | 647.1 / 220.6 / 0.344 | 373.1 | Shomate ≥ 500 K; NASA TM-4513 below (NIST Shomate starts at 500 K) | FETCHED |
| H2O(l) | l | 18.015 | −285.83 | 69.95 | | | Shomate (liquid) | FETCHED |
| CO | g | 28.010 | −110.52 | 197.66 | 132.9 / 35.0 / 0.050 | 81.6 | Shomate | FETCHED |
| CO2 | g | 44.009 | −393.53 | 213.79 | 304.1 / 73.8 / 0.224 | (subl. 194.7) | Shomate | FETCHED |
| SO2 | g | 64.058 | −296.84 | 248.21 | 430.6 / 78.9 / 0.256 | 263.1 | Shomate | FETCHED |
| SO3 | g | 80.057 | −395.77 | 256.77 | 490.9 / 82.1 / 0.424 | 317.9 | Shomate | thermo FETCHED; critical consts UNVERIFIED (not used by any goal) |
| S | s/l | 32.06 | 0 | 32.05 | | 717.8 | Shomate (rhombic → monoclinic 368.3 K → liquid 388.4 K) | FETCHED; vapour above 718 K not modelled (burner feeds liquid S at 413 K) |
| H2SO4(l) | l | 98.072 | −813.99 | 156.90 | | ~610 (dec.) | constant Cp 138.9 | CRC via snippet: **verify against CRC before release** |
| NO | g | 30.006 | 90.29 | 210.76 | 180.2 / 64.8 / 0.583 | 121.4 | Shomate | thermo FETCHED |
| NO2 | g | 46.005 | 33.10 | 240.04 | | 294.3 | Shomate | FETCHED (JANAF; NASA gives 34.19: K(2NO+O2⇌2NO2) differs ×2.3 at 298 K; we use JANAF) |
| N2O4 | g | 92.010 | 9.08 | 304.38 | | 294.3 | Shomate ≥ 500 K; Shomate-form fit to JANAF N-032 below | FETCHED (NASA N2O4 inconsistent with JANAF; not used) |
| N2O | g | 44.013 | 81.6 | 220.0 | 309.6 / 72.4 / 0.16 | 184.7 | Shomate | add from NIST in implementation (emission species only) |
| HNO3(l) | l | 63.012 | −174.10 | 155.60 | | 356 | constant Cp 109.9 | CRC via snippet: verify |
| CH3OH | g | 32.042 | −200.94 | 239.81 | 513.4 / 82.2 / 0.565 | 337.6 | NASA TM-4513 (NIST has no Shomate; its ΔHf −205 ± 10 is unusable) | FETCHED (Cantera nasa_gas.yaml) |
| CH3OH(l) | l | 32.042 | −239.50 | 127.19 | | 337.6 | constant Cp 81.1 | FETCHED (NIST compilation) |
| C2H5OH | g | 46.069 | −234.95 | 280.59 | 514.7 / 62.7 / 0.644 | 351.6 | NASA TM-4513 | FETCHED |
| C2H5OH(l) | l | 46.069 | −276.90 | 159.86 | | 351.6 | constant Cp 112.4 | FETCHED |
| C6H12O6 | s (aq in broth) | 180.156 | −1273.3 | 209.19 | | dec. | constant Cp 218.6 | FETCHED (NIST range −1271…−1276) |
| Cl2 | g | 70.90 | 0 | 223.08 | 416.9 / 76.4 / 0.070 | 239.2 | Shomate | FETCHED (sandbox only in v0.1) |
| HCl | g | 36.458 | −92.31 | 186.90 | 324.7 / 83.1 / 0.130 | 188.2 | Shomate | FETCHED (sandbox) |
| C3H8 | g | 44.097 | −104.68 | 270.32 | 369.9 / 42.5 / 0.152 | 231.0 | NASA TM-4513 | FETCHED (L03 unknown fuel) |
| C (graphite) | s | 12.011 | 0 | 5.74 | | | Shomate (NIST graphite) | add from NIST (L07 coke, L09 NCERT carbon problems) |
Plus "broth" and "biomass" pseudo-species for the fermenter (constant Cp of water; biomass CH1.8O0.5N0.2, M = 24.6 g/mol per C-mole, GAME), and NaCl/NaOH (sandbox only). **29 core entries + 4 auxiliary.**

**Non-ideality calibration point** (why ideal gas is acceptable with a flag): ideal-gas NH₃ equilibrium with 1:3 feed vs an SRK fugacity correction (indicative, k_ij = 0): 450 °C: 100 bar 16.0 vs 16.6 % (−4 %), 200 bar 25.3 vs 27.2 % (−7 %), 300 bar 31.8 vs 35.2 % (−10 %). Our levels run Haber at ≤ 200 bar, so the ideal-gas error is ≤ 7 % relative, stated in the Codex and shown by the gauge. (Larson-Dodge 1923-24 measurements could not be retrieved; recalled values are consistent but UNVERIFIED.)

### 4.2 Reactions (v0.1: 14 entries)
Computed from §4.1 (rigorous). Standard state 1 bar; K dimensionless with pressures in bar.

| id | reaction | ΔH°298 kJ | ΔS°298 J/K | K(298) | K(500 K) | K(700 K) | K(900 K) | Δn_g | used in |
|---|---|---|---|---|---|---|---|---|---|
| R1 | N₂ + 3H₂ ⇌ 2NH₃ | −91.80 | −198.11 | 5.43e5 | 9.93e-2 | 8.75e-5 | 1.47e-6 | −2 | ch 1, 3-5, 7 |
| R2 | SO₂ + ½O₂ ⇌ SO₃ | −98.92 | −94.02 | 2.63e12 | 2.58e5 | 286 | 6.68 | −½ | ch 3, 4, 6 |
| R3 | CO + 2H₂ ⇌ CH₃OH(g) | −90.42 | −219.21 | 2.45e4 | 5.82e-3 | 6.07e-6 | 1.18e-7 | −2 | L22 |
| R4 | CO₂ + 3H₂ ⇌ CH₃OH(g) + H₂O(g) | −49.24 | −177.19 | 0.235 | 4.22e-5 | 6.43e-7 | 5.1e-8 | −2 | L22 |
| R5 | CO + H₂O ⇌ CO₂ + H₂ | −41.18 | −42.02 | 1.04e5 | 138 | 9.44 | 2.31 | 0 | L12, L22, L28 |
| R6 | CH₄ + H₂O ⇌ CO + 3H₂ | +206.17 | +214.62 | 1.23e-25 | 8.55e-11 | 2.65e-4 | 1.30 | +2 | L28 |
| R7 | 4NH₃ + 5O₂ → 4NO + 6H₂O | −906.18 | | (irreversible) | | | | +1 | L26 |
| R7b | 4NH₃ + 3O₂ → 2N₂ + 6H₂O | −1267.3 (from §4.1) | | | | | | +1 | L26 (selectivity loss) |
| R7c | 4NH₃ + 4O₂ → 2N₂O + 6H₂O | −1105 (Wikipedia: Ostwald) | | | | | | +1 | L26 (N₂O) |
| R8 | 2NO + O₂ ⇌ 2NO₂ | −114.39 | −146.60 | 2.42e12 | 1.67e4 | 5.48 | 0.063 | −1 | L26 |
| R9 | 2NO₂ ⇌ N₂O₄ | −57.11 | −175.69 | 6.74 | 6.7e-4 | 1.6e-5 | 2.2e-6 | −1 | L14 (exam bridge) |
| R10 | S + O₂ → SO₂ | −296.84 | +11.01 | (complete) | | | | 0 (S condensed) | L02, L05-L06 |
| R11 | SO₃ + H₂O(l) → H₂SO₄(l) | −132.39 | | (complete) | | | | | absorber |
| R12 | C₆H₁₂O₆ → 2C₂H₅OH(l) + 2CO₂ | −67.55 | | (complete) | | | | | L23 |
| R13 | CH₄ + 2O₂ → CO₂ + 2H₂O(g) | −802.30 | | (complete) | | | | 0 | furnaces, L07-L08 |
(R7b, R7c ΔH to be recomputed by the engine from §4.1 once N₂O is added; the oracle tests assert the engine's value.)

Cross-checks against independent literature K correlations (thermo.md §5): WGS +2-3 % vs Callaghan 2006, +4-12 % vs Moe 1962; SMR −5…+9 % vs Xu-Froment (600-1000 K); methanol R3: Graaf 1986 is 11-28 % below thermochemical K, while Graaf & Winkelman 2016 gives 2.07e-3 bar⁻² at 523 K vs our 2.05e-3 (supports ours); Haber: ours 6-12 % above the old Gillespie-Beattie table (the modern JANAF value; recorded in the Codex as a real historical discrepancy). **Decision: the engine always uses its own K(T) from §4.1**; literature correlations appear only in tests as tolerance-banded cross-checks.

Textbook (constant ΔH) error vs rigorous, the number students should see in the Codex: R1 K is +76 % at 500 K, +291 % at 723 K; R3 +70 % / +248 %; R2 only +6 % (its ΔH barely changes with T).

### 4.3 Kinetics (v0.1: 10 rate laws, 8 needed by core levels)
| id | reaction / catalyst | form (engine `form`) | parameters | range | source / conf |
|---|---|---|---|---|---|
| K1 | NH₃ on promoted Fe | `temkin`: r_NH3 = 2k·η·[K_a² a_N2 (a_H2³/a_NH3²)^α − (a_NH3²/a_H2³)^(1−α)], kmol NH₃/(m³_cat h), a_i = y_i P (atm) | k = 8.849e14·exp(−170 560/RT); α = 0.5; η = 0.4 (6-10 mm pellets); K_a² ≡ K_R1(T) converted to atm⁻² (engine K, not Gillespie-Beattie); feed must carry ≥ 1 % NH₃ or r is clamped at a_NH3 = 0.01·a_N2 | 380-520 °C, 100-300 bar | Dyson & Simon, Ind. Eng. Chem. Fundam. 7 (1968) 605, via a converter-optimisation paper (F2). PFR check: 400 °C, 200 bar, adiabatic: 15.8 K per mol % NH₃, reaches equilibrium (11.7 % at 538 °C) and never crosses it |
| K2 | SO₂ on V₂O₅-K₂SO₄/SiO₂ | `eklund`: r = k·√(p_SO2/p_SO3)·(p_O2 − (p_SO3/(p_SO2·K_p))²), mol SO₂/(s g_cat), atm | k = exp(−97 782/T − 110·ln(1.8 T) + 912.8); K_p from engine R2 (atm⁻½); clamp p_SO3 ≥ 0.02 p_SO2 | 420-554 °C fit (light-off 380-420, damage > 620) | Eklund 1956 via arXiv:1412.6486 (F2). Bed 1 at 420 °C, 1.5 bar, 10/11/79: exit 626 °C at X = 0.698 = adiabatic equilibrium (matches plants: 600-630 °C, 65-70 %). Light-off isothermal (W = 2e4 g s/mol): X = 0.03 @ 360, 0.08 @ 380, 0.16 @ 400, 0.29 @ 420, 0.94 @ 500 °C |
| K3 | CH₃OH on Cu/ZnO/Al₂O₃ | `vbf`: Vanden Bussche-Froment LHHW (CO₂ route + RWGS), mol/(kg s), bar | Table 2 constants: √K_H2 = 0.499 e^{17 197/RT}; K_H2O = 6.62e-11 e^{124 119/RT}; K_H2O/(K8K9K_H2) = 3453.38; k′ = 1.07 e^{36 696/RT}; k1′ = 1.22e10 e^{−94 765/RT}; equilibria from engine R4, R5 | 180-280 °C, 15-51 bar (extrapolated to 70 bar; authors report Z = 0.99-1.01) | J. Catal. 161 (1996) 1-10 (FETCHED). Check: 250 °C, 70 bar, cooled tube: hot spot 298 °C; adiabatic stalls at +61 K (equilibrium-limited) |
| K4 | WGS high-T on Fe-Cr | `power_rev`: r = k p_CO^0.9 p_H2O^0.31 p_CO2^−0.156 p_H2^−0.05 (1 − Q/K) | Ea = 111 kJ/mol; k₀ GAME-calibrated (50 % conversion at W = 1000 g s/mol) | 320-450 °C | Hla et al., Appl. Catal. A 353 (2009) form (UNVERIFIED exponents → must be fetched before L28 ships; L12 uses the equilibrium reactor and does not depend on it) |
| K5 | SMR on Ni | `xf`: Xu-Froment (3 reactions) or merged single r_SMR + equilibrated WGS (v0.1 uses merged) | k1 = 4.225e15 e^{−240 100/RT}, adsorption K's in kinetics.md; η = 0.03 lumped | 500-900 °C | Xu & Froment, AIChE J. 35 (1989) 88 via Korean Chem. Eng. Res. 56 (2018) (F2). Check: 800 °C, 25 bar, S/C 3: CH₄ conversion → equilibrium 0.673 |
| K6 | H₂O₂ → H₂O + ½O₂ (lab rig) | `first_order`, Arrhenius | Ea: uncatalysed 75.3, I⁻ 56.5, catalase 8-19 kJ/mol; A chosen so uncatalysed t½ at 25 °C matches the level (GAME) | 10-60 °C | LibreTexts / RSC (F2) |
| K7 | Propylene oxide + H₂O → propylene glycol | `first_order` CSTR | k = 16.96e12 e^{−E/RT} h⁻¹ with **E = 75.36 kJ/mol exactly (32 400 Btu/lbmol × 2.326; the rounded 75.4 moves the unstable state by 0.35 K and breaks the fixture)** (not cal/mol: a common misreading); game CSTR uses ΔH × 3 variant (−251 MJ/kmol) for multiplicity, V = 0.10 m³, Q = 5 m³/h, C_A0 = 2.114 kmol/m³, ρc_p = 3.57 MJ/(m³ K), UA = 10 MJ/(h K) → steady states 27.6 °C (stable), 63.1 °C (unstable), 117.0 °C (stable); coolant-only ignition at 47.4 °C; −70 % UA from the hot state drifts to ≈ 152 °C (+20 K in 49 s) | 10-180 °C | Fogler (k, E, ΔH via CEN587 lecture notes, F2); the ×3 exotherm is Fogler's own multiplicity variant; reactor sizing GAME |
| K8 | Glucose → ethanol (S. cerevisiae) | `luong` batch | μ = μ_max f(T) S/(K_s + S + S²/K_i)(1 − P/112)^0.5; P_max(growth) 112 g/L, P_max(fermentation) 115 g/L (Luong 1985, FETCHED abstract); Ea ethanol formation 78.5 kJ/mol, optimum 32-36 °C (FETCHED abstract); μ_max 0.15 h⁻¹, K_s 5 g/L, K_i 250 g/L, Y_x/s 0.05, Y_p/s 0.46 (theoretical 0.511), m_s 0.06 h⁻¹ (GAME within literature ranges); cardinal T model T_min 5, T_opt 33, T_max 47 °C | 20-45 °C | Check: 150 g/L, 32 °C: 90 % glucose used in 22.5 h, 69 g/L EtOH; 42 °C stalls; 45 °C dies |
| K9 | Ostwald gauze | `gauze_selectivity`: mass-transfer-limited, complete NH₃ conversion; S_NO(T, P) table interpolated | BREF anchor points S_NO = 0.97 (< 1.7 bar, 810-850 °C), 0.96 (1.7-6.5 bar, 850-900 °C), 0.95 (> 6.5 bar, 900-940 °C); below the window S_NO falls (GAME slope −0.05 per −50 K, N₂ takes the rest); N₂O 1.5-2.5 % of NH₃ | 750-950 °C | EU BREF LVIC-AAF 2007 Tables 3.2, 3.7, 3.9 (FETCHED); low-T slope GAME |
| K10 | 2NO + O₂ → 2NO₂ (gas phase) | third order, negative apparent Ea | k₃ = 1.2e3·e^{530/T} L² mol⁻² s⁻¹ (valid ≤ 600 K) | 273-600 K | review via snippet (F2); IUPAC datasheet to fetch |
(K9, K10 only for L26.)

### 4.4 Catalysts (v0.1: 10 entries)
Ranges below are from kinetics.md §8 and are **UNVERIFIED** except where marked; the windows that gate gameplay (light-off, T_max) are cross-checked by the rate laws above (V₂O₅ light-off reproduced by K2). Prices are placeholders for the Build cost and must be sourced or labelled GAME.

| id | catalyst | window °C | poisons | deactivation | life | game effect |
|---|---|---|---|---|---|---|
| fe_ammonia | fused magnetite Fe-K₂O-Al₂O₃ | 380-520 | O-compounds (reversible), S, Cl (irreversible) | sintering > 520-550 °C | 10-20 y | K1, activity 1.0 |
| ru_ammonia | Ru/C Cs-Ba promoted (KAAP) | 340-440 | O-compounds | support methanation > 450 °C | — | K1 with k × 10 per volume (GAME, from "~10× Fe activity"), 20× price |
| v2o5 | V₂O₅-K₂SO₄/SiO₂ | 410-620 (light-off 380-420) | Fe, dust, moisture | > 620-630 °C | 10-20 y | K2 |
| v2o5_cs | Cs-promoted V₂O₅ | 370-620 | as above | as above | | K2 with light-off shifted −40 K (GAME, from industry practice), 2× price |
| cu_zn_meoh | Cu/ZnO/Al₂O₃ | 200-280 | S, Cl (ppb) | Cu sintering > 280-300 °C | 2-4 y | K3 |
| fecr_hts | Fe₂O₃-Cr₂O₃ | 320-450 | S, Cl | sintering | 3-5 y | K4 |
| cuzn_lts | Cu-ZnO-Al₂O₃ LTS | 190-250 | S, Cl | sintering > 260 °C | 2-4 y | equilibrium reactor with T ≥ 190 °C (L12 option) |
| ni_smr | Ni/Al₂O₃ | 500-900 | S (< 0.1 ppm), As | sintering > 850-900 °C, coking at low S/C | 4-6 y | K5 |
| ptrh_gauze | Pt-Rh 90/10 gauze | 800-950 | Fe, P, S, dust | Pt volatilisation | 3-12 months | K9 |
| yeast | S. cerevisiae | 28-35 (dies > 40-45) | ethanol > ~ 112 g/L | heat death | per batch | K8 |
(10 rows; ru_ammonia and v2o5_cs are the "faster road, same destination" options in L17.)

### 4.5 Phase-equilibrium and property data
Antoine constants, NRTL parameters, Henry's constants, steam-table points, relief sizing, flammability and Ostwald data, with verification against CoolProp reference equations, are in `research/vle_safety.md`; summary in §4.5.1. Ammonia saturation pressures used for level design (CoolProp, Tillner-Roth reference EOS): −33 °C 1.03 bar, −20 °C 1.90, −10 °C 2.91, 0 °C 4.29, 10 °C 6.15, 20 °C 8.57, 30 °C 11.67 bar.

#### 4.5.1 Summary (from `research/vle_safety.md`)
**Antoine** (log₁₀ P/bar = A − B/(T/K + C)). Engine uses the refits to CoolProp reference EOS (DERIVED, one equation per species over the game's range); the NIST WebBook sets (FETCHED) are kept as test cross-checks.
| species | range K | A | B | C | max error vs CoolProp | NIST set (cross-check) |
|---|---|---|---|---|---|---|
| NH₃ | 230-370 | 4.68550 | 1009.889 | −24.025 | 0.61 % | Stull 1947: 4.86886 / 1113.928 / −10.409 (239.6-371.5 K) |
| H₂O | 300-520 | 5.07658 | 1660.626 | −45.654 | 0.24 % | Bridgeman & Aldrich 1964: 5.08354 / 1663.125 / −45.622 (344-373 K) |
| CH₃OH | 290-460 | 5.17440 | 1564.223 | −35.005 | 0.13 % | Ambrose & Sprake 1970: 5.20409 / 1581.341 / −33.50 |
| C₂H₅OH | 290-460 | 5.09143 | 1515.440 | −53.549 | 0.84 % | Ambrose & Sprake 1970: 5.24677 / 1598.673 / −46.424 |
| SO₂ | 250-400 | 4.47598 | 1035.769 | −31.438 | 0.67 % | Stull 1947: 4.37798 / 966.575 / −42.071 |
| Cl₂ | 230-380 | 4.17412 | 913.043 | −20.146 | 0.39 % | Stull 1947: 4.28814 / 969.992 / −12.791 |
(Do not use NIST's printed Ambrose 1975 high-T alcohol sets: 6.5 % low vs CoolProp.) ΔHvap at Tb (CoolProp): NH₃ 23.33, H₂O 40.65, CH₃OH 35.28, C₂H₅OH 39.14, SO₂ 24.96, Cl₂ 20.35 kJ/mol.

**Activity models (decision: NRTL)**, DECHEMA parameters at 1 atm via the ChemSep database (τ_ij = A_ij/RT, A in cal/mol, R = 1.9872): ethanol(1)-water(2) A₁₂ = −57.9601, A₂₁ = 1241.7396, α = 0.2937 → azeotrope x = 0.880 (94.9 wt %), 78.08 °C vs measured ≈ 0.894 (95.6 wt %), 78.15 °C. The game's wall sits where the model puts it (94.9 wt %); the Codex quotes the measured 95.6 % and says the model is 0.7 wt % low. Methanol(1)-water(2) A₁₂ = −189.0469, A₂₁ = 792.8020, α = 0.2999 (no azeotrope; γ∞ ≈ 2.3; ideal Raoult would mispredict y by up to 0.15, so L22's flash and column use NRTL too). Wilson parameters kept as a cross-check (azeotrope 94.6 wt %).

**Henry's constants in water** (Sander compilation, henrys-law.org v5.0.0, FETCHED; H^cp at 298 K in mol m⁻³ Pa⁻¹, temperature coefficient d ln H/d(1/T) K): H₂ 7.8e-6 / 530; N₂ 6.4e-6 / 1300; O₂ 1.3e-5 / 1500; Ar 1.4e-5 / 1500; CH₄ 1.4e-5 / 1600; CO 9.7e-6 / 1300; CO₂ 3.4e-4 / 2300; NH₃ 0.59 / 4200; SO₂ 1.3e-2 / 2900. **Gas solubility in liquid NH₃ at loop conditions was not found** (only a snippet: N₂ ≈ 2.2 mol % at 0 °C and 1000 bar). Decision: non-condensables in liquid NH₃ use K = 10⁴ (essentially insoluble), flagged in the Codex; dissolved-gas losses are ignored in v0.1.

**Steam (IAPWS-IF97 via CoolProp)**: 4 bar 143.6 °C, h_f 604.7, h_g 2738.1 kJ/kg; 10 bar 179.9 °C, 762.7, 2777.1; 40 bar 250.4 °C, 1087.4, 2800.9. Feed water at 105 °C: 440-443 kJ/kg. (L05 uses Δh = 2801 − 440 = 2361 kJ/kg.)

**Relief (API 520 Part I critical flow, SI)**: A[mm²] = W[kg/h] / (C K_d P₁[kPa abs] K_b K_c) · √(T Z / M), C = 0.03948·√(k (2/(k+1))^((k+1)/(k−1))) (k = 1.4 → 0.02703), K_d = 0.975, K_b = K_c = 1 (via the `fluids` library implementation, F2; API text not read). **Standards label in the `global` pack: "API 520 / API 526 (ISO 4126-1/-7 use the same isentropic-nozzle critical-flow theory; ISO derates the coefficient, 0.9·K_d, and has no orifice letters)"**: the game uses API 520 numbers and letters, because the letters are the readable game object, and the Codex says so. Critical if P₂/P₁ ≤ 0.528 (k = 1.4). API 526 orifice areas (mm²): D 71, E 126, F 198, G 325, H 506, J 830, K 1186, L 1841, M 2323, N 2800, P 4116, Q 7129, R 10 323, T 16 774. Worked check (unit test): 10 000 kg/h NH₃, k = 1.31, 400 K, 1000 kPa abs → 1882 mm² → letter M.

**Flammability in air (vol %, ~20 °C, 1 atm)**: NH₃ 15-28 (measured 16.6-27.2; widens to 13.1-34.3 at 300 °C and 11.2-37.1 at 400 °C: Harris & MacDermott, ICI, IChemE Symp. Ser. 49, FETCHED); H₂ 4-75; CH₄ 5.0-14.3 (limits measured per EN 1839; ISO 10156 classifies flammability); CO 12.5-75; CH₃OH 6-36; C₂H₅OH 3.3-19. Engine: the flammable envelope for NH₃-air is interpolated linearly in T from the ICI data; pressure dependence is not modelled (no reliable source; flagged), and L26's design rule "≤ 11 % NH₃" keeps the margin.

**Ostwald (EU BREF LVIC-AAF 2007, FETCHED)**: NO yield 97 % (< 1.7 bar, 810-850 °C), 96 % (1.7-6.5 bar, 850-900 °C), 95 % (> 6.5 bar, 900-940 °C); optimum NH₃ in air 9.5-10.5 %; Pt loss 0.04-0.06 / 0.10-0.16 / 0.25-0.32 g/t HNO₃ at 1 / 3-7 / 8-12 bar; N₂O 1.5-2.5 % of NH₃ (≈ 4-9 kg/t HNO₃ medium pressure); NH₃ use 283-290 kg/t HNO₃.

**Climate**: GWP100 N₂O 273, CH₄ fossil 29.8 (IPCC AR6 WG1 Table 7.15, FETCHED). Grid factor (`global` pack): world average 0.47 t CO₂/MWh (Ember Global Electricity Review 2025, 2024 value 473 g/kWh, SNIP; IEA Electricity 2025 gives 445 direct, SNIP); EU 0.213 (Ember 2024, SNIP) as an alternative level override. (The India factor moved to the `in` pack, §11.)

### 4.6 Equipment and cost correlations (v0.1: 14 types)
Purchased cost (Turton et al., *Analysis, Synthesis and Design of Chemical Processes*, Appendix A, 2001 basis, CEPCI 397): log₁₀ C_p° = K₁ + K₂ log₁₀ A + K₃ (log₁₀ A)²; pressure factor log₁₀ F_P = C₁ + C₂ log₁₀ P + C₃ (log₁₀ P)² (P in barg); bare module C_BM = C_p°(B₁ + B₂ F_M F_P) or C_p° F_BM. Escalation × CEPCI_year/397. Coefficients below were read from transcriptions of Turton Table A.1 (OpenPyTEA `cost_correlations.csv`) and a Turton implementation (eqcost `catalog.toml`) (F2); **implementation task: verify every row against the book or CAPCOST before release.**

| type (A, unit, range) | K1 | K2 | K3 | C1, C2, C3 (P range barg) | B1, B2 or F_BM | F_M CS/SS/Ni |
|---|---|---|---|---|---|---|
| centrifugal compressor (fluid power kW, 450-3000) | 2.2897 | 1.3604 | −0.1027 | — | F_BM 2.7 / 5.8 / 11.5 | (in F_BM) |
| electric drive (shaft kW, 75-2600) | 2.9508 | 1.0688 | −0.1315 | — | F_BM 1.5 (UNVERIFIED) | — |
| centrifugal pump (shaft kW, 1-300) | 3.3892 | 0.0536 | 0.1538 | −0.3935, 0.3957, −0.00226 (10-100) | 1.89, 1.35 | 1.6 / 2.3 / 4.4 |
| S&T HX floating head (m², 10-1000) | 4.8306 | −0.8509 | 0.3187 | 0.03881, −0.11272, 0.08183 (5-140) | 1.63, 1.66 | 1.0 / 2.73 / 3.73 |
| S&T HX fixed tube sheet (m², 10-1000) | 4.3247 | −0.3030 | 0.1634 | same | 1.63, 1.66 | same |
| fired heater (duty kW, 1000-100 000) | 7.3488 | −1.1666 | 0.2028 | 0.1347, −0.2368, 0.1021 (10-200) | F_BM 2.13 CS / 2.81 SS | — |
| reformer furnace (duty kW, 3000-100 000) | 3.0680 | 0.6597 | 0.0194 | to source | to source | — |
| vertical vessel: reactors, drums (m³, 0.3-520) | 3.4974 | 0.4485 | 0.1074 | wall-thickness F_P (Turton eq. A.2; formula to verify) | 2.25, 1.82 | 1.0 / 3.1 / 5.4 |
| sieve trays (m² per tray, 0.07-12.3) | 2.9949 | 0.4465 | 0.3961 | — | F_BM 1.0 × F_q | — |
| packing (m³, 0.03-628) | 2.4493 | 0.9744 | 0.0055 | — | to source | — |
| jacketed agitated reactor / fermenter (m³, 0.1-35) | 4.1052 | 0.5320 | −0.0005 | to source | to source | — |
| steam boiler (duty kW, 1200-9400) | 6.9617 | −1.4800 | 0.3161 | to source | to source | — |
| cooling tower (not in Turton) | Towler & Sinnott 2010: C = 170 000 + 1500 Q^0.9 USD-2010, Q L/s (100-10 000) | | | | | |
| package boiler | Towler & Sinnott 2010: C = 124 000 + 10 S USD-2010, S kg/h steam (5 000-200 000) | | | | | |
Catalyst charges are costed per kg (§4.4). Relief valves, analysers, splitters and mixers: flat GAME costs (small).
**CEPCI**: 2001 = 397 (Turton basis); 2019 = 607.5, 2022 = 816.0, 2023 = 797.9 (Chemical Engineering, Sept 2024 Economic Indicators, FETCHED). 2024 ≈ 797 ± 3 (annual average not retrieved, UNVERIFIED). **Decision: the game prices everything in 2023 dollars (CEPCI 797.9)**, the latest verified annual value, so no unverified index enters a goal.
Worked checks (costs_turton.py, 2023 basis): 1 MW CS centrifugal compressor C_BM ≈ $1.52 M (+ motor ≈ $0.28 M); 100 m² floating-head CS HX at 10 barg ≈ $169 k; these become unit tests.
**Annualisation**: capital recovery factor at 10 %/yr over 15 years (0.1315/yr) + 4 %/yr maintenance; 8000 operating h/yr. Cost per tonne = (annualised C_BM + annual opex) / annual production.

### 4.7 Utilities, feeds, products, carbon (v0.1: 9 utilities + 14 prices) — **`global` region-pack data**
Prices are region-pack data (`src/regions/global/index.ts`, `data.prices`, §11), overridable per level (a gas shortage, a carbon price). All in **US$ (2023-2025 values)**; no currency conversion anywhere in the `global` pack. Re-sourced 2026-11-09 for the neutral setting (REVIEW.md §3); the India-specific defaults moved to the `in` pack (§11).

| item | `global` default | source / conf |
|---|---|---|
| natural gas, default contract ("LNG-importing coast") | **$11.0 /MMBtu** (≈ $10.4/GJ) | World Bank Pink Sheet, "Natural gas, Europe" 2024 annual = $10.96 (FETCHED; LNG Japan 2024 $12.85, FETCHED) |
| natural gas, cheap contract (levels that tell a cheap-gas story, L11 supplier choice) | $3.5 /MMBtu | World Bank Pink Sheet, US Henry Hub 2025 = $3.53 (FETCHED) |
| electricity (industrial) | **$0.10 /kWh** (GAME, between the two fetched anchors) | US industrial 2024 8.13 ¢/kWh (EIA-861 Table 4, FETCHED); EU27 non-household band ID 2024 ≈ €0.142/kWh excl. VAT (Eurostat nrg_pc_205, FETCHED) |
| LP / MP / HP steam | derived: fuel cost / 0.90 boiler efficiency + $2/t water treatment (≈ $29/t at the default gas) | derived from §3.8 |
| cooling water | $0.40 /GJ → **GAME** until sourced (Turton ch 8 order of magnitude, UNVERIFIED) | |
| refrigeration | electricity / COP (§3.8) | derived |
| carbon price | $0 default; $80/t CO₂e in "export" levels (≈ EU ETS 2025 average €74/t, SNIP, rounded and labelled GAME) | |
| ammonia | $400 /t (FOB Middle East swung $315 → $530 in 2025, SNIP) | |
| urea | $340 /t (World Bank Pink Sheet 2024 = $338, FETCHED) | flavour only in v0.1 |
| sulfur | $165 /t (early 2025 Qatar QSP, derived from SNIP) | |
| sulfuric acid | $100 /t (GAME: mid-range of 2024 observations $64-140, SNIP) | |
| methanol | $380 /t (Methanex APAC 2025 posted, SNIP) | stretch level only |
| fuel ethanol | $0.55 /L (US rack, Omaha FOB ≈ $2.07/gal Oct 2025, F2; Brazil hydrous ≈ $0.48/L, SNIP) | stretch level only |
| hydrogen (grey) | $1.0-2.5 /kg (gas-price dependent; derived in L28 from SMR instead) | IEA via SNIP |
| molasses, oxygen, CO₂, nitric acid | NOT FOUND → GAME placeholders, labelled, only in stretch levels | |

### 4.8 Benchmarks and emission factors (scoring references shown in the Report)
| item | value | source / conf |
|---|---|---|
| ammonia, best available technology (gas SMR) | 28 GJ/t NH₃, 1.6 t CO₂/t | IFA 2009 "Energy efficiency and CO₂ emissions in ammonia production" (FETCHED) |
| ammonia, 2008 survey of 93 plants | average 36.6 GJ/t (range 27.0-58.2) | same (FETCHED) |
| ammonia, coal gasification BAT | 42 GJ/t, 3.8 t CO₂/t | same (FETCHED) |
| ammonia, thermodynamic floor | ≈ 20 GJ/t | same chart (FETCHED; basis not stated) |
| sulfuric acid SO₂ limits (`global` pack, L25) | standard **2.0 kg SO₂/t** 100 % H₂SO₄ (US NSPS 40 CFR 60.82(a), FETCHED; EU BREF: "below 2 kg/t ≈ 99.7 %"); strict **1.3 kg/t** (≈ 99.8 %, lower end of EU BAT conversion for existing sulfur-burning DCDA, LVIC-AAF BREF 2007 Table 4.24, FETCHED); expert 0.65 kg/t (≈ 99.9 %, new-plant BAT) | FETCHED |
| conversion ↔ emission (engine identity; basis: per tonne of 100 % H₂SO₄ produced, sulfur-burning) | 97 % → 20.2 kg SO₂/t; 99.5 % → 3.3; 99.7 % → 1.97; 99.8 % → 1.31; 99.9 % → 0.65 | computed (levels_calc.py) |
| sulfur-burning acid plant steam export | 1.0-1.2 t steam/t acid (conventional), 1.7-1.8 with LT heat recovery | SNIP (Monsanto/IFA papers) |
| methanol energy | 31-36 GJ/t | SNIP |
| nitric acid N₂O | IPCC 2006 V3 ch 3 Table 3.3 defaults: atmospheric 5, medium pressure 7, high pressure 9 kg/t HNO₃ (unabated); NSCR 2, tail-gas destruction 2.5 (FETCHED). EU BAT-AEL 0.12-0.6 kg/t new plants, 0.12-1.85 existing (LVIC-AAF BREF 2007 Table 3.14, FETCHED) | FETCHED |
| GWP100 | N₂O 273, CH₄ (fossil) 29.8 | IPCC AR6 WG1 Table 7.15 (FETCHED, re-verified 2026-11-09) |
| grid CO₂ factor | world 0.47 t/MWh (Ember 2024); EU 0.213 t/MWh (2024) | SNIP |
| ethanol distillation steam | 1.7-2.8 kg steam/L | SNIP (Praj, EIA documents) |

### 4.9 Safety data
API 520 gas relief sizing at critical flow and API 526 orifice areas (ISO 4126 cross-reference, §4.5.1); alarm management per IEC 62682 / ISA-18.2; flammability limits (NH₃ 15-28 % in air at ambient (Wikipedia, FETCHED); ~10-11 % practical ceiling at elevated pressure in Ostwald converters (SNIP)); H₂, CH₄, CO, CH₃OH, C₂H₅OH limits; all in `research/vle_safety.md`, summarised in §4.5.1.

### 4.10 Plant facts used in briefs and Codex (from a sourced lookup, Wikipedia/EPA/BREF pages)
Haber loop 150-250 bar, synthesis 400-500 °C, per-pass conversion ~15-25 %, overall ~97 % with recycle, NH₃ separated at about −20 °C leaving 2-5 % NH₃ in the recycle, single lines > 3000 t/d, world output ~230 Mt/yr (2018). Contact process: burner gas ~10-11 % SO₂ at ~1000 °C, 4 beds typical, bed inlets 400-450 °C, ≈ 28 K rise per 1 % SO₂ converted (our engine: 29 K), single absorption 95-98 %, DCDA ≥ 99.7 %, SO₃ absorbed in 98-98.5 % acid not water (acid mist). Methanol: Cu/ZnO/Al₂O₃ 50-100 bar, 250-280 °C, per pass 15-25 %, recycle ratio ~5. Fermentation: S. cerevisiae ~30-38 °C, pH ~4.5-5.6, molasses ~18 % w/v sugar, ~10 % v/v ethanol, 20-70 h batches. Ostwald: Pt-10 % Rh gauze ~900 °C (800-930), up to 8 atm single pressure, product 52-68 % HNO₃ (68 % azeotrope). (Country-specific production figures and plant names moved to the `in` pack, §11.)

**Real-incident Codex pages (v0.1, user-approved): Bhopal 1984, Seveso 1976, T2 Laboratories 2007, Visakhapatnam LG Polymers 2020.** These are history, not setting: they ship in every region pack (the leak test allowlists the incident pages' place names, §9.12). Drafts with sources, attributed tolls and UNVERIFIED flags are in `research/incidents.md`; rules for them in §7.5. Texas City 1947, Beirut 2020 and Toulouse AZF 2001 (ammonium nitrate) are **not** in v0.1: they need their own user approval and fit the v0.2 ammonium-nitrate content.

### 4.11 Entry counts (v0.1)
| catalogue | count |
|---|---|
| species | 29 (+4 auxiliary) |
| reactions | 14 (+2 Ostwald side reactions) |
| rate laws | 10 (8 needed for the 22 core levels) |
| catalysts | 10 |
| equipment cost types | 14 |
| utilities | 9 |
| feed/product prices | 14 |
| benchmarks/emission factors | 12 |
| Antoine sets | 6 (NH₃, H₂O, CH₃OH, C₂H₅OH, SO₂, Cl₂) |
| activity-model pairs | 2 (ethanol-water, methanol-water; NRTL) |
| Henry constants | 9 |
| events | 14 types (§2.6, §8.5) |
| incidents (Codex) | 4 (Bhopal, Seveso, T2, Visakhapatnam) |
| Codex entries | 60 |
| levels | 28 |

---

## 5. World view and art direction

### 5.1 What the player sees
A **3D isometric plant** on a coastal plot, rendered in Godot Forward+ (Mobile renderer on phone) with an **orthographic camera** at 35° pitch, rotatable in 90° steps (Q/E, bumpers, two-finger twist with snap), zoom 3 levels + smooth, pan. 1 world unit = 1 m. The plot is a **2 m build grid**; units occupy footprints (a flash drum 2x2, a converter 4x4, a column 4x4 and tall, a cooling tower 6x6). The level's plot is fenced; beyond it is set dressing that never needs rendering detail: salt pans, the bay, a jetty with a sulfur ship, the old works' rusted silhouettes that come back to life as chapters complete (meta-progression is *visible*: §2.4).

Nothing is a flat icon. Every unit is a chunky, readable model with true proportions and a strong silhouette:

| Unit | Model | Live state shown on the model |
|---|---|---|
| Feed source | tank farm / pipeline header / sulfur pit with a conveyor | level gauge, species colour band |
| Compressor | motor + casing on a skid, coupling guard | spin speed ∝ power, vibration when surging, heat shimmer at outlet |
| Pump | small skid | shaft spin |
| Heater / furnace | box furnace with stack, burners visible through peepholes | burner flame size ∝ duty, stack plume |
| Cooler | air-fin cooler (fans) or shell-and-tube with cooling water lines | fan speed ∝ duty |
| Heat exchanger (2-stream) | shell-and-tube on saddles | shell gradient from hot end to cold end (emission shader) |
| Packed-bed converter | tall vessel, manways, internal beds shown as bands in "x-ray" view | bed bands colour by temperature; catalyst health as band saturation |
| CSTR | jacketed vessel with agitator motor | agitator spin, jacket flow, rattling + steam wisps when T climbs |
| Fermenter | stainless tank, sight glass | foam level, bubbles ∝ CO₂ rate, sight-glass colour |
| Flash drum / condenser | horizontal or vertical drum, demister | liquid level in a sight glass, frost if below 0 °C |
| Distillation column | tall column with platforms, ladders, reboiler at the base, condenser at top | tray glow (temperature profile), reflux drum level |
| Absorber / scrubber | packed tower with liquid distributor | liquid curtain particles |
| Splitter / purge | tee with control valve | valve stem position |
| Flare | stack with pilot | flame ∝ purge flow, colour by composition (H₂ nearly invisible blue: a teaching moment) |
| Stack + analyser | chimney with analyser hut | plume colour (brown for NO₂, white for steam, faint grey otherwise), analyser lamp |
| Relief valve | small valve on the vessel top + tailpipe | pops with a steam/gas jet and roar when lifting |
| Cooling tower | hyperbolic or cell tower | vapour plume ∝ heat rejected |
| Product tank | storage sphere (NH₃), tank (acid), drums | fill animation, tonnes counter floating label |

**Pipes** route automatically on a pipe rack (Manhattan routing on a raised layer, A* with a bend penalty) between unit ports; players never draw pipe segments by hand (that is the spreadsheet-of-geometry trap). Pipe visuals: thickness ∝ log(mass flow), a **scrolling pulse shader** whose speed ∝ velocity, colour = **composition colour** (mole-fraction-weighted blend of species colours, §5.6; for mixtures the pipe shows two to three colour bands of the dominant species), a frost texture below 0 °C, an orange emission glow above 300 °C (blackbody ramp clamped for readability), and a dashed pattern for gas vs solid for liquid so colour is never the only signal. Hover/tap a pipe: a tooltip with flow, T, P and the top three species (the stream table row in miniature).

### 5.2 Day, weather, life
Time of day follows the shift clock (sunrise palette in the morning shift, sodium-lamp night shift). Light rain (v0.2) changes cooling-tower plumes. Small life: a pickup truck on the access road, gulls, flamingos in the salt pans (set dressing is region-pack data; the `global` coast is fictional), workers in hard hats near units that need attention (they walk to an alarming unit: diegetic signposting).

### 5.3 Views (toggle, all keep the world visible)
| View | Key / button | Shows |
|---|---|---|
| Plant (default) | 1 | realistic look |
| Heat | 2 | units and pipes recoloured by temperature (cool blue → white → orange → red); hot spots pulse |
| Flow | 3 | pipes as Sankey-width ribbons with species colour; units dimmed |
| Pressure | 4 | units/pipes by pressure band; pressure-rating margin as a red ring |
| X-ray | 5 | vessel shells transparent: beds, trays, liquid levels, catalyst health |
| Labels | L | short unit tags (R-101, E-102…) and key number per unit |

### 5.4 How chemistry is made visible
1. **Equilibrium Window** (per reactor; in the unit drawer, and pinnable as a floating holo-card in the world above the reactor): conversion X (y) vs temperature T (x). Layers: the **equilibrium curve** X_eq(T) at the current P and feed (computed live, §3.4); **iso-rate contours** (r = 0.1, 1, 10 × reference) from the kinetics; the **adiabatic operating line** from the energy balance (slope 1/ΔT_ad); the **operating point** (bed inlet → outlet as an arrow); for multi-bed converters the **staircase**. Drag the operating point's T handle directly on the plot as an alternative input (it moves the inlet temperature setpoint). Faint ghost of the previous run's curve and point, so every change shows its consequence.
2. **The balance beam (Q/K gauge)**: the game's logo is a balance beam; every reactor wears one. Left pan = reactants, right pan = products, tilt = log₁₀(Q/K) clamped to ±3. At equilibrium it is level and glows teal. When the player changes P, T, concentration or inerts, the beam tilts *first* (Q/K jumps away from 1), then an animated **Le Chatelier arrow** over the reactor shows the shift direction ("→ more NH₃") and the beam settles as the reactor relaxes. This is Le Chatelier as a mechanism, not a rule to memorise.
3. **Molecule Lens** (tap the lens icon on any stream or reactor): a circular 2D window with 120 molecules (desktop) / 60 (phone) drawn as ball sketches (N₂ blue dumbbells, H₂ small white pairs, NH₃ violet pyramids…) in their true mole fractions, jittering with speed ∝ √T. In a reactor the lens shows forward and backward events flickering (rates); at equilibrium they balance visibly. It teaches mole fraction and dynamic equilibrium in one glance. Particle counts are rounded with largest-remainder so a 1 % inert shows 1 molecule.
4. **Semenov plot** (CSTR and any jacketed reactor): heat generated G(T) (S-curve, red) and heat removed R(T) (straight line, blue) vs T, steady states as dots (stable filled, unstable hollow), the operating point, and during a shift the R line *visibly rotating* as cooling degrades. The near-miss replay (§1.4) is built on this plot.
5. **Energy Sankey** (Report and an Energy drawer tab): fuel, electricity, reaction heat in; steam export, cooling water, stack losses out; the width of each band in MW. Closes exactly (the energy-balance property test is what makes this honest).
6. **Mass ledger**: element/atom ledger for the whole plant (N, H, S, O, C in = out), shown as stacked bars; the moment a loop with no exit for argon accumulates, the Ar bar visibly grows each tear iteration.
7. **Recycle filling** (Learner mode): tear-stream iterations of the flowsheet solver are replayed as an animation of the loop "filling up" (pipe colour and width converging over ~1.5 s). It is literally the Wegstein iteration history (§3.6) made visible, so non-convergence *looks* like what it is (oscillation or unbounded growth).

### 5.5 Alarms and runaway visuals
- Alarm priorities follow IEC 62682 / ISA-18.2 practice: **Low** (advisory, cyan chime, no beacon), **High** (amber beacon on the unit, two-tone beep, console row flashes), **Critical** (red rotating beacon, klaxon, screen-edge red vignette pulse, auto-pause in Learner mode). Each alarm has a deadband and a delay so values hovering at the limit do not chatter.
- **Runaway build-up**: unit shell shifts toward orange, heat shimmer intensifies, vessel shake amplitude ∝ dT/dt, steam wisps from flanges, pressure gauge needle sweeps. If the relief valve lifts: a white/grey jet with a roar and a ground-shadow pulse. If there is no relief and design pressure × 1.5 is exceeded: **containment loss**: a stylised burst (shock ring, debris arcs, fireball only for flammable inventory), the camera shakes, the shift ends. Tone: serious, not gory; no people are shown hurt. The incident report opens over the frozen frame.
- **Catalyst damage**: bed bands desaturate permanently (sintering) and a crack icon appears; shown again in the X-ray view.
- **Emissions**: plume colour and size, a stack analyser lamp, and a ground-level haze tint downwind when a limit is exceeded.

### 5.6 Palette
UI chrome uses the cobanana kit (core `kit.gd`) with EQUILIBRIUM's accent:

| Token | Hex | Use |
|---|---|---|
| accent / equilibrium teal | `#2EC4B6` | balance beam at equilibrium, primary buttons, focus ring |
| hazard amber | `#FFB703` | high alarms, warnings |
| alarm red | `#E63946` | critical alarms, failures |
| heat orange | `#FB8500` | hot surfaces, heat duty |
| cold blue | `#4CC9F0` | cooling water, refrigeration, frost |
| night navy (UI bg) | `#0B132B` / panels `#1C2541` | drawers, console |
| paper | `#F1FAEE` | light theme base |

Species colours (pipes, molecule lens, charts; chosen for distinct hue *and* lightness, checked with a CVD simulator; never used alone: labels and patterns always accompany them):

| Species | Colour | | Species | Colour |
|---|---|---|---|---|
| H₂ | `#E8F1FF` pale white-blue | | SO₂ | `#E9C46A` sulfur yellow |
| N₂ | `#5B7DB1` slate blue | | SO₃ | `#F4A261` orange |
| NH₃ | `#9D4EDD` violet | | H₂SO₄ | `#B5651D` amber-brown |
| O₂ | `#4CC9F0` cyan | | CO | `#8D99AE` grey-blue |
| Ar / inerts | `#6C757D` grey | | CO₂ | `#495057` dark grey |
| H₂O | `#1D7FD8` water blue | | CH₄ | `#2A9D8F` green-teal |
| CH₃OH | `#F15BB5` pink | | C₂H₅OH | `#FFD166` gold |
| NO | `#C9ADA7` | | NO₂ | `#8B4513` brown (real colour) |
| glucose / broth | `#C8B88A` | | Cl₂ | `#B5E48C` yellow-green (real colour) |

### 5.7 Audio
All synthesised by the GIGAWATT numpy/scipy/ffmpeg pipeline (`tools/audio/generate.py`, no samples, no licensing), routed through core `audio.gd`.
- **Plant bed**: a layered hum whose layers follow the simulation: compressor drone (pitch ∝ shaft power^0.3), furnace roar (∝ duty), cooling-tower hiss, pump whine, flare rumble; layers pan with the camera. A quiet plant sounds quiet.
- **Interaction**: valve "chunk" on setpoint commit, ratchet ticks on knob steps, pipe "clunk-hiss" on connect, a soft *lock* chord when a solve converges, a dissonant *slip* when it does not.
- **Alarms**: low chime (one note), high (two-tone beep 0.5 s period), critical (klaxon, 1.2 s sweep). Acknowledge silences the tone; the beacon stays until the condition clears.
- **Events**: relief-valve pop + roar, steam vent whoosh, compressor surge thump, catalyst crack.
- **Music**: industrial ambient / minimal techno, five tracks of different structure (GIGAWATT lesson: the user rejects samey music), adaptive intensity: a percussion stem fades in with the number of active High alarms; a tense drone replaces the beat during Critical. Title track: slow, warm, with the plant hum underneath.

---

## 6. Screens, drawers and input

### 6.1 Screen inventory
Only three *full-screen* surfaces exist: Title, Works map, and the Plant. Everything else is a drawer, card or modal over the Plant, so the world stays visible (PROGRAM quality bar 9).

| Surface | Kind | Contents |
|---|---|---|
| Title | full | Continue / New / Load (3 slots + auto) / Sandbox / Settings / Codex / Quit (desktop only). Background: the Works at dusk, a demo plant running **with autosave off** (GIGAWATT B1). |
| Works map | full (3D, same renderer) | the whole complex from above; each plant site is a level node; completed plants are lit and connected by pipelines (meta-progression); chapter banners; Engineer rank; Codex progress |
| Level brief | card (modal) | the character who sets the job, goal, constraints, stars, what is new (units/knobs), "Call it" prompt if the level has one |
| Plant | full (3D world) | the HUD + drawers below |
| HUD top bar | overlay | level name; goal meter(s); KPI chips (production t/d, cost/t, GJ/t, CO₂e/t); phase pill (DESIGN / SHIFT 03:42 / REPORT); speed (‖ 1x 4x 16x); Commission / Start shift button; menu |
| Build drawer (left) | drawer | unit palette (only units unlocked for this level, with count limits and cost), catalyst picker, feed contracts |
| Inspect drawer (right) | drawer, contextual | selected unit or stream: setpoint knobs, live readouts, Equilibrium Window / Semenov plot / column profile tab, "Why?" button, Codex link |
| Data drawer (bottom) | drawer | tabs: **Streams** (stream table, sortable, units toggle mol/mass, °C/K, bar/atm), **Ledger** (atom balance, energy Sankey, cost breakdown), **Trends** (shift time series for any pinned variable), **Runs** (last 10 runs: KPIs + diff) |
| Console (shift only) | docked bottom-right panel | alarm list (priority, unit, message, time, ACK), the 3 pinned trends, event card when an event fires, trip buttons for interlocks |
| Why panel | card | the explanation of the last result (§7.3) with "Show me" camera jumps and Codex links |
| Report | card (modal) | stars, goal check, histograms (3 metrics), near-miss replay button, plant card export, Retry / Next / Optimise |
| Codex | drawer (wide) or full on phone | entries, search, "Take me there" |
| Settings | modal | Display, Graphics, Audio, Accessibility, Controls, Gameplay (units system, thermo detail, coach, interlock assist) |
| Pause | modal | Resume, Restart level, Settings, Codex, Save & quit to map |

Modal discipline as in GIGAWATT/core: one `modal()` function; hotkeys, camera input, world picking, toasts and floating widgets obey it; Esc / B / Android Back closes exactly one layer; never quit without autosave.

### 6.2 Interaction verbs
place unit · move unit · rotate unit · delete unit · connect ports (pipe) · disconnect · select unit/stream · set a setpoint (coarse/fine) · type an exact value · choose catalyst · set feed · make a prediction ("Call it") · commission (solve) · start shift · change speed / pause · acknowledge alarm · trip interlock / emergency stop · open stream table · pin a trend · inspect a stream · open Equilibrium Window · drag operating point · open Codex / Why · undo / redo · camera pan / zoom / rotate / view mode · open Molecule Lens · replay near miss.

### 6.3 Input map
`[ ]` = button. "Hold" = 300 ms. Controller layout uses Xbox names (Steam Deck: A/B/X/Y, L1/R1 = LB/RB, L2/R2 = LT/RT). **Controllers are ignored unless `CB_PAD=1` or a pad is detected and the player opts in** (PROGRAM rule; core `pad.gd`).

| Action | Mouse + keyboard | Controller (Deck) | Touch (phone) |
|---|---|---|---|
| Camera pan | right-drag or middle-drag; WASD / arrows | left stick | one-finger drag on empty ground |
| Camera zoom | wheel; `+`/`-` | right stick Y (or LT+RT held = zoom mode) | pinch; on-screen `+`/`−` buttons |
| Camera rotate 90° | Q / E | right stick X flick (snap) | two-finger twist (snaps); on-screen ⟲ ⟳ |
| View modes | 1-5, L | View: hold Y + D-pad | view chip row (top-right) |
| Open Build drawer | B key or click palette tab | LB | Build tab (left edge) |
| Place unit | drag from palette to grid (ghost shows footprint, green/red); or click palette then click grid | in Build: D-pad choose unit, A pick up → grid cursor (left stick moves 1 tile per tick, snapped) → A place | drag from palette onto the grid; or tap palette item, then tap tile |
| Rotate unit (while placing/selected) | R | X | rotate handle on the ghost; or ⟳ in the unit card |
| Move unit | drag selected unit | select, hold A → move mode | long-press unit then drag |
| Delete unit | Del / Backspace (confirm if piped) | select, hold X (confirm) | unit card 🗑 (confirm) |
| Select unit | left-click | D-pad cycles units in reading order; RB/LB in Inspect cycles neighbours; A selects | tap |
| Connect ports (pipe) | click an outlet port (ports appear on hover), click a compatible inlet; or drag port→port. Incompatible ports grey out | select unit → Y "pipe mode": D-pad cycles its free ports, A starts, then D-pad/stick jumps between *compatible* ports in the world (port magnet, nearest first), A connects, B cancels | tap an outlet port (ports enlarge to 52 px when a unit is selected), then tap a highlighted inlet; drag also works |
| Disconnect | right-click pipe → Disconnect; or select pipe + Del | select pipe (D-pad onto pipe in pipe mode), hold X | tap pipe → ✂ |
| Inspect stream | hover pipe (tooltip); click to pin in Inspect | in pipe mode, A on a pipe | tap pipe |
| Set setpoint (coarse) | drag knob/slider; wheel over knob | in Inspect: D-pad up/down selects knob, left/right steps (coarse) | drag slider; big −/+ steppers |
| Set setpoint (fine) | Shift+wheel or Shift+drag (10× finer) | LT/RT = fine −/+ (analogue: rate ∝ pressure) | hold − or + (accelerating repeat); two-finger drag on the slider = fine |
| Type exact value | double-click the number → numeric field, Enter | A on the number → numeric keypad overlay (D-pad + A) | tap the number → numeric keypad overlay (never the full QWERTY: GIGAWATT finding) |
| Choose catalyst / option | dropdown | A opens list, D-pad, A | tap → list sheet |
| Drag operating point on Equilibrium Window | drag the handle | in the window: left stick X moves T | drag the handle |
| Call it (prediction) | type in the prediction field on the brief / HUD chip | A on chip → keypad | tap chip → keypad |
| Commission (solve) | Space or the button | Y | ▶ Commission button (bottom-right, 64 px) |
| Start shift | Space after commission | Y | ▶ Start shift |
| Speed / pause | Space (pause/resume during shift), `[` `]` slower/faster | START = pause menu; View/Select = cycle speed | speed pill tap |
| Acknowledge alarm | click ACK on the row; **K** acknowledges the top alarm (A is taken by camera pan); Shift+K all | A on the focused alarm row; **R3** acknowledges the top alarm from anywhere | tap ACK on the alarm row; tap the beacon on the unit |
| Trip interlock / E-stop | click TRIP (confirm hold 0.5 s) | hold RB + LB 0.5 s on a unit (E-stop that unit) | hold the TRIP button 0.5 s |
| Stream table / Data drawer | T | RB from the world (cycles Build→world→Inspect→Data) | Data tab (bottom edge) |
| Pin a trend | right-click a readout → Pin | X on a readout | long-press a readout → Pin |
| Why? | `?` or F2 | View on Report / Inspect | "Why?" button |
| Codex | C (F1 = help/controls) | hold START → Codex | Codex in menu; every term underlined → tap opens its entry |
| Molecule Lens | M with a unit/stream selected | Y with a stream selected in Inspect | 🔍 in the unit/stream card |
| Undo / redo | Ctrl+Z / Ctrl+Y (design phase only) | LB+X / RB+X | ↶ ↷ in the HUD (design phase only) |
| Back / close | Esc | B | Android Back / ✕ |
| Replay near miss | Report button | A on it | tap |

Rules carried from GIGAWATT: typing in any field never moves the camera; sliders apply 150 ms after the last step (not only on release); drags that start on a button cancel the press; every control is pad-focusable (sliders, dropdowns, checkboxes, the Equilibrium Window handle, the stream table); focus is restored after drawer rebuilds and never escapes a modal; the pad hint bar uses drawn button glyphs, not font glyphs.

### 6.4 Layout per form factor
| Layout | Drawers | World share | Notes |
|---|---|---|---|
| desktop (≥1600 px wide) | left 340 px, right 420 px, bottom 260 px; resizable | ≥ 55 % | Equilibrium Window can float in-world |
| handheld (Deck 1280x800) | one side drawer at a time (Build *or* Inspect), bottom drawer 40 % height max | ≥ 50 % | console collapses to the 3 top alarms + trend sparkline |
| phone (2424x1080 + insets) | drawers default 42 % width (GIGAWATT: 30 % clipped), full-height; bottom data drawer becomes a full-width sheet | ≥ 50 % when a drawer is open | 52 px min targets; camera buttons on screen; stream table shows 4 columns with horizontal paging, never scrollbars |

All text wraps; button rows flow (`HFlowContainer` only on whole-page scroll screens; GIGAWATT pitfall). Layout audit (core `CB_AUDIT=1`) must report zero squeezed/overflowing controls at the PROGRAM resolutions.

---

## 7. Teaching

Design rules (RESEARCH.md): the equation is the rule set; visible failure cause; attempt first, explain after (productive failure, g≈0.36); scaffold early levels (unscaffolded discovery overloads novices); histograms for mastery; exam bridges for transfer. Invest in feedback and visualisation (in-game support d≈0.34-0.62), not cosmetics.

### 7.1 The teaching loop inside every level
1. **Brief** (≤ 3 sentences, a character's voice) states the job and the constraint, never the method. ("Make 10 kmol/h of ammonia. Don't waste hydrogen; it's the expensive one." — not "use a 1:3 molar ratio").
2. **Attempt**: the player builds and commissions. Nothing explains the science up front beyond what the units' cards say they do.
3. **Visible failure cause** on the world and the plot (the beam tilts, the curve, the purge greys, the bed cracks).
4. **Why panel** (§7.3) with the player's own numbers, plus a *one-line* Codex link. Learner mode opens it automatically after a failed run; Engineer mode shows a "Why?" chip.
5. **Consolidation**: after the first ★, the level's Codex entry unlocks its formal page (equation, assumptions, a worked textbook example using the level's numbers), and the coach offers "Try predicting it" (Call it) on the next run.
6. **Transfer**: the chapter's exam-bridge level uses JEE/NEET numbers and asks for the prediction before the run.

### 7.2 Coach (tutorial from real state)
Core `coach` framework (GIGAWATT pattern: steps advance from engine state, never from button clicks; every step has a "Why:" line; device-aware wording: "click / tap / press A"). Steps are data:
```ts
interface CoachStep { id: string; level: string; text: Record<'mouse'|'touch'|'pad', string>; why: string;
  done: (g: GameState) => boolean;         // pure predicate on engine state
  focus?: { unit?: string; port?: string; drawer?: string; knob?: string };   // what to highlight
  skipIf?: (g: GameState) => boolean }     // e.g. player already did it
```
Coach scripts exist for L01-L03 (full hand-holding), and one or two steps on the first appearance of every new unit or knob (e.g. L10 "Pin the Equilibrium Window": done when `ui.pinned.includes('eqwin')`, reported by an action). Coach never covers the thing it points at (GIGAWATT: card bottom-left, hidden on full-screen pages), is pad-focusable and dismissible; `CB_NOCOACH` disables it.

**Needs-you-now chip** (GIGAWATT's best teaching device, one line under the goal meter): computed by `queries/needs.ts` from state with a priority list: unconnected port → unsolved/failed commission → goal not met with the dominant blame factor → an active High alarm → "you can still improve cost by X %". Never more than one.

### 7.3 Why panel: explanations from the player's own numbers
**Mechanism.** Every run stores a `RunRecord` (setpoints, solved key quantities per unit: T_in/out, P, K, Q/K, X, X_eq, rate at inlet, residence time, duties, KPIs). The `explainRun(prev, cur)` query builds a **blame tree**:
1. Find the KPI that moved most (relative) or the failed goal.
2. Decompose it with the level's **factor model**, e.g. production = feed × X; X = min-like blend of X_eq (thermodynamic ceiling) and X_kin (kinetic progress): the engine reports the *approach to equilibrium* η = X / X_eq.
3. Attribute the change by **one-at-a-time sensitivity**: re-solve the flowsheet with each changed setpoint reverted (cheap: ≤ 8 re-solves), rank by effect.
4. Fill a template for the top factor with real numbers and a direction word. Templates per (knob, physics) pair, e.g. `T↑ on exothermic equilibrium-limited`, `T↑ on kinetics-limited`, `P↑ with Δn<0`, `P↑ with Δn=0`, `inert↑ at constant P`, `purge↓ inert accumulation`, `T_in below light-off`, `coolant loss runaway`, `azeotrope limit`, `limiting reagent switched`.

Example outputs (numbers are from the solver; these show the intended voice, ≤ 3 sentences, all numbers with units):
- *T↑ equilibrium-limited:* "You raised the converter inlet from 420 °C to 520 °C to speed it up. The reaction is exothermic (ΔH = −92 kJ per mol N₂), so K fell from 6.2×10⁻⁵ to 4.5×10⁻⁶ and the ceiling dropped from 27 % to 14 % NH₃. The bed was already at 96 % of equilibrium, so the extra speed bought nothing: production fell 31 %."
- *P↑ with Δn = 0:* "You doubled the shift-converter pressure. CO + H₂O ⇌ CO₂ + H₂ has the same number of gas moles on both sides, so K and the equilibrium conversion did not change (still 92 %). You paid 1.4 MW of extra compression for nothing."
- *No purge:* "Argon enters at 0.30 kmol/h and nothing removes it, so every pass through the loop adds more. A steady state only exists if something lets argon out: add a purge."
- *Runaway (L24 numbers, K7):* "Cooling water flow fell 70 % at 02:14. The reactor was on its hot branch at 117 °C; with a third of the jacket it made heat faster than it could lose it, and the temperature climbed 20 K in 49 s toward a new balance near 152 °C, past the 140 °C relief point. A trip at 125 °C that cut the feed would have held it." (Other examples above show the intended voice; their numbers are placeholders that the template tests replace with engine values.)
- *Limiting reagent:* "Air is now the limiting reagent: 21 % O₂ × 900 kmol/h = 189 kmol/h O₂, but burning 200 kmol/h S needs 200. 11 kmol/h of sulfur left unburnt and the stack SO₂ alarm tripped."

Rules: every explanation names the knob the player touched, the physical quantity that moved (with before → after numbers), and the KPI consequence; uses plain words before symbols; never blames the player ("the bed was already near equilibrium", not "you made a mistake"); ends with *one* actionable hint only in Learner mode. All templates have unit tests that feed a constructed RunRecord pair and assert the sentence and numbers (§9.8).

### 7.4 Call it (prediction)
Optional in every level, mandatory for ★3 in exam bridges. One quantity, level-defined (e.g. "kg/h NH₃ leaving R-101", "K at 450 °C", "outlet temperature of the adiabatic bed"). Entered before commissioning; locked when the solve runs. Graded with the oracle tolerance of that level (usually 2 %, 1 K for temperatures). The Report shows the prediction beside the engine value and, if off, the Why panel explains the gap ("you predicted with ΔH constant; the engine uses Cp(T): the difference is 3.1 %. Switch Thermo detail to Textbook to compare." §3.3).

### 7.5 Codex
Entries are data (`src/data/codex.ts`), each with: `id`, `title`, `what` (one plain sentence), `why` (why a plant engineer cares), `equation` (rendered as text + a small SVG/MathText), `inThisGame` (how the engine computes it, with the **simplification named**, e.g. "ideal gas: no fugacity correction; at 300 bar this under-predicts NH₃ by ~X %"), `source` (citation), `liveVerdict(g)` (a "your plant now" line computed from state, GIGAWATT pattern), `go` (Take me there: unit or drawer), `unlock` (level or event). v0.1 target: **60 entries** in 7 groups:
- *Foundations (10):* mole, molar mass, molar flow vs mass flow, mole fraction & partial pressure (Dalton), ideal gas law, stoichiometric coefficient & extent of reaction, limiting/excess reagent, conversion/yield/selectivity, empirical formula & combustion analysis, atom balance.
- *Energy (9):* enthalpy & ΔHf°, Hess's law, ΔU vs ΔH (Δn_g RT), heat capacity & Shomate equation, heat duty, adiabatic temperature rise, steam & latent heat, heat exchangers & ΔT_min, Gibbs energy & spontaneity.
- *Equilibrium (10):* dynamic equilibrium, K and Q, Kp vs Kc (Kp = Kc(RT)^Δn), ΔG° = −RT ln K, van 't Hoff (and its constant-ΔH assumption), Le Chatelier: temperature / pressure / concentration / inerts at constant V vs constant P, equilibrium conversion vs temperature, non-ideality & fugacity (why the game flags it).
- *Kinetics (8):* rate & rate law, order, Arrhenius & activation energy, half-life, catalysts change rate not K, light-off & catalyst window, Temkin-Pyzhev & approach to equilibrium, optimal temperature progression.
- *Reactors & separations (11):* CSTR, PFR/packed bed, residence time & space velocity, multi-bed with inter-cooling, flash & Raoult's law, vapour pressure (Antoine), Rachford-Rice, distillation & reflux, azeotropes, absorption, condensation by refrigeration.
- *Loops & economics (6):* recycle, purge & inert build-up, tear streams & convergence (what the solver does), compressor work, cost correlations (Turton) & CEPCI, utility costs & carbon price.
- *Safety & environment (6 + 4 incident pages):* exotherms & Semenov runaway, multiple steady states, relief valves, explosive limits, SO₂/NOₓ/N₂O emissions & limits (limit values from the region pack), plus the four real-incident pages.

**Real-incident pages (binding rules; drafts in `research/incidents.md`).** Bhopal 1984, Seveso 1976, T2 Laboratories 2007, Visakhapatnam 2020. Each page: date and place, what the plant made, what happened (3-5 plain sentences), the human toll **with attribution and ranges where disputed** (Bhopal: Broughton 2005 review ≥ 3 800 immediate deaths and 15 000-20 000 premature deaths over two decades, government and survivor-group figures named as such), root causes as the official investigations concluded them, one-sentence lesson tied to a game mechanic, what changed afterwards, 2-4 sources. Rules: Codex only; unlocked after the related mechanic (L24 → T2 and Seveso; L20/L25 → Bhopal (inventory, safeguards out of service); a storage/monitoring entry → Visakhapatnam); a content note heads the group ("These pages describe real industrial accidents in which people died or were harmed. They are included to explain why safeguards exist, and to remember those affected."); no real site, company or place name in any level; never scored, never an achievement; in-game failures of fictional plants are stylised and read as "what was missed", not as a payoff. Every figure marked UNVERIFIED in the draft must be verified against the primary source (CSB report, Broughton 2005, the Andhra Pradesh High Powered Committee report, EUR-Lex 82/501/EEC) before release, and the Bhopal and Visakhapatnam pages get a human reviewer familiar with the cases (BUILD-PLAN M5).
Every simplification in §3.12 must have a Codex entry; a test asserts it (§9.8).

### 7.6 Modes and scaffolding
| | Learner | Engineer | Sandbox |
|---|---|---|---|
| Coach | full | first-appearance steps only | off |
| Why panel | auto-opens on failure | on demand | on demand |
| Thermo detail default | Book data in exam bridges, Rigorous elsewhere (toggle visible) | Rigorous (toggle allowed; histograms record which) | player's choice |
| Interlock assist | automatic trip at 90 % of runaway margin (counts as failed shift, explains) | player designs trips; none by default | optional |
| Events in shift | gentler magnitudes, auto-pause on Critical | full | off unless enabled |
| Costs | shown, not failing | can fail goals | shown |
| Unit limits | as level | as level | none (phone caps still apply, §3.11) |

### 7.7 Exam bridges
Exam-bridge **problem sets are region-pack data** (§11): the level shell (plant, units, Call-it plumbing) is shared; the numbers, the quoted problem text, its citation and the Report's "textbook working" come from the pack's exam set. The `global` pack's v0.1 set is the NCERT/JEE-style set below (PROGRAM decision 1 allows real NCERT/JEE quotes with sources; the citation is a source field, not setting text); other packs can supply AP / A-level / IB sets later. Exam bridges are optional side nodes (§2.4).

Each chapter has an exam-bridge level (L04, L09, L14, L18, L20) whose numbers come from an NCERT or JEE/NEET-style problem (§9.2 lists the oracle id). The player sets up the problem as a plant, must Call it before commissioning, and the Report shows the textbook working beside the engine's result ("NCERT XI ch 6 style: Kp = 85.9 bar at 400 K; your vessel: 85.9 bar"). This makes transfer explicit (RESEARCH design rule 5). Exam bridges use **Book data** (§3.3: the problem's own constants) so the numbers match the book exactly; the Report also shows the Rigorous (NIST) answer and the Textbook (constant-ΔH) answer, and the Why panel explains any gap.

---

## 8. Engine architecture (on cobanana-core)

### 8.1 Layout
Mirrors GIGAWATT and PROGRAM.md. `src/sim` and `src/data` never import `engine/`; nothing in `src/` touches Godot, DOM or storage directly.
```
src/
  engine/  protocol.ts (core kit: init/act/q/env/ping)  state.ts  persistence.ts
           actions/{design,setpoints,run,shift,session,meta}.ts      queries/{plant,unit,stream,plots,explain,needs,codex,meta}.ts
  sim/
    thermo/   species.ts (lookup) shomate.ts textbook.ts mixture.ts (H, S, Cp of streams) vle.ts (Antoine, NRTL, Henry) nonideal.ts (virial Z gauge)
    chem/     reactions.ts  equilibrium.ts (K(T), extent solver)  kinetics.ts (rate laws)  stoich.ts (atom matrix, limiting reagent)
    units/    feed.ts mixer.ts splitter.ts heater.ts cooler.ts hx.ts compressor.ts pump.ts valve.ts
              rx_stoich.ts rx_equil.ts rx_pfr.ts rx_cstr.ts rx_batch.ts (fermenter) gauze.ts flash.ts column.ts absorber.ts
              boiler.ts stack.ts relief.ts product.ts   (one file per unit: a pure function, §3.6)
    flowsheet/ graph.ts (ports, streams, SCC/Tarjan) tear.ts (tear selection) solve.ts (sequential-modular + Wegstein/Broyden) diagnose.ts
    dynamics/ shift.ts (pipeline) reactorODE.ts lags.ts events.ts alarms.ts safety.ts
    econ/     capex.ts (Turton) opex.ts (utilities, feeds) kpi.ts emissions.ts
    explain/  blame.ts templates.ts
    levels/   goals.ts stars.ts
  data/       species.ts reactions.ts kinetics.ts catalysts.ts equipment.ts prices.ts benchmarks.ts levels/*.ts codex.ts coach.ts events.ts incidents.ts
  env/        env.ts agents.ts scenarios.ts      playtest/ personas.ts invariants.ts report.ts
  oracle/     ncert.test.ts cheme.test.ts (§9.2)  props/*.test.ts (§9.3)
```
Core provides (do not re-implement): protocol kit, seeded RNG (mulberry32), action/query registry with teaching error messages, persistence, headless shim, bridge (stdio + `--port 47903`), Gym env helpers, golden-trajectory helper, persona runner + invariants, and **numerics**: dense LU (exists: `luDecompose/luSolve`), damped Newton-Raphson, RK4, backward Euler, scalar root finding (Brent), unit helpers. EQUILIBRIUM adds its own: Wegstein, Broyden (small dense, in `flowsheet/solve.ts`; propose upstreaming to core after v0.1 since GRID's load flow could use Broyden too).

### 8.2 GameState
```ts
interface EqState extends BaseState {               // core BaseState: game, seed, rng, tick, mode, level, levelStart, status, statusReason, missionsDone, log, saveVersion,
                                                     //   region ('global'), ruleset (set by the engine), levelActions (what a solution code replays)
  phase: 'design'|'commissioned'|'firstrun'|'shift'|'report';
  thermoDetail: 'rigorous'|'textbook'|'book';        // §3.3
  species: string[];                                 // the level's active species (≤ 12); every n[] is indexed by it
  flowsheet: { units: Unit[]; streams: Stream[]; nextId: number };   // Unit = {id, type, pos:{x,y}, rot:0|1|2|3, params:Record<string,number|string>, catalystId?}
                                                                     // Stream = {id, from:{unit,port}, to:{unit,port}}
  feeds: Record<string, FeedSpec>;                   // per feed unit: composition, flow, T, P, price key (resolved through the region pack)
  solved: SolveResult | null;                        // last steady-state result (stream n/T/P, unit results, diagnostics; NO tear-history snapshots: those are a query)
  shift: ShiftState | null;                          // shift clock (plant s = ticks since shift start), speed, event queue, dynamic unit states, alarms, interlocks, accumulators
  trends: Record<string, number[]>;                  // ≤ 3 pinned + 4 fixed series, 1 sample / 30 plant-s, ring of 960 (8 h)
  replay: ReplayFrame[];                             // near-miss ring: 60 frames at 1 Hz, compact (unit T/P, alarm bits)
  runs: RunRecord[];                                 // last 10 (Why/Runs/diff); prediction + outcome
  prediction: { quantity: string; value: number } | null;
  progress: { stars: Record<string, 0|1|2|3>; best: Record<string, Record<string, number>>; codex: string[]; rank: number; flags: string[]; pendingScores: number };
  ui: { pinned: string[]; coachStep: string | null };  // only what coach predicates need
}
```
**State size budget**: ≤ 256 KB serialised for the largest level mid-shift (asserted by a test on L24 and the L20 loop at the end of a full shift). Save format = core `SaveStore` JSON with `saveVersion`; migrations registered from v1. Derived data (stream enthalpies, mole fractions, tear histories, Equilibrium-Window curves) are never stored.

**Time**: one core `tick` = **1 plant-second**. The built-in `tick(n)` action advances the shift (there is no game-specific tick action; `tick` is reserved by core). Outside a shift, `tick` is a no-op apart from the first-run animation clock. The front-end calls `tick(n)` at **10 Hz** (n = plant-seconds per 100 ms at the current speed: 12 at cruise, 1 at watch ×1, up to 192 at cruise ×16 capped) and interpolates visuals between snapshots; it never calls the engine per frame.

**Snapshot** (`GameDef.snapshot`): a compact view for the UI after each act: phase, KPIs, goal meters, alarms, per-unit display values (T, P, key flows, glow/shake scalars), per-stream display values (flow, T, colour weights), shift clock. No trends, replay, runs, levelActions or full solve (those are queries). Target ≤ 8 KB per snapshot for L20, so the loopback bridge carries ≤ 80 KB/s.

All numbers are SI internally (mol/s, K, Pa, J/s, kg, s); the UI converts (kmol/h, °C, bar, MW, t/d). One `units.ts` helper per conversion, tested.

### 8.3 Actions (each returns `{ok, message}`; message teaches on failure)
| Domain | Actions |
|---|---|
| design | `placeUnit(type, x, y, rot)`, `moveUnit(id, x, y)`, `rotateUnit(id)`, `deleteUnit(id)`, `connect(fromUnit, fromPort, toUnit, toPort)`, `disconnect(streamId)`, `setParam(unitId, key, value)`, `setFeed(feedId, spec)`, `setCatalyst(unitId, catalystId)`, `undo()`, `redo()` |
| run | `predict(quantity, value)`, `commission()` (steady-state solve; on success phase→commissioned), `setThermoDetail(d)` |
| shift | `startShift()`, core `tick(n)` (n plant-seconds; reserved built-in), `setSpeed(n)`, `setpoint(unitId, key, value)` (during a shift: ramped by the unit's actuator rate), `ack(alarmId)`, `trip(unitId)`, `resetTrip(unitId)` |
| session | core built-ins `newGame(seed, mode)`, `startLevel(id, seed, mode, region)` (also used for Restart: it clears `levelActions`, so a solution code never contains an abandoned attempt), `save(slot)`, `load(slot)`, `setMode(m)`. The region is chosen at new game (title screen; only shipping packs listed) |
| scores | query `solutionCode()` → core `encodeSolution` of the current level run (§8.8); the network call is Godot's job, the engine only builds and verifies codes |
| meta | `markCoach(stepId)`, `pin(widget)`, `claimStars()` |
Teaching error examples: `connect` to an occupied port → "That inlet already has a pipe. Mix two streams with a Mixer first."; `connect` gas outlet to a pump → "A pump moves liquids. To raise the pressure of a gas, use a compressor."; `setParam(splitter, 'purge', 1.2)` → "A split fraction is a share of the stream: it must be between 0 and 1."; `commission()` with an open port → "Stream from E-101 outlet goes nowhere. Every outlet must end in a unit, a product tank or the stack."

### 8.4 Queries (read-only; names unique-checked at load)
`plant()` (units, streams, phase, KPIs) · `unitCard(id)` (params, limits, results, alarms) · `streamTable(opts)` · `stream(id)` · `eqWindow(unitId, opts)` (X_eq(T) curve, iso-rate contours, operating line, points, staircase; ≤ 120 points per curve) · `semenov(unitId)` (G(T), R(T), steady states with stability) · `columnProfile(unitId)` · `lens(streamOrUnitId, n)` (molecule counts by largest remainder) · `ledger()` (atom balance, energy Sankey, cost breakdown) · `kpis()` · `goals()` · `explainRun(a?, b?)` · `needs()` · `legalPorts(unitId, port)` · `palette()` · `levelBrief(id)` · `histogram(levelId, metric)` · `codex(id)` · `codexList()` · `trends(keys, window)` · `incident()` (last incident report) · `replay()` (near-miss ring buffer).

### 8.5 Systems pipeline (shift tick)
The shift advances in fixed **dt = 1 s of plant time** sub-steps = one core tick each (the front-end requests `tick(n)` at 10 Hz, §8.2). Systems run in a fixed order (RNG draws are sequenced; insert new systems deliberately, GIGAWATT rule):
1. `events` — fire scheduled/random events from the level's event table (seeded): cooling-water pump trip (UA × 0.3), feed composition drift (+inerts), catalyst ageing step, compressor trip, demand spike, utility price spike, power dip.
2. `actuators` — move actual setpoints toward requested ones at actuator rates (valves 10 %/s, heater duty 5 %/s, compressor speed 2 %/s).
3. `steadyState` — if any setpoint or event changed the boundary conditions since the last solve, re-solve the flowsheet (warm start from the last solution; ≤ 20 ms budget on phone, §3.11). Debounced: at most once per 5 plant-seconds.
4. `dynamics` — integrate dynamic unit states: reactor energy/material ODEs (backward Euler; RK4 for non-stiff fermenter), vessel pressures, first-order lags of every displayed stream toward the steady-state solution (τ = holdup / volumetric flow, clamped 5-300 s).
5. `safety` — relief valves (open when P > set, flow by a simplified gas-orifice equation), interlocks (trip when a variable crosses its trip point; tripped units go to safe state), containment loss check (P > 1.5 × design or T > material limit).
6. `alarms` — evaluate limits with deadband and on-delay; raise/clear; priorities.
7. `econ` — accumulate production, feed and utility cost, emissions, off-spec time.
8. `goals` — evaluate shift goals (e.g. produce ≥ X t on-spec, no Critical alarm > 60 s, emissions ≤ limit).
9. `record` — trends ring buffer (1 sample / 5 s), near-miss buffer (60 s at 1 Hz), incident capture.

Design-phase `commission()` uses only the steady-state solver (§3.6). The shift's dynamic layer is quasi-steady for the network and dynamic for reactors and vessels (§3.9).

### 8.6 Agent environment
Core Gym shape: `reset({seed, level, mode})`, `step({name, args})`, `observe()`, `describe()` (compact text for LLM agents), `legalActions({full})` (dry-run each candidate), `hash()` (FNV of state).
- **Observation**: structured: level goals, units with params and limits, solved streams (flows by species, T, P), KPIs, alarms, shift time. Plus a fixed-length numeric vector for RL on a given level: for each knob of the level's *fixed reference flowsheet* (normalised to [0,1] over its legal range) + key outputs (normalised production, cost/t, energy/t, emissions, max T margin, max P margin, active alarm count) — length published per level by `env.spec(level)`.
- **Action space**: (a) *design*: the action list above (discrete, parameterised); (b) *operate*: `setpoint(unit, key, value)` with value on a 21-point grid (discrete) or continuous (Box) via `env.spec`. `legalActions` enumerates valid placements on a coarse grid (every 2 tiles) to keep it small.
- **Reward**: per shift tick: on-spec production value − (feed + utility + carbon cost) per second, −100 per Critical alarm onset, −1000 and `done` on containment loss; commission failure −1; `truncated` at shift end. For design-only levels: terminal reward = −normalised primary metric if goals met, else −10.
- **Python wrapper**: `python/equilibrium_env.py` spawning `node godot/sidecar/bridge.mjs` (GIGAWATT pattern).

### 8.7 Personas (core persona runner; every persona plays every level; invariants checked after every action)
| Persona | Behaviour | Must |
|---|---|---|
| idle | commissions the reference flowsheet the level starts with (if any), never touches anything, lets the shift run | **lose** every level that has a shift (events push it off-spec or into a trip) and fail every level whose start state does not meet the goal; asserted |
| novice | random-but-plausible: picks units from the palette, connects compatible ports, moves knobs ±10-30 % of range, retries ≤ 5 times | not crash; never produce NaN; explanation exists for every failure |
| expert | scripted per level using queries: builds the reference solution, then optimises knobs by golden-section / coordinate search on the primary metric, handles events with a scripted response (open quench, raise purge, trip) | **win ★★★** on every level; its best metric defines the "Chief Engineer" threshold via calibration (§9.6) |
| exam student | builds the minimal plant and predicts with the textbook formula (constant ΔH, ideal gas) | Called it within tolerance on all exam-bridge levels (Book data mode) |
| cheese-seeker | adversarial: extremes of every knob (T min/max, P max, purge 0/1, split 0/1, zero feed, 1000× catalyst), degenerate topologies (product looped to feed, bypass the reactor, vent everything, mixer-splitter tricks, recycle the product tank), Call-it brute force, pause abuse in shift | **never** reaches ★★ or better by a degenerate route; every exploit found becomes a regression test (§9.5) |
| monkey (Haiku in QA, persona in CI) | uniformly random legal actions | no crash, no invariant violation over 10 000 actions |

Invariants checked after every action and tick: atom balance closes (|in−out| ≤ 1e-9 relative + accumulation in dynamic holdups), energy balance closes (≤ 1e-6 relative), no negative flows/mole fractions, T within [50 K, 3000 K], P within (0, 1000 bar], all numbers finite, `hash()` deterministic on replay, every `ok:false` has a non-empty message, every failed goal has an `explainRun` result.

### 8.8 Online leaderboards and solution codes (PROGRAM decision 2)
One shared service, `cobanana-scores` (separate repo; Hono; Cloudflare Workers + D1 or Docker Node + SQLite). EQUILIBRIUM's part is a pure verifier and a client.

**Ruleset id** (core): `equilibrium:<region>@<packVersion>.<rulesetVersion>`, e.g. `equilibrium:global@1.1`. `GAME.rulesetVersion` is bumped by any change that can move a metric (a thermo coefficient, a rate law, a cost correlation, a level's goal, seed or metric definition); the region pack bumps its `rulesetVersion` when a price, limit or exam set changes. Scores are compared only within one ruleset (and one mode). A golden test pins the metrics of every level's reference solution: a change that moves them without a version bump fails CI.

**Solution code** = core `CB1` code (`core/ts/kit/solution.ts`): `CB1.<base64url(JSON [game, level, ruleset, seed, mode, actions])>.<crc32>`, where `actions` is the engine-recorded `state.levelActions` (every successful action of the run in order, including `tick(n)`; core excludes save/load/setMode/newGame/startLevel). EQUILIBRIUM adds no format of its own. Consequences decided here:
- **Leaderboard seed**: ranked runs start with the level's fixed `leaderboardSeed` (in the level data, per ruleset) so everyone faces the same event sequence; free practice may use other seeds and is not submitted.
- **Speed independence**: because `tick(n)` sequences differ with play speed, property P21 (identical results for any partition of ticks) is a hard requirement, tested on every shift level.
- **Size**: core caps 20 000 actions / 256 KB. A full 8-h shift at the 10 Hz cadence records ≤ 2 400 `tick` entries plus the design actions; a test asserts the expert and novice runs of every level stay under 8 000 actions. Request to core (BUILD-PLAN M0): optionally merge consecutive `tick(n)` entries in `levelActions` (valid under P21) to shrink codes further.
- **`GAME.metrics(s)`** returns the level's three histogram metrics by stable key (e.g. `{ cost_usd_per_t, energy_gj_per_t, kg_so2_per_t }`), all finite; `src/verify.ts` is `export const verify = makeVerifier(GAME)`. Core `verify` returns `ok` only for a **won** run; stars are computed from the metrics by the client and server with the same `stars(levelId, metrics)` pure function.
- Budget ≤ 2 s CPU on desktop Node for the longest shift (§3.11). Cloudflare Workers' free plan (10 ms CPU) cannot replay a shift: **the Workers target needs the paid plan's CPU limit, or the Docker target** (flagged to the user).

**Client (Godot side; the engine only builds codes).** After a won Report the game queries `solutionCode()`, appends `{code, ruleset, level, mode, playerId, nickname?}` to `user://scores/queue.json`, and a background sender POSTs with exponential backoff (5 s → 10 min, jitter; queue cap 200; dropped oldest first with a toast). Anonymous player id = random 128-bit generated once at first launch (Godot `Crypto`, not the engine RNG), stored in settings; optional nickname, filtered server-side. Histograms per (ruleset, level, mode, metric) are fetched on Report open and cached in `user://scores/hist/<key>.json` with a timestamp; offline, the cached histogram is shown with "offline · updated 3 days ago". The game is fully playable offline; nothing blocks on the network. Settings: "Share scores online" (default on, explained once on first Report), "Nickname".

**Histogram UI (Report card).** Three small histograms (primary first) side by side on desktop, a swipeable row on phone, D-pad switchable on pad: bars of the distribution, the player's bar marked with a teal pin and the label "you · top 12 %", a faint ghost pin for the personal best, the ★★★ threshold as a dashed line, title shows metric + unit + ruleset short name. **Empty-state fallback** only when the server has never returned data for that key: the calibration sample of simulated engineers (§9.6), titled "Simulated engineers (offline sample)", hatched bars, no percentile claim.

**Server contract** (documented here so both repos agree): `POST /v1/eq/submit {code, playerId, nickname?}` → server calls `verify`, stores `{ruleset, level, mode, metrics, playerId, codeHash, at}` (one best per player per key per metric); `GET /v1/eq/hist?ruleset&level&mode&metric` → `{bins, edges, count, p}`; rate limit per playerId. The server imports EQUILIBRIUM's `verify` as a built bundle per ruleset (old rulesets stay verifiable).

### 8.9 Strings and localisation (PROGRAM decision 3)
English only in v0.1, every player-facing string externalised, following the core scaffold: `src/locales/en.ts` re-exporting `src/locales/en/{ui,briefs,coach,why,codex,events,errors}.ts` (engine side: action error messages, Why templates, briefs, coach text, Codex, event cards; `t()` from `src/i18n.ts`) and `godot/locales/strings.csv` (Godot `TranslationServer`, UI chrome). Core `@core/i18n` (`createI18n`, `checkLocales`) does lookup, fallback and placeholder checks. Keys, not sentences, in code: `t('err.connect.occupied')`; templates use named placeholders filled with pack-formatted numbers (`{T_in}` → "420 °C"; `{cost}` → "$31.20/t"). Region packs carry their flavour strings (character names, place names, brief flavour) in the pack's `strings` (core `RegionPack.strings`); region ≠ language. Lint: no string literal longer than 3 words in `src/sim`, `src/engine/actions`, `src/explain` outside `strings/`; every key used exists in `en`; no orphan keys. Chemical formulas use Unicode subscripts in strings, never markup.

---

## 9. Test plan (quality is the jewel)

### 9.1 Layers and gates
| Layer | Where | Gate |
|---|---|---|
| Data tests (provenance, units, plausibility, polynomial continuity) | `src/data/*.test.ts` | CI, every commit |
| Textbook oracles (§9.2) | `src/oracle/*.test.ts`, table-driven from `src/oracle/oracles.json` | CI; 100 % must pass |
| Dual-implementation science tests (§9.2.3) | `src/oracle/dual.test.ts` vs JSON fixtures generated by the Python research scripts | CI |
| Property / fuzz tests (§9.3) | `src/props/*.test.ts`, seeded | CI (10 000 cases each; nightly 1 000 000) |
| Flowsheet convergence suite (§9.4) | `src/sim/flowsheet/*.test.ts` | CI |
| Unit-op tests (one file per unit; each with ≥ 3 oracles or analytic cases) | `src/sim/units/*.test.ts` | CI |
| Level solvability + cheese + calibration (§9.5-9.6) | `scripts/calibrate-levels.ts`, `src/levels/*.test.ts` | CI (fast mode), nightly (full search) |
| Failure-mode and teaching tests (§9.7-9.8) | `src/explain/*.test.ts`, `src/levels/failures.test.ts` | CI |
| Golden trajectories (§9.9) | `src/golden.test.ts` | CI; regenerate only deliberately |
| Personas + invariants (§8.7) | `src/playtest/*` | CI (short), nightly (long) |
| Godot smoke, layout audit, input parity (§9.10) | core harness | CI smoke; release checklist for the rest |
| Playtest rounds incl. fun critic and educator (§9.11) | PROGRAM rounds 1-2 | before every tagged release |
| Performance (§3.11) | `scripts/bench-solve.ts`, Pixel pass | CI desktop regression; release checklist phone |

`tsc --noEmit` clean, no skipped tests, no weakened tolerances (PROGRAM rule: never weaken a test to make it pass).

### 9.2 Textbook oracles: 78 problems
**Status, honestly.** 43 chemistry problems (EQ-NC-001…043) and 35 chemical-engineering problems (EQ-CE-001…035) were collected and **solved in Python** by two independent workers (scripts in `research/oracles_*.py`). The web sources for NCERT were unreachable from the research environment, so **every citation is "recalled, not verified"** (R) or **constructed** in textbook style (C); the numbers and answers are self-consistent, so the tests are valid as engine tests regardless. A third worker **blind-solved 18 of them** (13 CE + 5 NC) from statements with answers removed: **all 18 agreed numerically**; it found 3 statement defects, corrected below (marked R*): the gas constant in EQ-NC-024, a mislabelled HI problem (EQ-NC-026), and missing k units in EQ-NC-037; it also flagged EQ-CE-026 (two rows must not be mixed), EQ-CE-011 (fix air composition) and EQ-CE-024 (state what is compared). Implementation tasks before v0.1 release: (1) download the NCERT PDFs (kech101/105/106, lech103) and verify each R citation's exercise number and numbers (a Haiku task); (2) check the CE citations against the books where available; (3) blind-cross-check the remaining 60 problems the same way. Until (1)-(2) are done, the Codex and exam-bridge Reports say "NCERT-style" rather than quoting exercise numbers.

**Coverage** (exact counts): NC: mole concept 4 · stoichiometry, limiting reagent, % yield 5 · empirical formula / combustion analysis 3 · gas laws & Dalton 3 · thermochemistry (ΔH from ΔHf, Hess, ΔU vs ΔH, bond enthalpy, Gibbs) 6 · equilibrium (Kc, Kp↔Kc, ICE incl. quadratic, α, ΔG° = −RT ln K) 8 · Le Chatelier directions 5 · kinetics (integrated first order, half-life, initial rates, Arrhenius, catalyst) 9. CE: reactive material balances 4 · recycle/purge 3 · Raoult flash, bubble, dew, condensation 4 · reactive energy balances 4 · CSTR/PFR design 8 · adiabatic equilibrium 1 · multiple steady states 2 · runaway/Semenov 2 · K(T) and equilibrium conversion 6 · ΔH_rxn at T 1. Total 43 + 35 = **78**.

**Assertion rule**: each oracle row becomes a test that builds the engine inputs from the `inputs` JSON in the research file, calls the named engine function (or a minimal flowsheet), and asserts every expected field within the tolerance. Book-convention constants (R = 0.083 or 0.0821, rounded atomic masses) are part of the inputs, never global.

#### 9.2.1 The oracle table
| id | | source (citation status: R = recalled, not verified; C = constructed) | problem | expected | tolerance | engine function |
|---|---|---|---|---|---|---|
| EQ-NC-001 | R | NCERT XI Ch1 (Eg 1.x, glucose molar mass) | Molar mass of glucose C6H12O6. | 180.156 g/mol | 0.2 % | molarMass |
| EQ-NC-002 | R | NCERT XI Ch1 Exercise 1.x (atoms in 52 mol Ar / 52 u He / 52 g He) - part (iii) | Number of atoms in 52 g of He. | 7.82351e+24 atoms | 1 % | molesFromMass/avogadro |
| EQ-NC-003 | R | NCERT XI Ch1 Exercise 1.x (HNO3 69%, d=1.41 g/mL) | Molarity of conc. HNO3 of density 1.41 g/mL, 69% by mass. | 15.4399 mol/L | 0.5 % | molarityFromMassPercent |
| EQ-NC-004 | R | NCERT XI Ch1 Exercise 1.x (sodium acetate 500 mL 0.375 M) | Mass of CH3COONa (M=82.0245) needed for 500 mL of 0.375 M solution. | 15.3796 g | 0.5 % | massFromMolarity |
| EQ-NC-005 | R | NCERT XI Ch1 Exercise 1.x (2.00e3 g N2 + 1.00e3 g H2 -> NH3) | N2+3H2->2NH3; 2000 g N2 with 1000 g H2. Limiting reagent? Mass NH3? (also H2 left: 281.7 mol check in script). | 2431.84 g NH3 (limiting = N2) | 0.5 % | limitingReagent+stoichYield |
| EQ-NC-006 | R | NCERT XI Ch1 Exercise 1.x (water from 16 g CH4) | CH4+2O2->CO2+2H2O; mass of water from complete combustion of 16 g CH4. | 35.9334 g H2O | 0.5 % | stoichMass |
| EQ-NC-007 | R | NCERT XI Ch1 Exercise 1.x (Cu from 100 g CuSO4) | Mass of Cu obtainable from 100 g CuSO4. | 39.8153 g Cu | 0.5 % | stoichMass |
| EQ-NC-008 | R | generic textbook percent-yield (CaCO3 decomposition) | CaCO3 -> CaO + CO2. 50.0 g CaCO3 heated, actual yield 80%. Mass CO2 obtained? | 17.5885 g CO2 | 1 % | percentYield/stoichMass |
| EQ-NC-009 | C | generic textbook limiting reagent (Mg + HCl) [constructed] | Mg+2HCl->MgCl2+H2. 6.0 g Mg with 100 mL of 2.0 M HCl. Limiting reagent, volume H2 at STP (22.4 L/mol)? | 2.24 L H2 (limiting = HCl) | 0.5 % | limitingReagent |
| EQ-NC-010 | R | NCERT XI Ch1 Exercise 1.x (Fe oxide 69.9% Fe, 30.1% O) | Empirical formula of an iron oxide with 69.9% Fe, 30.1% O. Fe:O ratio (x -> Fe2O3 = 1:1.5). | 1.50308 O per Fe (Fe2O3 => 1.5) | 1 % | empiricalFormula |
| EQ-NC-011 | R | NCERT XI Ch1 Example 1.x (4.07% H, 24.27% C, 71.65% Cl; M=98.96) | Compound has 4.07% H, 24.27% C, 71.65% Cl, molar mass 98.96 g/mol: empirical CH2Cl; ratio M/M_emp = n (molecular formula C2H4Cl2). | 2.00012 multiplier n | 1 % | empiricalFormula+molecularFormula |
| EQ-NC-012 | C | generic combustion analysis [constructed] | 0.300 g of C,H,O compound burns to 0.440 g CO2 and 0.180 g H2O. O by difference. Empirical formula CH2O (O:C ratio shown). | 0.998838 O:C ratio (CH2O => 1) | 1 % | combustionAnalysis |
| EQ-NC-013 | R | NCERT XI States of Matter Exercise (0.5 L H2 @0.8 bar + 2 L O2 @0.7 bar into 1 … | Total pressure when 0.5 L H2 at 0.8 bar and 2.0 L O2 at 0.7 bar are put in a 1 L vessel at 27 C. | 1.8 bar | 0.5 % | daltonTotalPressure |
| EQ-NC-014 | R | NCERT XI States of Matter Exercise (1 g A @2 bar; +2 g B -> 3 bar) | 1 g gas A gives 2 bar at 27 C; adding 2 g of gas B gives total 3 bar (same V,T). Find M_B/M_A. | 4 M_B/M_A | 0.1 % | idealGasMoles/dalton |
| EQ-NC-015 | R | NCERT XI States of Matter Exercise (mixture 20% H2 by weight, 1 bar) | H2/O2 mixture at 1 bar is 20% H2 by weight. Partial pressure of H2. | 0.798712 bar | 1 % | daltonPartial |
| EQ-NC-016 | R | NCERT XI Ch5 (rationalised) / Ch6 (old) Exercise (35.2 g CO2 from C, dHc=-393.5) | dHc(C)=-393.5 kJ/mol. Heat released forming 35.2 g CO2. | -314.8 kJ | 0.5 % | enthalpyFromMoles |
| EQ-NC-017 | R | standard Hess textbook (C->CO from CO2 and CO combustion) | C+O2->CO2 (-393.5); CO+1/2O2->CO2 (-283.0). dH for C+1/2O2->CO. | -110.5 kJ/mol | 0.1 % | hessLaw |
| EQ-NC-018 | R | NCERT XI Ch5/Ch6 Exercise (2A+B->2D, dU=-10.5 kJ, dS=-44.1 J/K, 298 K) | 2A(g)+B(g)->2D(g): dU=-10.5 kJ, dS=-44.1 J/K at 298 K. dG? Spontaneous? (dn_g=-1; dH=-12.98 kJ). NOTE near-zero result: sensitive to R. | 0.164228 kJ | abs 0.02 kJ (ΔG ≈ 0: relative tolerance meaningless) | gibbs+deltaHfromDeltaU |
| EQ-NC-019 | R | NCERT XI Ch5/Ch6 Example (dH vap water 40.79 kJ/mol at 373 K -> dU) | Vaporisation H2O(l)->H2O(g), dH=40.79 kJ/mol at 373 K. dU? | 37.6889 kJ/mol | 0.5 % | deltaUfromDeltaH |
| EQ-NC-020 | R | standard bond-enthalpy textbook (H2+Cl2->2HCl) | Bond enthalpies H-H 436, Cl-Cl 242, H-Cl 431 kJ/mol. dH for H2+Cl2->2HCl. | -184 kJ | 0.1 % | bondEnthalpyReaction |
| EQ-NC-021 | R | NCERT XI Ch5/Ch6 Example (dH=400 kJ, dS=0.2 kJ/K: spontaneous above T) | dH=400 kJ/mol, dS=0.2 kJ/K/mol. Minimum T for spontaneity. | 2000 K | 0.1 % | spontaneityT |
| EQ-NC-022 | R | NCERT XI Ch6 (rationalised) / Ch7 (old) Exercise (CO+H2O, Kc=4.24 at 800 K, 1 m… | CO+H2O<=>CO2+H2, Kc=4.24 at 800 K; 1.0 mol CO and 1.0 mol H2O in 10 L. Equilibrium [CO]. | 0.0326891 mol/L [CO]=[H2O] (CO2,H2 = 0.0673) | 1 % | equilibriumExtent |
| EQ-NC-023 | R | NCERT XI Ch6/Ch7 Example (Kp=2.0e10 /bar at 450 K, 2SO2+O2<=>2SO3 -> Kc) | Kp=2.0e10 bar^-1 at 450 K. Kc? | 7.479e+11 L/mol | 1 % | Kc_from_Kp |
| EQ-NC-024 | R* | NCERT XI ch 6 (old ch 7) exercise: 13.8 g N2O4 in 1 L at 400 K, P = 9.15 bar | N2O4 ⇌ 2NO2; 13.8 g N2O4 (M = 92) in 1.00 L at 400 K; total 9.15 bar. **Use R = 0.083 L bar mol⁻¹ K⁻¹ (book convention).** Find α, Kp, Kc. | Kp = 85.87 bar (α = 0.837, Kc = 2.59 mol/L). (R = 0.083145 gives 83.71: the constant matters) | 0.5 % | degreeOfDissociation, KpKc |
| EQ-NC-025 | C | JEE-style PCl5 dissociation [constructed] | PCl5<=>PCl3+Cl2: 50% dissociated at 1 atm total (Kp=1/3 atm). Degree of dissociation at 2 atm. | 0.377964 alpha | 0.5 % | degreeOfDissociation |
| EQ-NC-026 | R* | NCERT XI ch 6 (old ch 7) example: HI at 700 K | H2 + I2 ⇌ 2HI, Kc = 54.8 at 700 K. Start from HI only; at equilibrium [HI] = 0.5 mol/L. Find [H2] = [I2]. (*corrected by the blind cross-check: the first draft started from 0.5 M HI initial, a different problem*) | [H2] = [I2] = 0.5/√54.8 = 0.06754 mol/L | 0.5 % | equilibriumExtent |
| EQ-NC-027 | C | generic quadratic ICE: N2O4<=>2NO2 Kc=4.63e-3 [constructed] | 0.100 M N2O4, Kc=4.63e-3 (25 C). Solve 4x^2=Kc(0.1-x); x = extent (M); [NO2]=2x. | 0.0101955 mol/L x | abs 1e-6 M | equilibriumExtent (quadratic) |
| EQ-NC-028 | R | NCERT XI Ch6/Ch7 Example (3/2 O2 -> O3, Kp=2.47e-29 bar^-1/2, 298 K) | dG for 3/2 O2 -> O3 with Kp=2.47e-29 at 298 K. | 163.2 kJ/mol | 1 % | gibbsFromK |
| EQ-NC-029 | C | generic dG=-RT lnK [constructed] | dG=-20.0 kJ/mol at 300 K. K? | 3036.93 dimensionless | 1 % | kFromGibbs |
| EQ-NC-030 | R | NCERT XI Ch6/Ch7 text (inert gas, constant V) | N2+3H2<=>2NH3 at equilibrium; inert gas added at constant V. Shift? | none direction | exact (direction) | leChatelierDirection |
| EQ-NC-031 | R | NCERT XI Ch6/Ch7 text (inert gas, constant P) | Same, but inert gas added at constant total P (volume increases). Shift? | left(reactants) direction | exact (direction) | leChatelierDirection |
| EQ-NC-032 | C | JEE/NEET-style PCl5 <=> PCl3 + Cl2, inert gas at constant P [constructed] | PCl5 dissociation at equilibrium, inert gas added at constant P. Shift? | right(products) direction | exact (direction) | leChatelierDirection |
| EQ-NC-033 | R | NCERT XI Ch6/Ch7 text (exothermic NH3 synthesis, raise T 500->600 K, dH=-92.4) | N2+3H2<=>2NH3, dH=-92.4 kJ. Raise T. K change (K600/K500) and shift? | 0.0246102 K2/K1 (<1 => left) | exact (direction) | leChatelierDirection/vanHoff |
| EQ-NC-034 | R | NCERT XI Ch6/Ch7 text (N2O4<=>2NO2, halve volume at const T) | N2O4<=>2NO2 equilibrium; volume halved at constant T. Q/K = 2^dn = 2 -> shifts left. | 2 Q/K | 0.1 % | leChatelierDirection |
| EQ-NC-035 | C | JEE/NEET-style catalyst effect [constructed] | Catalyst lowers Ea from 75 to 50 kJ/mol at 298 K (same A). Rate-constant ratio k_cat/k_uncat. K_eq unchanged (ratio of forward/reverse both scale equally). | 24113.4 k ratio | 5 % | catalystEffect/arrhenius |
| EQ-NC-036 | R | NCERT XII Ch3 (rationalised) / Ch4 (old) Example (log k=14.34-1.25e4/T) Ea part | H2O2 first order: log k = 14.34 - 1.25e4 K/T. Ea. | 239.296 kJ/mol | 0.2 % | arrheniusEa |
| EQ-NC-037 | R* | NCERT XII ch 3 (old ch 4) exercise | log₁₀ k = 14.34 − 1.25×10⁴/T **with k in s⁻¹**. Temperature at which t½ = 256 min. (*cross-check: reading k in min⁻¹ gives 739 K; units must be stated*) | 668.97 K | 0.3 % (≈ 2 K) | firstOrderHalfLife, arrhenius |
| EQ-NC-038 | R | NCERT XII Ch3/Ch4 Exercise (k=1.15e-3 s^-1, 5 g -> 3 g) | First order, k=1.15e-3 s^-1. Time for 5 g to become 3 g. | 444.196 s | 0.5 % | firstOrderTime |
| EQ-NC-039 | R | NCERT XII Ch3/Ch4 Exercise (14C, t1/2=5730 y, 80% remaining) | 14C t1/2=5730 y; sample has 80% of living level. Age. | 1844.65 years | 0.5 % | firstOrderTime |
| EQ-NC-040 | R | NCERT XII Ch3/Ch4 Exercise (initial rates, 5.07e-5, 5.07e-5, 1.43e-4) | A+B->P: [A]=0.30,0.30,0.60; [B]=0.30,0.60,0.30; rates 5.07e-5,5.07e-5,1.43e-4 mol/L/s. Order in A (B: zero). | 1.49596 order in A | 1 % | orderFromInitialRates |
| EQ-NC-041 | C | generic JEE-style initial rates, k extraction [constructed] | [A]=0.1,0.2,0.1; [B]=0.1,0.1,0.2; rate=2e-3,8e-3,4e-3. Order A=2,B=1; k. | 2 k (L^2/mol^2/s) | 0.1 % | orderFromInitialRates+k |
| EQ-NC-042 | R | NCERT XII Ch3/Ch4 Exercise (rate x4 from 293 to 313 K) | Rate increases 4x from 293 to 313 K. Ea. | 52.8503 kJ/mol | 0.5 % | arrheniusEa |
| EQ-NC-043 | R | NCERT XII Ch3/Ch4 Exercise (k=0.02 s^-1 at 500 K, 0.07 s^-1 at 700 K) | k=0.02 at 500 K, 0.07 at 700 K. Ea (A also printed). | 18227.1 J/mol | 0.5 % | arrheniusEa |
| EQ-CE-001 | R | Felder 4th ed, Ch.4 reactive-system extent-of-reaction (cf. Ex 4.6-x NH3 oxidat… | 4NH3+5O2->4NO+6H2O. Feed 100 mol NH3 + 200 mol O2; fractional conversion of NH3 = 0.50. Find product moles and extent. | xi=12.5; NH3=50; O2=137.5; NO=50; H2O=75 | 0.5% (exact stoichiometry) | reactorStoich (fractional conversion) |
| EQ-CE-002 | R | Felder 4th ed, Ex 4.6-x ethylene oxide w/ side reaction (style); recalled, not … | C2H4+1/2O2->C2H4O (r1); C2H4+3O2->2CO2+2H2O (r2). Feed 100 mol C2H4, 100 mol O2. C2H4 conversion 25%; mole ratio C2H4O:CO2 in product = 4. Find outlet moles. | xi1=22.222; xi2=2.7778; C2H4=75; O2=80.556; C2H4O=22.222 | 0.5% (exact stoich) | reactorStoich (multiple reactions, 2 ex… |
| EQ-CE-003 | R | Felder 4th ed, Ch.4 combustion w/ excess air (style); recalled, not verified | 100 mol CH4 burned completely in air (21% O2/79% N2) with 20% excess air. Product moles and dry-basis mole fractions. | CO2=100; H2O=200; O2=40; N2=902.86; y_dry={CO2:0.09589, O2:0.038356, N2:0.86575} | 0.5% (exact) | combustion complete + excessAir |
| EQ-CE-004 | R | Felder 4th ed, Ch.4 combustion w/ incomplete burning (style); recalled, not ver… | 100 mol C3H8 fed with 25% excess air; 90% of the propane burns; of the propane that burns, 10% goes to CO (C3H8+3.5O2->3CO+4H2O) and 90% to CO2. Find outlet composition. | out={C3H8:10, CO2:243, CO:27}; total=3179.7; y_wet={C3H8:0.003145, CO2:0.076423, CO:0.0084914} | 0.5% (exact) | combustion partial + atom balance |
| EQ-CE-005 | R | Felder 4th ed, Ch.4.7 recycle & purge, methanol synthesis (cf. Problem 4.4x, wi… | Fresh feed 100 mol/h: 33 CO, 66 H2, 1 N2 (inert). Reactor CO+2H2->CH3OH, single-pass CO conversion 20% (of CO entering reactor). Condenser removes all CH3OH as liquid; uncondensed gas split: 10% purg… | reactor_feed={CO:117.86, H2:235.71, CH3OH:0}; xi=23.571; CH3OH=23.571; purge={CO:9.4286, H2:18.857, N2:1}; recycle={CO:84.857, H2:169.71, CH3OH:0} | 0.2% (closed-form solution exists (N2 b… | recyclePurgeTear (inert buildup, tear c… |
| EQ-CE-006 | R | Felder 4th ed, Ch.4 ammonia synthesis recycle/purge w/ Ar inert (style, cf. Pro… | Fresh feed 100 mol/h: 24.9 N2, 74.8 H2, 0.3 Ar. N2+3H2->2NH3, single-pass N2 conversion 25%. Condenser removes all NH3; remaining gas: 5% purge, 95% recycle. Solve the loop. | reactor_feed={N2:86.609, H2:261.83, NH3:0}; xi=21.652; NH3=43.304; purge={N2:3.2478, H2:9.8435, Ar:0.3}; purge_mole_frac_Ar=0.022403 | 0.2% (closed form: Ar_in=0.3/0.05=6) | recyclePurgeTear (inert buildup) |
| EQ-CE-007 | R | Felder 4th ed, Ch.6.4-6.5 Raoult's-law flash (Rachford-Rice form, Antoine Table… | Equimolar-ish feed z = benzene 0.4 / toluene 0.3 / ethylbenzene 0.3 flashed at 105 C and 760 mmHg, Raoult's law ideal. Find V/F, x, y. | Psat_mmHg=[1542.7, 645.97, 304.03]; K=[2.0298, 0.84997, 0.40004]; V_over_F=0.41729; x=[0.27977, 0.32004, 0.40019]; y=[0.56789, 0.27202, 0.16009] | 0.3% (exact data; V/F root of RR is wel… | flashRachfordRice |
| EQ-CE-008 | R | Felder 4th ed, Ex 6.4-x bubble point of benzene-toluene (style); recalled, not … | Bubble-point temperature and first-vapor composition of liquid x_benzene=0.5 / toluene 0.5 at 760 mmHg. | T_bubble_C=92.116; y_benzene=0.7136 | 0.2% (exact data (0.1 C abs. ok)) | bubblePointT |
| EQ-CE-009 | R | Felder 4th ed, Ex 6.4-x dew point (style); recalled, not verified | Dew-point temperature and first-liquid composition of vapor y_benzene=0.5 / toluene 0.5 at 760 mmHg. | T_dew_C=98.775; x_benzene=0.29099 | 0.2% (exact data) | dewPointT |
| EQ-CE-010 | R | Felder 4th ed, Ch.6.3 single-condensable-component condensation (style, Ex 6.3-… | 100 mol/h gas, 20 mol% water vapor + 80% dry air at 760 mmHg is cooled to 40 C at constant pressure. Find feed dew point, mol/h water condensed and gas-out water mole fraction. | dewpoint_C=60.426; p_sat_40C_mmHg=55.193; H2O_condensed=13.735; H2O_vapor_out=6.2647; y_H2O_out=0.072622 | 0.3% (exact data) | condensation (single condensable VLE) |
| EQ-CE-011 | R | Felder 4th ed, Ch.9.5 adiabatic flame temperature (Ex 9.5-x, style); recalled, … | CH4 burned completely with 25% excess air, both fed at 25 C, adiabatic, 1 atm. Air = 21 % O₂ / 79 % N₂ exactly. Find flame temperature. | T_adiabatic_C=1744.9; dH_combustion_kJ_mol=-802.31; product_moles={CO2:1, H2O:2, O2:0.5} | abs 1 K (air composition changes it 0.5 K) | adiabaticOutletT (combustion) |
| EQ-CE-012 | R | Felder 4th ed, Ch.9.1-9.2 heat of reaction at T (heat-of-reaction method); reca… | CO+2H2->CH3OH(g): standard dHr at 25 C and dHr(300 C) from sensible-heat correction. | dHr_25C_kJ=-90.18; dHr_300C_kJ=-98.946 | 0.5% (exact data) | heatOfReactionAtT |
| EQ-CE-013 | R | Felder 4th ed, Ch.9.3 adiabatic reactor (heat-of-reaction method) w/ water-gas … | CO+H2O->CO2+H2 in an adiabatic reactor. Feed 1 mol CO + 2 mol steam at 400 C; CO conversion 60%. Find outlet temperature. | T_out_C=600.89; dHr25_kJ=-41.15; xi=0.6 | 0.3% (exact data) | adiabaticOutletT (reactor, given conver… |
| EQ-CE-014 | R | Felder 4th ed, Ch.9.4 heat-of-formation vs heat-of-reaction method, methane com… | 1 mol CH4 + air (10% excess) at 25 C burned completely; products leave at 400 C. Heat duty Q = dH (negative = heat removed). Both methods must agree. | Q_kJ_per_mol_CH4=-664.84; HoF_method=-664.84; products={CO2:1, H2O:2, O2:0.2} | 0.3% (exact data) | energyBalanceReactive (duty) |
| EQ-CE-015 | R | Fogler 5th/6th ed, Ch.2 CSTR/PFR design equations (first-order liquid, style); … | A->B first order, k=0.2 1/min, v0=10 L/min, CA0=1 mol/L (FA0=10 mol/min). Volume of CSTR and of PFR for X=0.8. | V_CSTR_L=200; V_PFR_L=80.472; ratio=2.4853 | 0.2% (analytic) | cstrVolume, pfrVolume |
| EQ-CE-016 | R | Fogler 5th/6th ed, Ch.4-5 gas-phase PFR with volume change (Ex 4-x/5-x style); … | A->2B gas, isothermal isobaric, pure A fed: CA0=0.2 mol/L, v0=10 L/s, -rA=k CA^2, k=0.5 L/mol/s (eps=1). PFR volume for X=0.8 by numerical integration of FA0 dX/(-rA). | V_L=1036.2; V_analytic_L=1036.2; V_if_eps_zero_L=400 | 0.2% (quadrature vs analytic agree 1e-6) | pfrVolume (numerical integration) |
| EQ-CE-017 | R | Fogler 5th/6th ed, Ex 2-x CSTR followed by PFR from Levenspiel plot (style); re… | First order A->B k=0.2 1/min, FA0=10 mol/min, CA0=1 mol/L. CSTR to X=0.4 then PFR to X=0.8. Volumes; also Simpson rule on tabulated FA0/(-rA) at X=0,0.1..0.8 for the PFR part. | V_CSTR_L=33.333; V_PFR_analytic_L=54.931; V_PFR_simpson_L=55; V_total_L=88.264 | 0.2% (analytic answer; tabular Simpson … | cstrVolume+pfrVolume series, Levenspiel… |
| EQ-CE-018 | R | Fogler 5th/6th ed, Ch.2.5 CSTRs in series (first order); recalled, not verified | First order k=0.2/min, v0=10 L/min. Two equal CSTRs in series for overall X=0.9. Volume of each, and compare with single CSTR and PFR. | X_after_first=0.68377; V_each_L=108.11; V_total_L=216.23; V_single_CSTR_L=450; V_PFR_L=115.13 | 0.2% (analytic) | cstrVolume (series) |
| EQ-CE-019 | R | Fogler 5th/6th ed, Ch.3 Arrhenius k(T); recalled, not verified | k=0.1 1/min at 300 K, E=80 kJ/mol. k at 350 K; and recover E from the two k values; also the factor per 10 K near 300 K. | k2=9.769; E_recovered_J_mol=80000; factor_300_to_310=2.814 | 0.1% (exact) | arrhenius |
| EQ-CE-020 | R | Fogler 5th/6th ed, Ch.8/11 adiabatic equilibrium conversion (Ex 8-x/11-x style,… | Reversible exothermic A<=>B, dHrx=-20000 cal/mol (dCp=0), K(298)=1000, sum(theta_i Cp_i)=50 cal/mol/K, feed pure A at 300 K, adiabatic. Find adiabatic equilibrium conversion and T (intersection of X_… | T_ad_K=392.22; X_ad_eq=0.23055; X_eq_isothermal_300K=0.99875; K_at_Tad=0.29962 | 0.3% (exact) | adiabaticEquilibriumConversion / KofT_v… |
| EQ-CE-021 | R | Fogler 5th/6th ed, Ch.12 multiple steady states G(T) vs R(T) (Ex 12-x style, pa… | Liquid first-order A->B in a CSTR with cooling. tau=1 min, k(T)=1.0 exp[-(E/R)(1/T-1/350)] 1/min, E=30000 cal/mol, dHrx=-20000 cal/mol, CpSum=100 cal/mol/K (per mol A fed), kappa=UA/(FA0*CpSum)=0.6, … | T_K=[300.1, 345.54, 424.94]; X=[0.0007666, 0.36433, 0.9995]; stability=[stable, unstable, stable]; G_cal_mol=[15.332, 7286.5, 19990] | 0.2% (roots of smooth scalar function; … | multipleSteadyStates (three roots, stab… |
| EQ-CE-022 | R | Fogler 5th/6th ed, Ch.12.6 ignition-extinction curve; recalled, not verified | Same reactor as EQ-CE-021 but vary effective coolant temperature Tc (R(T)=CpSum(1+kappa)(T-Tc)). Find Tc at which the low branch disappears (ignition, heating up) and Tc at which the high branch disa… | Tc_ignition=321.51; Tc_extinction=256.01; T_tangent_points=[329.16, 371.1]; T_low_branch_at_ignition=329.16; T_high_branch_at_extinction=371.1 | 0.3% (tangency conditions G=R and G'=R') | multipleSteadyStates (ignition/extincti… |
| EQ-CE-023 | R | Fogler 5th/6th ed, Ch.13 runaway / T2 Laboratories (generic adiabatic batch run… | Adiabatic batch, first-order A->B: dX/dt=k(T)(1-X), T=T0+dTad*X, dTad=100 K, T0=450 K, k(450)=1e-3 1/s, E=100 kJ/mol. Time to X=0.5 and X=0.99, time and value of maximum rate, final T. Compare isothe… | t_X50_s=201.05; t_X99_s=262.68; t_max_rate_s=229.2; max_rate_per_s=0.011421; X_at_max_rate=0.76916 | 0.5% (ODE integrated with rtol 1e-10; e… | thermalRunaway (adiabatic batch) |
| EQ-CE-024 | R | Fogler 5th/6th ed Ch.12-13 / Semenov thermal explosion theory (zero-order, heat… | Zero-order exothermic reaction in a vessel: heat generation G(T)=g0 exp(-E/RT), g0=1e13 W, E=80 kJ/mol; heat loss hS(T-Ta), hS=50 W/K. Find the critical ambient temperature Ta_crit above which no ste… | Ta_crit_K=397.97; T_vessel_at_crit_K=415.95; dT_crit_K=17.981; dT_semenov_approx_K=16.46; all_tangent_T=[415.95] | 0.2 % exact tangency; the approximation R·Ta,crit²/E = 16.46 K is reported, not asserted against 17.98 | thermalRunaway (Semenov critical condit… |
| EQ-CE-025 | R | Smith, Van Ness, Abbott & Swihart, Ch.13.2 K from dG0 (ammonia, dGf NH3=-16450 … | N2+3H2->2NH3 at 298.15 K. K from dG0 = -RT ln K, with dGf(NH3)=-16450 J/mol. | dG0_J=-32900; K298=5.8097e+05; lnK=13.272 | 0.2% (exact) | KofT_vantHoff (K from dG) |
| EQ-CE-026 | R | Smith 13.3 van't Hoff K(T), constant dH (ammonia, dHf=-46110); recalled, not ve… | Ammonia synthesis, constant dH0=2*(-46110) J/mol. K at 500 K and 700 K: row A constant ΔH (R = 8.314, T₀ = 298.15); row B with Cp (Smith Table C.1 ΔA, ΔB, ΔD as in EQ-CE-030). **Two separate assertions; never mix rows** (they differ 43 %). | K500=0.17439; K700=0.00030817; with_Cp_K500=0.10006; with_Cp_K700=8.5624e-05 | 0.3% (exact for given model (constant d… | KofT_vantHoff and KofT_withCp |
| EQ-CE-027 | R | Smith 13.x water-gas shift K(T) with Cp (cf. Ex 13.4-13.5 style); recalled, not… | CO+H2O(g)->CO2+H2: K at 1000 K and 1100 K from dG298 and ln K integration with dH(T) using Cp/R=A+BT+D/T^2 data (Smith Table C.1/C.4 values recalled). | K1000=1.4612; K1100=1.0058; dH298=-41166; dH1000=-34636; K1000_const_dH=0.89522 | 0.5% (exact for given data; Smith print… | KofT_withCp |
| EQ-CE-028 | R | Smith Ex 13.x equilibrium conversion of water-gas shift (1 CO + 1 H2O, 1100 K, … | 1 mol CO + 1 mol H2O(g) at 1100 K, 1 bar, ideal gas. Equilibrium extent/conversion; and with 2 mol steam. | eps_e=0.50072; conv_CO=0.50072; eps_e_steam2=0.66752 | 0.5% (exact; P has no effect (dnu=0)) | equilibriumConversion |
| EQ-CE-029 | R | Smith Ch.13.4-13.5 ammonia equilibrium with inert, pressure effect (constructed… | Feed 1 N2 + 3 H2 + 0.1 Ar at 500 K, 100 bar, ideal gas (phi=1). K(500) from constant-dH van't Hoff. Equilibrium extent and NH3 mole fraction. (Ignores nonideality; real value higher.) | eps_e=0.86259; y_NH3=0.72645 | 0.5% (exact for stated model) | equilibriumConversion (dn<0, pressure, … |
| EQ-CE-030 | R | Smith Ch.13 SO2 oxidation equilibrium (Prob. 13.x style, constructed); recalled… | SO2+1/2O2->SO3, feed (basis 100 mol) 10 SO2, 10 O2, 80 N2 at 800 K and 1 atm; K(800) from full-Cp integration. Equilibrium SO2 conversion. | K800=35.114; K800_bar_basis=35.114; eps_e=8.9475; conv_SO2=0.89475 | 0.5% (exact for stated data) | equilibriumConversion (K(T) with Cp) |
| EQ-CE-031 | R | Smith Ex 4.6 standard heat of methanol synthesis at 800 C (CO+2H2->CH3OH(g)); r… | dH0 of CO+2H2->CH3OH(g) at 298.15 K and at 1073.15 K using Cp/R=A+BT+CT^2+DT^-2 (CH3OH A=2.211,B=12.216e-3,C=-3.450e-6; CO,H2 as Smith table C.1). | dH298_J=-90135; dH1073_J=-1.0357e+05; dA_dB_dC_dD=[-7.663, 0.010815, -3.45e-06, -13500] | 0.3% (exact for stated data; recalled S… | heatOfReactionAtT |
| EQ-CE-032 | R | GATE CH style recycle/purge (recalled, not verified; reconstructed) | Pure A fed 100 mol/h. Reactor A->B, single-pass conversion 60%. Separator sends all B to product, all unreacted A to a splitter: 10% purged, 90% recycled to reactor. Find reactor feed, recycle and ov… | reactor_feed=156.25; recycle=56.25; purge=6.25; B_product=93.75; overall_conv=0.9375 | 0.2% (closed form) | recyclePurgeTear |
| EQ-CE-033 | R | GATE CH style CSTR vs PFR volume ratio (recalled, not verified; reconstructed) | First-order liquid reaction, same feed and k, X=0.9. Ratio V_CSTR/V_PFR. | ratio=3.9087 | 0.2% (analytic) | cstrVolume/pfrVolume |
| EQ-CE-034 | R | GATE CH style two CSTRs in series (recalled, not verified; reconstructed) | First-order reaction, two equal CSTRs in series, each with k*tau=1. Overall conversion; and for a single CSTR with total tau. | X_overall=0.75; X_single_CSTR_same_total_tau=0.66667; X_PFR_same_total_tau=0.86466 | 0.2% (analytic) | cstrVolume (series) |
| EQ-CE-035 | R | GATE CH style second-order CSTR/PFR (recalled, not verified; reconstructed) | Second-order irreversible liquid reaction -rA=k CA^2, X=0.5. Space time ratio tau_CSTR/tau_PFR. | ratio=2; tau_CSTR_kCA0=2; tau_PFR_kCA0=1 | 0.2% (analytic) | cstrVolume/pfrVolume |

#### 9.2.1b Review results and statement corrections (2026-11-09, binding for the oracle JSON)
**Cross-check status now: 78 / 78.** The remaining 60 oracles were re-solved independently (own code, NIST data fetched live; not blind, the solver saw the expected values only after solving): **60 agree within tolerance, 0 disagree**. The reviewer also re-computed 43 values by an own script (27 values from 21 oracles + 16 level numbers, REVIEW.md §2): all agree (the K7 unstable state only once E is taken as 75.36). **Citations**: XI ch 1 items EQ-NC-002, 003, 004, 005, 007, 010 are verified against the pre-2023 edition's exercise text (1.33(iii), 1.6, 1.5, 1.24(i), 1.7, 1.3) via a solutions PDF; rationalised-edition numbering, and every ch 3/5/6 citation, remain unverified (ncert.nic.in refused connections; secondary sites agree on the numbers). EQ-NC-001, 006, 011 were not found in ch 1 and are relabelled "textbook-style". Rule unchanged: until verified, the game says "NCERT-style" and quotes no exercise number.

Statement fixes the oracle JSON must carry (each found by the independent re-solve):
| id | fix |
|---|---|
| EQ-NC-005 | book field = 2428.57 g (book masses N 14, H 1); engine value 2431.8 with IUPAC masses; tolerance unchanged |
| EQ-NC-018 | absolute tolerance 0.02 kJ (already); state R = 8.314 |
| EQ-NC-023 | state R = 0.0831 L bar mol⁻¹ K⁻¹ (gives 7.48×10¹¹) |
| EQ-NC-025 | add "at constant T" |
| EQ-NC-028 | reaction is 3/2 O₂ → O₃, Kp in bar⁻¹ᐟ² |
| EQ-NC-029 | state R = 8.314 |
| EQ-NC-033 | assert K600/K500 = 0.0246 ± 1 % **and** direction = left (tolerance was 0) |
| EQ-CE-004 | "25 % excess air relative to complete combustion of all propane fed" |
| EQ-CE-008/009/010 | carry Antoine constants to full printed precision (water 8.07131 / 1730.63 / 233.426 etc.) so the 5-digit answers reproduce |
| EQ-CE-014 | product water is vapour (ΔHc = −802.3 kJ/mol) |
| EQ-CE-017 | Simpson's rule over X = 0.4-0.8 only (0-0.8 gives ≈ 80.5 L) |
| EQ-CE-019 | one R: 8.314462618 |
| EQ-CE-023 | state R and k(T) = k₀·exp[(E/R)(1/450 − 1/T)] |
| EQ-CE-025 | K in bar⁻², standard state 1 bar |
| EQ-CE-028 | put K(1100 K) = 1.0058 in the statement |
| EQ-CE-031 | T = 1073.15 K in both statement and inputs |
| K7 fixture | E = 75.36 MJ/kmol exactly (75.4 moves the unstable state 63.1 → 63.45 °C) |

#### 9.2.2 Data oracles (from the research, asserted directly)
- **Thermo vs NIST-JANAF**: for each of the 17 JANAF species fetched (`research/janaf/*.html`), H−H298, S and Cp at 300, 500, 700, 1000, 1500 K within 0.02 kJ/mol, 0.02 J/(mol K), 0.1 J/(mol K).
- **K(T) vs JANAF log K_f** for R1, R2, R5, R6, R8, R9 at 298-1000 K within ±0.5 % (research found ±0.3 %).
- **Literature cross-checks (banded)**: WGS within 5 % of Callaghan 2006 (600-1000 K); SMR within 10 % of Xu-Froment (600-1000 K); methanol R3 within 2 % of Graaf & Winkelman 2016 at 523 K; Haber R1 6-12 % above Gillespie-Beattie (asserting the *known* offset documents it).
- **Textbook-mode errors** (Codex numbers): R1 K_vH/K at 500 K = 1.76 ± 0.02, at 723 K = 3.91 ± 0.05; R2 at 723 K = 1.064 ± 0.01.

#### 9.2.3 Dual-implementation "golden science" (Python reference ↔ TS engine)
`research/levels_calc.py`, `thermo.py` and `kinetics_*.py` are an **independent Python implementation** of the same physics. A script exports their results as JSON fixtures; the TS engine must reproduce them:
| fixture | values | tolerance |
|---|---|---|
| Haber ideal equilibrium y_NH₃, 1:3 feed | 6 T (380-550 °C) × 6 P (25-300 bar), e.g. 450 °C/200 bar = 25.34 % | 0.2 % rel |
| Haber with inerts / ratio (450 °C, 150 bar) | ratios 2-4, inerts 0-15 %, e.g. 5 % inert = 19.13 % | 0.2 % |
| Sulfur burner T_ad and boiler duty | y_SO₂ 6-18 %, e.g. 10 % → 931.4 °C, 4.93 MW | 0.5 K, 0.3 % |
| SO₂ adiabatic equilibrium beds | inlet 360-440 °C → bed-1 exit and X, e.g. 420 °C → 620.8 °C, 0.6908; staircases at 410/420/430 °C | 0.3 K, 0.1 % abs |
| DCDA 3+1 ideal | 99.983 % | 0.002 % abs |
| WGS equilibrium | 6 T × 5 S/CO, e.g. 250 °C, S/CO 1.5 → CO 1.03 % dry | 0.5 % rel |
| Haber loop (equilibrium converter + Raoult flash) | 5 purge × 3 T_sep, e.g. purge 1 %, −20 °C → 489.1 kmol/h NH₃, y_Ar,in 8.76 % | 0.3 % |
| N₂O₄ rigorous | Kp(400 K) = 51.14 bar, α(0.15 mol/L) = 0.769, P = 8.83 bar | 0.3 % |
| Kinetics PFR checks | K1 400 °C/200 bar profile (5 points); K2 bed 1 (5 points) and light-off curve (8 points); K3 isothermal approach (5 points); K7 steady states 27.6/63.1/117.0 °C and ignition 47.4 °C; K8 batch at 32 °C (90 % glucose at 22.5 h, 69.0 g/L) | 1 % rel / 0.3 K |
Any disagreement is investigated in both implementations before either is changed.

### 9.3 Property tests (seeded fuzz; 10 000 cases in CI, 10⁶ nightly)
| # | Property | Generator | Assertion |
|---|---|---|---|
| P1 | **Atom balance** for every unit and the whole flowsheet | random species subsets, random reactions from the DB, random feeds/T/P; random flowsheets (≤ 12 units) | Σ elements in = out (+ dynamic holdup change) within 1e-9 relative |
| P2 | **Mass balance closure** | same | Σ ṁ in = Σ ṁ out within 1e-9 |
| P3 | **Energy balance closure** | same, incl. heaters, compressors, reactors, flashes | Σ H_in + Q + W = Σ H_out within 1e-6 relative of the largest term |
| P4 | **Hess identity** | random reactions, T | isothermal reactor duty / ξ = Σ ν ΔHf + sensible terms = ΔH_rxn(T) from the thermo module (1e-9) |
| P5 | **van 't Hoff consistency** | every reaction, T on a grid inside polynomial ranges | central-difference d ln K/dT = ΔH°(T)/(RT²) within 1e-5 relative; ΔG = ΔH − TΔS exactly |
| P6 | **Textbook mode consistency** | same | ln K_textbook(T) is exactly linear in 1/T with slope −ΔH°298/R |
| P7 | **Le Chatelier: temperature** | random single-reaction equilibria (feed, T, P) | ΔT > 0 ⇒ sign(Δξ_eq) = −sign(ΔH°) (skip |ΔH| < 1 kJ) |
| P8 | **Le Chatelier: pressure** | same | ΔP > 0 ⇒ sign(Δξ_eq) = −sign(Δn_g); Δn_g = 0 ⇒ |Δξ| < 1e-9 |
| P9 | **Le Chatelier: inerts** | same; constant-P reactor and constant-V vessel variants | add inert at constant P ⇒ sign(Δξ) = sign(Δn_g); at constant V ⇒ Δξ = 0 |
| P10 | **Le Chatelier: concentration** | same | add a reactant ⇒ ξ increases; remove product (absorber) ⇒ ξ of the next stage increases |
| P11 | **Q/K direction** | random non-equilibrium mixtures | reactor moves ξ in direction sign(1 − Q/K); the balance-beam tilt sign matches |
| P12 | **Second law: kinetics never cross equilibrium** | every rate law, random states, PFR/CSTR/batch trajectories | sign(r) = sign(1 − Q/K) at every evaluation; along any trajectory 1 − Q/K never changes sign |
| P13 | **Second law: entropy generation** | random flowsheets with heaters/coolers using utilities at stated temperatures | S_gen = Σ S_out − Σ S_in − Σ Q/T_utility ≥ −1e-9 kW/K |
| P14 | **No free energy** | flowsheets with no feed, or loops with no work input | no product appears; an adiabatic loop with no work cannot raise any stream above the hottest inlet unless a reaction releases heat |
| P15 | **Heat-exchanger physics** | random HX specs | no temperature cross; Q ≤ Q_max (ε ≤ 1) |
| P16 | **Compressor/pump** | random P ratios | W ≥ isentropic work; T_out ≥ T_s,out |
| P17 | **Refrigeration** | random T_cold | COP ≤ Carnot |
| P18 | **Equilibrium solver robustness** | random K over 1e-30…1e30, random feeds incl. zero species | residual ≤ 1e-10; same result from 5 initial guesses; X_eq monotone in K |
| P19 | **Catalyst never changes K** | every catalyst/reaction | X_eq identical with any catalyst; only rate changes |
| P20 | **Flash** | random z, T, P | Σx = Σy = 1; V/F ∈ [0, 1]; bubble/dew bracket consistent; Rachford-Rice residual ≤ 1e-12 |
| P21 | **Determinism** | random action scripts | `hash()` identical on replay; identical at speeds ×1/×4/×16 |
| P22 | **Units round trip** | random values | display → SI → display exact to 1e-12 |
| P23 | **Extent vs Gibbs minimisation** | 200 random multi-reaction cases solved by scipy Gibbs minimisation in Python (fixtures) | same composition within 1e-6 |
| P24 | **No NaN** | everything above + monkey persona | no NaN/∞ ever reaches a stream or the UI |

### 9.4 Flowsheet convergence suite
1. **Named cases**: L19 loop; L20 loop at purge 0.5, 1, 2, 5, 10 %; L22 methanol loop; DCDA 3+1 (no loop, many units); a 2-tear and a 3-tear synthetic flowsheet; a nested loop (loop inside a loop); a loop containing the L24 CSTR at conditions with 3 steady states.
2. **Expected outcomes**: convergence to 1e-9 in ≤ 30 Wegstein passes for linear-ish loops (L20 at 1 % purge: direct substitution needs ~2400 passes; asserted ≤ 30 with Wegstein); identical solution (1e-8) from cold start, warm start and Broyden; `NO_EXIT` detected structurally with zero iterations for a purge-free inert loop; `LOOP_GAIN_GE_1` for a 100 % recycle splitter; `LOOP_OSCILLATING` or a converged branch (never a hang) for the CSTR-in-loop case, with the message naming the CSTR.
3. **Fuzz**: 10 000 random loop flowsheets (≤ 12 units, ≤ 3 tears, random reactions, purges 0.1-50 %): ≥ 99.5 % converge; **100 %** of the rest return a diagnosed code with a message (never `NUMERIC_GUARD`, never a timeout); p95 solve time ≤ 3 ms desktop.
4. **Tear selection**: minimal tear count on 50 hand-built graphs with known minimum.

### 9.5 Solvability bot and cheese search (every level)
- **Solvability**: the expert persona builds the level's reference solution and must earn ★ (CI) and ★★★ (nightly, after optimisation). A separate **blind search** (no reference): coarse grid over all knobs (5 points each, capped at 4096 commissions) then Nelder-Mead from the best 5 points; must find ★. Proves the level is solvable without the scripted answer.
- **Cheese search**: (a) the cheese-seeker persona's fixed list (extremes, zero feed, product recycling, bypassing reactors, venting everything, splitter 0/1, max catalyst, pause abuse, Call-it brute force: predictions are locked at commission and one per run, so brute force is impossible by construction); (b) a genetic search over topology mutations (add/remove/rewire a unit, 2000 evaluations per level, nightly) looking for any run that earns ★★ or better while violating a **level intent invariant**. Intent invariants per level, e.g.: product must be made by reaction in this level's reactor (atom ledger attribution); no stream from a product tank re-enters the plant; no unbounded utility (a heater may not exceed the site utility limit); L13 bed count ≥ 2 for ≥ 98 %; L20 purge > 0; L24 production happens on the upper branch only by ignition (not by a feed-temperature exploit beyond the feed heater's limit); L25 the absorber uses acid. Every exploit found becomes a regression test plus a rule fix.
- **Idle loses**: idle persona fails every level (asserted); for shift levels it fails through events, proving the shift matters.

### 9.6 Calibration and balance targets
`scripts/calibrate-levels.ts` (deterministic, seeded) per level:
1. Runs the expert optimisation; records the best primary metric; sets the Chief Engineer threshold (× 1.03 margin) and writes `data/levels/<id>.calibration.json` (committed; diffs reviewed like goldens).
2. Asserts an **interior optimum**: at the expert's best point, no knob sits on a bound unless the level is in the exception list (L10, by design) — protects against boring corner solutions (risk R2).
3. Asserts **difficulty curve**: novice persona ★ rate across 20 seeds: ch 1 ≥ 80 %, ch 2-3 60-85 %, ch 4-5 40-75 %, ch 6-7 25-60 %; expert ★★★ 100 %; idle 0 %.
4. Builds the **empty-state fallback sample**: 200 simulated engineers per level (novice runs + expert runs with Gaussian knob noise σ = 10 % of range + a few deliberately poor archetypes), saved to `data/histograms/<id>.json`, shown only when no online histogram has ever been fetched for that key, titled "Simulated engineers (offline sample)" (§8.8). Also emits each sample's solution code, which seeds the `verify()` test corpus.
5. Asserts the numbers quoted in the briefs (e.g. "7.0 t/h steam") are consistent with the engine (a brief text template pulls them from calibration, so the text cannot drift).

### 9.7 Failure-mode tests
Every failure mode in §2.6 and every code in §3.10 has a script that provokes it and asserts: the code; the message template id and its filled numbers; the front-end flags (unit alarm state, beacon, pipe greying, bed damage); `explainRun` returns the expected template; the Report shows a cause. Example: L20 purge = 0 → `NO_EXIT{species:'Ar', inflow: 3.0 kmol/h}` in 0 tear iterations; message contains "3.0 kmol/h" and "purge".

### 9.8 Teaching tests
- Why templates: for each (knob, physics) template a constructed `RunRecord` pair asserts the exact sentence, the before → after numbers (with units) and the direction words; a lint rejects explanations without a number or without naming the knob.
- Codex coverage: every simplification in §3.12, every unit type, every knob, every failure code and every reaction has a Codex entry (`codex.coverage.test.ts`); every Codex `source` non-empty; no `UNVERIFIED` provenance behind a Codex number.
- Coach: a coach-following persona completes L01-L03 using only coach focus hints; each step's `done` predicate becomes true exactly once; device-specific text exists for mouse/touch/pad.
- Learner jargon lint: every technical term in Learner-visible strings links to the glossary.
- Exam bridges: the Report's textbook working matches the oracle numbers (same function).

### 9.9 Golden trajectories
For every level: expert, idle and novice personas on seeds 1-3, full design + shift, state hash every 60 plant-s and at every action (`src/__golden__/<level>.json`). `GOLDEN_UPDATE=1` only for deliberate rule changes, stated in the commit (PROGRAM). Plus one golden per oracle-relevant unit (bed profiles, flash results) to catch silent numeric drift from refactors.

### 9.10 UI tests
- Godot smoke (`CB_SMOKE=1`): every screen, drawer and modal opens and closes; every level loads and commissions its reference solution; zero script errors.
- Layout audit (`CB_AUDIT=1`) at 1280x720, 1280x800, 1920x1080, 2560x1440, 3440x1440, 3840x2160 and phone 2424x1080 with insets: zero squeezed/overflowing controls; every drawer at default and max width.
- Input parity: scripted **pad-only** completion of L01, L13 and L24 with the virtual pad (under the pad lock); scripted **touch-only** completion of L01, L13, L24 on the Pixel (under the phone lock); keyboard-only completion of L01. Every interaction in §6.3 exercised by at least one script.
- Modal discipline: hotkeys inert behind every modal; Esc/B/Back closes one layer; never quits from title or map without confirm; autosave on Android pause.
- Visual regression: `CB_SHOT` screenshots of each level's reference plant in Plant, Heat and X-ray views compared by perceptual hash (alerts, not hard fails).
- Playtest rounds per PROGRAM (novice, form factors + settings, phone, pad, Haiku monkey, code reviewer, **fun critic**, **educator**), round 2 verifies every fix; `docs/CRITIQUE-<ver>.md`.

- **Spreadsheet-feel audit** (scripted, part of the layout audit): for every must-ship level, a screenshot after commission with all drawers closed must show the level's hero readout (§2.7) on screen; the goal meter must be readable without opening the Data drawer; the HUD shows ≤ 3 KPI chips. A reviewer checks the screenshot set at M3 and M5.

### 9.11 Fun-test hypotheses (each with a signal we can measure in playtests)
| When | Hypothesis | Signal | If false |
|---|---|---|---|
| Minute 1 | The plant feels alive before the player does anything (hum, steam, a demo flow on the map) and the first action is obvious | time to first unit placed ≤ 40 s; tester says "game", not "app" | stronger coach focus; more motion on the first plot |
| Minute 3 | Dragging temperature on the Equilibrium Window and watching NH₃ fall is a small "aha" | testers voice a reason (cold more, hot less) before the Why panel; ≥ 3 voluntary knob sweeps | make the curve bigger/in-world; add the ghost of the previous run |
| Minute 10 | Building the staircase (L13) feels like solving a puzzle, not filling a form | testers sketch or describe the zig-zag; ≥ 70 % reach 98 % in ≤ 4 commissions | reduce knobs; show the next-bed preview |
| Minute 20 | The first runaway or loop accumulation is memorable and understood | tester explains the cause in their own words after the Why panel; asks to retry | shorten the Why text; slow the event; better visual |
| Minute 2 | L00 Night Shift lands: the tester leans in during the alarm and either saves the loop or watches it trip, and wants to know why | tester's first words after L00 are about the plant, not the UI; ≥ 70 % touch the highlighted dial before the 45 s timeout | shorter calm, louder alarm, bigger dial highlight |
| Hour 2 | There is a reason to continue: the Works map lights up, an online histogram bar to beat, the next plant's silhouette | ≥ 60 % of testers start the next chapter unprompted; ≥ 40 % open a histogram twice | stronger map payoff, show rivals' bar count |
| Minute 60 | Players chase a histogram bar or a ★★★ without being asked | ≥ 50 % retry a completed level for a better metric; stream table opened in < 50 % of commissions in ch 1-3 (risk R1) | stronger histogram presentation; tighter Chief thresholds; more visible KPIs |
| Educator | A JEE/NEET teacher would assign L04, L09, L14, L18 as homework | educator persona verdict + a human teacher review | rewrite briefs/reports to match exam language |

### 9.12 Region-pack seam tests (PROGRAM decision 5)
- **Pack switch** (`src/regions/packs.test.ts`): for every pack present (`global`, and the draft `in`): load it through the core region-pack loader and schema validator; start every level; the level's reference solution commissions; the solvability bot earns ★ (CI) and the level stays solvable under that pack's prices and limits (nightly: ★★★ thresholds recalibrated per pack, `data/levels/<id>.<region>.calibration.json`); briefs and Reports render with no unfilled `{placeholder}`.
- **Leak test** (core `findRegionLeaks` / `expectNoRegionLeaks`, markers = each pack's `strings` values + `leakMarkers`): with the `global` pack active, render every player-facing string (all string keys × every level brief, coach step, Why template with sample numbers, Codex entry, event card, Report) and assert none contains a denylisted regional token: `₹`, `lakh`, `crore`, `Rs`, `CPCB`, `CEA`, `IS `, `BIS`, `Gujarat`, `Khambhat`, `India`, `Indian`, the `in` pack's character and place names. Allowlist: `source` citation fields (NCERT/JEE citations are allowed by PROGRAM decision 1) and the four incident pages. The reverse check runs with `in` (no `global` cast names leak into `in` briefs).
- **Chemistry is region-independent**: an oracle and property-suite run under each pack produces bit-identical results (packs may not touch `src/data` or `src/sim`); a static import check forbids `src/sim` and `src/data` from importing `src/regions`.
- **Formatting**: `global` formats US$ with thousands separators ("$1,234,567"); `in` formats ₹ with lakh grouping ("₹12,34,567"); round-trip tests per pack.

### 9.13 Leaderboard verification tests
- `verify()` round trip: for every level, the expert's, novice's and calibration sample's solution codes verify to exactly the metrics the in-game Report showed (bit-equal); 500 codes per nightly run.
- Tamper: flipped payload bit → crc failure; edited action args with a recomputed crc → verified metrics change accordingly (the server trusts nothing but the replayed actions); wrong ruleset, unknown action, unit not allowed in the level, a lost run, oversize payload, malformed JSON → `ok: false` with a reason, never a throw (core covers the envelope; EQUILIBRIUM tests the game-specific rejections).
- Speed partition: each shift level's expert run replayed with tick partitions {1}, {12}, {192} and a random partition gives bit-identical metrics (P21).
- Determinism across runtimes: the verify corpus runs on Node 22 and on the nodejs-mobile 18 build (Android test harness) and hashes compare equal.
- Purity: `verify.ts`'s import graph contains no Godot, storage, clock or network module (static check); runs in a Workers-like sandbox (no `fs`) in CI.
- Cheese parity: every exploit regression test (§9.5) also runs through `verify()`.

---

## 10. Scope, cut lines, risks

### 10.1 v0.1 MVP (definition: PROGRAM quality bar 1-10 met for everything listed here) — reviewed must-ship / stretch split
Quality over quantity: a polished 22-level campaign beats a thin 29-level one. **Must-ship** below is the release gate; **stretch** ships only if it meets the same bar by the M3 exit review (BUILD-PLAN), otherwise it moves to v0.2 without blocking the release.

| Area | Must-ship (v0.1 gate) | Stretch (v0.1 if ready, else v0.2) |
|---|---|---|
| Levels (22 + 7) | L00 Night Shift; L01-L16; L18-L20; L24; L25 (exam bridges L04, L09, L14, L18 as side nodes; L20 Part A embedded) | L17, L21, L22, L23, L26, L27, L28 (cut order if needed: L28, L26, L23, L22, L27, L17, L21) |
| Species | N₂, H₂, O₂, Ar, CH₄, NH₃(g/l), H₂O(g/l), CO, CO₂, SO₂, SO₃, S, H₂SO₄(l), NO₂, N₂O₄, C₃H₈, C(graphite); lab/lumped pseudo-species: H₂O₂(aq) (L18), propylene oxide / propylene glycol (L24; molar mass only, the CSTR uses the lumped ρc_p of K7) | NO, N₂O, HNO₃(l), CH₃OH(g/l), C₂H₅OH(g/l), glucose, broth/biomass, Cl₂, HCl, NaCl/NaOH |
| Reactions | R1, R2, R5, R9, R10, R11, R13, C + ½O₂ → CO, CO + ½O₂ → CO₂, C₃H₈ combustion, H₂O₂ decomposition, PO hydrolysis | R3, R4, R6, R7(b,c), R8, R12 |
| Rate laws | K1 Temkin (Fe), K2 Eklund (V₂O₅ ± Cs), K6 first order (H₂O₂), K7 PO CSTR | K3 VBF methanol, K4 WGS HTS, K5 SMR, K8 Luong, K9 gauze, K10 NO oxidation |
| Unit ops | feed, mixer, splitter/purge, heater/cooler (utilities incl. refrigeration), 2-stream HX, compressor (multi-stage), valve, stoichiometric reactor (incl. gasifier, burners), equilibrium reactor (isothermal/adiabatic), packed bed (adiabatic/isothermal) + multi-bed with inter-coolers, jacketed CSTR (dynamic), batch rig, flash (Raoult + Henry, ideal), ideal NH₃ separator, waste-heat boiler, absorber (fixed recovery, acid/water choice), stack + analyser, relief valve, interlock, product tank; lab fixtures (flask, bomb & flow calorimeter, lab furnace, burette) as pre-built scenes | pump, cooled tubular reactor, shortcut column + NRTL, fermenter, gauze burner, N₂O abatement/scrubber, reformer, CO₂ removal, methanator |
| Solvers | thermo (rigorous/textbook/book), extent equilibrium (Brent, damped Newton for R ≤ 3), PFR (RK4 + BE), CSTR steady states + dynamics, flash (Rachford-Rice), SM flowsheet + Wegstein + Broyden, diagnostics, shift pipeline, econ, explain/blame, region packs, `verify()` | Peng-Robinson (v0.2 anyway) |
| Front-end | title (L00 demo), Works map (lights up per chapter), plant world with 14 unit models (feed, compressor, heater/furnace, cooler, HX, converter/packed bed, CSTR, flash drum, boiler, absorber, splitter, flare, stack, relief, tanks/sphere; lab bench scene), auto-routed pipes with flow/composition shader, views Plant/Heat/X-ray/Labels, Equilibrium Window (drawer **and** pinnable in-world), balance beam + Le Chatelier arrows, Molecule Lens (static composition + jitter), Semenov plot, energy Sankey, atom ledger, stream table (optional), console + alarms, commissioning cinematic, first-run, Report with online histograms + near-miss replay (in-engine), plant card PNG, Codex (45 entries incl. the 4 incident pages), settings incl. score sharing; input parity mouse/keyboard, controller, touch; layouts desktop/handheld/phone | Flow and Pressure views, Molecule Lens forward/back event animation, GIF/MP4 export, day/weather cycle, column/fermenter/gauze models, Codex to 60 |
| Audio | plant bed layers, interaction sfx, 3-tier alarms, commissioning cinematic sting, relief/surge/crack events, **4** music tracks of different structure + adaptive alarm stem | 5th track |
| Online | `verify()`, solution codes, offline queue + histogram cache, histogram UI, nickname + share setting (server is the separate `cobanana-scores` repo) | Daily Shift (v0.2) |
| Region packs | `global` (shipped, default); `in` (draft data present and passing the seam tests, not selectable in release builds) | `in` selectable (v0.2, with Hindi strings) |
| Tests | everything in §9 for every must-ship level and unit (≥ 78 oracles, property suites, convergence suite, solvability + cheese per level, goldens, personas, region seam, verify, Godot smoke + layout audit, spreadsheet-feel audit) | the same for any stretch item that ships |
| Platforms | Linux, Windows, macOS via core CI; signed Android APK; Pixel 9a pass; Steam Deck layout pass with the virtual pad | — |

### 10.2 Cut line (if the schedule slips; never cut tests for a level that ships)
1. Stretch items go first, in the order listed in the table.
2. Then, among must-ship non-level items, in order: in-world pinnable Equilibrium Window (keep drawer) → plant card PNG → Labels view → Molecule Lens jitter (keep counts) → 4th music track.
3. Must-ship levels are cut only with the director's sign-off and never L00, L01, L05, L10, L13, L15, L19, L20, L24 (the spine of the hook: alarm, moles, first shift, Le Chatelier, staircase, rate vs ceiling, loop, purge, runaway).
4. Never cut: the world view, Equilibrium Window, balance beam, Why panel, alarms + shift, commissioning cinematic, online histograms (with offline fallback), input parity, oracle/property/region/verify tests.

### 10.3 Later (v0.2+)
Daily Shift (the leaderboard server exists from v0.1; seeded event sequences are already deterministic); the `in` region pack selectable with Hindi strings; stretch levels not shipped in v0.1; Peng-Robinson fugacity option ("Real gas" thermo detail) and a fugacity-corrected Haber; rigorous MESH distillation (stage-by-stage) replacing shortcut; urea and ammonium nitrate (with the safety narrative handled with care); chlor-alkali (electrochemistry: links to NODE); Ostwald absorption tower with NOₓ chemistry; dynamic distillation; plant-wide control loops (PID tuning as gameplay); multiplayer "shift handover"; iOS; Steam release with achievements mapped to the incident file; teacher mode (assign levels, see class histograms).

### 10.4 Top risks and mitigations
| # | Risk | Likelihood / impact | Mitigation | Early signal (test) |
|---|---|---|---|---|
| R1 | **Spreadsheet feel**: players read tables instead of playing | high / fatal | world-first UI; every number also in-world; stream table optional and collapsed by default; shift with events and alarms from L05; Equilibrium Window as the main "readout"; fun-critic playtest at the first playable (hypotheses §9.11) with a hard rule: if testers open the stream table in > 50 % of commissions in ch 1-3, the in-world readouts are insufficient → fix before content | playtest telemetry `ui.open.streams / commissions` |
| R2 | **Rigour vs fun**: a correct sim produces boring optima or illegible failures | med / high | levels designed around real tensions (rate vs equilibrium, purge vs loss, cooling vs cost) where the optimum is interior; solver bot proves an interior optimum exists per level (calibration fails the build if the best point sits on a knob bound); Why panel for legibility | `calibrate-levels` interior-optimum assertion |
| R3 | **Wrong science** (a K off by 10×, a sign error in an energy balance) | med / fatal (it's the jewel) | ≥ 78 oracles with blind cross-check (already done for a sample: §9.2), property tests (second law, van 't Hoff consistency, atom/energy closure on random flowsheets), data provenance column for every number, educator review (Opus) + a human chemistry teacher review before release | oracle + property suites in CI |
| R4 | **Solver convergence** (recycle loops, multiple steady states, stiff kinetics) | high / high | sequential-modular with structural pre-checks (accumulation detection before iterating), bounded Wegstein → Broyden fallback, warm starts, log-space extents, bracketed scalar solves, explicit multiple-steady-state handling, per-unit failure → teaching message, never a crash; convergence fuzz (§9.4) on 10 000 random loop flowsheets | convergence fuzz pass rate ≥ 99.5 % with 100 % of failures diagnosed |
| R5 | **Phone performance** (solve + 3D + particles on a Pixel 9a) | med / med | caps (§3.11), solve budget test on device, particle LOD, Mobile renderer, the shift re-solve debounce | `bench-solve` on device ≤ 20 ms p95 |
| R6 | **Smaller Steam niche** than tycoon games | high / med | the primary market is exam-prep students (exam bridges with NCERT/JEE-style problems in v0.1, other exam sets as region packs later; phone-first sessions; pricing is a store/region decision, not game data); the Steam pitch leans on Opus Magnum-style histograms and runaway replays (shareable); sandbox for the Factorio crowd | wishlist/alpha downloads; teacher interest |
| R7 | **Scope** (28 levels + 18 models + dynamic layer) | high / high | cut line §10.2; levels are data + calibration, not code; the unit models share a kit-bashed parts library (vessels, skids, nozzles) | milestone burndown |
| R8 | **Sensitive content** (real disasters, explosive chemicals) | low / high | incidents only in Codex, written soberly with sources; no depicted casualties; no ammonium nitrate production in v0.1; explosion visuals stylised | educator + safety review |
| R9 | **Textbook vs rigorous mismatch confuses students** ("the book says 0.17, the game says 0.10") | med / med | Thermo detail toggle; exam bridges default to Textbook; Why panel explains the gap; Codex entry "Why your textbook assumes ΔH is constant" | educator playtest |

### 10.5 User decisions (resolved 2026-11-09, PROGRAM.md) and what remains open
Resolved: (1) neutral international setting → the `global` pack (Kestrel Bay Works, the cast in §2.4); the Gujarat-coast setting and Indian cast are preserved as the draft `in` pack (§11). (2) US$ everywhere. (3) Online leaderboards in v0.1 (§8.8). (4) The four real-incident pages are kept (§7.5). (5) Region packs (§11).

Still open for the user (also listed in REVIEW.md): (a) leaderboard hosting: Cloudflare Workers needs the paid plan's CPU limit for shift replays (≤ 2 s CPU per verify), else Docker; (b) approval for any further real incidents (Texas City, Beirut, Toulouse are not in v0.1); (c) whether the default `global` gas price should be the real LNG-coast benchmark ($11/MMBtu, chosen) or a labelled GAME mid-value (~$7).

---

## 11. Region packs (PROGRAM decision 5)

### 11.1 The seam
Everything regional is data in a core `RegionPack<EqRegionData>` (`@core/regions`: `defineRegion`, `RegionRegistry`, `formatMoney`/`formatNumber`, `rulesetId`, leak helpers); chemistry never is. Layout:
```
src/regions/            (core scaffold layout)
  data.ts              EqRegionData type + validateEqRegion(d): string[] (every price key, limit key, character id and exam-set level present; finite numbers; sources non-empty)
  index.ts             RegionRegistry([global, in], default 'global') → GAME.regions
  global/index.ts      defineRegion({...}) — status 'shipping'; strings = cast names, places, brief flavour
  in/index.ts          status 'draft' (kept, tested, never listed in release builds)
godot/regions/<id>/    portraits, signage textures, ambience variants (optional; fallback to global)
```
```ts
interface EqRegionData {
  prices: Record<PriceKey, { value: number; unit: string; src: string; conf: Conf }>;     // §4.7 rows (US$ base for 'global'; the pack's currency for others)
  limits: { so2_standard: number; so2_strict: number; so2_expert: number;                // kg SO₂/t H₂SO₄ (L25)
            n2o_bat: [number, number]; grid_t_co2_per_mwh: number; carbon_price: number; src: Record<string, string> };
  benchmarks: Partial<Record<BenchKey, { value: number; src: string }>>;                   // regional rows only; world benchmarks (IFA) stay in src/data
  standardsLabels: { relief: string; alarms: string; flammability: string; emissions: string };   // text shown in Codex/Why
  cast: { mentor: CharacterId; supervisor: CharacterId; manager: CharacterId; safety: CharacterId };  // ids → strings
  setting: { worksName: string; coast: string; setDressing: string[] };                   // string keys
  examSet: { id: string; levels: Record<string, ExamProblem> };                          // L04, L09, L14, L18, L20A problem text, numbers, citation, book constants
  leaderboardSeeds: Record<string, number>;                                               // per level
}
```
**Rules.** (1) `src/sim`, `src/data` never import `src/regions` (static check). (2) Levels reference prices and limits only by key (`{price.gas_default}`, `{limit.so2_standard}`); `Level.setup` reads them from `NewGameCtx.region`. (3) Calibration runs per pack (`data/levels/<id>.<region>.calibration.json`). (4) A pack change that can move a score bumps its `rulesetVersion`. (5) Exam-bridge **shells** (plant, Call-it plumbing) are shared; the problem set is pack data; a pack without an exam set hides the side nodes. (6) Currency: each pack prices in its own currency natively (no runtime FX conversion inside rules), so a pack is internally consistent; the `in` draft therefore carries ₹ prices converted once at 83 ₹/$ with the rate recorded in `src`.

### 11.2 `global` pack (v0.1 default, shipping)
US$ (prefix, 2 decimals), western grouping, `standards = { relief: 'API 520/526 (ISO 4126)', alarms: 'IEC 62682 / ISA-18.2', flammability: 'EN 1839 / ISO 10156', emissions: 'US NSPS 40 CFR 60 / EU BREF LVIC-AAF' }`. Setting: Kestrel Bay Works, a fictional 1970s complex on a salt-flat coast. Cast (§2.4): Dr. Mara Quinn (chief engineer, mentor), Tomas Brandt (night-shift supervisor), Victor Hale (plant manager), Dr. Noor Haddad (safety and environment). Prices §4.7, limits §4.8, exam set "NCERT/JEE-style" (§7.7, §9.2), grid factor 0.47 t CO₂/MWh, carbon $0 (export levels $80/t). Leak markers: none beyond its strings.

### 11.3 `in` pack (DRAFT — preserved original design content; not shipped in v0.1)
> This section preserves the India-specific setting the designer wrote before the 2026-11-09 decisions. It is data for a future `in` region pack (v0.2 candidate, with Hindi strings). It must keep passing the seam tests (§9.12) but is never listed in release builds. Values marked SNIP/UNVERIFIED must be verified before it ships.

- **Setting**: **Khambhat Bay Works**, a tired 1970s chemical complex on a fictional stretch of the Gujarat coast; salt pans and the Gulf of Khambhat flamingo flats (real) as set dressing; a sulfur ship at the jetty.
- **Cast**: **Anjali Rao**, chief engineer, mentor ("A catalyst is a faster road, not a different destination."); **Bashir Khan**, night-shift supervisor, 31 years on the site ("When the cooling water goes quiet, you have about two minutes."); **Mr. Desai**, plant manager ("Every bar of pressure is a line on my electricity bill."); **Dr. Farida Contractor**, safety and environment officer. Brief speaker mapping: Mara→Anjali, Tomas→Bashir, Victor→Mr. Desai, Noor→Farida.
- **Currency and numbers**: ₹ (prefix, 0-2 decimals), `numbers.grouping = 'indian'` (lakh/crore: ₹12,34,567); original display used a fixed 83 ₹/$ (labelled).
- **Standards**: IS/BIS and CEA references where a game needs them (none of EQUILIBRIUM's rules depend on an IS code; relief and alarms use API/ISA as in `global`); emission limits per CPCB.
- **Prices (original §4.7 rows)**: natural gas India APM $6.9/MMBtu (≈ $6.5/GJ; PPAC/APM 2025, SNIP; Apr-25 $7.26, Jun-25 $6.41, Jul-25 $6.89 capped $6.75); electricity India HT tariff ≈ ₹6-8/kWh (UNVERIFIED); steam ≈ $17/t at APM gas (derived); carbon $0 (India CCTS does not cover ammonia/urea as of 2025-26, SNIP); fuel ethanol (ESY 2024-25 OMC price) ₹57.97/L C-heavy molasses, ₹60.73 B-heavy, ₹65.61 cane juice (SNIP, angelone.in / deccanherald); the original L23 brief: "The oil companies pay ₹57.97 a litre."
- **Limits**: sulfuric acid SO₂ (CPCB, third-party transcription, verify gazette): 2.5 (existing) / 2.0 (new) kg/t for ≤ 300 t/d; 2.0 / 1.5 kg/t for > 300 t/d (another report says 3, 2, 1 kg/t). Original L25 ★★: ≤ 1.5 kg/t (large-plant new-unit level). Grid factor 0.727 t CO₂/MWh (CEA v20, FY2023-24, SNIP).
- **Plant facts for briefs/Codex**: India 30.7 Mt urea in 2024-25 (record 31.4 Mt in 2023-24); revived plants at Sindri (2200 t/d NH₃) and Ramagundam (12.7 lakh t/yr); Indian molasses yields 180-250 L ethanol/t; typical Indian H₂SO₄ units 300-1500 t/d (UNVERIFIED); ethanol 30-100 KLPD typical molasses distilleries, up to 350 (SNIP).
- **Market notes (not game data)**: price ₹149-299 in India; primary audience JEE (15.67 lakh JEE Main 2026 registrants) and NEET (22.8 lakh) aspirants.
- **Exam set**: NCERT XI ch 1/5/6, XII ch 3 with exercise numbers once verified (§9.2.1b), JEE/NEET framing in the brief ("JEE Main style").
- **Leak markers**: `₹`, `lakh`, `crore`, `Rs`, `CPCB`, `CEA`, `BIS`, `IS `, `Gujarat`, `Khambhat`, `India`, `Indian`, `APM`, `OMC`, `Sindri`, `Ramagundam`.

