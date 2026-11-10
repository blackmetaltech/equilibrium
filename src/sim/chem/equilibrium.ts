// Chemical equilibrium by the stoichiometric-extent formulation (DESIGN 3.4, lane M1.4). SI: mol (or mol/s), K, Pa, J, m3.
//   n_i(xi) = n0_i + sum_j nu_ij xi_j        f_j = sum_gas nu_ij ln a_j - ln K_j = 0
//   a_i = y_i P / P0 (gas, isobaric)   a_i = n_i R T / (V P0) (gas, constant V)   a = 1 (pure condensed phases)
// R = 1: f is strictly increasing on the feasible bracket, so Brent in t = ln(alpha/beta) (alpha = xi - xi_min,
//   beta = xi_max - xi): the amounts are evaluated from the nearer bound, which keeps a nearly depleted species exact
//   for K from 1e-30 to 1e30.
// R >= 2: Gauss-Seidel sweeps of exact single-reaction solves, then damped Newton (core) with the analytic Jacobian and a
//   fraction-to-boundary limiter (0.01); the best iterate is returned with EQUILIBRIUM_NOT_CONVERGED if it does not converge.
// Adiabatic: outer Brent on T in [200, 2500] K for H_out(T, xi_eq(T)) = H_in. Catalyst never enters (it is not an input).
import { brent, dmath, newton } from '@core/numerics';
import { type ReactionRec, findReaction } from '../../data/reactions';
import { R_GAS, findSpecies } from '../../data/species';
import { type Diag, type SimResult, type ThermoDetail, failResult, okResult } from '../types';
import { enthalpyFlowAt, hasThermo, makeMixture, P_STD } from '../thermo';
import { type BookData, lnKOfReaction, lnKeq, rxnDH } from './reactions';
import { type Nu, limitingReagent } from './stoich';

export type EqMode = 'isothermal' | 'adiabatic' | 'constV';

export interface EqSpec {
  species: readonly string[];
  /** Feed amounts (mol or mol/s) in the order of `species`. */
  n0: readonly number[];
  /** Temperature (isothermal, constV) or the inlet temperature (adiabatic), K. */
  T: number;
  /** Pressure, Pa (isothermal, adiabatic). */
  P?: number;
  /** Vessel volume, m3 (constV). */
  V?: number;
  /** Catalogue reaction ids or sparse nu maps. */
  reactions: readonly (string | Nu)[];
  detail: ThermoDetail;
  /** Textbook constants (one for all reactions, or one per reaction). */
  book?: BookData | readonly (BookData | undefined)[];
  mode?: EqMode;
  /** Gas constant used for P = nRT/V in constV mode, J/(mol K). */
  R?: number;
  /** Adiabatic with `detail: book`: constant heat capacity of the feed, J/K (H = cp (T - Tin) + sum xi dH). */
  cpBook?: number;
  /** Starting extents for R >= 2 (robustness tests). */
  xi0?: readonly number[];
  /** Species ids treated as condensed (a = 1) in addition to the catalogue phases. */
  condensed?: readonly string[];
}

export interface EqOut {
  n: number[];
  xi: number[];
  T: number;
  P: number;
  /** ln Q - ln K per reaction at the returned state (about 0 at equilibrium). */
  lnQminusLnK: number[];
  lnK: number[];
  K: number[];
  iterations: number;
  method: 'brent' | 'newton' | 'none';
  /** Heat to be added to hold T (W or J): H_out - H_in; NaN when a species has no thermo data. */
  duty: number;
}

const T_LO = 200, T_HI = 2500, T_BOUND = 700, TINY = 1e-300, FTB = 0.01, FTOL = 1e-10;

interface Prep {
  S: number;
  R: number;
  nu: number[][];
  gas: boolean[];
  /** nu summed over gas species per reaction. */
  nug: number[];
  iso: boolean;
  recs: (ReactionRec | undefined)[];
  nus: Nu[];
}

function phaseGas(spec: EqSpec, recs: (ReactionRec | undefined)[]): boolean[] {
  const cond = new Set(spec.condensed ?? []);
  return spec.species.map((id) => {
    if (cond.has(id)) return false;
    for (const r of recs) if (r !== undefined && r.phase[id] !== undefined) return r.phase[id] === 'g';
    const sp = findSpecies(id);
    return sp === undefined ? true : sp.phase === 'g';
  });
}

