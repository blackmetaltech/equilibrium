// Solver performance bench (DESIGN 3.11 / 9.1 "Performance"). STUB until levels exist: with no level registry it
// prints "no levels yet" and exits 0. Once levels land, `bench(levelIds, n)` solves each level's reference flowsheet
// n times (default 200) and reports p50/p95 wall-clock ms per level.
//
// Run (vite-node ships with vitest but is not linked into node_modules/.bin under pnpm):
//   node "$(ls -d node_modules/.pnpm/vite-node@*/node_modules/vite-node | head -1)/vite-node.mjs" -c vitest.config.ts scripts/bench-solve.ts
// Optional: BENCH_N=500, BENCH_LEVELS=L05,L13
//
// Wiring, when the engine exists: export from src/levels (registry) a list of { id } and implement `solveReference` below
// to build the level's reference flowsheet once and return a function that runs one full solve (no setup inside the
// timed region). Timing uses performance.now(); this file is tooling, not rule code, so wall-clock use is fine here.

export interface LevelBench {
  levelId: string;
  n: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

/** One timed solve of a level's reference flowsheet. Built once per level, called n times. */
export type SolveOnce = () => void;

export function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return NaN;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(q * sortedAsc.length) - 1));
  return sortedAsc[i];
}

/** Run every level's reference flowsheet n times; `make(levelId)` returns the solve closure. */
export function bench(levelIds: string[], n = 200, make: (levelId: string) => SolveOnce = solveReference): LevelBench[] {
  const out: LevelBench[] = [];
  for (const levelId of levelIds) {
    const solve = make(levelId);
    solve(); // warm-up (JIT), not timed
    const t: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      solve();
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    out.push({ levelId, n, p50: percentile(t, 0.5), p95: percentile(t, 0.95), min: t[0], max: t[t.length - 1] });
  }
  return out;
}

/** Placeholder: replace with the real flowsheet build + solve once src/levels and src/sim/flowsheet exist. */
function solveReference(levelId: string): SolveOnce {
  throw new Error(`no reference flowsheet wired for level ${levelId}`);
}

/** Level ids known to the registry. Empty until the levels module exists. */
function levelIds(): string[] {
  const env = process.env.BENCH_LEVELS;
  return env ? env.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function main(): void {
  const ids = levelIds();
  if (ids.length === 0) {
    console.log('no levels yet');
    return;
  }
  const n = Number(process.env.BENCH_N ?? 200);
  const rows = bench(ids, n);
  console.log('level      n     p50 ms    p95 ms');
  for (const r of rows) console.log(`${r.levelId.padEnd(8)} ${String(r.n).padStart(5)} ${r.p50.toFixed(3).padStart(9)} ${r.p95.toFixed(3).padStart(9)}`);
}

main();
