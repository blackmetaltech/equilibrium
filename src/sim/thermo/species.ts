// Per-species thermodynamic evaluators compiled once from the catalogue (src/data/species.ts).
// SI: J/mol, J/(mol K), K, Pa. h is on the heat-of-formation basis (DESIGN 3.3):
//     h(T) = dHf298 + [H_poly(T) - H_poly(298.15)],   s(T) = S_poly(T)  (standard state 1 bar),  g = h - T s.
// Outside the polynomial range Cp is extrapolated linearly from the boundary (slope = dCp/dT at the boundary, floored at
// 25 % of the boundary Cp so it can never reach zero) and callers may report PROPERTY_EXTRAPOLATED (info).
// Liquids without a polynomial (NH3(l)): h_l = h_g - dHvap(T) with Watson (exponent 0.38), s_l from phase equilibrium
// at Tb and the integral of Cp_l/T, so dh/dT = Cp and ds/dT = Cp/T hold exactly for the liquid too.
import { dmath } from '@core/numerics';
import type { Diag } from '../types';
import { SPECIES, SPECIES_IDS, T_REF, R_GAS } from '../../data/species';
import { KIND_CONSTCP, KIND_NASA7, KIND_SHOMATE, segCp, segDcp, segH, segS } from './shomate';

export { T_REF };

export const WATSON_EXPONENT = 0.38;
/** Atmosphere in bar: the normal boiling point refers to 1 atm, the standard state to 1 bar. */
const ATM_BAR = 1.01325;
/** Fraction of the boundary Cp below which extrapolated Cp is not allowed to fall. */
const CP_FLOOR = 0.25;
/** Watson liquids are modelled from this fraction of Tb up to 1 K below Tc. */
const WATSON_TLO = 0.8;

export const GROUP_GAS = 0, GROUP_LIQUID = 1, GROUP_SOLID = 2;

/** Compiled species. Plain data, immutable after construction. */
export interface Thermo {
  id: string;
  /** kg/mol. */
  M: number;
  group: number;
  /** J/mol. */
  dHf: number;
  /** Polynomial H at 298.15 K of the reference segment (J/mol, absolute basis). */
  hRef: number;
  n: number;
  Tlo: number[];
  Thi: number[];
  kind: number[];
  coef: (readonly number[])[];
  /** Valid range, K. */
  Tmin: number;
  Tmax: number;
  Tb: number;
  Tc: number;
  /** J/mol at Tb. */
  dHvapTb: number;
  /** Watson liquid: the gas it is derived from. */
  gas: Thermo | null;
}

const KIND_CODE: Record<string, number> = { shomate: KIND_SHOMATE, nasa7: KIND_NASA7, constcp: KIND_CONSTCP };

function compile(): Record<string, Thermo> {
  const out: Record<string, Thermo> = {};
  // gases first so Watson liquids can link to them
  const order = [...SPECIES_IDS].sort((a, b) => Number(SPECIES[a]!.liquidOf !== undefined) - Number(SPECIES[b]!.liquidOf !== undefined));
  for (const id of order) {
    const s = SPECIES[id]!;
    if (!s.hasThermo) continue;
    const n = s.segments.length;
    const t: Thermo = {
      id, M: s.M / 1000, group: s.phase === 'g' ? GROUP_GAS : s.phase === 'l' || s.phase === 'aq' ? GROUP_LIQUID : GROUP_SOLID,
      dHf: (s.dHf298 ?? 0) * 1000, hRef: 0, n,
      Tlo: s.segments.map((x) => x.Tlo), Thi: s.segments.map((x) => x.Thi), kind: s.segments.map((x) => KIND_CODE[x.kind]!),
      coef: s.segments.map((x) => x.coef), Tmin: n ? s.segments[0]!.Tlo : 0, Tmax: n ? s.segments[n - 1]!.Thi : 0,
      Tb: s.Tb ?? Number.NaN, Tc: s.Tc ?? Number.NaN, dHvapTb: s.dHvapTb ?? Number.NaN, gas: null,
    };
    if (n > 0) {
      let found = false;
      for (let i = 0; i < n; i++) {
        if (T_REF >= t.Tlo[i]! && T_REF <= t.Thi[i]!) { t.hRef = segH(t.kind[i]!, t.coef[i]!, T_REF); found = true; break; }
      }
      if (!found) throw new Error('no segment at 298.15 K: ' + id);
    } else if (s.liquidOf !== undefined) {
      t.gas = out[s.liquidOf]!;
      t.Tmin = WATSON_TLO * t.Tb;
      t.Tmax = t.Tc - 1;
    } else throw new Error('species without thermo source: ' + id);
    out[id] = t;
  }
  return out;
}

