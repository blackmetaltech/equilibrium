# EQUILIBRIUM build status (handoff 2026-11-10)

Plan: `docs/BUILD-PLAN.md` (M0-M6). Deviations: `docs/DECISIONS.md` (read it). Worker briefs, reusable verbatim:
`.work/BRIEF-COMMON.md` + `.work/brief-*.md` (git-ignored; m1.7b, m1.8, m1.11, m1.12 are written but **not yet run**).

## Milestone: M0 done · M1 ≈ 60 % · M2 front-end started
Evidence: `tsc --noEmit` clean; `vitest run` 57 files / 827 tests pass (2 skipped: liquid S above 882 K); CI `ci.yml`
green on push (GitHub run 42688646054); `CB_SMOKE=1` → `SMOKE OK screens=2`; core 2034140 with `mergeTicks: true`.

| Task | State | Evidence |
|---|---|---|
| M0 scaffold, skeleton, regions (global + draft in), strings, SI, CI, fixtures | done | regions/leak/format tests; `oracles.json` 78 oracles + 13 dual fixtures (`scripts/export-fixtures.py`) |
| M1.1 thermo (38 species by script) | done | 17 JANAF species × 5 T: dH ≤ 0.014 kJ/mol, dS ≤ 0.015; 5 Cp gaps pinned (DECISIONS) |
| M1.2 data entry | folded into port scripts | `scripts/port-*.py` |
| M1.3 reactions / K(T) / stoich / basics | done | 26 oracles; K vs JANAF ≤ 0.5 % (66 rows); P4-P6 |
| M1.4 equilibrium solver | done | 21 oracles; Haber/WGS/SO2 beds/staircases/DCDA/N2O4 fixtures; P7-P11, P18, P19 |
| M1.5 kinetics + catalysts | done | 10 oracles; K1/K2/K7 fixtures; P12/P19 |
| M1.6 units A | done | P2/P3/P13/P15-P17/P24 fuzz |
| M1.7a flash, NH3 sep, boiler, absorber, stack, relief, interlock | done | CE-007…010, P20, L05 steam, relief 1882 mm² |
| M1.7b reactor units (stoich, eq reactor, packed bed, multibed) | **next** | brief `.work/brief-m1.7b.md`; owns CE-011…014 + PFR oracles |
| M1.8 CSTR + batch rig | **next** | brief `.work/brief-m1.8.md` (K7 states 27.6/63.1/117.0 °C) |
| M1.9 flowsheet solver | done | CE-005/006/032, L20 Part A, fuzz 10k 100 % converged p95 0.16 ms |
| M1.10 econ | done | 1 MW compressor $1.517 M, 100 m² HX $169 k; pack switch |
| M1.11 shift pipeline | **next** (after 1.12) | brief `.work/brief-m1.11.md` |
| M1.12 engine glue (actions, commission, queries, snapshot, verify) | **next, not started** | brief `.work/brief-m1.12.md`; worker notes below |
| M1.13 explain / Why | not started | no brief yet (DESIGN §7.3, §9.8) |
| M2.2 Godot world + 14 models | WIP committed | gallery `CB_CAM=gallery` (`.qa/equilibrium/m2-gallery-1080.png`, looks like a game); touch/pad camera, handheld + phone shots, FPS not verified |
| M2.1, M2.3-M2.9 | not started | levels L00, L10-L14; pipes; drawers; Eq Window; cinematic; Why/coach/report; Android + Pixel; pad; critics |

## Exact next steps
1. Run M1.12 (glue) and M1.7b (reactors) in parallel, then M1.8; after 1.12 lands run M1.11, then M1.13.
   M1.12 worker notes: registry merge = `UNIT_DEFS` (units/registry.ts) + `UNIT_DEFS_B` (registryB.ts) + future
   registryRx/registryCstr; solver `exits/consumes` must be bound to the species list at commission; ~60 `fail.<CODE>`
   strings needed; adding EqState fields changes goldens (regenerate deliberately); `src/locales.test.ts` flags orphan
   `ui` keys; the plant-query test asserts an exact shape.
2. Godot type names agreed: eq_reactor, packed_bed, multibed, cstr (converter model), flash, nh3_sep, boiler, absorber,
   stack, relief, flare, product/sink/vent — engine lanes must use these.
3. Then M2.1 levels (L00, L10-L14 + calibration exceptions), M2.3-M2.7 front-end, M2.8 Android/Pixel (phone lock) + pad,
   M2.9 fun critic + educator gate. M1 exit also needs: bench-solve numbers, 24 property tests at 10k, convergence report.

## Open bugs / questions
- HX U values UNVERIFIED (hand-typed); R17 ΔH UNVERIFIED; air-cooler Turton K values + a few F_BM UNVERIFIED; catalyst
  windows UNVERIFIED; all ρ_b and K6 k(25 °C) GAME.
- DESIGN §3.3 quotes Smith-table K values; the engine uses NIST (doc fix pending). R2 textbook-ratio 1.064 is the full form.
- L15 numbers in DESIGN come from a constant-Cp, literature-K script; the engine will differ a little (M1.7b reports it).
- WATER_ABSORBER_MIST has no consequence yet (decide in dynamics); boiler reports steam only in `info`.
- Esc cannot cancel placement (CbApp eats it): right-click / pad B used.
- No workers are in flight. Phone lock never taken.
