// Rate laws (DESIGN 3.5, 4.3) and the textbook kinetics helpers (exam bridges). SI in, state units out:
//   packed-bed laws return the EXTENT rate of each catalogue reaction in mol/(kg_cat s); liquid laws mol/(m3 s).
// Rules (3.5): every reversible law uses the engine's own K(T) so r = 0 exactly at Q = K and sign(r) = sign(1 - Q/K); the
// catalyst multiplies the forward rate (activity a, per-volume multiplier kMult, light-off shift dTk) and never touches K.
// The optional concentration floor (seed for a feed with no product) is applied in the consistent form
//   p_floor = max(p, min(floor * p_ref, p_eq / 2))
// so it never lifts the state to or past equilibrium: r stays exactly 0 at Q = K and keeps its sign elsewhere. It is OFF unless `floor` is set.
import { backwardEulerStep, dmath, rk4Step } from '@core/numerics';
import { catalystOf, findCatalyst } from '../../data/catalysts';
import { lawOf } from '../../data/kinetics';
import type { RateLawRec } from '../../data/kinetics';
import { reactionOf } from '../../data/reactions';
import type { ThermoDetail, SimResult } from '../types';
import { lnKOfReaction } from './reactions';
import type { BookData } from './reactions';

const ATM_PA = 101325;
const ATM_BAR = 1.01325;

// ---------------------------------------------------------------------------------------------------- Arrhenius
/** Classic k = A exp(-Ea / R T). */
export function arrhenius(A: number, Ea: number, T: number, R: number): number { return A * dmath.exp(-Ea / (R * T)); }
/** Reparameterised (stored) form k = kref exp(-Ea/R (1/T - 1/Tref)): no overflow for large A. */
export function arrheniusK(kref: number, Ea: number, T: number, Tref: number, R: number): number {
  return kref * dmath.exp((-Ea / R) * (1 / T - 1 / Tref));
}
/** Two-point activation energy, J/mol. */
export function arrheniusEa(k1: number, T1: number, k2: number, T2: number, R: number): number {
  return (R * dmath.log(k2 / k1)) / (1 / T1 - 1 / T2);
}
/** Pre-exponential from one point. */
export function arrheniusA(k: number, Ea: number, T: number, R: number): number { return k * dmath.exp(Ea / (R * T)); }
/** k(T2)/k(T1) for the same A and two activation energies at one T is arrheniusRatio(Ea1, Ea2, T, R) = k(Ea2)/k(Ea1). */
export function arrheniusRatio(Ea1: number, Ea2: number, T: number, R: number): number { return dmath.exp((Ea1 - Ea2) / (R * T)); }
/** Ea (J/mol, positive) from the slope of log10 k against 1/T (negative number, or its magnitude: the sign is ignored). */
export function arrheniusEaFromLog10Slope(slope: number, R: number): number { return Math.abs(slope) * Math.LN10 * R; }
/** Temperature at which k(T) = k for given A and Ea. */
export function tempForK(k: number, A: number, Ea: number, R: number): number { return Ea / (R * dmath.log(A / k)); }

// ---------------------------------------------------------------------------------------------------- first order
export function firstOrderK(tHalf: number): number { return Math.LN2 / tHalf; }
export function firstOrderHalfLife(k: number): number { return Math.LN2 / k; }
export function firstOrderRemaining(k: number, t: number): number { return dmath.exp(-k * t); }
/** Time for [A] to fall from A0 to A (or to `fraction` of itself); k or tHalf. */
export function firstOrderTime(p: { k?: number; tHalf?: number; A0?: number; A?: number; fraction?: number }): number {
  const k = p.k ?? (p.tHalf === undefined ? Number.NaN : firstOrderK(p.tHalf));
  const f = p.fraction ?? (p.A === undefined || p.A0 === undefined ? Number.NaN : p.A / p.A0);
  return dmath.log(1 / f) / k;
}

// ---------------------------------------------------------------------------------------------------- initial rates
/**
 * Orders from initial-rate runs: for each species, a pair of runs where only that species changes. k from the first run with the
 * orders rounded to the nearest half when within 0.05 of it (the exam convention); the orders themselves are returned unrounded.
 */
