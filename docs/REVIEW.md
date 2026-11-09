# EQUILIBRIUM: design review (level-1 reviewer, 2026-11-09/10)

Reviewed `DESIGN.md` (1369 lines on arrival, now about 1550), its `research/` folder, PROGRAM.md (user decisions 1-5), RESEARCH.md, the GIGAWATT production skill and cobanana-core (`CORE.md` and the live `ts/kit`, `ts/numerics`, `ts/regions`, `ts/i18n` and `kit/verify.ts` / `kit/solution.ts` APIs).

The review covered three things:
1. Applied the user decisions.
2. Reviewed the design with three hats: fun critic, educator and lead engineer.
3. Fixed DESIGN.md wherever I was confident.

It is summarised here; the build plan is `BUILD-PLAN.md`.

**Verdict.** The science core was already strong and is now cross-checked end to end: all 78 oracles agree with independent solvers.

The design's real risk was the one RESEARCH.md named, "spreadsheet feel", and DESIGN.md did not do enough against it:
- the first 20 minutes (L01-L04) were arithmetic with no tension;
- two exam bridges were quizzes;
- nothing bound the front-end to world-first readouts.

That is now fixed in the doc by:
- an L00 cold open;
- a per-level hero-readout / juice / clip table (§2.7);
- a commissioning cinematic and first run;
- hard UI rules, with an automated audit;
- exam bridges as optional side nodes.

On engineering:
- The engine contract was made consistent with core: BaseState, the reserved `tick`, plain-JSON state, dmath, core solution codes and `makeVerifier`.
- The phone performance and bridge-bandwidth budgets were rebuilt; they were not achievable as written.
- Scope was cut to **22 must-ship levels** plus 7 stretch.

Workers used:
- 3 Sonnet: data re-sourcing for the global pack, an independent re-solve of 60 oracles and 15 level numbers, and the incident-page research.
- 1 Haiku: NCERT citation lookup.

I audited every return: I spot-checked their numbers against my own script and checked the incident sources' attribution.

---

## 1. Findings

Severity: **B** = blocker (would ship wrong or broken), **M** = major, **m** = minor. Fix: **A** = applied in DESIGN.md, **D** = deferred, with its owner.

### 1.1 User decisions (PROGRAM.md 1-5)

| # | Sev | Finding | Fix |
|---|---|---|---|
| U1 | B | Setting was Indian (Khambhat Bay Works, Gujarat coast; Anjali / Bashir / Mr. Desai / Farida), with ₹ display and India prices and limits | A: neutral **Kestrel Bay Works**. Cast: Dr. Mara Quinn, Tomas Brandt, Victor Hale, Dr. Noor Haddad. US$ everywhere, every ₹ replaced (35 occurrences). Original content preserved verbatim as the draft `in` pack (§11.3) |
| U2 | B | India-specific data in prices and limits: APM gas, CPCB SO₂ limits, CEA grid factor, OMC ethanol price, India HT tariff, India plant facts | A: re-sourced by a worker and audited (table §3). India rows moved to §11.3 |
| U3 | M | Standards cited as US-only or unstated (API 520, ISA-18.2, ISO 10156 used for limits) | A: API 520/526 kept, cross-referenced to ISO 4126 (ISO has no orifice letters, and the letters are the game object). Alarms cite **IEC 62682** / ISA-18.2. Flammability limits cite EN 1839, with ISO 10156 as the classifier |
| U4 | B | Leaderboards: the design had "none in v0.1, simulated histograms" | A: new §8.8. Core `CB1` solution codes, `src/verify.ts = makeVerifier(GAME)`, `GAME.metrics`, ruleset id, leaderboard seeds, the offline queue and histogram cache, histogram UI, server contract, and tests (§9.13). Simulated engineers are now only a labelled empty-state fallback (§9.6.4) |
| U5 | M | Strings were not externalised | A: §8.9 sets up `src/strings/en/*.json` plus `godot/strings/en.csv` on core `@core/i18n`, with per-pack overrides and a string-literal lint |
| U6 | B | Region packs (decision 5, which arrived mid-review) | A: §11 covers the seam. It specifies the `EqRegionData` schema on core `RegionPack`, the layout, the rules (sim/data never import regions; levels use price and limit keys; per-pack calibration; native currency per pack), the `global` pack and the draft `in` pack. Pack-switch, leak, chemistry-invariance and formatting tests are in §9.12 |
| U7 | m | Incident pages: 7 listed, but the user approved 4 | A: v0.1 ships Bhopal, Seveso, T2 and Visakhapatnam with binding writing rules (§7.5). Sourced drafts are in `research/incidents.md`. Texas City, Beirut and AZF need separate approval (v0.2) |

