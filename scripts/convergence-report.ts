// Convergence report (DESIGN 9.4): the 10 000-flowsheet random loop fuzz, the hostile fuzz, and the named loops (L19 / L20 purge sweep /
// L22-style / 2- and 3-tear / nested / failure cases / real-unit Haber loops). Writes docs/convergence-report.md.
// Run: node "$(ls -d node_modules/.pnpm/vite-node@*/node_modules/vite-node | head -1)/vite-node.mjs" -c vitest.config.ts scripts/convergence-report.ts
// Optional: FUZZ_N=10000 (cases per fuzz). Tooling, not rule code: wall-clock use is fine here.
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Rng } from '@core/kit/rng';
import { en } from '../src/locales/en';
import { solveFlowsheet, type SolveOptions } from '../src/sim/flowsheet';
import { PP, U, ammoniaLoop, consistency, coupledLoops, ctxOf, massImbalance, purgeLoop, randomLoopSheet, registryFor, type Sheet } from '../src/sim/flowsheet/testunits';
import { haberLoop } from './bench-plants';

const N = Number(process.env.FUZZ_N ?? 10000);
const LOOP_CODES = new Set(['ACCUMULATION', 'LOOP_GAIN_GE_1', 'LOOP_OSCILLATING', 'NO_EXIT']);
const hasMessage = (code: string): boolean => (en as Record<string, unknown>)['fail.' + code] !== undefined;
const pct = (sorted: number[], q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]! : NaN;
const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const run = (s: Sheet, options: SolveOptions = {}) => solveFlowsheet({ species: s.species, units: s.units, pipes: s.pipes, registry: registryFor(s.species), ctx: ctxOf(s.species), options });

interface FuzzOut { n: number; converged: number; passes: number[]; tears: number[]; methods: Record<string, number>; fails: Record<string, number>; undiagnosed: number; badFixedPoint: number; worstBal: number; budget: number; ms: number[] }
function fuzz(seed: number, opts: { hostile?: boolean }): FuzzOut {
  const rng = new Rng(seed);
  const o: FuzzOut = { n: N, converged: 0, passes: [], tears: [], methods: {}, fails: {}, undiagnosed: 0, badFixedPoint: 0, worstBal: 0, budget: 0, ms: [] };
  for (let k = 0; k < N; k++) {
    const sh = randomLoopSheet(rng, opts);
    const reg = registryFor(sh.species);
    const t0 = performance.now();
    const r = solveFlowsheet({ species: sh.species, units: sh.units, pipes: sh.pipes, registry: reg, ctx: ctxOf(sh.species) });
    o.ms.push(performance.now() - t0);
    if (r.ok) {
      o.converged++; o.passes.push(r.value.passes); o.tears.push(r.value.tears.length);
      o.methods[r.value.method] = (o.methods[r.value.method] ?? 0) + 1;
      o.worstBal = Math.max(o.worstBal, massImbalance(sh.M, sh.units, sh.pipes, r.value.streams));
      if (k % 20 === 0 && consistency(sh, reg, r.value.streams) > 1e-8) o.badFixedPoint++;
      if (r.value.passes > 300) o.budget++;
    } else {
      o.fails[r.code] = (o.fails[r.code] ?? 0) + 1;
      if (!LOOP_CODES.has(r.code) || !hasMessage(r.code)) o.undiagnosed++;
      if (Number(r.data.passes ?? 0) > 300) o.budget++;
    }
  }
  o.passes.sort((a, b) => a - b); o.ms.sort((a, b) => a - b); o.tears.sort((a, b) => a - b);
  return o;
}
function fuzzMd(title: string, o: FuzzOut, balance = true): string {
  const failed = o.n - o.converged;
  return `### ${title}

| Metric | Value |
|---|---|
| Flowsheets | ${o.n} |
| Converged | ${o.converged} (${f(100 * o.converged / o.n, 2)} %) |
| Passes (converged) p50 / p95 / max | ${pct(o.passes, 0.5)} / ${pct(o.passes, 0.95)} / ${o.passes[o.passes.length - 1] ?? 'n/a'} |
| Tears per converged flowsheet, max | ${o.tears[o.tears.length - 1] ?? 'n/a'} |
| Methods | ${JSON.stringify(o.methods)} |
| Not converged | ${failed}${failed ? ` ${JSON.stringify(o.fails)}` : ''} |
| Of those: diagnosed with a loop code and a message key | ${failed ? `${failed - o.undiagnosed}/${failed} (${f(100 * (failed - o.undiagnosed) / failed, 1)} %)` : 'n/a (none failed)'} |
| Runs over the 300-pass budget | ${o.budget} |
| Worst mass imbalance (converged) | ${balance ? o.worstBal.toExponential(2) : 'n/a (the gain units of this set do not conserve mass)'} |
| Converged sheets failing the fixed-point check (1 in 20 sampled) | ${o.badFixedPoint} |
| Solve ms p50 / p95 / p99 / max | ${f(pct(o.ms, 0.5))} / ${f(pct(o.ms, 0.95))} / ${f(pct(o.ms, 0.99))} / ${f(o.ms[o.ms.length - 1]!)} |
`;
}