export function orderFromInitialRates(conc: Record<string, number[]>, rates: number[]): { orders: Record<string, number>; k: number } {
  const ids = Object.keys(conc);
  const orders: Record<string, number> = {};
  for (const s of ids) {
    orders[s] = Number.NaN;
    for (let i = 0; i < rates.length && Number.isNaN(orders[s]!); i++) {
      for (let j = i + 1; j < rates.length; j++) {
        const others = ids.filter((o) => o !== s).every((o) => conc[o]![i] === conc[o]![j]);
        if (others && conc[s]![i] !== conc[s]![j]) { orders[s] = dmath.log(rates[j]! / rates[i]!) / dmath.log(conc[s]![j]! / conc[s]![i]!); break; }
      }
    }
  }
  let k = rates[0]!;
  for (const s of ids) {
    const o = orders[s]!;
    const r = Math.round(o * 2) / 2;
    k /= dmath.pow(conc[s]![0]!, Math.abs(o - r) < 0.05 ? r : o);
  }
  return { orders, k };
}

// ---------------------------------------------------------------------------------------------------- rate laws
export interface RateState {
  speciesIds: string[];
  /** Molar flows (mol/s) or amounts: only the proportions matter for gas laws. */
  n?: number[];
  /** Mole fractions (alternative to n). */
  y?: number[];
  /** Concentrations, mol/m3, indexed by speciesIds (first-order liquid laws). */
  conc?: number[];
  T: number;
  /** Pa. */
  P: number;
  /** Catalyst activity a in (0, 1] (ageing, sintering, poisoning). Default 1. */
  activity?: number;
  /** Catalyst id: supplies kMult, dTk and rho_b (and the first-order variant); explicit options below override. */
  catalystId?: string;
  kMult?: number;
  dTk?: number;
  /** Bulk density kg/m3 for per-volume laws (K1). Default: the catalyst entry's. */
  rhoB?: number;
  /** Concentration floor in the consistent form (see file header). true = the law's floor. */
  floor?: boolean | number;
  detail?: ThermoDetail;
  book?: BookData;
}

interface Ctx { act: number; kMult: number; dTk: number; rhoB: number; variant: string }
function context(law: RateLawRec, st: RateState): Ctx {
  const cat = st.catalystId !== undefined ? findCatalyst(st.catalystId) : undefined;
  const ref = cat ?? (law.catalysts.length > 0 && law.variants === undefined ? catalystOf(law.catalysts[0]!) : undefined);
  return {
    act: st.activity ?? 1,
    kMult: st.kMult ?? cat?.kMult ?? 1,
    dTk: st.dTk ?? cat?.dTk ?? 0,
    rhoB: st.rhoB ?? ref?.rhoB ?? Number.NaN,
    variant: st.catalystId ?? 'none',
  };
}

function fractions(st: RateState): number[] {
  if (st.y !== undefined) return st.y.map((v) => Math.max(v, 0));
  const n = (st.n ?? []).map((v) => Math.max(v, 0));
  const t = n.reduce((a, b) => a + b, 0);
  return n.map((v) => (t > 0 ? v / t : 0));
}
function pick(st: RateState, y: number[], id: string | undefined): number {
  const i = id === undefined ? -1 : st.speciesIds.indexOf(id);
  return i < 0 ? 0 : y[i]!;
}
function floorFraction(st: RateState, law: RateLawRec): number {
  if (st.floor === undefined || st.floor === false) return 0;
  return st.floor === true ? law.params['floor']! : st.floor;
}
function lnKatm(law: RateLawRec, st: RateState): number {
  const rx = reactionOf(law.reactions[0]!);
  return lnKOfReaction(rx, st.T, st.detail ?? 'rigorous', st.book) - rx.dnGas * dmath.log(ATM_BAR);
}