### 1.2 Fun critic

| # | Sev | Finding | Fix |
|---|---|---|---|
| F1 | B | **No hook in minute 1.** L01 asks you to convert kg to moles on an empty plot. The fantasy in §1.2 (200 bar, alarms, ninety seconds) does not appear until L05/L24 | A: **L00 Night Shift**, a 90-second cold open on a running loop. A cooling-water trip fires, you turn one dial, the beam levels and the *lock* chord sounds. Or the loop trips, with a relief pop and a flare roar, and the title card reads "Kestrel Bay Works closed six months later. You're going to bring it back." L00 is also the title-screen demo |
| F2 | B | **Chapter 1 is homework.** It is design-only with no runtime: commission, then read a number | A: a 3-second **commissioning cinematic** (valves crack, pipes fill with species colour, motors spin up, the counter rolls; a failed solve freezes on the failing unit), plus a 30-second **first run** in L01-L04, L07 and L09 |
| F3 | B | **Nothing bound the front-end to world-first readouts.** The stream table was "optional", but every goal could still be a table cell | A: §2.7 table. Every must-ship level names its in-world hero readout, a juice moment with sound and motion, and a 10-second clip. Hard rules in §1.3: no goal checkable only in the Data drawer, ≤ 3 KPI chips, Call-it entered on an in-world gauge chip, diegetic dials. Learner mode hides the Data drawer until L05. The **spreadsheet-feel audit** (§9.10) screenshots each level with the drawers closed |
| F4 | M | L09 and L18 were three-prediction quizzes, which is PROGRAM's "no quizzes wrapped in a game" | A: L18 now has a plant goal (deliver O₂ within 10 min with no heating, by choosing the catalyst), and its Call-its are optional and resolved by a visible burette. L09 predictions are experiments with physical resolution. Exam bridges became **optional side nodes** (§2.4), so the critical path never forces an exam problem |
| F5 | M | No stated reason to play in hour 2 | A: online histograms (a real population with your pin and percentile), "top 10 %" map badges, a personal-best ghost, the Works map lighting up. Fun hypotheses for minute 2 and hour 2 added (§9.11) |
| F6 | m | Clip-worthiness was implicit | A: §2.7 lists one clip per level. The near-miss replay, the staircase, the loop greying and the Night Shift save are the strongest |
| F7 | m | Phone haptics not mentioned | D: M4 polish task (critical alarm, relief pop), if core settings expose them |
| F8 | m | The music budget (5 tracks) competes with must-ship | A: 4 must-ship tracks with different structure, the 5th is stretch |

### 1.3 Educator

