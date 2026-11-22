# EQUILIBRIUM: build plan (v0.1)

This plan is for the build director (Opus), who delegates the work to Sonnet and Haiku workers. Read it alongside `DESIGN.md` (the spec, referred to below by § number), `REVIEW.md` (the decisions behind it), `PROGRAM.md` and `cobanana-core/CORE.md`.

Scope is the **must-ship** column of DESIGN §10.1:
- 22 levels: L00-L16, L18-L20, L24, L25;
- the `global` region pack, with the `in` pack kept as a draft;
- online leaderboard client and `verify()`.

Stretch items (L17, L21, L22, L23, L26, L27, L28 and the non-level stretch list) are scheduled only after the M3 exit review.

## Conventions for every task
- **Repo and paths.** The repo is `equilibrium/` inside the games workspace, with `core/` as a submodule. Paths below are relative to the repo.
- **Brief template.** Each worker brief contains:
  1. files to read: DESIGN § + the named research file + `core/CORE.md`;
  2. exact files to create;
  3. **tests to write first** (red), then the implementation (green);
  4. `pnpm typecheck && pnpm test` output;
  5. a return of the diff summary, test counts, open questions and anything marked UNVERIFIED.
- **Commits.** Workers do not commit; the director reviews each diff and commits it. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Rule code.** Rule code uses `dmath` (never `Math.exp/log/pow` or `**`) and plain-JSON state. No strings longer than 3 words in `src/sim`; use `t()` keys.
- **Models.** **S** = Sonnet (implementation, serious testing); **H** = Haiku (bulk data entry, sweeps, screenshot passes, monkey testing).
- **Task size.** About one worker-session: 300-900 lines including tests.
- **Data provenance.** Coefficients are ported **by script** from `design/equilibrium/research/*.py` or from NIST, never retyped. Each catalogue row carries `src` and `conf`, and an `UNVERIFIED` value behind a goal fails `data/provenance.test.ts`.
- **Shared hardware.**
  - Phone: `flock …/.locks/phone.lock`. Pad: `flock …/.locks/pad.lock`.
  - Displays: :240-:259 only.
  - Engine port: 47903.
  - Android app id: `in.ixaxaar.cobanana.equilibrium`.

## Decisions taken so workers don't have to ask
| Topic | Decision |
|---|---|
| Module layout | DESIGN §8.1, adapted to the core scaffold: `src/game.ts` (GAME), `src/state.ts` (EqState), `src/levels/*.ts`, `src/personas.ts`, `src/verify.ts`, `src/i18n.ts`, `src/locales/en/*.ts`, `src/regions/{data.ts,index.ts,global,in}`. Rules live in `src/sim/{thermo,chem,units,flowsheet,dynamics,econ,explain}` and data in `src/data/*`. |
| Units | SI internally; helpers in `src/sim/units.ts`. The UI uses kmol/h, °C, bar, MW, t/d. |
| Species indexing | Per-level `state.species` (≤ 12). The thermo DB is keyed by species id; a `Mixture` helper maps id → index. |
| Equilibrium K | Pressure in bar, standard state 1 bar. Gas activity a = yP/1 bar. |
| Tolerances | As DESIGN §9.2 / §9.2.1b; property tests 1e-9 (atoms), 1e-6 (energy). |
| Fixtures | `scripts/export-fixtures.py` (python3 -I, run once by the director) writes `src/oracle/fixtures/*.json` from the research scripts. Fixtures are committed, and regenerated only deliberately. |
| Oracle JSON | `src/oracle/oracles.json`: one object per oracle (`id`, `source`, `status` R/C/V, `inputs`, `expected`, `tol` {rel\|abs}, `fn`), with §9.2.1b fixes applied. |
| Calibration output | `data/levels/<id>.<region>.calibration.json` and `data/histograms/<id>.<region>.json` (200 samples plus their solution codes). |
| Tick | 1 tick = 1 plant-second. Godot calls `tick(n)` at 10 Hz. Restart = core `startLevel`. |
| Metrics keys | snake_case with units, e.g. `cost_usd_per_t`, `energy_gj_per_t`, `kg_so2_per_t`, `steam_t_per_h`, `actions_used`. |
| Rate basis | Per kg catalyst; ρ_b converts per-volume laws. Until sourced, ρ_b is GAME-tagged (fused Fe 2500, V₂O₅ 600 kg/m³) and listed in the Codex. A data task replaces it. |
| Leaderboard seed | `region.data.leaderboardSeeds[level]`, default 1000 + level number. |
| Godot | 3D isometric, Forward+ (desktop) / Mobile renderer (phone). Unit models are kit-bashed from a parts library (`godot/world/parts/`). |

