// Nitric acid chain (DESIGN L26): gauze burner (K9 selectivity), tertiary N2O abater, fixed-recovery HNO3 absorber, and the NH3-air flammable envelope.
// Gauze: 4 NH3 + 5 O2 -> 4 NO + 6 H2O (R7), 4 NH3 + 3 O2 -> 2 N2 + 6 H2O (R7b), 4 NH3 + 4 O2 -> 2 N2O + 6 H2O (R7c) with the selectivities of K9: the NO yield of the
// pressure band of the EU BREF (Table 3.2: <1.7 bar 810-850 C 97 %, <6.5 bar 850-900 C 96 %, above 900-940 C 95 %; generated into data/vle.gen.ts), 5 points less per 50 K
// below the band (GAME, docs/research/kinetics.md section 5 suggestion), N2O 1.8 % of the ammonia nitrogen in the band (BREF 6-7.5 kg/t at medium pressure) and 2 points
// more per 50 K below it, N2 takes the rest. The gauze is mass-transfer limited, so ammonia is burnt completely and only the exit temperature (adiabatic, solved against the
// selectivity) matters. EXPLOSIVE_MIXTURE when the inlet is inside the ICI NH3-air envelope at the inlet temperature (interpolated linearly in T; no pressure effect).
// Params: gauze_burner: dP (Pa). n2o_abater: X (fraction of N2O decomposed to N2 + 1/2 O2, default 0.85: BREF Co3O4 beds 80-90 %). hno3_absorber: recovery (default 0.99), acid
// (mass fraction, 0.55-0.68, default 0.60), T (outlet K, default 313.15).
import { brent } from '@core/numerics';
import { FLAMM_NH3, OSTWALD_BANDS } from '../../data/vle';
import { SPECIES } from '../../data/species';
import { enthalpyFlow, enthalpyFlowAt, makeMixture, solveT, totalFlow } from '../thermo';
import { THERMO, hOf } from '../thermo/species';
import type { Diag, SimCtx, StreamState, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, num } from './utilities';

/** Cold-gauze penalties per 50 K below the band (GAME): NO selectivity and the N2O share rise. */
const COLD_NO_PER_50K = 0.05, COLD_N2O_PER_50K = 0.02;
/** N2O share of the ammonia nitrogen inside the band (GAME, set so medium-pressure plants give the BREF 6-7.5 kg N2O per t HNO3). */
const N2O_BAND = 0.018;

/** NH3-air flammable limits (vol %) at Tc (deg C), linear in T between the ICI points and extended with the last slope. */
export function nh3Envelope(Tc: number): { lfl: number; ufl: number } {
  const p = FLAMM_NH3;
  const i = Tc <= p[1]!.T_C ? 0 : 1;
  const a = p[i]!, b = p[i + 1]!, f = (Tc - a.T_C) / (b.T_C - a.T_C);
  const lfl = Math.max(5, a.lfl + (b.lfl - a.lfl) * f);
  return { lfl: Tc === 20 ? p[0]!.lfl : lfl, ufl: Tc === 20 ? p[0]!.ufl : a.ufl + (b.ufl - a.ufl) * f };
}

export interface Selectivity { no: number; n2o: number; n2: number; band: { Tlo_C: number; Thi_C: number } }
/** Selectivities of the ammonia nitrogen over the gauze at pressure P (Pa) and exit temperature T (K). */
export function noSelectivity(P: number, T: number): Selectivity {
  const bar = P / 1e5, Tc = T - 273.15;
  const band = OSTWALD_BANDS.find((b) => bar < b.Pmax_bar) ?? OSTWALD_BANDS[OSTWALD_BANDS.length - 1]!;
  const cold = Math.max(0, band.Tlo_C - Tc) / 50;
  const no = Math.max(0.3, band.S_NO - COLD_NO_PER_50K * cold);
  const n2o = Math.min(1 - no, N2O_BAND + COLD_N2O_PER_50K * cold);
  return { no, n2o, n2: 1 - no - n2o, band: { Tlo_C: band.Tlo_C, Thi_C: band.Thi_C } };
}

