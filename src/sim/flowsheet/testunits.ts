// Test-only helper units for the flowsheet solver suite (linear / analytic units, no chemistry).
// Nothing here is shipped: the real unit operations are registered by the units lane.
import type { Pipe, SimCtx, StreamState, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import type { Registry, UnitDef } from './graph';
import { Rng } from '@core/kit/rng';

const num = (u: UnitInst, k: string, d = 0): number => {
  const v = u.params[k];
  return typeof v === 'number' ? v : d;
};
const str = (u: UnitInst, k: string): string => String(u.params[k] ?? '');

export const U = (id: string, type: string, params: Record<string, number | string> = {}): UnitInst =>
  ({ id, type, pos: { x: 0, y: 0 }, rot: 0, params });
export const PP = (id: string, from: string, to: string): Pipe => {
  const [fu, fp] = from.split('.');
  const [tu, tp] = to.split('.');
  return { id, from: { unit: fu!, port: fp! }, to: { unit: tu!, port: tp! } };
};
export const ctxOf = (species: string[]): SimCtx => ({ species, thermoDetail: 'textbook' });

// ---- units ----------------------------------------------------------------------------------------------------------

const feed: UnitOp = (_i, u, ctx) =>
  okResult({ outlets: { out: { n: ctx.species.map((s) => num(u, 'n_' + s)), T: num(u, 'T', 300), P: num(u, 'P', 1e5) } } });

const sinkFn: UnitOp = () => okResult({ outlets: {} });

const mixOf = (k: number): UnitOp => (inlets, _u, ctx) => {
  const n = ctx.species.map(() => 0);
  let tot = 0, tw = 0, p = Infinity, tavg = 0;
  for (let j = 1; j <= k; j++) {
    const s = inlets['in' + j]!;
    let f = 0;
    for (let i = 0; i < n.length; i++) { n[i]! += s.n[i]!; f += s.n[i]!; }
    tot += f; tw += f * s.T; tavg += s.T / k; if (s.P < p) p = s.P;
  }
  return okResult({ outlets: { out: { n, T: tot > 0 ? tw / tot : tavg, P: p } } });
};

const split2: UnitOp = (inlets, u) => {
  const s = inlets.in!, f = num(u, 'frac');
  return okResult({ outlets: {
    purge: { n: s.n.map((x) => x * f), T: s.T, P: s.P },
    rec: { n: s.n.map((x) => x * (1 - f)), T: s.T, P: s.P },
  } });
};

const split3: UnitOp = (inlets, u) => {
  const s = inlets.in!, pf = num(u, 'pf'), rf = num(u, 'rf');
  return okResult({ outlets: {
    purge: { n: s.n.map((x) => x * pf), T: s.T, P: s.P },
    rec: { n: s.n.map((x) => x * rf), T: s.T, P: s.P },
    fwd: { n: s.n.map((x) => x * (1 - pf - rf)), T: s.T, P: s.P },
  } });
};

const reactorOf = (strict: boolean): UnitOp => (inlets, u, ctx) => {
  const s = inlets.in!, key = str(u, 'key'), ki = ctx.species.indexOf(key);
  const nu = ctx.species.map((sp) => num(u, 'nu_' + sp));
  if (ki < 0 || nu[ki]! >= 0) return failResult('BAD_REACTION', {}, { unitId: u.id });
  if (strict && s.n[ki]! <= 1e-30) return failResult('NO_REACTANT', { n: s.n[ki]! }, { unitId: u.id, species: key });
  const xi = num(u, 'X') * Math.max(s.n[ki]!, 0) / -nu[ki]!;
  return okResult({ outlets: { out: { n: s.n.map((x, i) => x + nu[i]! * xi), T: s.T, P: s.P } }, info: { xi } });
};

const sep: UnitOp = (inlets, u, ctx) => {
  const s = inlets.in!;
  const f = ctx.species.map((sp) => num(u, 'liq_' + sp));
  return okResult({ outlets: {
    liq: { n: s.n.map((x, i) => x * f[i]!), T: s.T, P: s.P },
    vap: { n: s.n.map((x, i) => x * (1 - f[i]!)), T: s.T, P: s.P },
  } });
};

const pass: UnitOp = (inlets, u) => {
  const s = inlets.in!;
  return okResult({ outlets: { out: { n: s.n.slice(), T: s.T, P: s.P - num(u, 'dP') } } });
};

/** Linear gain on one species: out = a * in + c (other species pass through). */
const lin: UnitOp = (inlets, u, ctx) => {
  const s = inlets.in!, k = ctx.species.indexOf(str(u, 'key'));
  const n = s.n.slice(); n[k] = num(u, 'a') * n[k]! + num(u, 'c');
  return okResult({ outlets: { out: { n, T: s.T, P: s.P } } });
};

/** Discontinuous map without a fixed point: a two-cycle forever (stands in for a bistable reactor). */
const stepmap: UnitOp = (inlets, u, ctx) => {
  const s = inlets.in!, k = ctx.species.indexOf(str(u, 'key'));
  const n = s.n.slice(); n[k] = n[k]! < num(u, 'th') ? num(u, 'hi') : num(u, 'lo');
  return okResult({ outlets: { out: { n, T: s.T, P: s.P } } });
};

/** Smooth three-fixed-point S-curve (bistable CSTR stand-in): out = lo + (hi-lo)/(1+exp-like logistic via rational form). */
const scurve: UnitOp = (inlets, u, ctx) => {
  const s = inlets.in!, k = ctx.species.indexOf(str(u, 'key'));
  const x = s.n[k]! / num(u, 'scale', 1), steep = num(u, 'steep', 10);
  const y = x * x * steep / (1 + x * x * steep); // monotone S-like, saturating
  const n = s.n.slice(); n[k] = num(u, 'lo') + (num(u, 'hi') - num(u, 'lo')) * y * y * (3 - 2 * y);
  return okResult({ outlets: { out: { n, T: s.T, P: s.P } } });
};

const nanUnit: UnitOp = (inlets) => okResult({ outlets: { out: { n: inlets.in!.n.map(() => NaN), T: 300, P: 1e5 } } });
const thrower: UnitOp = () => { throw new Error('boom'); };

// ---- registry ---------------------------------------------------------------------------------------------------------

const one = (fn: UnitOp, extra: Partial<UnitDef> = {}): UnitDef => ({ inlets: ['in'], outlets: ['out'], fn, ...extra });
const mix = (k: number): UnitDef => ({ inlets: Array.from({ length: k }, (_, j) => 'in' + (j + 1)), outlets: ['out'], fn: mixOf(k) });

export const TEST_REGISTRY: Registry = {
  feed: { inlets: [], outlets: ['out'], fn: feed, isSource: true },
  product: { inlets: ['in'], outlets: [], fn: sinkFn, isSink: true },
  mix2: mix(2), mix3: mix(3), mix4: mix(4),
  // purge splitter: species leave through it only when the purge fraction is positive
  split: { inlets: ['in'], outlets: ['purge', 'rec'], fn: split2, exits: (u) => num(u, 'frac') > 0 },
  // structurally claims an exit whatever the parameter (used to reach LOOP_GAIN_GE_1 by iteration)
  splitS: { inlets: ['in'], outlets: ['purge', 'rec'], fn: split2, exits: () => true },
  split3: { inlets: ['in'], outlets: ['purge', 'rec', 'fwd'], fn: split3, exits: (u) => num(u, 'pf') > 0 },
  split3S: { inlets: ['in'], outlets: ['purge', 'rec', 'fwd'], fn: split3, exits: () => true },
  reactor: one(reactorOf(false)),
  reactorStrict: one(reactorOf(true)),
  sep: { inlets: ['in'], outlets: ['vap', 'liq'], fn: sep },
  pass: one(pass), lin: one(lin), stepmap: one(stepmap), scurve: one(scurve), nan: one(nanUnit), thrower: one(thrower),
};

// consumes / exits for species-indexed params need the species list: bind them per flowsheet.
/** Registry whose reactor `consumes` and separator `exits` know the species names (index -> name). */
export function registryFor(species: string[]): Registry {
  const r: Registry = { ...TEST_REGISTRY };
  const cons = (u: UnitInst, i: number) => num(u, 'nu_' + species[i], 0) < 0 && num(u, 'X') > 0;
  r.reactor = { ...TEST_REGISTRY.reactor!, consumes: cons };
  r.reactorStrict = { ...TEST_REGISTRY.reactorStrict!, consumes: cons };
  r.sep = { ...TEST_REGISTRY.sep!, exits: (u, i) => num(u, 'liq_' + species[i], 0) > 0 };
  return r;
}

// ---- helpers ---------------------------------------------------------------------------------------------------------

/** Relative mass imbalance of a solved flowsheet: sources (feed outlets) vs sinks (product inlets), molar masses `M`. */
export function massImbalance(M: number[], units: UnitInst[], pipes: Pipe[], streams: Record<string, StreamState>): number {
  let inn = 0, out = 0;
  const type = new Map(units.map((u) => [u.id, u.type]));
  for (const p of pipes) {
    const s = streams[p.id]!;
    const m = s.n.reduce((a, x, i) => a + x * M[i]!, 0);
    if (type.get(p.from.unit) === 'feed') inn += m;
    if (type.get(p.to.unit) === 'product') out += m;
  }
  return Math.abs(inn - out) / Math.max(inn, 1e-300);
}

export interface Sheet { species: string[]; units: UnitInst[]; pipes: Pipe[]; M: number[] }

/**
 * A Part-A-style recycle/purge loop: feed -> mix -> reactor -> separator (liq -> product) -> splitter (purge -> sink,
 * rec -> mix). `nu`, `fresh` (mol/s) and the conversion are explicit; the reactor key is the limiting reagent.
 */
export function purgeLoop(species: string[], nu: number[], fresh: number[], key: string, X: number, purge: number,
  liq: number[], M: number[]): Sheet {
  const fp: Record<string, number> = {};
  species.forEach((s, i) => { fp['n_' + s] = fresh[i]!; });
  const rp: Record<string, number> = { X };
  species.forEach((s, i) => { rp['nu_' + s] = nu[i]!; });
  const sp: Record<string, number> = {};
  species.forEach((s, i) => { sp['liq_' + s] = liq[i]!; });
  return {
    species, M,
    units: [
      U('F', 'feed', { ...fp, T: 300, P: 1e6 }), U('M', 'mix2'), U('R', 'reactor', { ...rp, key }),
      U('S', 'sep', sp), U('X', 'split', { frac: purge }), U('PR', 'product'), U('PG', 'product'),
    ],
    pipes: [
      PP('s1', 'F.out', 'M.in1'), PP('s2', 'M.out', 'R.in'), PP('s3', 'R.out', 'S.in'), PP('s4', 'S.vap', 'X.in'),
      PP('s5', 'X.rec', 'M.in2'), PP('s6', 'S.liq', 'PR.in'), PP('s7', 'X.purge', 'PG.in'),
    ],
  };
}

/** Ammonia-style loop (N2 + 3 H2 -> 2 NH3, NH3 removed completely) at a given purge fraction; fresh in mol/s. */
export function ammoniaLoop(purge: number, X = 0.25, scale = 1 / 3600): Sheet {
  return purgeLoop(['N2', 'H2', 'NH3', 'Ar'], [-1, -3, 2, 0], [249 * scale, 748 * scale, 0, 3 * scale], 'N2', X, purge,
    [0, 0, 1, 0], [28, 2, 17, 40]);
}

// ---- random loop flowsheets (fuzz) ----------------------------------------------------------------------------------

export const FUZZ_SPECIES = ['A', 'B', 'C', 'I'];
export const FUZZ_M = [20, 20, 20, 4];

/**
 * A random chain feed -> [mix] -> e1 -> [mix] -> e2 ... with up to 3 recycle splitters. Every recycle splitter also
 * purges 0.1-50 % so each loop has an exit. Elements: reactor (A->B, B->C, A->C), separator (random liquid take-off to a
 * product sink) or pass-through. <= 12 units of the chain plus feed, mixers and sinks stay modest.
 */
export function randomLoopSheet(rng: Rng, opts: { maxRecycles?: number; hostile?: boolean } = {}): Sheet {
  const L = rng.int(3, 7);
  const nRec = rng.int(1, opts.maxRecycles ?? 3);
  const splitAt = rng.shuffle(Array.from({ length: L }, (_, i) => i)).slice(0, Math.min(nRec, L)).sort((a, b) => a - b);
  const target = new Map<number, number[]>(); // mixer position -> splitter positions feeding it
  for (const a of splitAt) { const b = rng.int(0, a); (target.get(b) ?? target.set(b, []).get(b)!).push(a); }
  const units: UnitInst[] = [];
  const pipes: Pipe[] = [];
  let pc = 0;
  const pipe = (from: string, to: string) => pipes.push(PP('p' + pc++, from, to));
  const fp: Record<string, number> = {};
  FUZZ_SPECIES.forEach((s, i) => { fp['n_' + s] = i === 3 ? rng.range(0.001, 0.05) : i === 0 ? rng.range(0.5, 2) : 0; });
  units.push(U('F', 'feed', { ...fp, T: 300, P: 1e6 }));
  let prev = 'F.out';
  const recIn: Record<number, { unit: string; used: number }> = {};
  for (let j = 0; j < L; j++) {
    const feeders = target.get(j) ?? [];
    let entry = prev;
    if (feeders.length) {
      const k = feeders.length + 1;
      const id = 'M' + j;
      units.push(U(id, k === 2 ? 'mix2' : k === 3 ? 'mix3' : 'mix4'));
      pipe(prev, id + '.in1');
      recIn[j] = { unit: id, used: 1 };
      entry = id + '.out';
    }
    const isSplit = splitAt.includes(j);
    const kind = isSplit ? 'split' : rng.pick(opts.hostile ? ['reactor', 'sep', 'pass', 'lin', 'lin'] : ['reactor', 'reactor', 'sep', 'pass']);
    const id = 'E' + j;
    if (kind === 'reactor') {
      const [key, prod] = rng.pick([['A', 'B'], ['B', 'C'], ['A', 'C']] as const);
      const p: Record<string, number> = { X: rng.range(0.1, 0.95) };
      FUZZ_SPECIES.forEach((s) => { p['nu_' + s] = s === key ? -1 : s === prod ? 1 : 0; });
      units.push(U(id, 'reactor', { ...p, key }));
      pipe(entry, id + '.in');
      prev = id + '.out';
    } else if (kind === 'sep') {
      const p: Record<string, number> = {};
      FUZZ_SPECIES.forEach((s) => { p['liq_' + s] = s === 'I' ? 0 : rng.chance(0.5) ? rng.range(0.2, 1) : 0; });
      units.push(U(id, 'sep', p));
      units.push(U('L' + j, 'product'));
      pipe(entry, id + '.in');
      pipe(id + '.liq', 'L' + j + '.in');
      prev = id + '.vap';
    } else if (kind === 'lin') {
      units.push(U(id, 'lin', { key: 'A', a: rng.range(0.5, 1.7), c: 0 }));
      pipe(entry, id + '.in');
      prev = id + '.out';
    } else if (kind === 'pass') {
      units.push(U(id, 'pass'));
      pipe(entry, id + '.in');
      prev = id + '.out';
    } else {
      // recycle splitter: purge + recycle + forward
      const dead = opts.hostile && rng.chance(0.5);
      const pf = dead ? 0 : rng.range(0.001, 0.5);
      const rf = (1 - pf) * (dead ? rng.range(0.9, 1) : rng.range(0.2, 1));
      units.push(U(id, dead && rng.chance(0.5) ? 'split3S' : 'split3', { pf, rf }));
      units.push(U('G' + j, 'product'));
      pipe(entry, id + '.in');
      pipe(id + '.purge', 'G' + j + '.in');
      prev = id + '.fwd';
      // recycle pipe: filled once the target mixer exists (targets are at or before this position)
      const tj = [...target.entries()].find(([, v]) => v.includes(j))![0];
      const r = recIn[tj]!;
      r.used++;
      pipe(id + '.rec', r.unit + '.in' + r.used);
    }
  }
  units.push(U('OUT', 'product'));
  pipe(prev, 'OUT.in');
  return { species: FUZZ_SPECIES, units, pipes, M: FUZZ_M };
}

/**
 * Fixed-point check of a solution: re-run every unit on its solved inlets and compare the outlets with the pipe streams.
 * Returns the largest deviation relative to the stream's total flow (T and P compared on their own scale).
 */
export function consistency(sheet: Sheet, registry: Registry, streams: Record<string, StreamState>): number {
  const ctx = ctxOf(sheet.species);
  let worst = 0;
  for (const u of sheet.units) {
    const def = registry[u.type]!;
    const inlets: Record<string, StreamState> = {};
    for (const port of def.inlets) inlets[port] = streams[sheet.pipes.find((p) => p.to.unit === u.id && p.to.port === port)!.id]!;
    const r = def.fn(inlets, u, ctx);
    if (!r.ok) return Infinity;
    for (const port of def.outlets) {
      const p = sheet.pipes.find((q) => q.from.unit === u.id && q.from.port === port);
      if (!p) continue;
      const a = r.value.outlets[port]!, b = streams[p.id]!;
      const tot = Math.max(a.n.reduce((s, x) => s + Math.abs(x), 0), 1e-30);
      for (let i = 0; i < a.n.length; i++) worst = Math.max(worst, Math.abs(a.n[i]! - b.n[i]!) / tot);
      worst = Math.max(worst, Math.abs(a.T - b.T) / 300, Math.abs(a.P - b.P) / 1e5);
    }
  }
  return worst;
}

/**
 * k coupled loops (k = 2: two tears, k = 3: three tears): Mi (fresh feed, own recycle, forward stream of the previous loop)
 * -> Ri -> Si (split3: purge, own recycle, forward to the next loop). Edge-disjoint own loops force k tears.
 */
export function coupledLoops(k: number, purge = 0.1, rec = 0.5, fwd = 0.2): Sheet {
  const species = FUZZ_SPECIES;
  const units: UnitInst[] = [];
  const pipes: Pipe[] = [];
  for (let i = 0; i < k; i++) {
    const fp: Record<string, number> = {};
    species.forEach((s, j) => { fp['n_' + s] = j === 0 ? 1 + i : j === 3 ? 0.01 : 0; });
    const rp: Record<string, number> = { X: 0.5 + 0.1 * i };
    species.forEach((s) => { rp['nu_' + s] = s === 'A' ? -1 : s === 'B' ? 1 : 0; });
    units.push(U('F' + i, 'feed', { ...fp, T: 300, P: 1e6 }), U('M' + i, 'mix3'), U('R' + i, 'reactor', { ...rp, key: 'A' }),
      U('S' + i, 'split3', { pf: purge, rf: rec }), U('G' + i, 'product'));
    pipes.push(PP('f' + i, `F${i}.out`, `M${i}.in1`), PP('a' + i, `M${i}.out`, `R${i}.in`), PP('b' + i, `R${i}.out`, `S${i}.in`),
      PP('c' + i, `S${i}.rec`, `M${i}.in2`), PP('g' + i, `S${i}.purge`, `G${i}.in`), PP('x' + i, `S${i}.fwd`, `M${(i + 1) % k}.in3`));
  }
  void fwd;
  return { species, units, pipes, M: FUZZ_M };
}
