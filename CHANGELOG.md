# Changelog

All notable changes to EQUILIBRIUM. The release workflow publishes the section whose heading contains `[x.y.z]`.
Each version is one themed layer (the GIGAWATT pattern). Repos are private; no public release without the owner's go-ahead.

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