function temkin(law: RateLawRec, st: RateState, c: Ctx): number[] {
  const p = law.params;
  const y = fractions(st);
  const pN = (pick(st, y, law.species['N2']) * st.P) / ATM_PA;
  const pH = (pick(st, y, law.species['H2']) * st.P) / ATM_PA;
  let pA = (pick(st, y, law.species['NH3']) * st.P) / ATM_PA;
  if (!(pN > 0) || !(pH > 0)) return [0];
  const Ka2 = dmath.exp(lnKatm(law, st));
  const fl = floorFraction(st, law);
  if (fl > 0) pA = Math.max(pA, Math.min(fl * pN, 0.5 * Math.sqrt(Ka2 * pN * pH * pH * pH)));
  if (!(pA > 0)) return [Number.NaN];
  const a = p['alpha']!;
  const k = arrheniusK(p['kref']!, p['Ea']!, st.T - c.dTk, p['Tref']!, p['R']!);
  const fwd = Ka2 * pN * dmath.pow((pH * pH * pH) / (pA * pA), a);
  const rev = dmath.pow((pA * pA) / (pH * pH * pH), 1 - a);
  const rNH3 = 2 * k * p['eta']! * (fwd - rev); // kmol NH3 / (m3_cat h)
  const xi = rNH3 / 2; // extent rate of N2 + 3 H2 -> 2 NH3
  return [(((xi * 1000) / 3600) / c.rhoB) * c.act * c.kMult]; // mol / (kg_cat s)
}

function eklund(law: RateLawRec, st: RateState, c: Ctx): number[] {
  const p = law.params;
  const y = fractions(st);
  const pS = (pick(st, y, law.species['SO2']) * st.P) / ATM_PA;
  const pO = (pick(st, y, law.species['O2']) * st.P) / ATM_PA;
  let pT = (pick(st, y, law.species['SO3']) * st.P) / ATM_PA;
  if (!(pS > 0) || !(pO > 0)) return [0];
  const Kp = dmath.exp(lnKatm(law, st));
  const fl = floorFraction(st, law);
  if (fl > 0) pT = Math.max(pT, Math.min(fl * pS, 0.5 * Kp * pS * Math.sqrt(pO)));
  if (!(pT > 0)) return [Number.NaN];
  const Te = st.T - c.dTk;
  const k = dmath.exp(-p['b']! / Te - p['c']! * dmath.log(1.8 * Te) + p['d']!);
  const q = pT / (pS * Kp);
  const r = k * Math.sqrt(pS / pT) * (pO - q * q); // mol SO2 / (s g_cat)
  return [r * 1000 * c.act * c.kMult]; // mol / (kg_cat s)
}

function firstOrder(law: RateLawRec, st: RateState, c: Ctx): number[] {
  const p = law.params;
  const i = st.speciesIds.indexOf(law.species['A']!);
  const C = st.conc === undefined || i < 0 ? Number.NaN : st.conc[i]!;
  let k: number;
  if (law.variants !== undefined) {
    const v = law.variants.find((x) => x.catalyst === c.variant) ?? law.variants.find((x) => x.catalyst === 'none')!;
    k = arrheniusK(v.kref, v.Ea, st.T - c.dTk, p['Tref']!, p['R']!);
  } else k = arrheniusK(p['kref']!, p['Ea']!, st.T - c.dTk, p['Tref']!, p['R']!);
  return [k * C * c.act * c.kMult]; // mol / (m3 s)
}


const BAR_PA = 1e5;
/**
 * K3, Vanden Bussche & Froment (1996): CO2 hydrogenation to methanol (R4) and the reverse water-gas shift, p in bar, mol/(kg_cat s).
 * Both reversible factors use the engine's own K(T) of R4 and R5 (rule above). Returns the extents of [R4, R5] as the catalogue
 * writes them: R5 is CO + H2O -> CO2 + H2, so its extent rate is minus the RWGS rate of the paper.
 */