function prepare(spec: EqSpec, iso: boolean): Prep | null {
  const recs: (ReactionRec | undefined)[] = [];
  const nus: Nu[] = [];
  for (const r of spec.reactions) {
    if (typeof r === 'string') {
      const rec = findReaction(r);
      if (rec === undefined) return null;
      recs.push(rec); nus.push(rec.nu);
    } else { recs.push(undefined); nus.push(r); }
  }
  const S = spec.species.length;
  const nu = nus.map((m) => spec.species.map((id) => m[id] ?? 0));
  const gas = phaseGas(spec, recs);
  const nug = nu.map((row) => row.reduce((a, v, i) => a + (gas[i]! ? v : 0), 0));
  return { S, R: nus.length, nu, gas, nug, iso, recs, nus };
}

function bookOf(spec: EqSpec, j: number): BookData | undefined {
  const b = spec.book;
  if (b === undefined) return undefined;
  return Array.isArray(b) ? (b as readonly (BookData | undefined)[])[j] : (b as BookData);
}

function lnKs(spec: EqSpec, p: Prep, T: number): number[] {
  return p.nus.map((nu, j) => {
    const rec = p.recs[j];
    const bk = bookOf(spec, j);
    return rec !== undefined ? lnKOfReaction(rec, T, spec.detail, bk) : lnKeq(nu, T, spec.detail, bk);
  });
}

/** Activity offset c: ln(P/P0) isobaric, ln(R T/(V P0)) constant V. */
function offsetC(spec: EqSpec, iso: boolean, T: number): number {
  if (iso) return dmath.log((spec.P ?? P_STD) / P_STD);
  return dmath.log(((spec.R ?? R_GAS) * T) / ((spec.V ?? 1) * P_STD));
}

/** f_j(n) for every reaction. */
function residuals(p: Prep, n: readonly number[], c: number, lnK: readonly number[], only?: number): number[] {
  let Ng = 0;
  const ln: number[] = new Array<number>(p.S);
  for (let i = 0; i < p.S; i++) {
    const v = n[i]! > TINY ? n[i]! : TINY;
    ln[i] = dmath.log(v);
    if (p.gas[i]!) Ng += v;
  }
  const lnNg = p.iso ? dmath.log(Ng) : 0;
  const rows = only === undefined ? p.nu.map((_, j) => j) : [only];
  return rows.map((j, k) => {
    const row = p.nu[j]!;
    let s = 0;
    for (let i = 0; i < p.S; i++) if (p.gas[i]! && row[i]! !== 0) s += row[i]! * ln[i]!;
    return s - (p.iso ? p.nug[j]! * lnNg : 0) + p.nug[j]! * c - lnK[only === undefined ? j : k]!;
  });
}

interface One { n: number[]; dxi: number; iterations: number; atBound: boolean; zero: boolean; f: number }

/** Exact single-reaction solve from the amounts `n` (they are the feed of this reaction). */
function solveOne(p: Prep, j: number, n: readonly number[], c: number, lnK: number): One {
  const row = p.nu[j]!;
  let xmin = -Infinity, xmax = Infinity, imin = -1, imax = -1;
  for (let i = 0; i < p.S; i++) {
    const v = row[i]!;
    if (v === 0) continue;
    const r = n[i]! / v;
    if (v > 0 && -r > xmin) { xmin = -r; imin = i; }
    if (v < 0 && -r < xmax) { xmax = -r; imax = i; }
  }
  if (!(xmin > -Infinity) || !(xmax < Infinity)) return { n: n.slice(), dxi: 0, iterations: 0, atBound: false, zero: true, f: 0 };
  const W = xmax - xmin;
  if (!(W > 0)) return { n: n.slice(), dxi: 0, iterations: 0, atBound: false, zero: true, f: 0 };
  const lo: number[] = n.map((v, i) => (row[i]! === 0 ? v : i === imin ? 0 : Math.max(0, v + row[i]! * xmin)));
  const hi: number[] = n.map((v, i) => (row[i]! === 0 ? v : i === imax ? 0 : Math.max(0, v + row[i]! * xmax)));
  const build = (t: number): number[] => {
    const lower = t <= 0;
    const e = dmath.exp(lower ? t : -t); // alpha = W/(1+e^-t); lower half: alpha = W e/(1+e)
    const small = (W * e) / (1 + e);
    return n.map((_, i) => {
      const v = row[i]!;
      if (v === 0) return n[i]!;
      const x = lower ? lo[i]! + v * small : hi[i]! - v * small;
      return x > 0 ? x : TINY;
    });
  };
  const f = (t: number): number => residuals(p, build(t), c, [lnK], j)[0]!;
  const fl = f(-T_BOUND), fh = f(T_BOUND);
  if (fl >= 0) return { n: lo.map((v) => (v > 0 ? v : 0)), dxi: xmin, iterations: 0, atBound: true, zero: false, f: fl };
  if (fh <= 0) return { n: hi.map((v) => (v > 0 ? v : 0)), dxi: xmax, iterations: 0, atBound: true, zero: false, f: fh };
  const r = brent(f, -T_BOUND, T_BOUND, { tol: 1e-14, maxIter: 300 });
  const t = r.x;
  const e = dmath.exp(t <= 0 ? t : -t);
  const small = (W * e) / (1 + e);
  const dxi = t <= 0 ? xmin + small : xmax - small;
  return { n: build(t), dxi, iterations: r.iterations, atBound: false, zero: false, f: f(t) };
}

