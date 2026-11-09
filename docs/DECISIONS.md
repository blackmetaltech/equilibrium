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