| # | Sev | Finding | Fix |
|---|---|---|---|
| E1 | M | L10 said "K(T) falls 5000× from 400 to 550 °C". It is **≈ 32×** (1.8e-4 → 5.7e-6 bar⁻²; worker and reviewer agree) | A |
| E2 | M | §3.4 claimed the single-reaction residual is *decreasing* (sign error). The derivative is Σν²/n − Δν²/n_tot > 0 by Cauchy-Schwarz, over gas species only | A |
| E3 | M | L24 ran propylene oxide / methanol / water at 117 °C with no pressure stated: it would boil. The relief model for a liquid-full vessel was undefined | A: pressurised to 6 bar(g), design 10 bar(g). The v0.1 relief lifts at a 140 °C temperature-equivalent set point (GAME, named on the card and in the Codex). Vapour-pressure relief is deferred to v0.2 |
| E4 | M | K7 activation energy was given as 75.4 kJ/mol, but the fixtures use 75.36. The rounding moves the unstable steady state 63.1 → 63.45 °C, which breaks the 0.3 K fixture (reviewer finding) | A: E = 75.36 exactly, stated in §4.3 and in the oracle fixes |
| E5 | M | The §7.3 runaway example (96 °C, 182 °C in 3 min) contradicted the K7 model (hot state 117 °C, drift toward ≈ 152 °C, +20 K in 49 s, adiabatic bound 173.7 °C) | A: rewritten with K7 numbers. The other examples are marked as placeholders that the template tests replace |
| E6 | M | K1 Temkin is per m³ of catalyst, but beds are per kg and L15 quotes "L cat": the basis was mixed | A: a required bulk density ρ_b per catalyst, with provenance. The bed knob is mass; volume is shown. D: source ρ_b for fused iron and V₂O₅ (M1 data task) |
| E7 | m | L04: the book's answer is 2428.57 g (N = 14, H = 1); the engine gives 2431.8 g (IUPAC). Students may be confused | A: the Report shows both, and the tolerance already covers the gap |
| E8 | m | L12's data holds only for a pure CO + steam feed, but the brief said "CO-rich gas" | A: the level supplies pure CO + steam, stated |
| E9 | m | L27: the 1882 mm² figure is the unit-test case, not the level's (20 t/h, 30 bar(g)) | A: clarified. The Call-it uses the level's own case |
| E10 | m | Emission identity basis unstated | A: per tonne of 100 % H₂SO₄ produced, sulfur-burning; 99.9 % → 0.65 kg/t added |
| E11 | m | 15 oracle statements were under-specified (R value, units, basis, Simpson span, Antoine digits) | A: §9.2.1b correction table, binding for the oracle JSON |
| E12 | M | NCERT citations unverified | Partly done. Six XI ch 1 items are verified against the old edition (Ex 1.33(iii), 1.6, 1.5, 1.24(i), 1.7, 1.3). Three were not found and are relabelled "textbook-style". Chapters 3, 5 and 6 remain unverified (ncert.nic.in refused connections). D: M5 task; rule kept: "NCERT-style", no exercise numbers until verified |
| E13 | m | Syllabus mapping (rationalised NCERT XI ch 1/5/6, XII ch 3; States of Matter removed) | Checked correct. No change |
| E14 | m | Progression teaches the syllabus in order: mole → energy → equilibrium → kinetics → loops → safety. Le Chatelier T, P, inerts and concentration each have a level (L10, L11, L12, L14, L25). Rate vs equilibrium is the L10 → L15 reversal | No change: the strongest part of the design |
| E15 | m | Not spot-checked by me or the workers: the L17 "K at 600 °C = 10.0 bar⁻½", the L13/L16 bed temperatures, L22, L23, L26 and L28 data | D: covered by the dual-implementation fixtures (§9.2.3) in M1. L17 is stretch |

### 1.4 Lead engineer

| # | Sev | Finding | Fix |
|---|---|---|---|
| X1 | B | GameState did not extend core `BaseState`, used `Float64Array` (not plain JSON), lacked `'book'` thermo detail, and stored the tear history | A: `EqState extends BaseState`, `number[]` arrays, `species` index list, trends/replay rings, size budget ≤ 256 KB, derived data never stored |
| X2 | B | A game action named `tick(seconds)` collided with core's reserved `tick`. Restart was a recorded game action, so it would pollute solution codes | A: one core tick = 1 plant-second. Restart = core `startLevel` (clears `levelActions`) |
| X3 | B | **Performance not achievable**: "16 sub-steps per frame" contradicted cruise at 120 plant-s per real second, re-solves at up to 24/s × 20 ms on the phone, and the full-state snapshot per frame over the bridge | A: front-end calls `tick(n)` at 10 Hz and interpolates. Per-tick budget is 0.5 ms on phone. Re-solves happen only on boundary changes (≤ 4 per real second, coalesced). A compact `snapshot` of ≤ 8 KB. Trends, replay and solve are fetched by query |
| X4 | B | dmath rule not stated: K spans 30 decades, and server verification needs bit-identical replays | A: §3.1 rule, plus a Node 22 vs nodejs-mobile 18 corpus test (§9.13) |
| X5 | M | Speed independence (P21) is now load-bearing, because core codes record `tick(n)` partitions | A: partition tests on every shift level (§9.13) |
| X6 | M | Workers free plan (10 ms CPU) cannot replay an 8-hour shift | Flagged to the user. Verify budget ≤ 2 s CPU; Workers needs the paid plan, or use Docker |
| X7 | M | Solution-code size: about 2,400 ticks per shift plus design actions | A: assert < 8,000 actions for expert and novice runs. D: request to core to optionally merge consecutive `tick` entries |
| X8 | M | Scope: 28 levels, 18 models, 10 rate laws, NRTL, a column and a fermenter for v0.1 | A: must-ship / stretch table (§10.1). Must-ship needs only 4 rate laws (K1, K2, K6, K7), no NRTL, column, fermenter or gauze, and 14 unit models |
| X9 | M | Missing species for must-ship levels: H₂O₂ (L18), PO and PG (L24) | A: lab/lumped pseudo-species listed in §10.1 |
| X10 | m | Fallback histograms (500 samples per level) are expensive and now secondary | A: 200 samples, which also seed the `verify()` corpus |
| X11 | m | Ambiguities a Sonnet worker would ask about | Decided in BUILD-PLAN "decisions": file layout, module order, fixture export format, tolerances, calibration file names |