function vbf(law: RateLawRec, st: RateState, c: Ctx): number[] {
  const p = law.params;
  const y = fractions(st), T = st.T - c.dTk, R = p['R']!;
  const fl = p['pfloor']!;
  const q = (id: string): number => Math.max((pick(st, y, law.species[id]) * st.P) / BAR_PA, fl);
  const pCO = q('CO'), pCO2 = q('CO2'), pH2 = q('H2'), pW = q('H2O'), pM = q('MeOH');
  if (!(pick(st, y, law.species['H2']) > 0) || !(pick(st, y, law.species['CO2']) + pick(st, y, law.species['CO']) > 0)) return [0, 0];
  const sK = p['sKH2_a']! * dmath.exp(p['sKH2_b']! / (R * T)), KW = p['KH2O_a']! * dmath.exp(p['KH2O_b']! / (R * T));
  const beta = 1 + (p['KWr']! * pW) / pH2 + sK * Math.sqrt(pH2) + KW * pW;
  const k5 = p['k5_a']! * dmath.exp(p['k5_b']! / (R * T)), k1 = p['k1_a']! * dmath.exp(-p['k1_b']! / (R * T));
  const K4 = dmath.exp(lnKOfReaction(reactionOf(law.reactions[0]!), st.T, st.detail ?? 'rigorous', st.book));
  const Kwgs = dmath.exp(lnKOfReaction(reactionOf(law.reactions[1]!), st.T, st.detail ?? 'rigorous', st.book));
  const rM = (k5 * pCO2 * pH2 * (1 - (pW * pM) / (K4 * pH2 * pH2 * pH2 * pCO2))) / (beta * beta * beta);
  const rW = (k1 * pCO2 * (1 - (Kwgs * pW * pCO) / (pCO2 * pH2))) / beta;
  return [rM * c.act * c.kMult, -rW * c.act * c.kMult];
}

/**
 * Luong batch fermentation (K8) at one state: biomass X, glucose S, ethanol P in g/L, temperature in K. Returns dX/dt, dS/dt, dP/dt in g/(L h).
 * mu = mu_max f(T) S/(Ks + S + S^2/Ki) (1 - P/Pm)^n; maintenance qm = mS f(T) S/(Ks+S) (1 - P/Pm2)^n2; growth and maintenance draw glucose
 * (mu/Yxs + qm) X, ethanol Yps of it; heat death kd(T) above 32 C. f is the Rosso cardinal temperature factor.
 */
export function luongRates(lawId: string, X: number, S: number, P: number, T: number): [number, number, number] {
  const p = lawOf(lawId).params;
  const f = cardinalT(T, p['Tmin']!, p['Topt']!, p['Tmax']!);
  const s = Math.max(S, 0);
  const inhib = (v: number, Pm: number, n: number): number => dmath.pow(Math.max(1 - v / Pm, 0), n);
  const mu = p['mu_max']! * f * s / (p['Ks']! + s + (s * s) / p['Ki']!) * inhib(P, p['Pm']!, p['n']!);
  const qm = p['mS']! * f * s / (p['Ks']! + s) * inhib(P, p['Pm2']!, p['n2']!);
  const rs = (mu / p['Yxs']! + qm) * X;
  return [(mu - deathRate(lawId, T)) * X, -rs, p['Yps']! * rs];
}
/** Rosso cardinal temperature factor (0 outside (Tmin, Tmax), 1 at Topt). */
export function cardinalT(T: number, Tmin: number, Topt: number, Tmax: number): number {
  if (T <= Tmin || T >= Tmax) return 0;
  const num = (T - Tmax) * (T - Tmin) * (T - Tmin);
  const den = (Topt - Tmin) * ((Topt - Tmin) * (T - Topt) - (Topt - Tmax) * (Topt + Tmin - 2 * T));
  return num / den;
}
/** Heat-death rate of the yeast, 1/h: Arrhenius from kd(40 C) above 32 C. */
export function deathRate(lawId: string, T: number): number {
  const p = lawOf(lawId).params;
  return T > 305.15 ? p['kd40']! * dmath.exp((p['Ed']! / p['R']!) * (1 / 313.15 - 1 / T)) : 0;
}

/**
 * Rate of each reaction of the law (extent rate, state units). Stretch-tier stub laws return NaN for every reaction.
 * Gas laws need n or y (and P, T); first-order laws need conc.
 */
export function rate(lawId: string, st: RateState): number[] {
  const law = lawOf(lawId);
  const c = context(law, st);
  switch (law.form) {
    case 'temkin': return temkin(law, st, c);
    case 'eklund': return eklund(law, st, c);
    case 'vbf': return vbf(law, st, c);
    case 'first_order':
    case 'cstr_arrhenius': return firstOrder(law, st, c);
    default: return law.reactions.map(() => Number.NaN);
  }
}

