// Ammonia-plant units (DESIGN L28): the primary reformer, CO2 removal and the methanator.
// reformer: the equilibrium reactor of R6 + R5 (steam methane reforming and the shift) at the reformer exit temperature T (750-880 C), heated by a furnace: the duty
//   is fired heat (info.fired_W). Params: T (K), dP, reactions (default R6,R5). Info of the equilibrium reactor plus x_ch4 (CH4 converted) and fired_W.
// co2_removal: fixed recovery of the CO2 to the `co2` outlet (default 0.99, max 0.999), solvent regeneration energy GAME_GJ_PER_T per tonne CO2 (GAME, labelled: modern
//   activated-MDEA 1.2 GJ/t, older MEA 3-4), gas cooled to T (default 313.15 K). Info: regen_W, steam_kg_s (LP steam equivalent), cw_duty_W.
// methanator: CO + 3 H2 -> CH4 + H2O and CO2 + 4 H2 -> CH4 + 2 H2O to the fraction X (default 1), adiabatic. Info: dT, h2_used_mol_s.
import { enthalpyFlowAt, makeMixture, solveT, totalFlow } from '../thermo';
import { SPECIES } from '../../data/species';
import type { UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { eqReactor } from './rx_equil';
import { guardInlets, num, steamLatent } from './utilities';

/** Regeneration energy of the CO2 removal solvent, GJ per tonne CO2 (GAME). */
export const CO2_GJ_PER_T = 1.2;

export const reformer: UnitOp = (inlets, u, ctx) => {
  const v: UnitInst = { ...u, params: { reactions: 'R6,R5', mode: 'isothermal', ...u.params } };
  const r = eqReactor(inlets, v, ctx);
  if (!r.ok) return r;
  const s = inlets.in!, iC = ctx.species.indexOf('CH4'), out = r.value.outlets.out!;
  const x = iC >= 0 && s.n[iC]! > 0 ? 1 - out.n[iC]! / s.n[iC]! : 0;
  return okResult({ ...r.value, info: { ...r.value.info, x_ch4: x, fired_W: Math.max(0, r.value.duty ?? 0), T_K: out.T } }, r.diag);
};

export const co2Removal: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const iC = ctx.species.indexOf('CO2');
  if (iC < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: 'CO2' });
  const rec = num(u, 'recovery', 0.99), T = num(u, 'T', 313.15), P = s.P - num(u, 'dP', 0);
  if (!(rec >= 0 && rec <= 0.999)) return failResult('SPEC_RANGE', { recovery: rec, max: 0.999 }, { unitId: u.id });
  if (!(P > 0)) return failResult('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: num(u, 'dP', 0) }, { unitId: u.id });
  const take = rec * s.n[iC]!, gas = s.n.slice(), co2 = new Array<number>(s.n.length).fill(0);
  gas[iC] = s.n[iC]! - take; co2[iC] = take;
  const mx = makeMixture(ctx.species);
  const outG = { n: gas, T, P }, outC = { n: co2, T, P };
  const Hin = enthalpyFlowAt(mx, s.n, s.T), Hout = enthalpyFlowAt(mx, gas, T) + enthalpyFlowAt(mx, co2, T);
  const kgS = (take * SPECIES['CO2']!.M) / 1000, regen = kgS * CO2_GJ_PER_T * 1e6;
  return okResult({ outlets: { out: outG, co2: outC }, duty: totalFlow(s.n) > 0 ? Hout - Hin : 0, info: {
    absorbed_mol_s: take, recovery: rec, co2_t_h: kgS * 3.6, regen_W: regen, steam_kg_s: regen / steamLatent(), cw_duty_W: Math.max(0, Hin - Hout), T,
  } });
};

export const methanator: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const I = Object.fromEntries(['CH4', 'H2O', 'CO', 'CO2', 'H2'].map((id) => [id, ctx.species.indexOf(id)])) as Record<string, number>;
  for (const id of Object.keys(I)) if (I[id]! < 0) return failResult('SPECIES_MISSING', {}, { unitId: u.id, species: id });
  const X = num(u, 'X', 1), P = s.P - num(u, 'dP', 0);
  if (!(X >= 0 && X <= 1)) return failResult('SPEC_RANGE', { X }, { unitId: u.id });
  const n = s.n.slice(), co = X * n[I.CO!]!, c2 = X * n[I.CO2!]!, h2 = 3 * co + 4 * c2;
  if (h2 > n[I.H2!]! + 1e-12) return failResult('HYDROGEN_SHORT', { needed: h2, have: n[I.H2!]! }, { unitId: u.id });
  n[I.CO!] -= co; n[I.CO2!] -= c2; n[I.H2!] -= h2; n[I.CH4!] += co + c2; n[I.H2O!] += co + 2 * c2;
  const mx = makeMixture(ctx.species), Hin = enthalpyFlowAt(mx, s.n, s.T);
  let T = s.T;
  if (totalFlow(s.n) > 0) { const t = solveT(mx, Hin, n); if (!t.ok) return failResult(t.code, t.data, { unitId: u.id }); T = t.value; }
  return okResult({ outlets: { out: { n, T, P } }, duty: 0, info: { dT: T - s.T, T_out: T, h2_used_mol_s: h2, co_converted_mol_s: co, co2_converted_mol_s: c2 } });
};
