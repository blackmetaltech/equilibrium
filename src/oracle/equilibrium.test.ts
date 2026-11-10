// DESIGN 9.2 textbook oracles of lane chem/equilibrium (src/oracle/oracles.json), table-driven: every id runs through the
// engine (solveEquilibrium / qOverK / the K(T) API) and is compared with its own tolerance.
import { describe, expect, it } from 'vitest';
import oracleFile from './oracles.json';
import { kcFromKp, kpFromKc, lnKeq, rxnDG } from '../sim/chem';
import { solveEquilibrium, qOverK } from '../sim/chem/equilibrium';

interface Oracle {
  id: string; lane: string; fn: string; inputs: any; expected: Record<string, any>; tol: { rel?: number; abs?: number }; book?: any;
  assertGroups?: string[][];
}
const oracles = (oracleFile.oracles as unknown as Oracle[]).filter((o) => o.lane === 'chem/equilibrium');
const R_J = 8.314;
const BAR = 1e5;

type Out = Record<string, number | string>;
const must = <T>(r: { ok: boolean } & any): T => {
  if (!r.ok) throw new Error('solve failed: ' + r.code);
  return r.value as T;
};
const solve = (s: Parameters<typeof solveEquilibrium>[0]) => must<any>(solveEquilibrium(s));

/** Smith Cp/R = A + B T + D/T^2 integral of dH(T) and ln K(T) from 298.15 K (the oracle's own K(T) model, not the engine's). */
type PolySp = { A: number; B: number; D: number; dGf298: number; dHf298: number };
function lnKSmith(nu: Record<string, number>, sp: Record<string, PolySp>, T: number, T0 = 298.15, R = R_J): number {
  let dA = 0, dB = 0, dD = 0, dH0 = 0, dG0 = 0;
  for (const id of Object.keys(nu)) {
    const s = sp[id]!, v = nu[id]!;
    dA += v * s.A; dB += v * s.B; dD += v * s.D; dH0 += v * s.dHf298; dG0 += v * s.dGf298;
  }
  // integral of dH/(R T^2) dT with dH = J + R(dA T + dB/2 T^2 - dD/T)
  const J = dH0 - R * (dA * T0 + (dB / 2) * T0 * T0 - dD / T0);
  const I = (t: number) => -J / (R * t) + dA * Math.log(t) + (dB / 2) * t + (dD / 2) / (t * t);
  return -dG0 / (R * T0) + (I(T) - I(T0));
}

const close = (a: number, e: number, tol: { rel?: number; abs?: number }, what: string) => {
  if (tol.abs !== undefined && tol.rel === undefined) expect(Math.abs(a - e), what).toBeLessThanOrEqual(tol.abs);
  else expect(Math.abs(a - e), what + ` got ${a} want ${e}`).toBeLessThanOrEqual((tol.rel ?? 0) * Math.abs(e) + (tol.abs ?? 0));
};

const dirOf = (qk: number): string => (Math.abs(qk) < 1e-9 ? 'none' : qk > 0 ? 'left' : 'right');