function applyXi(p: Prep, n0: readonly number[], xi: readonly number[]): number[] {
  return n0.map((v, i) => {
    let s = v;
    for (let j = 0; j < p.R; j++) s += p.nu[j]![i]! * xi[j]!;
    return s;
  });
}

interface Solved { n: number[]; xi: number[]; iterations: number; method: 'brent' | 'newton' | 'none'; lnK: number[]; f: number[]; converged: boolean; zero: boolean[] }

/** Solve the whole reaction set at a fixed T (and P or V). */
function solveAtT(spec: EqSpec, p: Prep, T: number, n0: readonly number[], xi0?: readonly number[]): Solved {
  const lnK = lnKs(spec, p, T);
  const c = offsetC(spec, p.iso, T);
  const zero = new Array<boolean>(p.R).fill(false);
  if (p.R === 1) {
    const o = solveOne(p, 0, n0, c, lnK[0]!);
    zero[0] = o.zero;
    return { n: o.n, xi: [o.dxi], iterations: o.iterations, method: o.zero ? 'none' : 'brent', lnK, f: [o.f], converged: true, zero };
  }
  // Gauss-Seidel sweeps of exact single-reaction solves (initial guess; also the fallback when Newton stalls).
  const sweep = (nStart: number[], count: number): { n: number[]; xi: number[] } => {
    let n = nStart.slice();
    const xi = new Array<number>(p.R).fill(0);
    for (let s = 0; s < count; s++) {
      let move = 0, scale = 0;
      for (let j = 0; j < p.R; j++) {
        const o = solveOne(p, j, n, c, lnK[j]!);
        if (o.zero) zero[j] = true; else zero[j] = false;
        n = o.n; xi[j]! += o.dxi;
        move = Math.max(move, Math.abs(o.dxi));
      }
      for (const v of n) scale = Math.max(scale, v);
      if (move <= 1e-13 * scale) break;
    }
    return { n, xi };
  };
  let xi: number[];
  if (xi0 !== undefined && xi0.length === p.R && applyXi(p, n0, xi0).every((v) => v > 0)) xi = xi0.slice();
  else xi = sweep(n0.slice(), 1).xi;
  const F = (x: number[]): number[] => residuals(p, applyXi(p, n0, x), c, lnK);
  const jac = (x: number[]): number[][] => {
    const n = applyXi(p, n0, x);
    let Ng = 0;
    for (let i = 0; i < p.S; i++) if (p.gas[i]!) Ng += Math.max(n[i]!, TINY);
    const J: number[][] = [];
    for (let j = 0; j < p.R; j++) {
      const rowJ: number[] = [];
      for (let k = 0; k < p.R; k++) {
        let s = 0;
        for (let i = 0; i < p.S; i++) if (p.gas[i]!) s += (p.nu[j]![i]! * p.nu[k]![i]!) / Math.max(n[i]!, TINY);
        if (p.iso) s -= (p.nug[j]! * p.nug[k]!) / Ng;
        rowJ.push(s);
      }
      J.push(rowJ);
    }
    return J;
  };
  const limit = (xo: number[], xn: number[]): number[] => {
    const no = applyXi(p, n0, xo), nn = applyXi(p, n0, xn);
    let th = 1;
    for (let i = 0; i < p.S; i++) {
      if (nn[i]! < FTB * no[i]!) {
        const d = no[i]! - nn[i]!;
        if (d > 0) th = Math.min(th, ((1 - FTB) * no[i]!) / d);
      }
    }
    return th < 1 ? xo.map((v, k) => v + th * (xn[k]! - v)) : xn;
  };
  let best: { x: number[]; r: number } = { x: xi, r: Number.POSITIVE_INFINITY };
  let iters = 0;
  let conv = false;
  for (let attempt = 0; attempt < 4 && !conv; attempt++) {
    const res = newton(F, xi, { jacobian: jac, tol: FTOL, maxIter: 50, limit });
    iters += res.iterations;
    if (res.residual < best.r || !Number.isFinite(best.r)) best = { x: res.x, r: res.residual };
    if (res.converged) { conv = true; break; }
    const sw = sweep(applyXi(p, n0, res.x), 20 * (attempt + 1));
    xi = res.x.map((v, k) => v + sw.xi[k]!);
  }
  const nOut = applyXi(p, n0, best.x).map((v) => (v > 0 ? v : 0));
  return { n: nOut, xi: best.x, iterations: iters, method: 'newton', lnK, f: F(best.x), converged: conv, zero };
}

