// Sequential-modular flowsheet solver (DESIGN 3.6): validate -> Tarjan partition -> tear selection -> structural NO_EXIT
// check -> direct substitution x2 + bounded Wegstein -> Broyden fallback -> coded diagnosis. Pure: no module-level state.
import type { Diag, Pipe, SimCtx, SimResult, StreamState, UnitInst, UnitOpOut } from '../types';
import { failResult, okResult } from '../types';
import { cmp, tarjanScc, topoOrder, topologyHash, validateTopology, type PhaseHook, type Registry } from './graph';
import { minTearSet } from './tear';
import { broydenSolve } from './broyden';
import { classifyLoop } from './diagnose';
import { dmath } from '@core/numerics';

export type SolveMethod = 'auto' | 'direct' | 'wegstein' | 'broyden';
export interface SolveOptions {
  /** auto: direct x2, Wegstein, Broyden fallback (default). The others force one method (tests, benchmarks). */
  method?: SolveMethod;
  /** Total unit-network evaluations (default 300; a failed run uses at most this many, diagnosis probe included). */
  maxPasses?: number;
  /** Lower bound of the Wegstein factor q (DESIGN 3.6: -5). */
  qMin?: number;
  /** Whole-flowsheet element balance: (species totals fed by sources, totals leaving by sinks) -> relative imbalance. */
  elementBalance?: (inN: number[], outN: number[]) => number;
  /** Phase-compatibility hook (units lane). */
  phaseOk?: PhaseHook;
}
export interface WarmStart { topologyHash: string; tears: Record<string, StreamState>; tearSel?: string[] }
export interface Snapshot { scc: number; pass: number; resid: number; tears: Record<string, StreamState> }
export interface LoopInfo { units: string[]; tears: string[]; passes: number; method: 'direct' | 'wegstein' | 'broyden'; warm: boolean }
export interface FlowsheetSolution {
  streams: Record<string, StreamState>;
  units: Record<string, UnitOpOut>;
  tears: string[];
  passes: number;
  method: 'direct' | 'wegstein' | 'broyden';
  topologyHash: string;
  warm: WarmStart;
  warmed: boolean;
  /** <= 60 tear snapshots for the loop-filling animation. Exposed through a query, never stored in game state. */
  history: Snapshot[];
  loops: LoopInfo[];
}
export interface SolveInput {
  species: string[];
  units: UnitInst[];
  pipes: Pipe[];
  registry: Registry;
  ctx: SimCtx;
  warm?: WarmStart;
  options?: SolveOptions;
}

const REL = 1e-9, ABS_FLOW = 1e-12, TOL_T = 1e-6, TOL_P = 1e-3;
/** Internal convergence is 100x stricter than the contract so that whole-flowsheet balances close to 1e-9. */
const STRICT = 0.01;
const DEFAULT_PASSES = 300, PROBE = 12, MAX_HISTORY = 60, BLOWN = 1e100;
const key = (u: string, p: string): string => u + '\u0001' + p;

export function solveFlowsheet(input: SolveInput): SimResult<FlowsheetSolution> {
  try {
    return solveInner(input);
  } catch {
    return failResult('NUMERIC_GUARD', { thrown: 1 });
  }
}