---

## 2. Oracle and level-number spot-check (reviewer's own script)

`research/review_spotcheck.py` (python3 -I, scipy) was written independently of the research scripts. **43 / 43 checks agree** after fix E4 (K7 with E = 75.36). Before that fix, the K7 unstable state was off by 0.35 K.

| Check | Expected | Reviewer | OK |
|---|---|---|---|
| EQ-NC-005 NH₃ g / L04 H₂ left kmol/h | 2431.84 / 281.8 | 2431.76 / 281.88 | ✓ / ✓ |
| EQ-NC-024 Kp bar / α | 85.87 / 0.837 | 85.871 / 0.8373 | ✓ |
| EQ-NC-023 Kc | 7.479e11 | 7.483e11 (R = 0.083145) | ✓ |
| EQ-NC-035 k ratio | 24113 | 24100 | ✓ (5 %) |
| EQ-NC-036 Ea kJ/mol | 239.296 | 239.309 | ✓ |
| EQ-NC-037 T K | 668.97 | 668.97 | ✓ |
| EQ-NC-038 t s | 444.196 | 444.196 | ✓ |
| EQ-NC-039 years | 1844.65 | 1844.65 | ✓ |
| EQ-NC-042 / 043 Ea | 52.850 kJ / 18227 J | 52.853 / 18228 | ✓ |
| EQ-NC-019 ΔU / L09 ΔU − ΔH | 37.689 / 4.96 | 37.689 / 4.958 | ✓ |
| EQ-NC-022 [CO] / EQ-NC-028 ΔG | 0.032689 / 163.2 | 0.032689 / 163.21 | ✓ |
| EQ-CE-025 K298 | 5.8097e5 | 5.8054e5 | ✓ (0.07 %) |
| EQ-CE-026 K500 / K700 constant ΔH | 0.17439 / 3.0817e-4 | 0.17440 / 3.0831e-4 | ✓ |
| EQ-CE-006 N₂ in / H₂ in / y_Ar purge | 86.609 / 261.83 / 0.022403 | 86.609 / 261.83 / 0.022403 | ✓ |
| L20 Part A Ar % at reactor inlet | 1.69 | 1.693 | ✓ |
| EQ-CE-015 V_CSTR / V_PFR; CE-033; CE-032 | 200 / 80.47; 3.9087; 156.25 | same | ✓ |
| EQ-CE-021 steady states K | 300.10 / 345.54 / 424.94 | 300.10 / 345.54 / 424.94 | ✓ |
| EQ-CE-023 t₅₀ s | 201.05 | 201.06 | ✓ |
| K7 / L24 steady states °C | 27.6 / 63.1 / 117.0 | 27.56 / 63.06 / 117.01 (E = 75.36) | ✓ |
| SO₂ 99.7 % → kg/t | 1.97 | 1.966 | ✓ |
| L27 API 520 area mm² | 1882 | 1881.7 | ✓ |
| L01, L02, L03, L07 stoichiometry (8 values) | 30.24, 140.1, 10.0 %, 11.0 %, 261.9, 91.5, 2.81 | all match | ✓ |

**Worker cross-checks.**
- **Independent re-solve (Sonnet):** all 60 oracles not previously cross-checked agree within tolerance, with 15 statement defects (fixed in §9.2.1b). Of 15 level numbers, 14 agree, including L10 equilibrium points within 0.2 % using live NIST Shomate data, the L12 K and CO % data, and L14 NIST Kp 51.14. The disagreement was the L10 "5000×" claim (fixed).
- **Earlier blind check:** 18 of 18.
- **Total: 78 of 78 oracles cross-checked.**

