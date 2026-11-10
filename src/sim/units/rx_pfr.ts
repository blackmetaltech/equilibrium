// Packed bed (DESIGN 3.5, BINDING): state (xi_1..xi_R, T) along the catalyst mass W,
//   d xi_j / dW = r_j(n(xi), T, P)                       (rate() already carries the catalyst activity, kMult, dTk, rho_b)
//   dT / dW = [ sum_j (-dH_j(T)) dxi_j/dW - Ua_W (T - Tc) ] / sum_i n_i Cp_i(T)      (Ua_W = 0 adiabatic; isothermal: T fixed)
// RK4 with step doubling (rtol 1e-6, local extrapolation) on scaled variables; when the step collapses below W/1e4 the
// integrator switches to backward Euler with geometrically growing steps (stiffness near equilibrium); the whole bed is meant to
// cost <= 400 rate evaluations (info.evals reports the count; BED_BUDGET warns when exceeded). P is constant along the bed, the
// pressure drop dP is taken at the outlet. After the integration the outlet T is re-solved from the energy balance
// (H_out = H_in - heat removed) so the ledger closes exactly; the correction is reported (info.Tclose, the integration error).
// Params: law | catalystId (-> law), W (kg catalyst), mode ('adiabatic' | 'isothermal' | 'cooled'), T (K, isothermal), Tc (K) and
//   UaW (W/(K kg_cat)) for 'cooled', activity (0..1), rhoB (kg/m3, per-volume laws), floor (0 disables the seed), dP (Pa), key, nprof.
// Info: X, Xeq (isothermal equilibrium of the inlet at T_out), eta = X / Xeq, K, QK_in / QK_out (log10 Q/K, reaction 1),
//   dTad (adiabatic-equilibrium rise from the inlet), dT, Tmax, T_in, T_out, Q, evals, implicit, np and the profile p<i>_W, p<i>_T,
//   p<i>_X, p<i>_QK (<= 60 points; `bedProfile` rebuilds the arrays).
import { backwardEulerStep, dmath, rk4Step } from '@core/numerics';
import { findCatalyst } from '../../data/catalysts';
import { findLaw } from '../../data/kinetics';
import { reactionOf } from '../../data/reactions';
import { qOverK, solveEquilibrium } from '../chem/equilibrium';
import { rate } from '../chem/kinetics';
import { lnKOfReaction } from '../chem/reactions';
import { totalFlow } from '../thermo';
import type { Diag, SimResult, StreamState, ThermoDetail, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { type EnergyModel, beam, engineModel } from './rx_stoich';
import { keyIndex } from './rx_equil';
import { guardInlets, has, num, str } from './utilities';

const T_FROM_C = 273.15;
const T_SC = 1000, Q_SC = 1e4;
const MAX_STEPS = 6000;
/** Step floor as a fraction of W (DESIGN 3.5: below it the bed is stiff and goes implicit) and the error ratio up to which a minimum step is still taken as a kink. */
const H_MIN = 1e-4, KINK_ERR = 100;
/** A bed is settled on equilibrium when it sits on the curve (|log10 Q/K| < ON_CURVE for every reaction) and the rates leave less than SETTLED of the feed to be converted over the rest of the bed. */
const SETTLED = 1e-4, ON_CURVE = 1e-5, CROSS = 3e-4;
/** Budget pacing: at this fraction of the evaluation cap the tolerance is relaxed by RELAX (the error stays below 1e-4 of the feed, measured). */
const PACE = 0.6, RELAX = 100;

export interface BedSpec {
  species: readonly string[];
  inlet: StreamState;
  lawId: string;
  catalystId?: string;
  /** Catalyst mass, kg. */
  W: number;
  mode: 'adiabatic' | 'isothermal' | 'cooled';
  /** Isothermal bed temperature, K (default: the inlet T). */
  T?: number;
  /** Coolant temperature, K, and heat-transfer capacity per catalyst mass, W/(K kg), for the cooled bed. */
  Tc?: number;
  UaW?: number;
  /** Pressure drop taken at the outlet, Pa. */
  dP?: number;
  activity?: number;
  kMult?: number;
  dTk?: number;
  rhoB?: number;
  /** Seed for a feed with no product (true = the law's floor, 0 or false = off). Default true. */
  floor?: boolean | number;
  key?: string;
  detail?: ThermoDetail;
  /** Enthalpy data of the energy balance (default: the engine's rigorous thermo). */
  model?: EnergyModel;
  rtol?: number;
  /** Rate evaluations after which the bed is finished with coarse implicit steps and BED_BUDGET is raised. */
  maxEvals?: number;
  nprof?: number;
  /** Light-off and over-temperature windows, K (default: the catalyst entry, deg C there). */
  TlightOff?: number;
  Tmax?: number;
}

export interface BedProfile { W: number[]; T: number[]; X: number[]; QK: number[] }
export interface BedOut {
  out: StreamState;
  xi: number[];
  /** H_out - H_in, W. */
  duty: number;
  profile: BedProfile;
  evals: number;
  implicit: boolean;
  Tmax: number;
  X: number;
  keyIdx: number;
  info: Record<string, number>;
}

/** Decimate to at most `m` points, keeping the first and the last. */
function thin<T>(a: readonly T[], m: number): T[] {
  if (a.length <= m) return a.slice();
  return Array.from({ length: m }, (_, k) => a[Math.round((k * (a.length - 1)) / (m - 1))]!);
}

/** Integrate one bed. Pure; domain failures come back as codes. */
export function simulateBed(spec: BedSpec): SimResult<BedOut> {
  try {
    return bedRaw(spec);
  } catch {
    return failResult('NUMERIC_GUARD', { W: spec.W });
  }
}

function bedRaw(spec: BedSpec): SimResult<BedOut> {
  const law = findLaw(spec.lawId);
  if (law === undefined || (law.form !== 'temkin' && law.form !== 'eklund' && law.form !== 'vbf')) return failResult('NOT_PFR_LAW', {});
  const ids = spec.species;
  const rxs = law.reactions.map((id) => reactionOf(id));
  for (const r of rxs) for (const sp of Object.keys(r.nu)) if (!ids.includes(sp)) return failResult('SPECIES_MISSING', {}, { species: sp });
  const R = rxs.length;
  const s0 = spec.inlet;
  const model = spec.model ?? engineModel(ids);
  const detail = spec.detail ?? 'rigorous';
  const Pout = s0.P - (spec.dP ?? 0);
  if (!(Pout > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s0.P, dP: spec.dP ?? 0 });
  if (!(spec.W >= 0)) return failResult('SPEC_RANGE', { W: spec.W });
  const Fs = totalFlow(s0.n);
  const Tfix = spec.mode === 'isothermal' ? spec.T ?? s0.T : Number.NaN;
  const T0 = spec.mode === 'isothermal' ? Tfix : s0.T;
  const UaW = spec.mode === 'cooled' ? spec.UaW ?? 0 : 0;
  const Tc = spec.Tc ?? s0.T;
  const nOf = (xi: readonly number[]): number[] => ids.map((id, i) => {
    let v = s0.n[i]!;
    for (let j = 0; j < R; j++) v += (rxs[j]!.nu[id] ?? 0) * xi[j]!;
    return v;
  });
  const keyIdx = keyIndex(ids, s0.n, law.reactions[0]!, spec.key);
  const diag: Diag[] = [];
  const cat = spec.catalystId !== undefined ? findCatalyst(spec.catalystId) : undefined;
  const TlightOff = spec.TlightOff ?? (cat !== undefined ? cat.TlightOff + T_FROM_C : undefined);
  const Tcat = spec.Tmax ?? (cat !== undefined ? cat.Tmax + T_FROM_C : undefined);
  const rateState = { speciesIds: ids as string[], P: s0.P, activity: spec.activity, catalystId: spec.catalystId, kMult: spec.kMult, dTk: spec.dTk, rhoB: spec.rhoB, floor: spec.floor ?? true, detail };

  const iso = spec.mode === 'isothermal', cooled = spec.mode === 'cooled';
  const iT = iso ? -1 : R, iQ = cooled ? R + 1 : -1;
  let evals = 0;
  const f = (s: number, y: number[]): number[] => {
    evals++;
    const xi = y.slice(0, R).map((v) => v * Fs);
    const T = iso ? Tfix : y[iT]! * T_SC;
    const n = nOf(xi).map((v) => (v > 0 ? v : 0)); // a trial stage of the integrator may overshoot a reactant
    const r = rate(spec.lawId, { ...rateState, n, T });
    void s;
    const out = new Array<number>(y.length).fill(0);
    let heat = 0;
    for (let j = 0; j < R; j++) { out[j] = (r[j]! * spec.W) / Fs; if (!iso) heat += -model.dH(rxs[j]!.nu, T) * r[j]!; }
    if (!iso) {
      const rem = UaW * (T - Tc);
      out[iT] = (((heat - rem) / model.cp(n, T)) * spec.W) / T_SC;
      if (cooled) out[iQ] = (rem * spec.W) / (Fs * Q_SC);
    }
    return out;
  };

  const xiEnd: number[] = new Array<number>(R).fill(0);
  let Tend = T0, Qrem = 0, implicit = false;
  const hist: { W: number[]; T: number[]; xi: number[][] } = { W: [0], T: [T0], xi: [xiEnd.slice()] };
  if (Fs > 0 && spec.W > 0) {
    const rtol = spec.rtol ?? 1e-6;
    const cap = spec.maxEvals ?? 400;
    let y: number[] = [...new Array<number>(R).fill(0), ...(iso ? [] : [T0 / T_SC]), ...(cooled ? [0] : [])];
    let s = 0, h = 0.05, guard = 0, rej = 0, rtolEff = rtol, budget = false;
    const push = (): void => { hist.W.push(s * spec.W); hist.T.push(iso ? Tfix : y[iT]! * T_SC); hist.xi.push(y.slice(0, R).map((v) => v * Fs)); };
    // derivative at the current state: carried between steps (it is k1 of the next attempt) and used to detect a bed that has
    // settled on equilibrium (on the curve, with almost nothing left to convert)
    const mag = (d: readonly number[]): number => { let m = 0; for (let j = 0; j < R; j++) m = Math.max(m, Math.abs(d[j]!)); return m; };
    let fcur = f(0, y);
    const qkAt = (yy: readonly number[]): number[] => {
      const T = iso ? Tfix : yy[iT]! * T_SC;
      const q = qOverK({ species: ids, P: Pout, reactions: law.reactions, detail, n0: nOf(yy.slice(0, R).map((v) => v * Fs)), T });
      return q.ok ? q.value : [Number.NaN];
    };
    const settledOnCurve = (): boolean => qkAt(y).every((v) => Math.abs(v) < ON_CURVE);
    // Second law (P12): relaxation towards equilibrium never moves log10 Q/K away from 0 or across it (a cooled bed moves K itself
    // and is exempt). An explicit step that does is an instability near equilibrium, not physics: it is rejected and the bed goes implicit.
    let qkPrev = qkAt(y)[0]!;
    const crosses = (yy: readonly number[]): boolean => {
      if (cooled) return false;
      const q = qkAt(yy)[0]!;
      if (Number.isNaN(q) || Number.isNaN(qkPrev)) return false;
      if (Math.abs(q) > Math.abs(qkPrev) + CROSS) return true;
      return Math.abs(qkPrev) > CROSS && q * qkPrev < 0 && Math.abs(q) > CROSS;
    };
    while (s < 1 - 1e-14) {
      if (++guard > MAX_STEPS) return failResult('BED_STEPS', { W: s * spec.W });
      if (s > 0 && mag(fcur) * (1 - s) < SETTLED && settledOnCurve()) { s = 1; push(); break; }
      h = Math.min(h, 1 - s);
      // budget: at PACE x cap the tolerance is relaxed (a kink in a rate law or a long relaxation tail), past twice the cap the bed
      // is finished with coarse implicit steps; both are reported
      if (!budget && evals >= PACE * cap) { budget = true; rtolEff = rtol * RELAX; diag.push({ code: 'BED_BUDGET', severity: 'info', data: { evals, cap } }); }
      if (budget && !implicit && evals >= 2 * cap) { implicit = true; h = Math.max(h, H_MIN); }
      if (implicit) {
        // a Newton failure (kink, steep rate near a missing product) halves the step and tries again
        let done = false;
        for (let tries = 0; tries < 24 && !done; tries++) {
          try { y = backwardEulerStep(f, s, y, Math.min(h, 1 - s)); done = true; } catch { h /= 2; }
        }
        if (!done) return failResult('BED_NEWTON', { W: s * spec.W });
        h = Math.min(h, 1 - s);
        s += h; push();
        h = Math.min(h * 3, 1 - s);
        if (!(y.every(Number.isFinite))) return failResult('BED_NONFINITE', { W: s * spec.W });
        fcur = f(s, y);
        continue;
      }
      const f0 = fcur, yc = y;
      const fm = (t: number, yy: number[]): number[] => (t === s && yy.every((v, i) => v === yc[i]) ? f0.slice() : f(t, yy));
      const y1 = rk4Step(fm, s, y, h);
      const yh = rk4Step(fm, s, y, h / 2);
      const y2 = rk4Step(fm, s + h / 2, yh, h / 2);
      let err = 0;
      for (let j = 0; j < y.length; j++) {
        const floorJ = j < R ? 1e-2 : 1;
        err = Math.max(err, Math.abs(y2[j]! - y1[j]!) / 15 / (rtolEff * Math.max(Math.abs(y2[j]!), floorJ) + 1e-14));
      }
      if (!Number.isFinite(err)) err = Number.POSITIVE_INFINITY; // an overshooting trial step: reject it
      const yAcc = err <= 1 ? y2.map((v, j) => v + (v - y1[j]!) / 15) : y2;
      if (err <= 1 && crosses(yAcc)) {
        implicit = true; h = Math.max(Math.min(h, 1 - s), H_MIN);
        diag.push({ code: 'BED_STIFF_SWITCHED', severity: 'info', data: { W: s * spec.W } });
      } else if (err <= 1) {
        y = yAcc;
        s += h; push();
        qkPrev = qkAt(y)[0]!;
        h *= Math.min(2, 0.9 * dmath.pow(1 / Math.max(err, 1e-10), 0.2));
        fcur = f(s, y); rej = 0;
      } else {
        // a kink in the rate (the seed floor) makes the error shrink only like h^2: after the first rejection halve at least
        const hNew = h * Math.max(0.1, Math.min(0.9 * dmath.pow(1 / err, 0.2), rej > 0 ? 0.5 : 0.9));
        rej++;
        if (hNew >= H_MIN) h = hNew;
        else if (err <= KINK_ERR) {
          // the step is at the minimum and the error is within a few percent of 1e-4 relative: a kink, not stiffness; take it
          y = y2.map((v, j) => v + (v - y1[j]!) / 15);
          s += h; push();
          h = 2 * H_MIN; rej = 0;
          fcur = f(s, y);
        } else { implicit = true; h = Math.min(1 - s, Math.max(hNew, H_MIN)); diag.push({ code: 'BED_STIFF_SWITCHED', severity: 'info', data: { W: s * spec.W } }); }
      }
    }
    for (let j = 0; j < R; j++) xiEnd[j] = y[j]! * Fs;
    Tend = iso ? Tfix : y[iT]! * T_SC;
    Qrem = cooled ? y[iQ]! * Fs * Q_SC : 0;
  }
  const nOut = nOf(xiEnd).map((v) => (v > 0 ? v : 0));
  const Hin = model.H(s0.n, s0.T);
  let Tout = Tend, Tclose = 0;
  if (spec.mode !== 'isothermal' && Fs > 0 && spec.W > 0) {
    const t = model.solveT(Hin - Qrem, nOut);
    if (t.ok) { Tclose = t.value - Tend; Tout = t.value; }
  }
  const Hout = model.H(nOut, Tout);
  const duty = Fs > 0 && spec.W > 0 ? Hout - Hin : 0;
  hist.T[hist.T.length - 1] = Tout;
  const Tmax = Math.max(...hist.T, Tout);
  if (TlightOff !== undefined && T0 < TlightOff) diag.push({ code: 'BELOW_LIGHTOFF', severity: 'info', data: { T: T0, Tmin: TlightOff } });
  if (Tcat !== undefined && Tmax > Tcat) diag.push({ code: 'CATALYST_OVERTEMP', severity: 'warn', data: { Tmax, limit: Tcat } });

  const k0 = keyIdx >= 0 ? s0.n[keyIdx]! : 0;
  const Xof = (xi: readonly number[]): number => (k0 > 0 ? (k0 - nOf(xi)[keyIdx]!) / k0 : 0);
  const X = Xof(xiEnd);
  const base = { species: ids, P: Pout, reactions: law.reactions, detail } as const;
  const qk = (n: readonly number[], T: number): number => {
    const r = qOverK({ ...base, n0: n, T });
    return r.ok ? beam(r.value[0]!) : 0;
  };
  const idxs = thin(hist.W.map((_, i) => i), spec.nprof ?? 60);
  const profile: BedProfile = {
    W: idxs.map((i) => hist.W[i]!), T: idxs.map((i) => hist.T[i]!), X: idxs.map((i) => Xof(hist.xi[i]!)),
    QK: idxs.map((i) => qk(nOf(hist.xi[i]!), hist.T[i]!)),
  };
  let Xeq = X, dTad = 0;
  if (Fs > 0) {
    const eq = solveEquilibrium({ ...base, n0: s0.n, T: Tout, mode: 'isothermal' });
    if (eq.ok && keyIdx >= 0 && k0 > 0) Xeq = (k0 - eq.value.n[keyIdx]!) / k0;
    const ad = solveEquilibrium({ ...base, n0: s0.n, T: s0.T, mode: 'adiabatic' });
    if (ad.ok) dTad = ad.value.T - s0.T;
  }
  const info: Record<string, number> = {
    X, Xeq, eta: Xeq > 0 ? X / Xeq : 1, K: dmath.exp(lnKOfReaction(rxs[0]!, Tout, detail)),
    QK_in: qk(s0.n, T0), QK_out: qk(nOut, Tout), dTad, dT: Tout - s0.T, Tmax, T_in: s0.T, T_out: Tout, Q: duty,
    evals, implicit: implicit ? 1 : 0, Tclose, np: profile.W.length,
  };
  xiEnd.forEach((x, j) => { info['xi' + (j + 1)] = x; });
  profile.W.forEach((w, i) => { info['p' + i + '_W'] = w; info['p' + i + '_T'] = profile.T[i]!; info['p' + i + '_X'] = profile.X[i]!; info['p' + i + '_QK'] = profile.QK[i]!; });
  return okResult({ out: { n: nOut, T: Tout, P: Pout }, xi: xiEnd, duty, profile, evals, implicit, Tmax, X, keyIdx, info }, diag);
}

/** Rebuild the profile arrays from a bed's `info` (prefix '' for the packed bed, 'b2_' for bed 2 of a multi-bed converter). */
export function bedProfile(info: Record<string, number>, prefix = ''): BedProfile {
  const np = info[prefix + 'np'] ?? 0;
  const col = (c: string): number[] => Array.from({ length: np }, (_, i) => info[prefix + 'p' + i + '_' + c]!);
  return { W: col('W'), T: col('T'), X: col('X'), QK: col('QK') };
}

/** Law of a unit: the `law` param, else the first law of its catalyst. */
export function lawIdOf(u: UnitInst): string {
  const l = str(u, 'law');
  if (l !== '') return l;
  const cat = u.catalystId !== undefined ? findCatalyst(u.catalystId) : undefined;
  return cat?.lawIds[0] ?? '';
}

/** Bed options shared by the packed bed and the multi-bed converter, from the unit's params. */
export function bedOptions(u: UnitInst, species: readonly string[], detail: ThermoDetail): SimResult<Omit<BedSpec, 'inlet' | 'W'>> {
  const lawId = lawIdOf(u);
  if (lawId === '' || findLaw(lawId) === undefined) return failResult('SPEC_MISSING', { param: 'law' }, { unitId: u.id });
  const mode = str(u, 'mode', 'adiabatic');
  if (mode !== 'adiabatic' && mode !== 'isothermal' && mode !== 'cooled') return failResult('SPEC_RANGE', { mode: 0 }, { unitId: u.id });
  const act = num(u, 'activity', 1);
  if (!(act >= 0 && act <= 1)) return failResult('SPEC_RANGE', { activity: act }, { unitId: u.id });
  return okResult({
    species, lawId, catalystId: u.catalystId, mode, T: has(u, 'T') ? num(u, 'T') : undefined, Tc: has(u, 'Tc') ? num(u, 'Tc') : undefined,
    UaW: num(u, 'UaW', 0), dP: num(u, 'dP', 0), activity: act, kMult: has(u, 'kMult') ? num(u, 'kMult') : undefined,
    dTk: has(u, 'dTk') ? num(u, 'dTk') : undefined, rhoB: has(u, 'rhoB') ? num(u, 'rhoB') : undefined,
    floor: has(u, 'floor') ? num(u, 'floor') : true, key: str(u, 'key') || undefined, detail, nprof: has(u, 'nprof') ? num(u, 'nprof') : undefined,
    Tmax: has(u, 'Tmax') ? num(u, 'Tmax') : undefined, TlightOff: has(u, 'TlightOff') ? num(u, 'TlightOff') : undefined,
    maxEvals: has(u, 'maxEvals') ? num(u, 'maxEvals') : undefined,
  });
}

export const packedBed: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  if (!has(u, 'W')) return failResult('SPEC_MISSING', { param: 'W' }, { unitId: u.id });
  const o = bedOptions(u, ctx.species, ctx.thermoDetail);
  if (!o.ok) return o;
  const r = simulateBed({ ...o.value, inlet: s, W: num(u, 'W') });
  if (!r.ok) return { ...r, unitId: u.id };
  return okResult({ outlets: { out: r.value.out }, duty: r.value.duty, info: r.value.info }, r.diag.map((d) => ({ ...d, unitId: u.id })));
};

// ------------------------------------------------------------------------------------------------ textbook PFR helpers
/** Composite Simpson rule of g on [a, b] with n intervals (n made even). */
export function simpson(g: (x: number) => number, a: number, b: number, n = 400): number {
  const m = n % 2 === 0 ? n : n + 1, h = (b - a) / m;
  let sum = g(a) + g(b);
  for (let i = 1; i < m; i++) sum += g(a + i * h) * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3;
}
/** Simpson rule on equally spaced tabulated values (Levenspiel plot, odd number of points). */
export function simpsonTable(y: readonly number[], h: number): number {
  let sum = y[0]! + y[y.length - 1]!;
  for (let i = 1; i < y.length - 1; i++) sum += y[i]! * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3;
}
/** PFR volume from the design equation V = integral of FA0 / (-rA) dX; `perX(X)` = FA0 / (-rA(X)) (volume per unit conversion). */
export function pfrVolume(perX: (X: number) => number, X0: number, X1: number, n = 400): number { return simpson(perX, X0, X1, n); }