function solveInner(input: SolveInput): SimResult<FlowsheetSolution> {
  const { species, units, pipes, registry, ctx } = input;
  const opts = input.options ?? {};
  const S = species.length, W = S + 2;
  const maxPasses = opts.maxPasses ?? DEFAULT_PASSES;
  const method: SolveMethod = opts.method ?? 'auto';
  const qMin = opts.qMin ?? -5;

  const bad = validateTopology(units, pipes, registry, opts.phaseOk);
  if (bad) return failResult(bad.code, bad.data, { unitId: bad.unitId });
  const hash = topologyHash(species, units, pipes);

  const sorted = units.slice().sort((a, b) => cmp(a.id, b.id));
  const idx = new Map<string, number>(sorted.map((u, i) => [u.id, i]));
  const pipesSorted = pipes.slice().sort((a, b) => cmp(a.id, b.id));
  const from = (p: Pipe) => idx.get(p.from.unit)!, to = (p: Pipe) => idx.get(p.to.unit)!;
  const into = new Map<string, Pipe>(), outOf = new Map<string, Pipe>();
  for (const p of pipesSorted) { into.set(key(p.to.unit, p.to.port), p); outOf.set(key(p.from.unit, p.from.port), p); }
  const sccs = tarjanScc(sorted.length, pipesSorted.map((p) => ({ from: from(p), to: to(p) })));

  const streams: Record<string, StreamState> = {};
  const unitOut: Record<string, UnitOpOut> = {};
  const unitDiag: Record<string, Diag[]> = {};
  const warmTears: Record<string, StreamState> = {};
  const allTears: string[] = [];
  const loops: LoopInfo[] = [];
  let passes = 0;
  let history: Snapshot[] = [];
  let histStride = 1, histCount = 0, lastSnap: Snapshot | null = null, sccNo = 0;
  const warm = input.warm && input.warm.topologyHash === hash ? input.warm : null;

  const pushSnap = (pass: number, resid: number, tears: Record<string, StreamState>) => {
    const snap: Snapshot = { scc: sccNo, pass, resid, tears };
    lastSnap = snap;
    if (histCount++ % histStride === 0) {
      history.push(snap);
      if (history.length > MAX_HISTORY) { history = history.filter((_, i) => i % 2 === 0); histStride *= 2; }
    }
  };

  /** Evaluate one unit; returns a failure result, or null on success (streams and unitOut updated). */
  const evalUnit = (u: UnitInst, tearIn: Record<string, StreamState> | null, inLoop: boolean): SimResult<never> | null => {
    const def = registry[u.type]!;
    const inlets: Record<string, StreamState> = {};
    for (const port of def.inlets) {
      const p = into.get(key(u.id, port))!;
      inlets[port] = tearIn?.[p.id] ?? streams[p.id]!;
    }
    let res;
    try { res = def.fn(inlets, u, ctx); } catch { return failResult('NUMERIC_GUARD', { thrown: 1 }, { unitId: u.id }); }
    if (!res || typeof res !== 'object') return failResult('NUMERIC_GUARD', { shape: 1 }, { unitId: u.id });
    if (!res.ok) {
      const data: Record<string, number | string> = { ...res.data };
      if (inLoop) data.inLoop = 1;
      return failResult(res.code, data, { unitId: res.unitId ?? u.id, species: res.species, diag: res.diag });
    }
    const out = res.value;
    const outlets: Record<string, StreamState> = {};
    for (const port of def.outlets) {
      const s = out.outlets?.[port];
      const p = outOf.get(key(u.id, port));
      if (!s) {
        if (p) return failResult('NUMERIC_GUARD', { missing: 1, port }, { unitId: u.id });
        continue;
      }
      if (!Array.isArray(s.n) || s.n.length !== S || !Number.isFinite(s.T) || !Number.isFinite(s.P)) return failResult('NUMERIC_GUARD', { shape: 1, port }, { unitId: u.id });
      for (let i = 0; i < S; i++) if (!Number.isFinite(s.n[i])) return failResult('NUMERIC_GUARD', { nonFinite: 1, port }, { unitId: u.id, species: species[i] });
      outlets[port] = { n: s.n.slice(), T: s.T, P: s.P };
      if (p) streams[p.id] = outlets[port]!;
    }
    if ((out.duty !== undefined && !Number.isFinite(out.duty)) || (out.work !== undefined && !Number.isFinite(out.work))) {
      return failResult('NUMERIC_GUARD', { duty: 1 }, { unitId: u.id });
    }
    unitOut[u.id] = { ...out, outlets };
    unitDiag[u.id] = res.diag;
    return null;
  };

  const solveLoop = (comp: number[]): SimResult<never> | null => {
    const inScc = new Set(comp);
    const sccUnits = comp.map((i) => sorted[i]!);
    const sccIds = sccUnits.map((u) => u.id);
    const local = new Map<number, number>(comp.map((v, i) => [v, i]));
    const internal = pipesSorted.filter((p) => inScc.has(from(p)) && inScc.has(to(p)));
    const iEdges = internal.map((p) => ({ from: local.get(from(p))!, to: local.get(to(p))! }));
    const ext = pipesSorted.filter((p) => inScc.has(to(p)) && !inScc.has(from(p)));

    // tear selection: warm selection if still valid, else enumeration (cheap scores prefer splitter -> mixer streams)
    let tearIds: string[] | null = null;
    if (warm?.tearSel) {
      const cand = warm.tearSel.filter((id) => internal.some((p) => p.id === id));
      const removed = new Set<number>(cand.map((id) => internal.findIndex((p) => p.id === id)));
      if (cand.length && topoOrder(comp.length, iEdges, removed)) tearIds = cand;
    }
    if (!tearIds) {
      const score = (p: Pipe) => (registry[sorted[from(p)]!.type]!.outlets.length > 1 ? 1 : 0) + (registry[sorted[to(p)]!.type]!.inlets.length > 1 ? 1 : 0);
      tearIds = minTearSet(comp.length, internal.map((p, k) => ({ id: p.id, from: iEdges[k]!.from, to: iEdges[k]!.to, score: score(p) }))).tears;
    }
    const tearPipes = tearIds.map((id) => internal.find((p) => p.id === id)!).sort((a, b) => cmp(a.id, b.id));
    const removed = new Set<number>(tearPipes.map((t) => internal.indexOf(t)));
    const order = topoOrder(comp.length, iEdges, removed)!.map((l) => sorted[comp[l]!]!);
    for (const t of tearPipes) allTears.push(t.id);

    // structural NO_EXIT: every species entering the loop must be consumed, purged or separated somewhere inside it
    const inflow = new Array<number>(S).fill(0);
    for (const p of ext) { const s = streams[p.id]!; for (let i = 0; i < S; i++) inflow[i]! += s.n[i]!; }
    const leaves = (k: number) => pipesSorted.some((p) => from(p) === comp[k] && !inScc.has(to(p)));
    for (let i = 0; i < S; i++) {
      if (!(inflow[i]! > ABS_FLOW)) continue;
      const exit = sccUnits.some((u, k) => {
        const d = registry[u.type]!;
        return !!d.consumes?.(u, i) || (!!d.exits?.(u, i) && leaves(k));
      });
      if (!exit) return failResult('NO_EXIT', { species: species[i]!, scc: sccIds.join(','), inflow: inflow[i]! }, { species: species[i] });
    }
    const prefer = species.map((_, i) => !sccUnits.some((u) => registry[u.type]!.consumes?.(u, i)));

    const T = tearPipes.length, D = T * W;
    const tIn: Record<string, StreamState> = {};
    let lastX: number[] = [];
    let failure: SimResult<never> | null = null;
    const startPasses = passes;
    const reserve = Math.min(PROBE, Math.floor(maxPasses / 4));
    const limit = Math.max(1, maxPasses - reserve);

    const tolOf = (j: number, a: number, b: number): number => {
      const r = j % W;
      if (r < S) return STRICT * Math.max(ABS_FLOW, REL * Math.max(Math.abs(a), Math.abs(b)));
      return STRICT * (r === S ? TOL_T : TOL_P);
    };
    const crOf = (x: number[], g: number[]): number => {
      let m = 0;
      for (let j = 0; j < D; j++) { const c = Math.abs(g[j]! - x[j]!) / tolOf(j, x[j]!, g[j]!); if (c > m) m = c; }
      return m;
    };
    const asTears = (x: number[]): Record<string, StreamState> => {
      const o: Record<string, StreamState> = {};
      tearPipes.forEach((p, t) => { const b = t * W; o[p.id] = { n: x.slice(b, b + S), T: x[b + S]!, P: x[b + S + 1]! }; });
      return o;
    };
    const evalG = (x: number[]): number[] | null => {
      passes++;
      for (let t = 0; t < T; t++) {
        const b = t * W;
        tIn[tearPipes[t]!.id] = { n: x.slice(b, b + S), T: x[b + S]!, P: x[b + S + 1]! };
      }
      for (const u of order) {
        const f = evalUnit(u, tIn, true);
        if (f) { failure = f; return null; }
      }
      lastX = x;
      const g = new Array<number>(D);
      for (let t = 0; t < T; t++) {
        const s = streams[tearPipes[t]!.id]!, b = t * W;
        for (let i = 0; i < S; i++) g[b + i] = s.n[i]!;
        g[b + S] = s.T; g[b + S + 1] = s.P;
      }
      return g;
    };
    const inventory = (x: number[]): number[] => {
      const v = new Array<number>(S).fill(0);
      for (let t = 0; t < T; t++) for (let i = 0; i < S; i++) v[i]! += x[t * W + i]!;
      return v;
    };

    // initial guess: warm tears, else zero flow at the inlet T/P (retried once with the loop's own feed if a unit objects)
    let x0: number[] = [];
    let warmedHere = false;
    if (warm && tearPipes.every((p) => warm.tears[p.id]?.n.length === S)) {
      for (const p of tearPipes) { const s = warm.tears[p.id]!; x0.push(...s.n, s.T, s.P); }
      warmedHere = true;
    }
    const tp0 = ext.length ? streams[ext[0]!.id]! : { n: [], T: 298.15, P: 101325 };
    const guess = (feedLike: boolean): number[] => {
      const v: number[] = [];
      for (let t = 0; t < T; t++) v.push(...(feedLike ? inflow : new Array<number>(S).fill(0)), tp0.T, tp0.P);
      return v;
    };
    if (!warmedHere) x0 = guess(false);

    let x = x0, g = evalG(x);
    if (!g && !warmedHere) { x = guess(true); g = evalG(x); }
    if (!g) return failure;

    let cr = crOf(x, g);
    pushSnap(passes, cr, asTears(x));
    let best = { x, g, cr };
    let xp: number[] | null = null, gp: number[] | null = null;
    let directDone = 0, growth = 0, wCount = 0, usedWeg = false, usedBro = false, blown = false;
    let toBroyden = method === 'broyden';
    const crHist = [cr];
    const alt = new Array<number>(D).fill(0), lastSign = new Array<number>(D).fill(0);

    const wegstein = (xk: number[], gk: number[], xq: number[], gq: number[]): number[] => {
      const xn = new Array<number>(D);
      for (let j = 0; j < D; j++) {
        const dx = xk[j]! - xq[j]!;
        let q = 0;
        if (Math.abs(dx) > 1e-3 * tolOf(j, xk[j]!, gk[j]!)) {
          const s = (gk[j]! - gq[j]!) / dx;
          if (s < 1) q = Math.min(0, Math.max(qMin, s / (s - 1)));
        }
        let v = q * xk[j]! + (1 - q) * gk[j]!;
        if (j % W < S && v < 0) v = 0;
        xn[j] = v;
      }
      return xn;
    };

    while (cr >= 1 && !toBroyden) {
      if (passes >= limit) break;
      const useDirect = method === 'direct' || directDone < 2 || xp === null;
      let xn = useDirect ? g!.slice() : wegstein(x, g!, xp!, gp!);
      if (!useDirect) { usedWeg = true; wCount++; }
      else directDone++;
      if (xn.some((v) => !(Math.abs(v) < BLOWN))) { blown = true; break; }
      let gn = evalG(xn);
      if (!gn && !useDirect) { xn = g!.slice(); gn = evalG(xn); }
      if (!gn) return failure;
      xp = x; gp = g; x = xn; g = gn;
      const ncr = crOf(x, g);
      growth = ncr > cr ? growth + 1 : 0;
      for (let j = 0; j < D; j++) {
        const r = g[j]! - x[j]!;
        if (Math.abs(r) > tolOf(j, x[j]!, g[j]!)) {
          const sg = r > 0 ? 1 : -1;
          alt[j] = lastSign[j] !== 0 && sg === -lastSign[j]! ? alt[j]! + 1 : 0;
          lastSign[j] = sg;
        } else { alt[j] = 0; lastSign[j] = 0; }
      }
      cr = ncr;
      crHist.push(cr);
      pushSnap(passes, cr, asTears(x));
      if (cr < best.cr) best = { x, g, cr };
      if (method === 'auto' && cr >= 1) {
        if (growth >= 8 || alt.some((a) => a >= 12)) toBroyden = true;
        else if (wCount >= 6) {
          const n = crHist.length;
          const rho = dmath.exp(dmath.log(Math.max(crHist[n - 1]!, 1e-300) / Math.max(crHist[n - 4]!, 1e-300)) / 3);
          const remaining = rho >= 1 ? Infinity : dmath.log(cr) / -dmath.log(rho);
          if (remaining > D + 8) toBroyden = true;
        }
      }
    }
    if (blown && method === 'auto') toBroyden = true;

    let converged = cr < 1;
    let finalX = x, finalG = g;
    if (!converged && (toBroyden || (blown && method === 'auto'))) {
      usedBro = true;
      const sx = method === 'broyden' ? x : best.x, sg = method === 'broyden' ? g : best.g;
      const sc = new Array<number>(D), step = new Array<number>(D);
      for (let t = 0; t < T; t++) {
        let tot = 0;
        for (let i = 0; i < S; i++) tot += Math.max(Math.abs(sx[t * W + i]!), Math.abs(sg[t * W + i]!));
        const fs = Math.max(tot, 1e-9);
        for (let i = 0; i < S; i++) { sc[t * W + i] = fs; step[t * W + i] = 1e-7 * fs; }
        const ts = Math.max(Math.abs(sx[t * W + S]!), 1), ps = Math.max(Math.abs(sx[t * W + S + 1]!), 1);
        sc[t * W + S] = ts; step[t * W + S] = 1e-7 * ts;
        sc[t * W + S + 1] = ps; step[t * W + S + 1] = 1e-7 * ps;
      }
      const r = broydenSolve((z) => { const gz = evalG(z); return gz ? gz.map((v, j) => v - z[j]!) : null; }, sx, {
        maxEvals: Math.max(0, limit - passes), step, scale: sc,
        f0: sg.map((v, j) => v - sx[j]!),
        project: (z) => z.map((v, j) => (j % W < S && v < 0 ? 0 : v)),
        done: (z, f) => crOf(z, f.map((v, j) => v + z[j]!)) < 1,
        onIterate: (z, f) => pushSnap(passes, crOf(z, f.map((v, j) => v + z[j]!)), asTears(z)),
      });
      if (r.ok) {
        converged = true;
        finalX = r.x; finalG = r.x.map((v, j) => v + r.f[j]!);
        if (lastX.length !== D || lastX.some((v, j) => v !== finalX[j])) { const gg = evalG(finalX); if (!gg) return failure; finalG = gg; }
      } else if (failure && r.reason === 'evalFail') {
        failure = null;
      }
    }

    if (!converged) {
      // diagnosis: a short direct-substitution probe from the best iterate, classified from the inventories
      let xk = best.x;
      const seq: number[][] = [inventory(xk)];
      for (let k = 0; k < PROBE && passes < maxPasses; k++) {
        if (xk.some((v) => !(Math.abs(v) < BLOWN))) break;
        const gk = evalG(xk);
        if (!gk) break;
        xk = gk.map((v, j) => (j % W < S && v < 0 ? 0 : v));
        seq.push(inventory(xk));
      }
      const d = classifyLoop(species, seq, { prefer });
      return failResult(d.code, { ...d.data, passes, scc: sccIds.join(','), tears: T }, { species: d.species });
    }

    pushSnap(passes, crOf(finalX, finalG), asTears(finalX));
    for (const p of tearPipes) warmTears[p.id] = { n: streams[p.id]!.n.slice(), T: streams[p.id]!.T, P: streams[p.id]!.P };
    loops.push({ units: sccIds, tears: tearPipes.map((p) => p.id), passes: passes - startPasses, method: usedBro ? 'broyden' : usedWeg ? 'wegstein' : 'direct', warm: warmedHere });
    return null;
  };

  for (const comp of sccs) {
    const u0 = comp[0]!;
    const selfLoop = comp.length === 1 && pipesSorted.some((p) => from(p) === u0 && to(p) === u0);
    const f = comp.length === 1 && !selfLoop ? evalUnit(sorted[u0]!, null, false) : solveLoop(comp);
    if (f) return f;
    if (comp.length > 1 || selfLoop) sccNo++;
  }

  if (opts.elementBalance) {
    const inN = new Array<number>(S).fill(0), outN = new Array<number>(S).fill(0);
    for (const p of pipesSorted) {
      const s = streams[p.id]!;
      if (registry[sorted[from(p)]!.type]!.isSource) for (let i = 0; i < S; i++) inN[i]! += s.n[i]!;
      if (registry[sorted[to(p)]!.type]!.isSink) for (let i = 0; i < S; i++) outN[i]! += s.n[i]!;
    }
    const imb = opts.elementBalance(inN, outN);
    if (!(imb <= 1e-9)) return failResult('ELEMENT_BALANCE', { imbalance: imb });
  }

  if (lastSnap && (history.length === 0 || history[history.length - 1] !== lastSnap)) {
    if (history.length >= MAX_HISTORY) history[history.length - 1] = lastSnap; else history.push(lastSnap);
  }
  const diag: Diag[] = [];
  for (const u of sorted) for (const d of unitDiag[u.id] ?? []) diag.push(d);
  const methodUsed = loops.some((l) => l.method === 'broyden') ? 'broyden' : loops.some((l) => l.method === 'wegstein') ? 'wegstein' : 'direct';
  const tears = allTears.slice().sort(cmp);
  return okResult({
    streams, units: unitOut, tears, passes, method: methodUsed, topologyHash: hash,
    warm: { topologyHash: hash, tears: warmTears, tearSel: tears }, warmed: loops.length > 0 && loops.every((l) => l.warm),
    history, loops,
  }, diag);
}