/** Compiled species by id (only species with thermo data). */
export const THERMO: Readonly<Record<string, Thermo>> = compile();

export function hasThermo(id: string): boolean { return Object.prototype.hasOwnProperty.call(THERMO, id); }
export function thermoOf(id: string): Thermo {
  if (!hasThermo(id)) throw new Error('no thermo data for species: ' + id);
  return THERMO[id]!;
}

// ------------------------------------------------------------------------------------------ segment lookup
/** -1 below the range, n above, else the segment index with Tlo <= T < Thi (the top end belongs to the last segment). */
function segIndex(t: Thermo, T: number): number {
  const n = t.n;
  if (T < t.Tlo[0]!) return -1;
  for (let i = 0; i < n; i++) if (T < t.Thi[i]!) return i;
  return T === t.Thi[n - 1]! ? n - 1 : n;
}

/** True when T lies outside the polynomial (or, for Watson liquids, the model) range. */
export function isExtrapolated(t: Thermo, T: number): boolean { return T < t.Tmin || T > t.Tmax; }

// ------------------------------------------------------------------------------------------ extrapolation
function extrapCp(t: Thermo, T: number): number {
  const low = T < t.Tlo[0]!;
  const i = low ? 0 : t.n - 1, Tb = low ? t.Tlo[0]! : t.Thi[t.n - 1]!;
  const cpb = segCp(t.kind[i]!, t.coef[i]!, Tb), k = segDcp(t.kind[i]!, t.coef[i]!, Tb);
  const cp = cpb + k * (T - Tb), cmin = CP_FLOOR * cpb;
  return cp < cmin ? cmin : cp;
}
/** Linear-limit offset uc (|uc| <= |u|) where the linear Cp would hit the floor. */
function extrapParts(t: Thermo, T: number, o: { Tb: number; i: number; cpb: number; k: number; uc: number }): void {
  const low = T < t.Tlo[0]!;
  const i = low ? 0 : t.n - 1, Tb = low ? t.Tlo[0]! : t.Thi[t.n - 1]!;
  const cpb = segCp(t.kind[i]!, t.coef[i]!, Tb), k = segDcp(t.kind[i]!, t.coef[i]!, Tb);
  const u = T - Tb, cmin = CP_FLOOR * cpb;
  o.Tb = Tb; o.i = i; o.cpb = cpb; o.k = k;
  o.uc = cpb + k * u < cmin ? (cmin - cpb) / k : u;
}
function extrapH(t: Thermo, T: number): number {
  const o = { Tb: 0, i: 0, cpb: 0, k: 0, uc: 0 };
  extrapParts(t, T, o);
  const hb = segH(t.kind[o.i]!, t.coef[o.i]!, o.Tb) - t.hRef + t.dHf;
  return hb + o.cpb * o.uc + 0.5 * o.k * o.uc * o.uc + CP_FLOOR * o.cpb * (T - o.Tb - o.uc);
}
function extrapS(t: Thermo, T: number): number {
  const o = { Tb: 0, i: 0, cpb: 0, k: 0, uc: 0 };
  extrapParts(t, T, o);
  const sb = segS(t.kind[o.i]!, t.coef[o.i]!, o.Tb);
  return sb + o.k * o.uc + (o.cpb - o.k * o.Tb) * dmath.log((o.Tb + o.uc) / o.Tb) + CP_FLOOR * o.cpb * dmath.log(T / (o.Tb + o.uc));
}

// ------------------------------------------------------------------------------------------ Watson liquids
/** dHvap(T), J/mol: dHvap(Tb) ((Tc - T)/(Tc - Tb))^0.38, zero at and above Tc. NaN when the species has no Tc/Tb/dHvap. */
export function dHvapOf(t: Thermo, T: number): number {
  const g = t.gas ?? t;
  if (T >= g.Tc) return 0;
  return g.dHvapTb * dmath.pow((g.Tc - T) / (g.Tc - g.Tb), WATSON_EXPONENT);
}