function enthalpyOf(spec: EqSpec, mx: ReturnType<typeof makeMixture> | null, p: Prep, T: number, nOrXi: { n: readonly number[]; xi: readonly number[] }, Tin: number): number {
  if (mx !== null) return enthalpyFlowAt(mx, nOrXi.n, T);
  // book energy: constant heat capacity and dH per reaction
  let h = (spec.cpBook ?? 0) * (T - Tin);
  for (let j = 0; j < p.R; j++) h += nOrXi.xi[j]! * rxnDH(p.nus[j]!, T, 'book', bookOf(spec, j));
  return h;
}

function mixtureOf(spec: EqSpec): ReturnType<typeof makeMixture> | null {
  if (!spec.species.every((id) => hasThermo(id))) return null;
  return makeMixture(spec.species);
}

/** Equilibrium composition of the reaction set (isothermal, adiabatic or constant-volume isothermal). */
export function solveEquilibrium(spec: EqSpec): SimResult<EqOut> {
  try {
    return solveEquilibriumRaw(spec);
  } catch {
    return failResult('NUMERIC_GUARD', { T: spec.T });
  }
}

function solveEquilibriumRaw(spec: EqSpec): SimResult<EqOut> {
  const mode: EqMode = spec.mode ?? 'isothermal';
  const iso = mode !== 'constV';
  if (!(spec.T > 0)) return failResult('BAD_INPUT', { T: spec.T });
  if (iso && !(spec.P !== undefined && spec.P > 0)) return failResult('BAD_INPUT', { P: spec.P ?? 0 });
  if (!iso && !(spec.V !== undefined && spec.V > 0)) return failResult('BAD_INPUT', { V: spec.V ?? 0 });
  const p = prepare(spec, iso);
  if (p === null) return failResult('UNKNOWN_REACTION', {});
  const diag: Diag[] = [];
  const n0 = spec.n0.slice();
  const mx = mixtureOf(spec);
  if (mode === 'adiabatic' && mx === null && spec.detail !== 'book') return failResult('NO_THERMO', {});
  if (mode === 'adiabatic' && mx === null && !(spec.cpBook !== undefined && spec.cpBook > 0)) return failResult('NO_THERMO', {});

  let T = spec.T;
  let sol: Solved;
  if (mode === 'adiabatic') {
    const mxUse = spec.detail === 'book' && spec.cpBook !== undefined ? null : mx;
    const Hin = mxUse !== null ? enthalpyFlowAt(mxUse, n0, spec.T) : 0;
    const g = (t: number): number => {
      const s = solveAtT(spec, p, t, n0, undefined);
      return enthalpyOf(spec, mxUse, p, t, { n: s.n, xi: s.xi }, spec.T) - Hin;
    };
    const glo = g(T_LO), ghi = g(T_HI);
    if (!Number.isFinite(glo) || !Number.isFinite(ghi)) return failResult('NO_THERMO', {});
    if (!(glo <= 0 && ghi >= 0)) return failResult('T_BRACKET', { glo, ghi });
    const r = brent(g, T_LO, T_HI, { tol: 1e-10, maxIter: 300 });
    T = r.x;
    sol = solveAtT(spec, p, T, n0, undefined);
  } else {
    sol = solveAtT(spec, p, T, n0, spec.xi0);
  }
  p.nus.forEach((_, j) => {
    if (sol.zero[j]) diag.push({ code: 'NO_REACTANT', severity: 'info', data: { reaction: j } });
  });
  if (!sol.converged) diag.push({ code: 'EQUILIBRIUM_NOT_CONVERGED', severity: 'warn', data: { residual: Math.max(...sol.f.map(Math.abs)), iterations: sol.iterations } });
  const c = offsetC(spec, iso, T);
  const f = residuals(p, sol.n, c, sol.lnK);
  let P = spec.P ?? 0;
  if (!iso) {
    let Ng = 0;
    sol.n.forEach((v, i) => { if (p.gas[i]!) Ng += v; });
    P = (Ng * (spec.R ?? R_GAS) * T) / spec.V!;
  }
  let duty = Number.NaN;
  if (mx !== null) duty = enthalpyFlowAt(mx, sol.n, T) - enthalpyFlowAt(mx, n0, spec.T);
  return okResult({
    n: sol.n, xi: sol.xi, T, P,
    lnQminusLnK: sol.zero.map((z, j) => (z ? 0 : f[j]!)),
    lnK: sol.lnK, K: sol.lnK.map((v) => dmath.exp(v)),
    iterations: sol.iterations, method: sol.method, duty,
  }, diag);
}