// ---------------------------------------------------------------------------------------------------- isothermal PFR
export interface IsothermalIn extends Omit<RateState, 'n' | 'y' | 'conc'> {
  /** Feed molar flows, mol/s, indexed by speciesIds. */
  n0: number[];
  /** Catalyst mass, kg. */
  W: number;
  rtol?: number;
}
export interface IsothermalOut { n: number[]; xi: number[]; evals: number; switchedImplicit: boolean }

/**
 * Isothermal plug flow over catalyst mass W: d(xi_j)/dW = rate_j(n(xi), T, P). RK4 with step doubling; backward Euler when the
 * step collapses below W/1e4 (stiff, near equilibrium). The adiabatic bed with the energy balance is the packed-bed unit (M1.7).
 */
export function isothermalConversion(lawId: string, inp: IsothermalIn): SimResult<IsothermalOut> {
  const law = lawOf(lawId);
  if (law.form !== 'temkin' && law.form !== 'eklund' && law.form !== 'vbf') return { ok: false, code: 'NOT_PFR_LAW', data: { law: lawId }, diag: [] };
  const rxs = law.reactions.map((id) => reactionOf(id));
  const ids = inp.speciesIds;
  const nOf = (xi: number[]) => ids.map((id, i) => inp.n0[i]! + rxs.reduce((a, r, j) => a + (r.nu[id] ?? 0) * xi[j]!, 0));
  const st = { speciesIds: ids, T: inp.T, P: inp.P, activity: inp.activity, catalystId: inp.catalystId, kMult: inp.kMult, dTk: inp.dTk, rhoB: inp.rhoB, floor: inp.floor, detail: inp.detail, book: inp.book };
  let evals = 0;
  const f = (_w: number, xi: number[]): number[] => { evals++; return rate(lawId, { ...st, n: nOf(xi) }); };
  const F0 = inp.n0.reduce((a, b) => a + b, 0);
  const rtol = inp.rtol ?? 1e-9;
  const W = inp.W;
  let w = 0;
  let xi = law.reactions.map(() => 0);
  let h = W / 50;
  let implicit = false;
  let guard = 0;
  while (w < W * (1 - 1e-14)) {
    if (++guard > 200000) return { ok: false, code: 'BED_STEPS', data: { w }, diag: [] };
    h = Math.min(h, W - w);
    if (implicit) {
      try { xi = backwardEulerStep(f, w, xi, h); } catch { return { ok: false, code: 'BED_NEWTON', data: { w }, diag: [] }; }
      w += h;
      continue;
    }
    const y1 = rk4Step(f, w, xi, h);
    const yh = rk4Step(f, w, xi, h / 2);
    const y2 = rk4Step(f, w + h / 2, yh, h / 2);
    let err = 0;
    for (let j = 0; j < xi.length; j++) err = Math.max(err, Math.abs(y2[j]! - y1[j]!) / (rtol * Math.max(Math.abs(y2[j]!), 1e-6 * F0) + 1e-15));
    if (!Number.isFinite(err)) return { ok: false, code: 'BED_NONFINITE', data: { w }, diag: [] };
    if (err <= 1) {
      xi = y2.map((v, j) => v + (v - y1[j]!) / 15);
      w += h;
      h *= Math.min(2, 0.9 * dmath.pow(1 / Math.max(err, 1e-10), 0.2));
    } else {
      h *= Math.max(0.2, 0.9 * dmath.pow(1 / err, 0.2));
      if (h < W * 1e-4) { implicit = true; h = (W - w) / 2000; }
    }
  }
  return { ok: true, value: { n: nOf(xi), xi, evals, switchedImplicit: implicit }, diag: [] };
}

/** Isothermal conversion of the key reactant over a temperature list (the light-off curve). */
export function lightOffCurve(lawId: string, inp: Omit<IsothermalIn, 'T'>, Ts: number[], keyIndex: number): number[] {
  return Ts.map((T) => {
    const r = isothermalConversion(lawId, { ...inp, T });
    return r.ok ? 1 - r.value.n[keyIndex]! / inp.n0[keyIndex]! : Number.NaN;
  });
}
