#!/usr/bin/env bash
# Local mirror of .github/workflows/release.yml (test + smoke jobs). Run from anywhere; it cds to the repo root.
#   scripts/ci-local.sh            all steps
#   SKIP_GODOT=1 scripts/ci-local.sh   skip the Godot import and UI smoke steps (TS-only machines)
# Prints PASS/FAIL per step and exits non-zero if any step failed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/eq-ci-XXXXXX")"
declare -a RESULTS=()
FAILED=0

step() { # step <name> <command...>   (runs the command, logs to $LOG_DIR/<name>.log, never aborts the script)
  local name="$1"; shift
  local log="$LOG_DIR/${name// /_}.log"
  printf '== %s\n' "$name"
  if "$@" >"$log" 2>&1; then
    RESULTS+=("PASS  $name"); printf 'PASS  %s\n' "$name"
  else
    RESULTS+=("FAIL  $name   (log: $log)"); FAILED=1
    printf 'FAIL  %s\n' "$name"; tail -n 25 "$log" | sed 's/^/    /'
  fi
}

smoke() {   # the shared runner: SMOKE OK required, no script error in the log (see core/qa/run-flow.sh)
  CB_SMOKE=1 core/qa/run-flow.sh -k smoke -T 300 -o "$LOG_DIR" -- | tee "$LOG_DIR/smoke.verdict"
  [[ "$(head -c4 "$LOG_DIR/smoke.verdict")" == PASS ]]
}

godot_import() { godot --headless --path godot --import || true; }   # exit code ignored, like CI

step "tsc --noEmit"            ./node_modules/.bin/tsc --noEmit
step "vitest run"              ./node_modules/.bin/vitest run
step "vite build (bridge)"     ./node_modules/.bin/vite build -c vite.bridge.config.ts

if [[ "${SKIP_GODOT:-0}" == "1" ]]; then
  RESULTS+=("SKIP  godot import + UI smoke (SKIP_GODOT=1)")
elif ! command -v godot >/dev/null 2>&1; then
  RESULTS+=("FAIL  godot not found on PATH (set SKIP_GODOT=1 to skip)"); FAILED=1
else
  step "godot --import"        godot_import
  step "godot UI smoke"        smoke
fi

printf '\n== summary (logs in %s)\n' "$LOG_DIR"
printf '%s\n' "${RESULTS[@]}"
if [[ $FAILED -eq 0 ]]; then echo "ALL PASS"; else echo "FAILED"; fi
exit $FAILED