const MW_N2O = SPECIES['N2O']!.M, MW_HNO3 = SPECIES['HNO3']?.M ?? 63.0128;
const idx = (ctx: SimCtx, id: string): number => ctx.species.indexOf(id);

export const gauzeBurner: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const I = Object.fromEntries(['NH3', 'O2', 'N2', 'NO', 'N2O', 'H2O'].map((id) => [id, idx(ctx, id)])) as Record<string, number>;
  for (const id of Object.keys(I)) if (I[id]! < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: id });
  const P = s.P - num(u, 'dP', 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  const tot = totalFlow(s.n), nA = s.n[I.NH3!]!;
  if (!(tot > 0) || !(nA > 0)) return okResult({ outlets: { out: { n: s.n.slice(), T: s.T, P } }, duty: 0, info: { T_out: s.T, s_no: 0, nh3_conv: 0, n2o_kg_per_t: 0, y_nh3: 0 } });
  const y = (nA / tot) * 100, env = nh3Envelope(s.T - 273.15);
  if (y >= env.lfl && y <= env.ufl) return failResult('EXPLOSIVE_MIXTURE', { y, lfl: env.lfl, ufl: env.ufl, T: s.T }, { unitId: u.id });
  const mx = makeMixture(ctx.species);
  const outAt = (T: number): { n: number[]; sel: Selectivity; o2: number } => {
    const sel = noSelectivity(P, T), n = s.n.slice();
    const o2 = nA * (1.25 * sel.no + 0.75 * sel.n2 + 1.0 * sel.n2o);
    n[I.NH3!] = 0; n[I.O2!] = n[I.O2!]! - o2; n[I.NO!] = n[I.NO!]! + nA * sel.no; n[I.N2!] = n[I.N2!]! + (nA * sel.n2) / 2; n[I.N2O!] = n[I.N2O!]! + (nA * sel.n2o) / 2; n[I.H2O!] = n[I.H2O!]! + 1.5 * nA;
    return { n, sel, o2 };
  };
  const need = outAt(s.T + 400).o2;
  if (s.n[I.O2!]! < need - 1e-12) return failResult('INSUFFICIENT_O2', { needed: need, have: s.n[I.O2!]! }, { unitId: u.id });
  const Hin = enthalpyFlowAt(mx, s.n, s.T);
  const gT = (T: number): number => { const o = outAt(T); return enthalpyFlowAt(mx, o.n, T) - Hin; };
  let T: number;
  try { T = brent(gT, s.T, 3500, { tol: 1e-9 }).x; } catch { return failResult('NUMERIC_GUARD', { T: s.T }, { unitId: u.id }); }
  const o = outAt(T);
  const nNO = nA * o.sel.no, nN2O = (nA * o.sel.n2o) / 2;
  const diag: Diag[] = [];
  if (T - 273.15 < o.sel.band.Tlo_C) diag.push({ code: 'GAUZE_COLD', severity: 'warn', unitId: u.id, data: { T, Tmin: o.sel.band.Tlo_C + 273.15 } });
  return okResult({ outlets: { out: { n: o.n, T, P } }, duty: enthalpyFlowAt(mx, o.n, T) - Hin, info: {
    T_out: T, T_in: s.T, T_K: T, s_no: o.sel.no, s_n2o: o.sel.n2o, s_n2: o.sel.n2, nh3_conv: 1, y_nh3: y, lfl: env.lfl, ufl: env.ufl, no_mol_s: nNO, n2o_mol_s: nN2O,
    n2o_kg_per_t: nNO > 0 ? ((nN2O * MW_N2O) / (nNO * MW_HNO3)) * 1000 : 0, band_lo: o.sel.band.Tlo_C + 273.15, band_hi: o.sel.band.Thi_C + 273.15,
  } }, diag);
};

