# Changelog

All notable changes to EQUILIBRIUM. The release workflow publishes the section whose heading contains `[x.y.z]`.
Each version is one themed layer (the GIGAWATT pattern). Repos are private; no public release without the owner's go-ahead.

## [0.4.0] - unreleased · "Employable" (depth: control room, turnaround, career)
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
### Known gaps
- Career dashboard front-end in progress; Ch9 boards need label polish on narrow screens.

## [0.3.0] - unreleased · "The campaign" (chapters 2-7)
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

## [0.2.0] - unreleased · "Night shift" (chapter 1 + the control room)
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