const main = fuzz(20261110, {});
const hostile = fuzz(77, { hostile: true });

// ---- named loops ----
const rows: string[] = [];
const H = 3600;
const row = (name: string, s: Sheet, options: SolveOptions = {}, note = ''): void => {
  const r = run(s, options);
  if (r.ok) rows.push(`| ${name} | ${options.method ?? 'auto'} | converged | ${r.value.passes} | ${r.value.method} | ${r.value.tears.length} | ${note} |`);
  else rows.push(`| ${name} | ${options.method ?? 'auto'} | ${r.code} | ${String(r.data.passes ?? 0)} | - | - | ${hasMessage(r.code) ? 'message ok' : 'NO MESSAGE'} ${note} |`);
};
row('L19 style: N2 + 3H2 -> 2NH3, all converted, no purge', purgeLoop(['N2', 'H2', 'NH3'], [-1, -3, 2], [249 / H, 747 / H, 0], 'N2', 0.25, 0, [0, 0, 1], [28, 2, 17]));
for (const p of [0.5, 1, 2, 5, 10]) {
  row(`L20 ammonia loop (synthetic units, X = 25 %), purge ${p} %`, ammoniaLoop(p / 100));
  row(`L20 ammonia loop (synthetic units), purge ${p} %`, ammoniaLoop(p / 100), { method: 'direct', maxPasses: 6000 }, 'direct substitution for comparison');
}
row('L22 style methanol loop (CO + 2H2 -> CH3OH, N2 inert), purge 10 %', purgeLoop(['CO', 'H2', 'CH3OH', 'N2'], [-1, -2, 1, 0], [33 / H, 66 / H, 0, 1 / H], 'CO', 0.2, 0.1, [0, 0, 1, 0], [28, 2, 32, 28]));
row('2-tear synthetic flowsheet', coupledLoops(2));
row('3-tear synthetic flowsheet', coupledLoops(3));
{
  const sp = ['A', 'B', 'C', 'I'];
  const nu = (a: string, b: string): Record<string, number> => Object.fromEntries(sp.map((s) => ['nu_' + s, s === a ? -1 : s === b ? 1 : 0]));
  row('nested loop (loop inside a loop)', {
    species: sp, M: [20, 20, 20, 4],
    units: [U('F', 'feed', { n_A: 2, n_B: 0, n_C: 0, n_I: 0.02 }), U('M1', 'mix2'), U('R1', 'reactor', { X: 0.6, key: 'A', ...nu('A', 'B') }), U('M2', 'mix2'), U('R2', 'reactor', { X: 0.7, key: 'B', ...nu('B', 'C') }),
      U('SP', 'split3', { pf: 0.02, rf: 0.5 }), U('SX', 'sep', { liq_C: 0.9 }), U('SP2', 'split', { frac: 0.1 }), U('G1', 'product'), U('G2', 'product'), U('LQ', 'product')],
    pipes: [PP('p1', 'F.out', 'M1.in1'), PP('p2', 'M1.out', 'R1.in'), PP('p3', 'R1.out', 'M2.in1'), PP('p4', 'M2.out', 'R2.in'), PP('p5', 'R2.out', 'SP.in'), PP('p6', 'SP.rec', 'M2.in2'), PP('p7', 'SP.purge', 'G1.in'),
      PP('p8', 'SP.fwd', 'SX.in'), PP('p9', 'SX.vap', 'SP2.in'), PP('p10', 'SP2.rec', 'M1.in2'), PP('p11', 'SP2.purge', 'G2.in'), PP('p12', 'SX.liq', 'LQ.in')],
  });
  const loopWith = (mid: string, params: Record<string, number | string>): Sheet => ({
    species: ['A', 'B'], M: [1, 1],
    units: [U('F', 'feed', { n_A: 1, n_B: 0 }), U('M', 'mix2'), U('Z', mid, params), U('X', 'split', { frac: 0.5 }), U('G', 'product')],
    pipes: [PP('a', 'F.out', 'M.in1'), PP('b', 'M.out', 'Z.in'), PP('c', 'Z.out', 'X.in'), PP('d', 'X.rec', 'M.in2'), PP('e', 'X.purge', 'G.in')],
  });
  row('oscillating unit in a loop (stepmap)', loopWith('stepmap', { key: 'A', th: 3, hi: 10, lo: 1 }));
  for (const th of [1.6, 2.0, 2.4]) row(`bistable S-curve unit in a loop (CSTR-with-3-steady-states stand-in), scale ${th}`, loopWith('scurve', { key: 'A', lo: 0.5, hi: 9, scale: th, steep: 12 }));
  const gain: Sheet = { species: ['A', 'B'], M: [1, 1], units: [U('F', 'feed', { n_A: 1, n_B: 0.5 }), U('M', 'mix2'), U('P', 'pass'), U('X', 'splitS', { frac: 0 }), U('G', 'product')],
    pipes: [PP('a', 'F.out', 'M.in1'), PP('b', 'M.out', 'P.in'), PP('c', 'P.out', 'X.in'), PP('d', 'X.rec', 'M.in2'), PP('e', 'X.purge', 'G.in')] };
  row('100 % recycle splitter claiming an exit', gain);
  row('inert loop without purge (L20 at 0 % purge)', ammoniaLoop(0));
}

