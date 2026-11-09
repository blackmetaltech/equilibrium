# EQUILIBRIUM: build decisions and deviations

Deviations from `docs/BUILD-PLAN.md` / `docs/DESIGN.md` are recorded here with a reason (newest last).

- 2026-11-10 · The design docs and the research folder (`design/equilibrium/research`) are copied into `docs/` and `docs/research/`
  so fixtures can be regenerated from inside the repo (`scripts/export-fixtures.py` reads `docs/research/*.py`).
- 2026-11-10 · SI display/conversion helpers live in `src/sim/si.ts`, not `src/sim/units.ts` (BUILD-PLAN): `src/sim/units/` is the
  unit-operation folder (DESIGN §8.1) and a sibling `units.ts` would shadow it in module resolution.
- 2026-11-10 · Shared rule-code contracts (StreamState, Pipe, UnitInst, Diag, SimResult, UnitOp) are fixed by the director in
  `src/sim/types.ts` before the parallel lanes start. Rule code returns coded diagnostics; sentences come from `t('fail.<CODE>')`.
- 2026-11-10 · Task 1.2 (Haiku bulk data entry) is folded into the Sonnet lanes as **porting scripts** (`scripts/port-*.py`
  reading `docs/research/*.py` → generated `src/data/*.gen.ts`). BUILD-PLAN forbids retyping coefficients; a script is both
  cheaper and auditable. The director spot-checks rows against the research files.
- 2026-11-10 · "CI green on a push to a local bare remote": GitHub Actions cannot run locally (`act` is not installed and pushing
  is not allowed). Instead `scripts/ci-local.sh` runs the same steps as the workflow (typecheck, tests, sidecar build, Godot
  import + smoke) and must pass before every milestone commit.
- 2026-11-10 · M1.1: five JANAF Cp rows exceed the 0.1 J/(mol K) band because NIST's own Shomate fits differ from JANAF
  there (CH4, C2H4 at 1500 K; N2O4 at the 1000 K break; liquid S at 500/700 K, the λ region). They are pinned at their
  observed deviation (+3 %) in `src/oracle/janaf.test.ts` (fails if they grow or vanish); H and S stay inside the band
  everywhere. Accepted: no level runs CH4/C2H4 at 1500 K or liquid S above 450 K.
- 2026-11-10 · EQ-CE-026 / §3.3: the engine's NIST/JANAF K(700 K) for R1 is 8.75e-5 rigorous / 3.18e-4 textbook; the
  DESIGN text quotes the Smith-table row (8.56e-5 / 3.08e-4). Oracles carry their own book data; Codex numbers come from
  the engine.
- 2026-11-10 · M0.3: `haber_loop.json` needs CoolProp (NH3 Psat) to regenerate: `PYLIB=<dir with CoolProp> python3 -I
  scripts/export-fixtures.py` (CoolProp 8.0.0 matched the research's 6.x numbers). EQ-NC-026 uses the corrected DESIGN
  statement ([H2] = 0.06754), not the research script's mislabelled HI problem. K1/K2 fixtures carry both the research's
  literature-K variant and an engine-K variant; the engine is asserted against the engine-K variant.
- 2026-11-10 · P22 round-trip tolerance is 1e-12·max(|x|, 1) (relative above 1, absolute below): °C and bar(g) near zero
  cannot round-trip to 1e-12 relative through the 273.15 / 1.01325 offsets.
- 2026-11-10 · M1.9: bounded Wegstein (q ∈ [−5, 0], DESIGN §3.6) contracts at −5 + 6s per pass, i.e. 0.94 at s = 0.99, so
  on its own it needs 338 passes at a 1 % purge — the DESIGN's "≤ 30 Wegstein passes" is not achievable with that bound.
  The solver hands off to Broyden as soon as the Wegstein contraction estimate predicts more passes than a Broyden restart
  costs (dimension + 8): 16-17 passes at 0.5-10 % purge, `method: 'broyden'`. `qMin` stays configurable. The L20
  "loop filling" animation uses the stored tear history whatever the method.