## 3. Global-pack data (worker re-sourcing, audited)

| Item | New `global` value | Source / confidence |
|---|---|---|
| SO₂ limit, standard / strict / expert | 2.0 / 1.3 / 0.65 kg/t | US NSPS 40 CFR 60.82(a) (FETCHED); EU LVIC-AAF BREF 2007 Table 4.24 (FETCHED); kg/t derived from conversion |
| N₂O | IPCC 2006 Table 3.3 defaults 2 / 2.5 / 5 / 7 / 9 kg/t; EU BAT-AEL 0.12-0.6 (new) / 0.12-1.85 (existing) | FETCHED (the design's "0.12-0.45" was corrected) |
| Natural gas default / cheap | $11.0 / $3.5 per MMBtu | World Bank Pink Sheet: Europe 2024 $10.96; Henry Hub 2025 $3.53 (FETCHED) |
| Electricity | $0.10 /kWh (GAME, between anchors) | US industrial 8.13 ¢ (EIA-861, FETCHED); EU band ID about €0.142 (Eurostat, FETCHED) |
| Fuel ethanol | $0.55 /L | US rack (F2); Brazil about $0.48 (SNIP). Stretch level only |
| Sulfuric acid | $100 /t (GAME) | 2024 observations $64-140 (SNIP) |
| Grid factor | 0.47 t CO₂/MWh | Ember 2024 (SNIP); IEA 0.445 (SNIP) |
| GWP N₂O / CH₄ fossil; IFA ammonia benchmarks | 273 / 29.8; 28 and 36.6 GJ/t | re-verified (FETCHED) |
| CEPCI 2024 | not published openly | keep the 2023 basis (797.9) |
| Not found | nitric acid, molasses, O₂, CO₂ prices | GAME placeholders, stretch levels only |

**Audit note.** The worker correctly reported that no real 2024-25 LNG-coast gas benchmark sits at $6-8/MMBtu. I chose the real Europe benchmark ($11) over a labelled GAME mid-value, which raises every level's costs. Calibration (§9.6) re-pins the thresholds, so no gameplay number depends on it, but the user may prefer the other option (open item c).

## 4. Decisions I made (binding unless the user overrides)

1. `global` setting: Kestrel Bay Works, with a neutral international cast. The `in` pack is preserved as a draft and is not selectable in v0.1 release builds.
2. Must-ship is 22 levels: L00-L16, L18-L20, L24, L25. Stretch: L17, L21, L22, L23, L26, L27, L28. Exam bridges are optional side nodes.
3. One tick = one plant-second. The front-end calls the engine at 10 Hz. Re-solves happen only on boundary changes.
4. Leaderboards use core `CB1` codes and `makeVerifier`. There is a fixed leaderboard seed per level and ruleset. Buckets are (ruleset, level, mode, metric). Ranked runs use the level's default thermo detail.
5. Native currency per pack, with no FX inside rules.
6. Exam-bridge sets are pack data. The `global` set is NCERT/JEE-style, with citations as source fields (allowed by decision 1 and on the leak allowlist).
7. The four incident pages ship in every pack (history, not setting) and are on the leak allowlist.
8. L24 relief lifts at a 140 °C temperature-equivalent set point (GAME). The reactor is pressurised to 6 bar(g).
9. Gas price default: $11/MMBtu (real benchmark).
10. Fallback histograms: 200 simulated engineers, hatched, labelled, no percentile.

## 5. Open items for the user

- (a) **Leaderboard hosting.** Shift replays need about 2 s CPU per verify, so Cloudflare Workers needs the paid plan's CPU limit; otherwise use the Docker target.
- (b) **Gas price.** Real LNG-coast benchmark ($11/MMBtu, chosen) or a labelled GAME value of about $7?
- (c) **More real incidents.** Texas City 1947, Beirut 2020 and Toulouse 2001 (ammonium nitrate) are excluded from v0.1 pending approval.
- (d) **Human reviewers before release.**
  - A chemistry teacher, for the exam bridges.
  - Someone familiar with the Bhopal and Visakhapatnam cases, for those two pages.
