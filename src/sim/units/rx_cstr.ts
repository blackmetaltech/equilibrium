// Jacketed liquid CSTR (DESIGN 3.5, 3.7, 3.9; L24 K7 propylene oxide hydrolysis). Steady states G(T) = R(T):
//   X(T) = tau k / (1 + tau k),   G = (-dH) Q C0_key X / |nu_key|,   R = Q rhoCp (T - T0) + UAeff (T - Tc)
// found by scanning F = G - R on 400 points over [Tc - 10, Tc + dTad + 50] (widened below to the feed T and above by the feed T too),
// Brent-polishing every sign change and classifying each state: slope (dG/dT < dR/dT) AND the 2x2 (C_key, T) Jacobian trace < 0, det > 0.
// WHICH state the plant sits on is decided by a simulated start-up (reactor full of feed at feed T, jacket at Tc) integrated for 20 tau
// with the backward-Euler step of src/sim/dynamics/reactorODE.ts; the nearest stable state is then taken as the commissioned one.
// With a finite coolant flow (mcpC) the jacket has its own balance and the steady-state scan uses UAeff = UA mcpC / (UA + mcpC).
// Unit `cstr`: params law (K7), catalystId, V (m3), Q (m3/s; else total feed / cTot, cTot mol/m3 default 5.5e4), UA (W/K), Tc (K),
//   T0 (K, default inlet T), rhoCp (J/m3/K), dH (J/mol), mcpC (W/K), Cj (J/K). Info: X, T, tau, xi, dTad, nss, branch, ss<i>_T/_X/_stable
//   (i < 5), Tc, UAeff; diag MULTIPLE_STEADY_STATES (info) when the plant has more than one state.
import { brent, dmath } from '@core/numerics';
import { findLaw } from '../../data/kinetics';
import { findReaction } from '../../data/reactions';
import { arrheniusK } from '../chem/kinetics';
import { rxnDH } from '../chem/reactions';
import { cstrStep, type CstrInputs, type CstrModel, type CstrState } from '../dynamics/reactorODE';
import type { Diag, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, has, num, str } from './utilities';
import { rigK } from './rx_batch';

const T_FROM_C = 273.15;
const SCAN = 400;

// ---------------------------------------------------------------------------------------------------- model helpers
/** First-order rate constant (1/s) and its derivative from a catalogue law, optionally for a catalyst variant. */
export function lawRate(lawId: string, catalystId?: string): { k: (T: number) => number; dk: (T: number) => number } | undefined {
  const law = findLaw(lawId);
  if (law === undefined || (law.form !== 'first_order' && law.form !== 'cstr_arrhenius')) return undefined;
  if (law.variants !== undefined) {
    const r = rigK(catalystId ?? 'none', lawId);
    return { k: r.k, dk: (T) => (r.k(T) * r.Ea) / (law.params['R']! * T * T) };
  }
  const p = law.params;
  const k = (T: number): number => arrheniusK(p['kref']!, p['Ea']!, T, p['Tref']!, p['R']!);
  return { k, dk: (T) => (k(T) * p['Ea']!) / (p['R']! * T * T) };
}

/** Effective jacket conductance: UA for an ideal (infinite-flow) jacket, UA mcpC / (UA + mcpC) with a finite coolant flow. */
export const uaEff = (u: CstrInputs): number => (u.mcpC !== undefined && Number.isFinite(u.mcpC) ? (u.UA * u.mcpC) / (u.UA + u.mcpC || 1) : u.UA);

const nuKey = (m: CstrModel): number => Math.abs(m.nu[m.key]!);
/** Adiabatic temperature rise at full conversion of the key, K. */
export const cstrDTad = (m: CstrModel, u: CstrInputs): number => (-m.dH * u.C0[m.key]!) / nuKey(m) / m.rhoCp;

