// Solver performance bench (DESIGN 3.11 / 9.1 "Performance"): full flowsheet solve of four plants through the engine commission path.
// Reports median / p95 / max wall-clock ms over N runs (default 300) after warm-up, for
//   solve    - solveFlowsheet alone on the plant as commission() feeds it (the "p95 <= 3 ms" target),
//   commission (cold) - the whole commission action with the warm start cleared (solve + economics + ledger + state write),
//   commission (warm) - the same with the stored tears,
// plus the snapshot and state sizes in bytes and, when src/sim/dynamics/shift.ts exists, the shift tick.
// Writes docs/bench-solve.md. Run (vite-node ships with vitest but is not linked into node_modules/.bin under pnpm):
//   node "$(ls -d node_modules/.pnpm/vite-node@*/node_modules/vite-node | head -1)/vite-node.mjs" -c vitest.config.ts scripts/bench-solve.ts
// Optional: BENCH_N=500. Tooling, not rule code: wall-clock use is fine here.
import { existsSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import type { Engine } from '@core/kit';
import { bindRegistry, phaseHook } from '../src/engine/registry';
import { unitsForSolve } from '../src/engine/actions/run';
import { ctxOf } from '../src/engine/solved';
import { solveFlowsheet } from '../src/sim/flowsheet';
import type { EqState } from '../src/state';
import { dcda, haberLoop, loop12, plant20 } from './bench-plants';

export interface Stat { n: number; median: number; p95: number; max: number }

export function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return NaN;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(q * sortedAsc.length) - 1));
  return sortedAsc[i]!;
}
export function stat(t: number[]): Stat {
  const s = t.slice().sort((a, b) => a - b);
  return { n: s.length, median: percentile(s, 0.5), p95: percentile(s, 0.95), max: s[s.length - 1]! };
}
function time(n: number, setup: () => void, run: () => void): Stat {
  for (let i = 0; i < Math.min(30, n); i++) { setup(); run(); } // warm-up (JIT)
  const t: number[] = [];
  for (let i = 0; i < n; i++) { setup(); const t0 = performance.now(); run(); t.push(performance.now() - t0); }
  return stat(t);
}

const N = Number(process.env.BENCH_N ?? 300);
const plants: [string, () => { e: Engine<EqState> }][] = [['Haber loop (10 units)', haberLoop], ['Contact process DCDA (11 units)', dcda], ['Recycle loop (12 units)', loop12], ['Plant (20 units)', plant20]];
const f = (x: number): string => x.toFixed(3);
const rows: string[] = [];
let worstSolveP95 = 0;
for (const [name, make] of plants) {
  const { e } = make();
  const act = (): { ok: boolean; commissioned?: boolean } => e.act('commission', []) as never;
  if (!act().commissioned) throw new Error(`${name} did not commission`);
  const coldPasses = e.state.solved!.iterations, coldLoops = e.state.solved!.loops;
  const s = e.state; // snapshot of the solve inputs (the engine replaces its state object on every action)
  const units = unitsForSolve(s), registry = bindRegistry(s.species), ctx = ctxOf(s);
  const solveOnce = (): void => { const r = solveFlowsheet({ species: s.species, units, pipes: s.flowsheet.streams, registry, ctx, options: { phaseOk: phaseHook } }); if (!r.ok) throw new Error('solve failed'); };
  const redo = (): void => { e.state.phase = 'design'; };
  const sv = time(N, () => undefined, solveOnce);
  const cold = time(N, () => { redo(); e.state.warm = null; }, () => { act(); });
  const warm = time(N, redo, () => { act(); });
  const done = e.state;
  if (!done.solved?.ok) throw new Error(`${name} left a failed solve`);
  worstSolveP95 = Math.max(worstSolveP95, sv.p95);
  const snap = JSON.stringify(e.snapshot()).length, state = JSON.stringify(done).length;
  rows.push(`| ${name} | ${coldLoops} | ${coldPasses} | ${f(sv.median)} | ${f(sv.p95)} | ${f(sv.max)} | ${f(cold.median)} | ${f(cold.p95)} | ${f(cold.max)} | ${f(warm.median)} | ${f(warm.p95)} | ${snap} | ${state} |`);
  console.log(rows[rows.length - 1]);
}

// Shift tick (DESIGN 8.5): engine action tick(1) on a commissioned plant with a running shift, N samples. Guarded: the shift pipeline is another
// lane's in-progress work, so any failure here is reported as "skipped" and never breaks the solver bench.
const tickRows: string[] = [];
let tickNote = '';
if (!existsSync(new URL('../src/sim/dynamics/shift.ts', import.meta.url))) tickNote = 'Skipped: `src/sim/dynamics/shift.ts` does not exist yet.';
else {
  try {
    for (const [name, make] of plants.filter(([, m]) => m !== plant20 && m !== dcda)) {
      const { e } = make();
      if (!e.act('commission', []).commissioned) throw new Error('commission failed');
      const st = e.act('startShift', ['shift', true]);
      if (!st.ok) throw new Error('startShift: ' + st.message);
      const one = (): void => { const r = e.act('tick', [1]); if (!r.ok) throw new Error('tick: ' + r.message); };
      const ts = time(Math.min(N, 200), () => undefined, one);
      tickRows.push(`| ${name} | ${f(ts.median)} | ${f(ts.p95)} | ${f(ts.max)} |`);
      console.log('tick', tickRows[tickRows.length - 1]);
    }
  } catch (err) { tickRows.length = 0; tickNote = `Skipped: shift pipeline not usable yet (${String(err instanceof Error ? err.message : err).slice(0, 120)}). Re-run once it lands.`; }
}
const tickMd = tickRows.length ? `\n## Shift tick (tick(1) = 1 plant-second, engine action)\n\n| Plant | median | p95 | max |\n|---|---|---|---|\n${tickRows.join('\n')}\n` : `\n- Shift tick: ${tickNote}\n`;

const md = `# Solver bench

Generated by \`scripts/bench-solve.ts\` (N = ${N} runs per cell after 30 warm-up runs; times in ms).

Machine: ${cpus()[0]?.model ?? 'unknown'} x ${cpus().length}, ${platform()} ${release()}, Node ${process.version}.

Target: solve p95 <= 3 ms on desktop (DESIGN 9.4). Worst solve p95 here: **${f(worstSolveP95)} ms** (${worstSolveP95 <= 3 ? 'PASS' : 'FAIL'}).

| Plant | Loops | Passes | solve median | solve p95 | solve max | commission cold median | cold p95 | cold max | commission warm median | warm p95 | snapshot bytes | state bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

- **solve**: \`solveFlowsheet\` alone (what the 3 ms target covers), same inputs commission() builds.
- **commission cold**: the whole engine action with the warm start cleared: topology check, solve, economics, ledger, state write.
- **commission warm**: same, starting from the stored tear streams.
- Passes is the unit-network evaluation count of the first (cold) commission (0 = acyclic).
- DCDA here is the SO2 converter train with two absorbers (3-bed + interpass absorption + 1-bed + tail absorber); the plant is acyclic, so it is a many-unit chain, not a loop.
${tickMd}`;
writeFileSync(new URL('../docs/bench-solve.md', import.meta.url), md);
console.log('wrote docs/bench-solve.md');