// real-unit Haber loop through the engine commission path (rigorous equilibrium converter, NH3 separator, purge splitter)
const real: string[] = [];
for (const p of [0.5, 1, 2, 5, 10]) {
  const { e } = haberLoop(p / 100);
  const times: number[] = [];
  let r = { commissioned: false, message: '' } as { commissioned?: boolean; message: string };
  for (let i = 0; i < 20; i++) { const { e: e2 } = haberLoop(p / 100); const t0 = performance.now(); r = e2.act('commission', []) as never; times.push(performance.now() - t0); }
  void e; times.sort((a, b) => a - b);
  const solved = r.commissioned ? 'converged' : 'failed';
  real.push(`| Haber loop, real units (L20 analog), purge ${p} % | ${solved} | ${r.commissioned ? r.message : r.message.slice(0, 80)} | ${f(pct(times, 0.5))} |`);
}

const md = `# Convergence report

Generated by \`scripts/convergence-report.ts\` (FUZZ_N = ${N}). Machine: ${cpus()[0]?.model ?? 'unknown'}. Targets (DESIGN 9.4): at least 99.5 % converge; 100 % of the rest return a diagnosed code with a message (never NUMERIC_GUARD, never a timeout); solve p95 <= 3 ms; Wegstein <= 30 passes on linear-ish loops.

## Random loop flowsheets

Synthetic unit set from \`src/sim/flowsheet/testunits.ts\`: up to 12 units, up to 3 tears, random reactions, purges 0.1-50 %. "Diagnosed" means the failure code is one of ACCUMULATION, LOOP_GAIN_GE_1, LOOP_OSCILLATING, NO_EXIT and has a \`fail.<CODE>\` message template.

${fuzzMd(`Random loop fuzz (seed 20261110, ${N} flowsheets)`, main)}
${fuzzMd(`Hostile fuzz (seed 77, dead purges and gain > 1 units, ${N} flowsheets)`, hostile, false)}
## Named loops

| Case | Method | Outcome | Passes | Method used | Tears | Note |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## Real-unit Haber loop (engine commission path)

| Case | Outcome | Message | commission ms (median of 20) |
|---|---|---|---|
${real.join('\n')}

Notes: the synthetic L20 rows use the closed-form-checked ammonia purge loop of \`solve.test.ts\` (X = 25 % per pass, Ar inert, NH3 removed); the real-unit rows use the actual converter, cooler, separator and splitter of the game. L22 and L24 are represented by a synthetic methanol loop and a bistable S-curve unit until those levels' real plants exist.
`;
writeFileSync(new URL('../docs/convergence-report.md', import.meta.url), md);
console.log(`main: ${main.converged}/${N} converged, passes p50 ${pct(main.passes, 0.5)} p95 ${pct(main.passes, 0.95)} max ${main.passes[main.passes.length - 1]}, fails ${JSON.stringify(main.fails)}, undiagnosed ${main.undiagnosed}`);
console.log(`hostile: ${hostile.converged}/${N} converged, fails ${JSON.stringify(hostile.fails)}, undiagnosed ${hostile.undiagnosed}`);
console.log(rows.join('\n')); console.log(real.join('\n'));