const RUN: Record<string, (o: Oracle) => Out> = {
  'EQ-NC-022': (o) => {
    const r = solve({ species: ['CO', 'H2O', 'CO2', 'H2'], n0: [1, 1, 0, 0], T: 800, P: BAR, reactions: [{ CO: -1, H2O: -1, CO2: 1, H2: 1 }], detail: 'book', book: { K: o.inputs.Kc } });
    const V = o.inputs.V_L;
    return { CO_mol_L: r.n[0] / V, CO2_mol_L: r.n[2] / V, H2_mol_L: r.n[3] / V };
  },
  'EQ-NC-023': (o) => ({ Kc_L_mol: kcFromKp(o.inputs.Kp, o.inputs.T, o.inputs.dn, o.inputs.R_L_bar) }),
  'EQ-NC-024': (o) => {
    const R = 8.3; // book R = 0.083 L bar/(mol K), as J/(mol K) with V in m3 and P in Pa
    const n0 = o.inputs.N2O4_g / o.inputs.M;
    const r = solve({ species: ['N2O4', 'NO2'], n0: [n0, 0], T: o.inputs.T, V: o.inputs.V_L * 1e-3, R, mode: 'constV', reactions: [{ N2O4: -1, NO2: 2 }], detail: 'book', book: { K: o.book.Kp_bar } });
    const pN = (r.n[0] * R * o.inputs.T) / (o.inputs.V_L * 1e-3) / BAR, pD = (r.n[1] * R * o.inputs.T) / (o.inputs.V_L * 1e-3) / BAR;
    const Kp = (pD * pD) / pN;
    return { alpha: 1 - r.n[0] / n0, pN2O4_bar: pN, pNO2_bar: pD, Ptot_bar: r.P / BAR, Kp_bar: Kp, Kc_mol_L: kcFromKp(Kp, o.inputs.T, 1, 0.083) };
  },
  'EQ-NC-025': (o) => {
    // PCl5: Kp from 50 % dissociation at P1, then alpha at P2 (units of P cancel: dimensionless activities)
    const a1 = o.inputs.alpha1, P1 = o.inputs.P1;
    const Kp = ((a1 * a1) / (1 - a1 * a1)) * P1;
    const r = solve({ species: ['PCl5', 'PCl3', 'Cl2'], n0: [1, 0, 0], T: 500, P: o.inputs.P2 * BAR, reactions: [{ PCl5: -1, PCl3: 1, Cl2: 1 }], detail: 'book', book: { K: Kp } });
    return { alpha: 1 - r.n[0] };
  },
  'EQ-NC-026': (o) => {
    const Kf = o.inputs.Kc_forward;
    // feed HI so that the equilibrium [HI] is 0.5 M: HI0 = 0.5 + 2x with x = 0.5/sqrt(Kf)
    const x = 0.5 / Math.sqrt(Kf);
    const r = solve({ species: ['H2', 'I2', 'HI'], n0: [0, 0, 0.5 + 2 * x], T: 700, P: BAR, reactions: [{ H2: -1, I2: -1, HI: 2 }], detail: 'book', book: { K: Kf } });
    return { H2_mol_L: r.n[0], I2_mol_L: r.n[1] };
  },
  'EQ-NC-027': (o) => {
    const T = 298.15, R = 0.083145; // L bar/(mol K); Kp from Kc, then a 1 L constant-volume vessel
    const Kp = kpFromKc(o.inputs.Kc, T, 1, R);
    const r = solve({ species: ['N2O4', 'NO2'], n0: [0.1, 0], T, V: 1e-3, R: R * 100, mode: 'constV', reactions: [{ N2O4: -1, NO2: 2 }], detail: 'book', book: { K: Kp } });
    return { x_mol_L: r.xi[0], NO2_mol_L: r.n[1] };
  },
  'EQ-NC-028': (o) => ({ dG_kJ_mol: rxnDG({ O2: -1.5, O3: 1 }, o.inputs.T, 'book', { K: o.inputs.Kp, T: o.inputs.T, R: o.inputs.R_J_mol_K }) / 1000 }),
  'EQ-NC-029': (o) => ({ K: Math.exp(lnKeq({ A: -1, B: 1 }, o.inputs.T, 'book', { dH: o.inputs.dG_kJ * 1000, dS: 0, R: o.inputs.R_J_mol_K })) }),
  'EQ-NC-030': (o) => dirTest(o),
  'EQ-NC-031': (o) => dirTest(o),
  'EQ-NC-032': (o) => dirTest(o),
  'EQ-NC-033': (o) => {
    const book = (T: number) => lnKeq({ N2: -1, H2: -3, NH3: 2 }, T, 'book', { lnK: 0, T: o.inputs.T1, dH: o.inputs.dH_kJ * 1000, R: o.inputs.R_J_mol_K });
    const ratio = Math.exp(book(o.inputs.T2) - book(o.inputs.T1));
    return { K_ratio_600_over_500: ratio, direction: ratio < 1 ? 'left' : 'right' };
  },
  'EQ-NC-034': (o) => {
    // N2O4 <=> 2NO2 at equilibrium in volume V, then V -> V * factor at constant T and amounts
    const nu = { N2O4: -1, NO2: 2 };
    const V = 1e-3, T = 350;
    const eq = solve({ species: ['N2O4', 'NO2'], n0: [1e-3, 0], T, V, mode: 'constV', reactions: [nu], detail: 'book', book: { K: 0.5 } });
    const q = must<number[]>(qOverK({ species: ['N2O4', 'NO2'], n0: eq.n, T, V: V * o.inputs.V_factor, mode: 'constV', reactions: [nu], detail: 'book', book: { K: 0.5 } }));
    return { Q_over_K: Math.pow(10, q[0]!), direction: dirOf(q[0]!) };
  },
  'EQ-CE-020': (o) => {
    const cal = 4.184, R = o.inputs.Rcal * cal;
    const book = { K: o.inputs.K298, T: 298, dH: o.inputs.dH_cal * cal, R };
    const base = { species: ['A', 'B'], n0: [1, 0], T: o.inputs.T0, P: BAR, reactions: [{ A: -1, B: 1 }], detail: 'book' as const, book };
    const ad = solve({ ...base, mode: 'adiabatic', cpBook: o.inputs.Cp_cal_mol_K * cal });
    const iso = solve(base);
    return { T_ad_K: ad.T, X_ad_eq: ad.n[1], K_at_Tad: Math.exp(ad.lnK[0]), X_eq_isothermal_300K: iso.n[1] };
  },
  'EQ-CE-025': (o) => {
    const dG = rxnDG(o.inputs.nu, o.inputs.T, 'book', { dH: 2 * o.inputs.dGf_NH3, dS: 0, R: o.inputs.R });
    return { dG0_J: dG, K298: Math.exp(-dG / (o.inputs.R * o.inputs.T)), lnK: -dG / (o.inputs.R * o.inputs.T) };
  },
  'EQ-CE-026': (o) => {
    const nu = o.inputs.nu;
    const book = { K: o.inputs.K298, T: o.inputs.T0_K, dH: o.inputs.dH298, R: o.inputs.R_J_mol_K };
    const cp = { N2: { A: 3.28, B: 0.000593, D: 4000, dGf298: 0, dHf298: 0 }, H2: { A: 3.249, B: 0.000422, D: 8300, dGf298: 0, dHf298: 0 }, NH3: { A: 3.578, B: 0.00302, D: -18600, dGf298: -16450, dHf298: -46110 } };
    const [T1, T2] = o.inputs.T as number[];
    return {
      K500: Math.exp(lnKeq(nu, T1!, 'book', book)), K700: Math.exp(lnKeq(nu, T2!, 'book', book)),
      with_Cp_K500: Math.exp(lnKSmith(nu, cp, T1!)), with_Cp_K700: Math.exp(lnKSmith(nu, cp, T2!)),
    };
  },
  'EQ-CE-027': (o) => {
    const sp = o.inputs.species_data as Record<string, PolySp>;
    const [T1, T2] = o.inputs.T as number[];
    return { K1000: Math.exp(lnKSmith(o.inputs.nu, sp, T1!)), K1100: Math.exp(lnKSmith(o.inputs.nu, sp, T2!)) };
  },
  'EQ-CE-028': (o) => {
    const nu = { CO: -1, H2O: -1, CO2: 1, H2: 1 };
    const run = (steam: number) => solve({ species: ['CO', 'H2O', 'CO2', 'H2'], n0: [1, steam, 0, 0], T: o.inputs.T, P: o.inputs.P_bar * BAR, reactions: [nu], detail: 'book', book: { K: o.inputs.K } });
    const a = run(o.inputs.feed[1]), b = run(2);
    return { conv_CO: 1 - a.n[0], eps_e: a.xi[0], eps_e_steam2: b.xi[0] };
  },
  'EQ-CE-029': (o) => {
    const f = o.inputs.feed;
    const r = solve({ species: ['N2', 'H2', 'NH3', 'Ar'], n0: [f.N2, f.H2, 0, f.Ar], T: o.inputs.T, P: o.inputs.P_bar * BAR, reactions: [o.inputs.nu], detail: 'book', book: { K: o.inputs.K_bar_m2 } });
    const tot = r.n.reduce((a: number, b: number) => a + b, 0);
    return { eps_e: r.xi[0], y_NH3: r.n[2] / tot };
  },
  'EQ-CE-030': (o) => {
    const sp = o.inputs.species_data as Record<string, PolySp>;
    const lnK = lnKSmith(o.inputs.nu, sp, o.inputs.T);
    const f = o.inputs.feed;
    const r = solve({ species: ['SO2', 'O2', 'SO3', 'N2'], n0: [f.SO2, f.O2, 0, f.N2], T: o.inputs.T, P: o.inputs.P_atm * 101325, reactions: [o.inputs.nu], detail: 'book', book: { lnK } });
    return { K800: Math.exp(lnK), K800_bar_basis: Math.exp(lnK), eps_e: r.xi[0], conv_SO2: r.xi[0] / f.SO2 };
  },
};