/** The L24 game reactor (K7): V 0.10 m3, 5 m3/h, U A 10 MJ/(h K), feed and coolant 25 C; GAME constants of docs/research/kinetics_cstr_si.py. */
export const K7_GAME = { V: 0.1, Q: 5 / 3600, UA: 10e6 / 3600, T0: 25 + T_FROM_C, Tc: 25 + T_FROM_C, rhoCp: 3.57e6, dH: -251.2e3, CA0: 2114, Cwater: 50000 } as const;
export function k7Game(over: Partial<{ V: number; Q: number; UA: number; T0: number; Tc: number }> = {}): { model: CstrModel; inputs: CstrInputs } {
  const g = { ...K7_GAME, ...over };
  const r = lawRate('K7')!;
  const rx = findReaction('R18')!;
  const ids = Object.keys(rx.nu);
  const nu = ids.map((id) => rx.nu[id]!);
  const C0 = ids.map((id) => (id === 'C3H6O' ? g.CA0 : id === 'H2O(l)' ? g.Cwater : 0));
  return {
    model: { V: g.V, rhoCp: g.rhoCp, dH: g.dH, nu, key: ids.indexOf('C3H6O'), k: r.k, dk: r.dk },
    inputs: { C0, T0: g.T0, Q: g.Q, UA: g.UA, Tc: g.Tc },
  };
}

// ---------------------------------------------------------------------------------------------------- steady states
export interface SteadyState { T: number; X: number; stable: boolean; slope: number; trace: number; det: number }
export interface Semenov { T: number[]; G: number[]; R: number[] }
export interface SteadyOut { states: SteadyState[]; semenov: Semenov }

const dkOf = (m: CstrModel, T: number): number => {
  if (m.dk) return m.dk(T);
  const h = 1e-3 * T;
  return (m.k(T + h) - m.k(T - h)) / (2 * h);
};
const Xof = (m: CstrModel, u: CstrInputs, T: number): number => { const tk = (m.V / u.Q) * m.k(T); return tk / (1 + tk); };
const dXof = (m: CstrModel, u: CstrInputs, T: number): number => { const tau = m.V / u.Q, tk = tau * m.k(T); return (tau * dkOf(m, T)) / ((1 + tk) * (1 + tk)); };
/** Heat generation, W. */
export const cstrG = (m: CstrModel, u: CstrInputs, T: number): number => (-m.dH * u.Q * u.C0[m.key]! * Xof(m, u, T)) / nuKey(m);
/** Heat removal, W. */
export const cstrR = (m: CstrModel, u: CstrInputs, T: number): number => u.Q * m.rhoCp * (T - u.T0) + uaEff(u) * (T - u.Tc);
const rangeOf = (m: CstrModel, u: CstrInputs, widen = 0): [number, number] => [Math.min(u.Tc, u.T0) - 10 - widen, Math.max(u.Tc, u.T0) + cstrDTad(m, u) + 50];

function classify(m: CstrModel, u: CstrInputs, T: number): SteadyState {
  const X = Xof(m, u, T);
  const slope = (-m.dH * u.Q * u.C0[m.key]! * dXof(m, u, T)) / nuKey(m) - (u.Q * m.rhoCp + uaEff(u));
  const k = m.k(T), dk = dkOf(m, T), tau = m.V / u.Q, Ck = u.C0[m.key]! * (1 - X);
  // Jacobian of (C_key, T): rows dC/dt, dT/dt
  const j11 = -(1 / tau + k), j12 = -dk * Ck;
  const j21 = (-m.dH * k) / (nuKey(m) * m.rhoCp);
  const j22 = (-(u.Q * m.rhoCp + uaEff(u)) + (-m.dH * dk * Ck * m.V) / nuKey(m)) / (m.rhoCp * m.V);
  const trace = j11 + j22, det = j11 * j22 - j12 * j21;
  return { T, X, stable: slope < 0 && trace < 0 && det > 0, slope, trace, det };
}

/** All steady states of the CSTR (ordered by T) and the Semenov plot data (G and R on <= 120 points). */
export function cstrSteadyStates(m: CstrModel, u: CstrInputs, nPlot = 120): SteadyOut {
  const [lo, hi] = rangeOf(m, u);
  const F = (T: number): number => cstrG(m, u, T) - cstrR(m, u, T);
  const states: SteadyState[] = [];
  let Tp = lo, fp = F(lo);
  if (fp === 0) states.push(classify(m, u, lo));
  for (let i = 1; i <= SCAN; i++) {
    const T = lo + ((hi - lo) * i) / SCAN, f = F(T);
    if (f === 0) states.push(classify(m, u, T));
    else if (fp !== 0 && Math.sign(f) !== Math.sign(fp)) states.push(classify(m, u, brent(F, Tp, T, { tol: 1e-11, maxIter: 200 }).x));
    Tp = T; fp = f;
  }
  const n = Math.min(nPlot, 120);
  const sem: Semenov = { T: [], G: [], R: [] };
  for (let i = 0; i < n; i++) {
    const T = lo + ((hi - lo) * i) / (n - 1);
    sem.T.push(T); sem.G.push(cstrG(m, u, T)); sem.R.push(cstrR(m, u, T));
  }
  return { states, semenov: sem };
}