export const n2oAbater: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const X = num(u, 'X', 0.85);
  if (!(X >= 0 && X <= 0.98)) return failResult('SPEC_RANGE', { X, max: 0.98 }, { unitId: u.id });
  const iN = idx(ctx, 'N2O'), i2 = idx(ctx, 'N2'), iO = idx(ctx, 'O2');
  for (const [i, id] of [[iN, 'N2O'], [i2, 'N2'], [iO, 'O2']] as const) if (i < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: id });
  const P = s.P - num(u, 'dP', 0);
  const mx = makeMixture(ctx.species), n = s.n.slice(), k = X * n[iN]!;
  n[iN] = n[iN]! - k; n[i2] = n[i2]! + k; n[iO] = n[iO]! + k / 2;
  const Hin = enthalpyFlowAt(mx, s.n, s.T);
  let T = s.T;
  if (totalFlow(s.n) > 0) { const t = solveT(mx, Hin, n); if (!t.ok) return failResult(t.code, t.data, { unitId: u.id }); T = t.value; }
  return okResult({ outlets: { out: { n, T, P } }, duty: 0, info: { n2o_removed_pct: X * 100, n2o_removed_mol_s: k, T_out: T, dT: T - s.T } });
};

export const hno3Absorber: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const iNO = idx(ctx, 'NO'), iN2 = idx(ctx, 'NO2'), iO = idx(ctx, 'O2'), iA = idx(ctx, 'HNO3(l)'), iW = idx(ctx, 'H2O(l)');
  for (const [i, id] of [[iNO, 'NO'], [iN2, 'NO2'], [iO, 'O2'], [iA, 'HNO3(l)'], [iW, 'H2O(l)']] as const) if (i < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: id });
  const rec = num(u, 'recovery', 0.99), w = num(u, 'acid', 0.6), T = num(u, 'T', 313.15);
  if (!(rec >= 0 && rec <= 0.9995)) return failResult('SPEC_RANGE', { recovery: rec, max: 0.9995 }, { unitId: u.id });
  if (!(w >= 0.55 && w <= 0.68)) return failResult('SPEC_RANGE', { acid: w, min: 0.55, max: 0.68 }, { unitId: u.id });
  const P = s.P - num(u, 'dP', 0);
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  const aNO = rec * s.n[iNO]!, aNO2 = rec * s.n[iN2]!, nAcid = aNO + aNO2;
  const o2 = 0.75 * aNO + 0.25 * aNO2;
  if (o2 > s.n[iO]! + 1e-12) return failResult('INSUFFICIENT_O2', { needed: o2, have: s.n[iO]! }, { unitId: u.id });
  const Mw = SPECIES['H2O(l)']!.M, nWa = (nAcid * MW_HNO3 * (1 - w)) / (w * Mw), nWmake = 0.5 * nAcid + nWa;
  const gas = s.n.slice(); gas[iNO] = gas[iNO]! - aNO; gas[iN2] = gas[iN2]! - aNO2; gas[iO] = gas[iO]! - o2;
  const acid = new Array<number>(s.n.length).fill(0); acid[iA] = nAcid; acid[iW] = nWa;
  const mx = makeMixture(ctx.species), gasOut = { n: gas, T, P }, acidOut = { n: acid, T, P };
  const Hin = enthalpyFlow(mx, s) + nWmake * hOf(THERMO['H2O(l)']!, 298.15);
  const Q = totalFlow(s.n) > 0 || nWmake > 0 ? enthalpyFlow(mx, gasOut) + enthalpyFlow(mx, acidOut) - Hin : 0;
  const acidKg = (nAcid * MW_HNO3) / w / 1000;
  return okResult({ outlets: { out: gasOut, acid: acidOut }, duty: Q, info: {
    absorbed_mol_s: nAcid, recovery: rec, Q, o2_used_mol_s: o2, water_makeup_mol_s: nWmake, water_makeup_kg_s: (nWmake * Mw) / 1000, acid_kg_s: acidKg, acid_t_h: acidKg * 3.6, hno3_kg_s: (nAcid * MW_HNO3) / 1000, T, nox_out_mol_s: gas[iNO]! + gas[iN2]!,
  } });
};
