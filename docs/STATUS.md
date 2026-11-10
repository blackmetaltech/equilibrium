# EQUILIBRIUM build status

Plan: `docs/BUILD-PLAN.md` (M0-M6). Decisions/deviations: `docs/DECISIONS.md`. Worker briefs (not committed): `.work/`.

## Done
- **M0 scaffold**: core submodule (2034140, `mergeTicks` on), EqState skeleton, empty-plant GAME, `global` + draft `in`
  region packs with seam/leak/format tests, externalised strings, SI conversions (P22), Godot empty plant world (fenced 2 m
  grid, night lighting, iso ortho camera) + Plant drawer (SMOKE OK, audit 0 at 1080p), CI (`ci.yml` green on push),
  `scripts/ci-local.sh`, `scripts/export-fixtures.py` → `src/oracle/oracles.json` (78 oracles) + 13 dual fixtures.
- **M1.1 thermo** (species DB ported by script, JANAF oracles), **M1.3** reactions/K(T)/stoich/basics (26 oracles,
  K vs JANAF), **M1.6** unit ops A (feed, mixer, splitter, heater/cooler, HX, compressor, valve, sinks),
  **M1.9** flowsheet solver (tears, NO_EXIT, Wegstein→Broyden, diagnosis, fuzz 10k).

## In progress (lanes)
- M1.4 extent equilibrium solver (`src/sim/chem/equilibrium.ts`) — oracle lane chem/equilibrium (20) + dual fixtures.
- M1.5 kinetics + catalysts (`src/sim/chem/kinetics.ts`, `src/data/{kinetics,catalysts}*`).
- M1.7a flash / NH3 separator / WHB / absorber / stack / relief / interlock (`src/sim/units/*`, `src/sim/thermo/vle.ts`).
- M1.10 econ (`src/sim/econ`, `src/data/equipment*`, `benchmarks.ts`): WIP, uncommitted.
- M2.2 Godot world/models: WIP uncommitted under `godot/world/{parts,models}` (unparsed; do not commit until smoke passes).

## Next
M1.7b reactors (stoich, equilibrium reactor, packed bed RK4/BE, multi-bed staircase) after 1.4/1.5; M1.8 CSTR;
M1.11 dynamics/shift; M1.12 engine glue (actions, queries, snapshot, metrics, verify); M1.13 explain/Why;
then M2 slice (L00, L10-L14) with the gates (Pixel perf, pad, fun critic).

## Open bugs / questions
- EQ-CE-011…014 need the stoichiometric reactor (M1.7b).
- HX U values UNVERIFIED (hand-typed, Towler & Sinnott recall); R17 ΔH UNVERIFIED.
- DESIGN §3.3 quotes Smith-table K values; engine uses NIST (doc fix pending).