export interface Critical { T: number; Tc: number; kind: 'ignition' | 'extinction' }
/**
 * Tangency conditions G = R and G' = R': the temperatures where a branch is born / dies and the coolant temperature at which that happens.
 * vary 'Tc': only the coolant moves (the feed stays at T0, L24: 47.4 C); 'both': feed and coolant move together (T0 = Tc, EQ-CE-022).
 * The larger Tc is the ignition (low branch vanishes on warming), the smaller the extinction (high branch vanishes on cooling).
 */
export function cstrCritical(m: CstrModel, u: CstrInputs, vary: 'Tc' | 'both'): Critical[] {
  const ua = uaEff(u);
  if (!(ua > 0)) return [];
  const [lo, hi] = rangeOf(m, u, 60);
  const sR = u.Q * m.rhoCp + ua;
  const s = (T: number): number => (-m.dH * u.Q * u.C0[m.key]! * dXof(m, u, T)) / nuKey(m) - sR;
  const out: Critical[] = [];
  const N = 4000;
  let Tp = lo, fp = s(lo);
  for (let i = 1; i <= N; i++) {
    const T = lo + ((hi - lo) * i) / N, f = s(T);
    if (fp !== 0 && Math.sign(f) !== Math.sign(fp)) {
      const Tt = brent(s, Tp, T, { tol: 1e-11, maxIter: 200 }).x;
      const G = cstrG(m, u, Tt);
      const Tc = vary === 'Tc' ? Tt - (G - u.Q * m.rhoCp * (Tt - u.T0)) / ua : Tt - G / sR;
      out.push({ T: Tt, Tc, kind: 'ignition' });
    }
    Tp = T; fp = f;
  }
  if (out.length === 2) {
    const [a, b] = out as [Critical, Critical];
    if (a.Tc < b.Tc) { a.kind = 'extinction'; } else { b.kind = 'extinction'; }
  }
  return out;
}

/** Semenov thermal explosion of a zero-order vessel: G = g0 exp(-E/RT), loss hS (T - Ta). Tangency G' = hS below the maximum of G'. */
export function semenovCritical(p: { g0: number; E: number; R: number; hS: number }): { T: number; Ta: number; dT: number; dTapprox: number; all: number[] } {
  const G = (T: number): number => p.g0 * dmath.exp(-p.E / (p.R * T));
  const f = (T: number): number => (G(T) * p.E) / (p.R * T * T) - p.hS;
  const Tmax = p.E / (2 * p.R); // G' peaks here; above it the tangent is not physical
  const all: number[] = [];
  const N = 4000, a = 50;
  let Tp = a, fp = f(a);
  for (let i = 1; i <= N; i++) {
    const T = a + ((Tmax - a) * i) / N, v = f(T);
    if (Math.sign(v) !== Math.sign(fp)) all.push(brent(f, Tp, T, { tol: 1e-12, maxIter: 200 }).x);
    Tp = T; fp = v;
  }
  const T = all[0]!;
  const Ta = T - G(T) / p.hS;
  return { T, Ta, dT: T - Ta, dTapprox: (p.R * Ta * Ta) / p.E, all };
}

/** CSTR design equation V = FA0 X / (-rA): `perX(X)` = FA0 / (-rA(X)) as for pfrVolume. */
export const cstrVolume = (perX: (X: number) => number, X: number): number => X * perX(X);

