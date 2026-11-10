// Lab flask (EXTRA unit for L14, DESIGN 2.6): a closed vessel charged with the inlet stream's moles (mol/s read as mol), brought to
// equilibrium at T. The flask is not part of the M1 unit lanes; it is registered through EXTRA_DEFS in src/engine/registry.ts.
// Params: V (m3, constant volume), T (K), Pfix (Pa; 0 = hold the volume V, > 0 = hold this pressure), book_K (activity K,
// 1 bar standard state; switches the flask to the book's own data and gas constant), R (J/(mol K), book only).
// Info: P_bar (gauge reading), alpha (dissociation of N2O4), K, Kp_bar, no2_mol_m3 (photometer), V, T_out.
import { dmath } from '@core/numerics';
import { solveEquilibrium } from '../chem/equilibrium';
import { lnKeq } from '../chem/reactions';
import { totalFlow } from '../thermo';
import { R_GAS } from '../thermo/shomate';
import type { SimResult, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { guardInlets, has, num } from './utilities';

const NU = { N2O4: -1, NO2: 2 };
/** The book's gas constant: 0.083 L bar mol-1 K-1 is 8.3 J mol-1 K-1 with V in m3 and P in Pa. */
export const BOOK_R = 8.3;

export const labFlask: UnitOp = (inlets, u, ctx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const sp = ctx.species, iA = sp.indexOf('N2O4'), iB = sp.indexOf('NO2');
  if (iA < 0 || iB < 0) return failResult('SPEC_MISSING', { param: 'species' }, { unitId: u.id });
  const T = num(u, 'T', s.T);
  if (!(T > 0)) return failResult('SPEC_RANGE', { T }, { unitId: u.id });
  const hold = num(u, 'Pfix', 0) > 0 ? 'P' : 'V';
  const book = has(u, 'book_K') ? { K: num(u, 'book_K') } : undefined;
  const detail = book !== undefined && ctx.thermoDetail !== 'book' ? 'book' : ctx.thermoDetail;
  const R = detail === 'book' ? (has(u, 'R') ? num(u, 'R') : BOOK_R) : R_GAS;
  const base = { species: sp, n0: s.n, T, reactions: [NU], detail, book } as const;
  const n0 = s.n[iA]! + 0.5 * s.n[iB]!;
  let r: SimResult<{ n: number[]; P: number }>;
  if (totalFlow(s.n) <= 0) r = okResult({ n: s.n.slice(), P: s.P });
  else if (hold === 'P') {
    const Pfix = num(u, 'Pfix', s.P);
    if (!(Pfix > 0)) return failResult('SPEC_RANGE', { Pfix }, { unitId: u.id });
    r = solveEquilibrium({ ...base, P: Pfix, mode: 'isothermal' });
  } else {
    const V = num(u, 'V', 1e-3);
    if (!(V > 0)) return failResult('SPEC_RANGE', { V }, { unitId: u.id });
    r = solveEquilibrium({ ...base, V, R, mode: 'constV' });
  }
  if (!r.ok) return { ...r, unitId: u.id };
  const n = r.value.n, P = r.value.P, Pbar = P / 1e5;
  const tot = totalFlow(n);
  const pN = tot > 0 ? (n[iA]! / tot) * Pbar : 0, pD = tot > 0 ? (n[iB]! / tot) * Pbar : 0;
  const K = dmath.exp(lnKeq(NU, T, detail, book));
  const V = hold === 'V' ? num(u, 'V', 1e-3) : (tot * R * T) / P;
  const info: Record<string, number> = {
    P_bar: Pbar, alpha: n0 > 0 ? 1 - n[iA]! / n0 : 0, K, Kp_bar: pN > 0 ? (pD * pD) / pN : 0, V,
    no2_mol_m3: V > 0 ? n[iB]! / V : 0, T_out: T,
  };
  return okResult({ outlets: { out: { n, T, P } }, duty: 0, info });
};
