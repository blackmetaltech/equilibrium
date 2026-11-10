// Fermenter (DESIGN 3.5, L23): a batch of yeast on a glucose charge, K8 (Luong product inhibition x Monod with substrate inhibition x Rosso cardinal
// temperature, heat death above 32 C; data/kinetics.gen.ts from docs/research/kinetics_ferment.py). The charge is the inlet stream (its composition sets the
// glucose concentration in g/L), held at T for `time` with a cooling coil, then discharged: broth out, CO2 off-gas on the dome (vap).
// Integration: X, S, P in g/L over the batch time (adaptive RK4, odeAt). Bookkeeping: ethanol made = delta P; the glucose behind it is delta P / 0.5114
// (stoichiometric R12); the part of the glucose consumed for cell growth and maintenance (about a tenth) is not tracked as cell mass, it stays on the
// glucose line of the broth (residual sugar and cells, carbon-counted), so the atom ledger closes. info.conv reports the glucose actually consumed.
// Failure: YEAST_KILLED {T, X, X0} when the viable biomass is below a tenth of the pitch at the end of the batch (45 C in 22 h; 42 C only stalls).
// Params: T (K, default the inlet T), time (s), law (default K8), X0 (g/L pitch, default 1), key (glucose species).
// Info: X_gL, S_gL, P_gL, conv (glucose consumed), eth_mol_s, co2_mol_s, Q_rxn_W (heat released by the fermentation), cw_duty_W (coil load), vol_L_s, sizing vol_m3
//   (charge volume per hour of batch x 1.25), batch_h, and display numbers level, gas, spin (0-1), T_K, plus the trajectory p<i>_t/X/S/P (<= 24 points).
import { findReaction } from '../../data/reactions';
import { SPECIES } from '../../data/species';
import { luongRates } from '../chem/kinetics';
import { rxnDH } from '../chem/reactions';
import { enthalpyFlowAt, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { odeAt } from './rx_batch';
import { guardInlets, has, num, str } from './utilities';

/** Density of the water and of dissolved glucose (apparent), kg/L: the charge volume is the sum of the two (GAME; sugar solutions at 15-20 wt %). */
const RHO_W = 0.998, RHO_G = 1.56;
const M_GLC = SPECIES['C6H12O6']!.M, M_EOH = SPECIES['C2H5OH']!.M, M_W = SPECIES['H2O']!.M;
const NPROF = 24;

/** Mole fractions {glucose, water} of a charge that holds `gPerL` grams of glucose per litre of solution. */
export function glucoseFeed(gPerL: number): { glucose: number; water: number } {
  const mGlc = gPerL / 1000;                      // kg per litre of solution
  const mW = (1 - mGlc / RHO_G) * RHO_W;          // kg water per litre
  const nG = (mGlc * 1000) / M_GLC, nW = (mW * 1000) / M_W;
  return { glucose: nG / (nG + nW), water: nW / (nG + nW) };
}

export const fermenter: UnitOp = (inlets, u: UnitInst, ctx: SimCtx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const fail = (code: string, data: Record<string, number | string> = {}) => failResult<never>(code, data, { unitId: u.id });
  const law = str(u, 'law', 'K8');
  const T = has(u, 'T') ? num(u, 'T') : s.T, time = num(u, 'time', 0), X0 = num(u, 'X0', 1);
  if (!(T > 0) || !(time >= 0) || !(X0 > 0)) return fail('SPEC_RANGE', { T, time });
  const sp = ctx.species;
  const iG = sp.indexOf(str(u, 'key', 'C6H12O6')), iW = Math.max(sp.indexOf('H2O(l)'), sp.indexOf('H2O')), iE = Math.max(sp.indexOf('C2H5OH(l)'), sp.indexOf('C2H5OH')), iC = sp.indexOf('CO2');
  if (iG < 0 || iW < 0 || iE < 0 || iC < 0) return fail('SPECIES_MISSING', {});
  const nG = s.n[iG]!, nW = s.n[iW]!, nE = s.n[iE]!;
  if (!(nG > 0)) return fail('SPEC_INFEASIBLE', { glucose: nG });
  const V = (nW * M_W) / 1000 / RHO_W + (nG * M_GLC) / 1000 / RHO_G + (nE * M_EOH) / 1000 / 0.789;  // L/s of charge
  const S0 = (nG * M_GLC) / V, P0 = (nE * M_EOH) / V;
  const times = Array.from({ length: NPROF }, (_, i) => (time / 3600) * ((i + 1) / NPROF));
  const nOut = s.n.slice(), nGas = new Array<number>(sp.length).fill(0);
  let Xe = X0, Se = S0, Pe = P0;
  const prof: number[][] = [[0, X0, S0, P0]];
  let peak = 0;
  if (time > 0) {
    const f = (_t: number, y: number[]): number[] => { const d = luongRates(law, y[0]!, y[1]!, y[2]!, T); return [d[0], d[1], d[2]]; };
    const sol = odeAt(f, [X0, S0, P0], times, { rtol: 1e-8, atol: 1e-9 });
    if (sol.length < times.length) return fail('NUMERIC_GUARD', { T });
    sol.forEach((y, i) => { prof.push([times[i]!, y[0]!, Math.max(y[1]!, 0), y[2]!]); });
    const last = sol[sol.length - 1]!;
    Xe = last[0]!; Se = Math.max(last[1]!, 0); Pe = last[2]!;
    if (!Number.isFinite(Xe + Se + Pe)) return fail('NUMERIC_GUARD', { T });
    for (let i = 1; i < prof.length; i++) peak = Math.max(peak, (prof[i]![3]! - prof[i - 1]![3]!) / (prof[i]![0]! - prof[i - 1]![0]!));
    if (Xe < 0.1 * X0) return fail('YEAST_KILLED', { T, X: Xe, X0 });
    const dS = S0 - Se, dP = Math.max(Pe - P0, 0);
    const molE = (dP * V) / M_EOH, molGlcAll = (dS * V) / M_GLC;
    const rest = Math.max(molGlcAll - molE / 2, 0);   // glucose that went to cells and maintenance, kept on the glucose line
    nOut[iG] = nG - molGlcAll + rest;
    nOut[iE] = nE + molE;
    nGas[iC] = molE; // 2 CO2 per glucose fermented = one per ethanol
  }
  const molE = nOut[iE]! - nE;
  const mx = makeMixture(sp);
  const out: StreamState = { n: nOut, T, P: s.P }, vap: StreamState = { n: nGas, T, P: s.P };
  const duty = enthalpyFlowAt(mx, nOut, T) + enthalpyFlowAt(mx, nGas, T) - enthalpyFlowAt(mx, s.n, s.T);
  const rx = findReaction('R12');
  const dH12 = rx !== undefined && sp.every((id) => SPECIES[id]?.hasThermo) ? rxnDH(rx.nu, T, 'rigorous') : -67.55e3;
  const Qrxn = -(molE / 2) * dH12;
  const conv = S0 > 0 ? (S0 - Se) / S0 : 0;
  const info: Record<string, number> = {
    X_gL: Xe, S_gL: Se, P_gL: Pe, conv, eth_mol_s: molE, co2_mol_s: nGas[iC]!, Q_rxn_W: Qrxn, cw_duty_W: Math.max(0, -duty), vol_L_s: V, vol_m3: ((V * Math.max(time, 3600)) / 1000) * 1.25,
    batch_h: time / 3600, S0_gL: S0, T_K: T, level: 0.8, gas: Math.min(1, peak / 4), spin: 0.4, np: prof.length,
  };
  prof.forEach((p, i) => { info['p' + i + '_t'] = p[0]!; info['p' + i + '_X'] = p[1]!; info['p' + i + '_S'] = p[2]!; info['p' + i + '_P'] = p[3]!; });
  return okResult({ outlets: { out, vap }, duty, info });
};