---

## M0 · Scaffold (1 day; director + 2 workers)
| # | Task | Model | Files | Acceptance |
|---|---|---|---|---|
| 0.1 | Run `cobanana-core/scaffold/new-game.sh equilibrium EQUILIBRIUM in.ixaxaar.cobanana.equilibrium 47903`. Godot import + `CB_SMOKE=1`. | director | repo | Template tests green; `SMOKE OK`; first commit |
| 0.2 | Strip the template tank. Add an empty `EqState` (§8.2), the `src/sim` skeleton dirs, `src/locales/en/*` stubs, `src/regions/{data.ts,global,in}` with the full `EqRegionData` schema + validator, global and in pack data from DESIGN §4.7/§4.8/§11, and region tests (validate, format round trip, ruleset id). | S | src/state.ts, src/regions/**, src/locales/** | `tsc` clean; region tests pass; `in` is status `draft` |
| 0.3 | CI: copy the core workflows. Add `scripts/export-fixtures.py` + committed fixtures; `scripts/bench-solve.ts` stub; determinism test inherited. | S | .github, scripts | CI green on a push to a local bare remote (no GitHub push) |
| 0.4 | Request to core, director → core status: optional merge of consecutive `tick` entries in `levelActions`. | director | — | Answered or tracked |

**Exit:** the repo boots on desktop with an empty plant screen; CI is green; 0 template remnants.

## M1 · Engine core, TDD (oracles + property tests first)
Lanes run in parallel once 1.1 has landed. Every task writes its oracle and property tests **before** the code.

| # | Task | Model | Files | Tests written first | Acceptance |
|---|---|---|---|---|---|
| 1.1 | Species DB (must-ship species + pseudo-species), Shomate/NASA, h/s/cp, Watson, textbook mode, molar masses | S | sim/thermo/{species,shomate,textbook,mixture}.ts, data/species.ts | JANAF table oracles (§9.2.2: 17 species × 5 T); polynomial continuity at range breaks; provenance test | H, S, Cp within 0.02 kJ/mol / 0.02 / 0.1; 0 UNVERIFIED behind must-ship goals |
| 1.2 | Data entry: species rows, reactions R1/R2/R5/R9/R10/R11/R13 + combustion + H₂O₂ + PO, catalysts with ρ_b, Antoine NH₃/H₂O/SO₂, Henry, steam points | H (bulk) → S review | data/*.ts | — | Director spot-checks 10 rows against research files |
| 1.3 | Reactions + K(T) (rigorous, textbook, book), stoich matrix, atom balance, limiting reagent | S | sim/chem/{reactions,stoich}.ts | K vs JANAF log Kf ±0.5 %; P5, P6; textbook-error Codex numbers (§9.2.2); NC oracles 001-021 | All pass |
| 1.4 | Extent equilibrium solver (Brent R = 1, damped Newton R ≤ 3, edge cases), adiabatic equilibrium | S | sim/chem/equilibrium.ts | NC-022-034, CE-020/025-030; P7-P11, P18, P19; Haber/WGS fixture grids (§9.2.3) | Grids within 0.2 %; P18 10k cases |
| 1.5 | Kinetics K1, K2, K6, K7 (+ form registry), thermodynamic consistency | S | sim/chem/kinetics.ts, data/kinetics.ts | P12; NC-035-043; CE-019/023; K1/K2 fixture profiles; light-off curve | Fixtures within 1 % / 0.3 K |
| 1.6 | Unit ops A: feed, mixer, splitter, heater/cooler + utilities, HX (ε-NTU/LMTD), compressor (Shomate isentropic), valve | S | sim/units/*.ts | P2-P4, P13-P17; unit oracles (≥ 3 each); CE-011-014 | All pass |
| 1.7 | Unit ops B: stoich reactor, equilibrium reactor, packed bed (RK4 + BE switch), multi-bed with coolers, ideal NH₃ separator, flash (Rachford-Rice + Henry), boiler/WHB, absorber, stack, product, relief, interlock | S (split into 2 tasks) | sim/units/*.ts | CE-001-004, 007-010, 015-018, 033-035; SO₂ bed fixtures, staircases, DCDA; P20 | Fixtures within tolerance |
| 1.8 | CSTR: steady states (scan + Brent, stability), simulated start-up, dynamic ODE (BE dt = 1 s); batch rig | S | sim/units/rx_cstr.ts, rx_batch.ts | CE-021, 022, 024; K7 fixture (27.6/63.1/117.0, ignition 47.4, −70 % UA drift); E = 75.36 | Within 0.3 K |
| 1.9 | Flowsheet: graph, Tarjan, tear selection, NO_EXIT pre-check, Wegstein + Broyden, diagnose | S | sim/flowsheet/*.ts | §9.4 named cases; CE-005/006/032; L20 at 0.5-10 % purge ≤ 30 passes; tear-selection 50 graphs; fuzz 10k (≥ 99.5 % converge, 100 % diagnosed) | p95 ≤ 3 ms desktop |
| 1.10 | Econ: Turton capex + CEPCI, opex from region-pack prices, KPIs, emissions | S | sim/econ/*.ts | Worked checks (1 MW compressor $1.52 M; 100 m² HX $169 k); pack-switch changes cost but not physics | Pass |
| 1.11 | Dynamics/shift pipeline: events, actuators, coalesced re-solve, lags, safety, alarms (deadband/delay), econ accumulation, records | S | sim/dynamics/*.ts | P21 partition invariance; tick ≤ 0.5 ms phone-equivalent (desktop ≤ 0.1 ms); alarm chatter test | Pass |
| 1.12 | Engine glue: GAME (actions §8.3, queries §8.4, compact snapshot, metrics, invariants), `src/verify.ts` = makeVerifier | S | src/game.ts, engine/** | Teaching-error tests for every action; snapshot ≤ 8 KB on L20; state ≤ 256 KB; save round trip; verify tamper tests | Pass |
| 1.13 | Explain/blame + Why templates + needs chip | S | sim/explain/*.ts, locales/en/why.ts | Template tests per (knob, physics) pair; lint (number + knob named) | Pass |

**Lanes:**
- Thermo/chem: 1.1 → 1.3 → 1.4 → 1.5.
- Units: 1.6, then 1.7 / 1.8 in parallel.
- Flowsheet: 1.9 after 1.6.
- Systems: 1.10 / 1.11 / 1.12 / 1.13 after 1.9.

Up to 4 workers run concurrently.

**Exit evidence:**
- ≥ 78 oracle tests plus dual fixtures, all green;
- 24 property tests at 10k cases;
- convergence fuzz report;
- `bench-solve` desktop numbers;
- `tsc` clean.

**Estimate:** about 16 worker-tasks.

## M2 · Vertical slice: Chapter 3 "The Wall" (L10-L14) + L00, playable on desktop, phone and pad
Chapter 3 was chosen because it carries the hook: the Equilibrium Window, the beam, Le Chatelier, the staircase and an exam bridge. L00 proves the shift, the alarms and the juice.

| # | Task | Model | Acceptance |
|---|---|---|---|
| 2.1 | Levels L00, L10-L14 as data plus solvers, goals, stars, metrics; global pack strings | S | `checkAllLevels` problems = []; idle loses; L14 Book data; L13 bed-count intent |
| 2.2 | Godot plant world: iso camera (rotate/zoom/pan, all three inputs), build grid, parts library, models for feed, compressor, heater, cooler, converter/packed bed, flash, splitter, flare, stack, tanks | S (×2: camera+grid, models) | Screenshots at 1920x1080 and phone; models read at all zooms |
| 2.3 | Pipe auto-router (A* on rack, bend penalty) + flow/composition/temperature shader + hover tooltip | S | 20-unit flowsheet routes in < 50 ms; colour never the only signal |
| 2.4 | Drawers: Build, Inspect (diegetic dials), Data (optional), HUD (≤ 3 chips, goal meter, phase pill), Console | S | Layout audit zero issues on 7 resolutions |
| 2.5 | Equilibrium Window (curve, iso-rate, operating line, staircase, drag handle, ghost) + balance beam + Le Chatelier arrow | S | Window ≤ 15 ms query; pad and touch drag work |
| 2.6 | Commissioning cinematic, first run, alarms (3 tiers + beacon + vignette), time dilation HUD, audio stubs (hum layers, lock/slip chords, alarm tones) | S | L00 plays end to end; the clip is capturable |
| 2.7 | Why panel, coach for L00/L10, Report with histogram UI (fallback sample) | S | Why shows the player's numbers |
| 2.8 | Android build + Pixel pass; pad pass on the Deck layout | S (holds locks) | Touch-only and pad-only completion of L00 + L13 |
| 2.9 | **Fun critic (Opus) + educator (Opus)** on the slice; spreadsheet-feel audit | Opus testers | Hypotheses §9.11 minute 1/2/3/10 measured; go/no-go for M3 |

**Exit evidence:**
- screenshots of every hero readout for these levels (§2.7);
- a 10-second capture of L00 and of L13;
- Pixel and Deck logs;
- critic reports.

**Gate:** if the fun critic says "spreadsheet", stop and fix before any M3 content.

**Estimate:** about 11 worker-tasks.

## M3 · Full must-ship campaign and content
| # | Task | Model | Acceptance |
|---|---|---|---|
| 3.1-3.5 | Levels by chapter: Ch1 L01-L04, Ch2 L05-L09, Ch4 L15, L16, L18, Ch5 L19, L20, Ch6 L24, L25 (data, solvers, events, intent invariants, Call-its, metrics) | S ×5 | Per level: solvable, idle loses, cheese search clean, interior optimum (exceptions listed), novice-rate band |
| 3.6 | Remaining models: CSTR, boiler/WHB, absorber, relief, lab bench scene, sphere/tanks; Semenov plot; Sankey; atom ledger; Molecule Lens | S ×2 | Hero readout screenshot per level |
| 3.7 | Works map: sites, lighting per chapter, side nodes, rank, badges | S | All nodes reachable on all inputs |
| 3.8 | Calibration script + per-pack calibration + fallback samples + verify corpus | S | Calibration JSON committed for `global` and `in` |
| 3.9 | Codex 45 entries (data + live verdicts), including the 4 incident pages from `research/incidents.md` with UNVERIFIED items resolved | S writes; H checks sources; director signs off | Coverage test; no UNVERIFIED |
| 3.10 | Coach for L01-L03 + first-appearance steps; device-specific text | S | Coach persona completes L01-L03 |
| 3.11 | Brief/Report strings, exam-bridge Reports (book working beside engine) | S | No unfilled placeholders; leak test clean |
| 3.12 | **M3 exit review**: which stretch items (if any) enter | director | Decision recorded in status |

**Exit evidence:**
- 22 levels pass `checkAllLevels`;
- calibration files;
- goldens for every level (expert, idle and novice × 3 seeds);
- leak test clean;
- hero-readout screenshot set.

**Estimate:** about 15 worker-tasks.

## M4 · Polish: audio, juice, Codex, settings, leaderboard client
| # | Task | Model | Acceptance |
|---|---|---|---|
| 4.1 | Audio: synthesised plant bed layers following the sim, all sfx, 4 music tracks of different structure + adaptive alarm stem | S | Audio audit: no clipping; layers react to state |
| 4.2 | Juice pass per §2.7 (shake, glow ramps, particles, relief jet, beam animation, map lighting), phone haptics if core supports them | S ×2 | Clip per level captured |
| 4.3 | Near-miss replay (in-engine) + plant card PNG | S | Replay identical to the run |
| 4.4 | Leaderboard client: queue, retry, cache, nickname, share setting, histogram UI states (online / offline-cached / fallback / error) | S | Works offline; tests with a local `cobanana-scores` Docker instance |
| 4.5 | Settings: thermo detail, units, coach, interlock assist, score sharing; persistence | S | Settings audit |
| 4.6 | Views: Heat, X-ray, Labels | S | Screenshots |
| 4.7 | Title screen with the L00 demo (autosave off), save/continue | S | Fresh install shows no demo Continue |

**Exit evidence:** feature checklist complete; smoke green; audits zero.

**Estimate:** about 9 worker-tasks.

## M5 · QA rounds (PROGRAM tester roster + critics)
**Round 1**, in parallel with isolated displays and saves:

| Tester | Model | Coverage |
|---|---|---|
| Novice | S | Learner mode, desktop 1080p, L00-L10 |
| Form factors + settings | S | All 7 resolutions |
| Phone | S, holds the phone lock | Real Pixel; touch-only on L00, L01, L13, L24 |
| Pad | S, alone with the pad lock | Deck layout; pad-only on L01, L13, L24 |
| Monkey | H | 10k actions; Haiku, button mashing |
| Code reviewer | S, read-only | Input parity, saves, settings, strings, region seam, verify purity |
| **Fun critic** | Opus | Would anyone play this for an hour? Hook, hour 2, clips, spreadsheet feel |
| **Educator** | Opus | Every Why and Codex equation, units, simplifications named, exam bridges vs NCERT; ≥ 10 oracle spot-checks |

**Fix pass**, then **round 2**: verify every fix with the same personas.

Release checks:
- The Bhopal and Visakhapatnam pages, plus the exam bridges, go to the user for human review (REVIEW §5d).
- Remaining NCERT citations: H tries the primary PDFs again. If they are still unreachable, keep "NCERT-style".

**Output:** `docs/CRITIQUE-0.1.md`.

**Exit:** zero blockers and zero majors open; round 2 verified.

**Estimate:** about 10 tester runs plus about 6 fix tasks.

## M6 · Release
1. Version bumps and CHANGELOG.
2. Screenshots at 4K and phone; README; Pages site.
3. CI tag build for Linux/Windows/macOS.
4. Signed APK built by hand; SHA256SUMS.
5. Verify `verify()` bundles for ruleset `equilibrium:global@1.1` are handed to `cobanana-scores`.

The push and tag wait for the orchestrator. **Estimate:** about 3 tasks.

**Total: about 70 worker-tasks** (M0 3, M1 16, M2 11, M3 15, M4 9, M5 16, M6 3).

---

## Testing matrix (targets are release gates)
| Layer | What | Where | Target |
|---|---|---|---|
| Unit | Every sim module + unit op, ≥ 3 analytic/oracle cases each | `src/sim/**/*.test.ts` | 100 % of modules; `tsc` clean; no skips |
| Oracle | 78 textbook problems (43 NC + 35 CE) with §9.2.1b fixes; JANAF data oracles; K vs JANAF | `src/oracle/*.test.ts` | 78/78 + 85 data points + literature bands, all green |
| Dual implementation | Python research ↔ TS fixtures (§9.2.3) | `src/oracle/dual.test.ts` | All fixtures within tolerance |
| Property / fuzz | P1-P24 (§9.3) | `src/props` | 10k cases each in CI, 10⁶ nightly, 0 failures |
| Convergence | Named loops + 10k random loop flowsheets | `src/sim/flowsheet` | ≥ 99.5 % converge, 100 % of the rest diagnosed; L20 ≤ 30 passes |
| Golden | Expert/idle/novice × seeds 1-3 × 22 levels + per-unit goldens | `src/__golden__` | Bit-exact; regenerated only deliberately |
| Persona | Idle, novice, expert, exam student, cheese-seeker, monkey + invariants | `src/playtest` | 0 invariant violations; expert ★★★ 100 %; idle 0 %; novice bands §9.6 |
| Solvability | Solver bot + blind grid/Nelder-Mead search per level | `checkAllLevels`, `scripts/calibrate-levels.ts` | problems = [] for 22 levels × 2 packs |
| Cheese | Fixed exploit list + nightly topology GA (2000 evaluations per level) | `src/levels/cheese.test.ts` | No ★★ by a degenerate route; each exploit → regression test |
| Region seam | Pack switch, leak, chemistry invariance, formatting (§9.12) | `src/regions/*.test.ts` | Both packs load; all levels solvable; 0 leaks |
| Verify | Round trip, tamper, partition, runtime parity, purity (§9.13) | `src/verify.test.ts` | Bit-equal metrics on 500 codes; ≤ 2 s CPU worst level |
| Teaching | Why templates, Codex coverage, coach persona, jargon lint, exam Reports (§9.8) | `src/explain`, `src/data` | All green |
| Perf | `bench-solve` desktop; Pixel run | `scripts/bench-solve.ts` | Solve ≤ 3 ms desktop / ≤ 20 ms phone p95; tick ≤ 0.5 ms phone; snapshot ≤ 8 KB |
| Smoke | `CB_SMOKE=1` every screen × theme × layout | CI | `SMOKE OK`, 0 script errors |
| Layout audit | 1280x720, 1280x800, 1920x1080, 2560x1440, 3440x1440, 3840x2160, phone 2424x1080 with insets | `CB_AUDIT=1`, `core/qa/ph.sh` | 0 squeezed or overflowing controls |
| Spreadsheet-feel audit | Drawers-closed screenshot per level shows the hero readout; ≤ 3 chips | `core/qa/shot1.sh` sweep (H) + director review | 22/22 |
| Phone | Real Pixel 9a, touch-only on L00, L01, L13, L24; Back, safe area, autosave on pause | `core/qa/phone.sh` | Pass; ≤ 20 ms solve |
| Pad | Virtual pad, Deck layout, pad-only on L01, L13, L24; every control focusable | `core/qa/pad*.sh` | No mouse fallback needed |
| Monkey | Haiku 10k random actions + soak | desk harness | 0 crashes, 0 `SCRIPT ERROR` |
| Fun | Opus fun critic at M2 and M5 against §9.11 hypotheses | `docs/CRITIQUE-*` | Minute-1/2/3/10/60 and hour-2 signals met, or fixed |
| Educator | Opus educator at M2 and M5; ≥ 10 oracle spot-checks by hand | `docs/CRITIQUE-*` | 0 science errors open; human teacher review requested |

## Risks to watch (from REVIEW)
- **Spreadsheet feel** (gate at M2).
- **Phone performance** (measure at M2, not M5).
- **Leaderboard CPU on Workers** (user decision).
- **Solution-code size if the core tick-merge is not available.** Fallback: keep the 10 Hz cadence; the test asserts < 8,000 actions.
- **Unsourced ρ_b and GAME prices.** Labelled; calibration absorbs them.
- **Incident-page accuracy** (human review before release).