// ---------------------------------------------------------------------------------------------------- start-up
/** Simulated commissioning: full of feed at the feed T, jacket at Tc, integrated for 20 tau (dt = 1 s, coarser for long residence times). */
export function startUp(m: CstrModel, u: CstrInputs): CstrState {
  const tau = m.V / u.Q, total = 20 * tau;
  const dt = Math.max(1, total / 3000), steps = Math.ceil(total / dt);
  let s: CstrState = { C: u.C0.slice(), T: u.T0, Tj: u.Tc };
  for (let i = 0; i < steps; i++) {
    s = cstrStep(m, s, u, dt);
    if (!Number.isFinite(s.T)) break;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------- unit op
export const cstrUnit: UnitOp = (inlets, u: UnitInst, ctx) => {
  const inn = inlets['in'];
  if (!inn) return failResult('NO_INLET', {}, { unitId: u.id });
  const guard = guardInlets<never>({ in: inn }, u);
  if (guard) return guard;
  const lawId = str(u, 'law', 'K7');
  const rate = lawRate(lawId, u.catalystId ?? str(u, 'catalystId', 'none'));
  const law = findLaw(lawId);
  const rx = law === undefined ? undefined : findReaction(law.reactions[0]!);
  if (rate === undefined || law === undefined || rx === undefined) return failResult('NOT_CSTR_LAW', {}, { unitId: u.id });
  const ids = Object.keys(rx.nu);
  const idx = ids.map((id) => ctx.species.indexOf(id));
  const miss = idx.findIndex((i) => i < 0);
  if (miss >= 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: ids[miss] });
  const keyId = law.species['A']!;
  const V = num(u, 'V', K7_GAME.V), UA = num(u, 'UA', K7_GAME.UA), Tc = num(u, 'Tc', K7_GAME.Tc), T0 = num(u, 'T0', inn.T);
  const tot = inn.n.reduce((a, b) => a + b, 0);
  const Q = has(u, 'Q') ? num(u, 'Q') : tot / num(u, 'cTot', 5.5e4);
  if (!(V > 0) || !(Q > 0) || !(UA >= 0) || !(Tc > 0) || !(T0 > 0)) return failResult('SPEC_RANGE', { V, Q, UA, Tc }, { unitId: u.id });
  const dH = has(u, 'dH') ? num(u, 'dH') : lawId === 'K7' ? K7_GAME.dH : rx.dH298book !== undefined ? rx.dH298book * 1e3 : rxnDH(rx.nu, T0, 'rigorous');
  const model: CstrModel = {
    V, rhoCp: num(u, 'rhoCp', K7_GAME.rhoCp), dH, nu: ids.map((id) => rx.nu[id]!), key: ids.indexOf(keyId), k: rate.k, dk: rate.dk,
    ...(has(u, 'Cj') ? { Cj: num(u, 'Cj') } : {}),
  };
  const inputs: CstrInputs = { C0: idx.map((i) => inn.n[i]! / Q), T0, Q, UA, Tc, ...(has(u, 'mcpC') ? { mcpC: num(u, 'mcpC') } : {}) };
  const ss = cstrSteadyStates(model, inputs);
  if (ss.states.length === 0) return failResult('NO_STEADY_STATE', { T0, Tc }, { unitId: u.id });
  const diag: Diag[] = [];
  const start = startUp(model, inputs);
  let branch = -1, best = Infinity;
  ss.states.forEach((s, i) => {
    const d = Math.abs(s.T - start.T);
    if (s.stable && d < best) { best = d; branch = i; }
  });
  let T: number, X: number;
  if (branch >= 0 && best < 5) { T = ss.states[branch]!.T; X = ss.states[branch]!.X; } else {
    branch = -1; T = start.T; X = 1 - start.C[model.key]! / inputs.C0[model.key]!;
    diag.push({ code: 'CSTR_NO_SETTLE', severity: 'warn', unitId: u.id, data: { T } });
  }
  if (!Number.isFinite(T) || !Number.isFinite(X)) return failResult('NUMERIC_GUARD', {}, { unitId: u.id });
  if (ss.states.length > 1) diag.push({ code: 'MULTIPLE_STEADY_STATES', severity: 'info', unitId: u.id, data: { n: ss.states.length, branch, T } });
  const xi = (Q * inputs.C0[model.key]! * X) / nuKey(model);
  const n = inn.n.slice();
  ids.forEach((_id, j) => { n[idx[j]!] = inn.n[idx[j]!]! + model.nu[j]! * xi; });
  const ua = uaEff(inputs);
  const info: Record<string, number> = {
    X, T, tau: V / Q, xi, dTad: cstrDTad(model, inputs), nss: ss.states.length, branch, Tc, UAeff: ua, Q,
  };
  ss.states.slice(0, 5).forEach((s, i) => { info[`ss${i}_T`] = s.T; info[`ss${i}_X`] = s.X; info[`ss${i}_stable`] = s.stable ? 1 : 0; });
  return okResult({ outlets: { out: { n, T, P: inn.P } }, duty: -ua * (T - Tc), info }, diag);
};