/** log10(Q/K) per reaction at the given amounts (raw: the balance beam clamps it). Isobaric with P, or constant V with V. */
export function qOverK(spec: Omit<EqSpec, 'mode'> & { mode?: EqMode }): SimResult<number[]> {
  try {
    const iso = (spec.mode ?? 'isothermal') !== 'constV';
    const p = prepare(spec as EqSpec, iso);
    if (p === null) return failResult('UNKNOWN_REACTION', {});
    const lnK = lnKs(spec as EqSpec, p, spec.T);
    if (lnK.some((v) => Number.isNaN(v))) return failResult('NO_THERMO', {});
    const f = residuals(p, spec.n0, offsetC(spec as EqSpec, iso, spec.T), lnK);
    // an absent gas species makes Q 0 or infinite: report the limit instead of the clamped logarithm
    return okResult(f.map((v, j) => {
      let zr = false, zp = false;
      for (let i = 0; i < p.S; i++) {
        if (!p.gas[i]! || !(spec.n0[i]! <= 0)) continue;
        if (p.nu[j]![i]! < 0) zr = true; else if (p.nu[j]![i]! > 0) zp = true;
      }
      if (zr && zp) return Number.NaN;
      return zr ? Number.POSITIVE_INFINITY : zp ? Number.NEGATIVE_INFINITY : v / Math.LN10;
    }));
  } catch {
    return failResult('NUMERIC_GUARD', { T: spec.T });
  }
}

export interface EqCurve { T: number[]; X: number[]; xi: number[][]; ref: string }

/** X_eq(T) on a temperature grid: conversion of `ref` (default: the limiting reactant of the first reaction), isobaric. */
export function eqCurve(feed: Omit<EqSpec, 'T' | 'mode'>, Tgrid: readonly number[], ref?: string): SimResult<EqCurve> {
  const base: EqSpec = { ...feed, T: Tgrid[0] ?? 300, mode: 'isothermal' };
  const p = prepare(base, true);
  if (p === null) return failResult('UNKNOWN_REACTION', {});
  let r = ref;
  if (r === undefined) {
    const nmap: Record<string, number> = {};
    feed.species.forEach((id, i) => { nmap[id] = feed.n0[i]!; });
    r = limitingReagent(nmap, p.nus[0]!).species;
  }
  const ir = feed.species.indexOf(r);
  if (ir < 0 || !(feed.n0[ir]! > 0)) return failResult('NO_REACTANT', { reaction: 0 });
  const out: EqCurve = { T: [], X: [], xi: [], ref: r };
  let last: readonly number[] | undefined;
  for (const T of Tgrid) {
    try {
      const s = solveAtT({ ...base, T }, p, T, feed.n0, last);
      out.T.push(T);
      out.X.push((feed.n0[ir]! - s.n[ir]!) / feed.n0[ir]!);
      out.xi.push(s.xi);
      last = s.xi;
    } catch {
      return failResult('NUMERIC_GUARD', { T });
    }
  }
  return okResult(out);
}