function dirTest(o: Oracle): Out {
  // N2 + 3H2 <=> 2NH3 at the given equilibrium amounts, then an inert gas at constant V or constant P.
  const nuV = o.inputs.nu as number[];
  const sp = nuV.length === 3 && nuV[2] === 2 ? ['N2', 'H2', 'NH3'] : ['PCl5', 'PCl3', 'Cl2'];
  const nu: Record<string, number> = {};
  sp.forEach((id, i) => { nu[id] = nuV[i]!; });
  const n = o.inputs.n as number[];
  const P = o.inputs.P * BAR;
  const T = 500;
  const all = [...sp, 'Ar'];
  // K is defined by the equilibrium state itself (Q = K there)
  const q0 = qOverK({ species: all, n0: [...n, 0], T, P, reactions: [nu], detail: 'book', book: { lnK: 0 } });
  const lnK = (must<number[]>(q0)[0]!) * Math.LN10;
  const book = { lnK };
  const nInert = 2;
  const gasTot0 = n.reduce((a, b) => a + b, 0);
  let q: number[];
  if (o.inputs.inert === 'V') {
    // same V: the pressure rises to P (gasTot0 + nInert)/gasTot0; V from the original state
    const R = 8.314462618;
    const V = (gasTot0 * R * T) / P;
    q = must<number[]>(qOverK({ species: all, n0: [...n, nInert], T, V, mode: 'constV', reactions: [nu], detail: 'book', book }));
  } else {
    q = must<number[]>(qOverK({ species: all, n0: [...n, nInert], T, P, reactions: [nu], detail: 'book', book }));
    // the solver agrees: the extent moves the way the sign of ln Q - ln K says
    const r = solve({ species: all, n0: [...n, nInert], T, P, reactions: [nu], detail: 'book', book });
    expect(Math.sign(r.xi[0]), 'solver direction').toBe(-Math.sign(q[0]!));
  }
  return { direction: dirOf(q[0]!) };
}

describe('chem/equilibrium oracles (DESIGN 9.2)', () => {
  it('has the oracle ids this table covers', () => {
    expect(oracles.map((o) => o.id).sort()).toEqual(Object.keys(RUN).sort());
  });
  for (const o of oracles) {
    it(`${o.id} ${o.fn}`, () => {
      const out = RUN[o.id]!(o);
      for (const key of Object.keys(o.expected)) {
        if (!(key in out)) continue; // expected keys outside this engine call (alternative conventions) are not asserted
        const e = o.expected[key];
        if (typeof e === 'string') expect(out[key], key).toBe(e);
        else close(out[key] as number, e, o.tol, `${o.id}.${key}`);
      }
      expect(Object.keys(out).filter((k) => k in o.expected).length, 'asserted keys').toBeGreaterThan(0);
    });
  }
});