// 8-point Gauss-Legendre on [-1, 1]
const GLX = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GLW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/** Q(T) = integral over tau in [Tb, T] of 0.38 dHvap(tau)/((Tc - tau) tau), via w = (Tc - tau)^0.38 (smooth in w). */
function watsonQ(g: Thermo, T: number): number {
  const wb = dmath.pow(g.Tc - g.Tb, WATSON_EXPONENT), wT = dmath.pow(g.Tc - T, WATSON_EXPONENT);
  const C = g.dHvapTb / wb;
  const mid = 0.5 * (wT + wb), half = 0.5 * (wb - wT);
  let sum = 0;
  for (let j = 0; j < 8; j++) {
    const w = mid + half * GLX[j]!;
    sum += GLW[j]! / (g.Tc - dmath.pow(w, 1 / WATSON_EXPONENT));
  }
  return C * half * sum;
}
function watsonTc(t: Thermo): number { return t.gas!.Tc - 1; }

function wCp(t: Thermo, T: number): number {
  const g = t.gas!;
  if (T > watsonTc(t)) return cpOf(g, T);
  return cpOf(g, T) + (WATSON_EXPONENT * dHvapOf(g, T)) / (g.Tc - T);
}
function wH(t: Thermo, T: number): number {
  const g = t.gas!, Tcl = watsonTc(t);
  if (T > Tcl) return wH(t, Tcl) + hOf(g, T) - hOf(g, Tcl);
  return hOf(g, T) - dHvapOf(g, T);
}
function wS(t: Thermo, T: number): number {
  const g = t.gas!, Tcl = watsonTc(t);
  if (T > Tcl) return wS(t, Tcl) + sOf(g, T) - sOf(g, Tcl);
  return sOf(g, T) - R_GAS * dmath.log(ATM_BAR) - g.dHvapTb / g.Tb + watsonQ(g, T);
}

// ------------------------------------------------------------------------------------------ public evaluators
/** Molar heat capacity, J/(mol K). */
export function cpOf(t: Thermo, T: number): number {
  if (t.gas !== null) return wCp(t, T);
  const i = segIndex(t, T);
  if (i < 0 || i >= t.n) return extrapCp(t, T);
  return segCp(t.kind[i]!, t.coef[i]!, T);
}
/** Molar enthalpy on the heat-of-formation basis, J/mol. */
export function hOf(t: Thermo, T: number): number {
  if (t.gas !== null) return wH(t, T);
  const i = segIndex(t, T);
  if (i < 0 || i >= t.n) return extrapH(t, T);
  return t.dHf + segH(t.kind[i]!, t.coef[i]!, T) - t.hRef;
}
/** Standard molar entropy (1 bar), J/(mol K). */
export function sOf(t: Thermo, T: number): number {
  if (t.gas !== null) return wS(t, T);
  const i = segIndex(t, T);
  if (i < 0 || i >= t.n) return extrapS(t, T);
  return segS(t.kind[i]!, t.coef[i]!, T);
}
/** Standard molar Gibbs energy g = h - T s, J/mol. */
export function gOf(t: Thermo, T: number): number { return hOf(t, T) - T * sOf(t, T); }

/** cp, h, s together into `out` (one segment lookup). */
export function eval3(t: Thermo, T: number, out: number[]): void {
  if (t.gas !== null) { out[0] = wCp(t, T); out[1] = wH(t, T); out[2] = wS(t, T); return; }
  const i = segIndex(t, T);
  if (i < 0 || i >= t.n) { out[0] = extrapCp(t, T); out[1] = extrapH(t, T); out[2] = extrapS(t, T); return; }
  const k = t.kind[i]!, c = t.coef[i]!;
  out[0] = segCp(k, c, T);
  out[1] = t.dHf + segH(k, c, T) - t.hRef;
  out[2] = segS(k, c, T);
}

/** PROPERTY_EXTRAPOLATED (info) when T is outside the species' valid range, else null. */
export function extrapolationDiag(id: string, T: number): Diag | null {
  const t = thermoOf(id);
  if (!isExtrapolated(t, T)) return null;
  return { code: 'PROPERTY_EXTRAPOLATED', severity: 'info', species: id, data: { T, Tlo: t.Tmin, Thi: t.Tmax } };
}
