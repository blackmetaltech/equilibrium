// Property tests of the extent equilibrium solver (DESIGN 9.3 P7-P11, P18, P19), seeded, 10 000 cases each.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@core/numerics/test-util';
import { qOverK, solveEquilibrium, type EqSpec } from './equilibrium';
import { lnKeq } from './reactions';
import { rxnDH } from './reactions';
import { findReaction, REACTOR_SETS } from '../../data/reactions';

const N = 10000;
const BAR = 1e5;
const ok = (r: any): any => {
  if (!r.ok) throw new Error('solve failed ' + r.code + ' ' + JSON.stringify(r.data));
  return r.value;
};
const U = (r: () => number, a: number, b: number) => a + (b - a) * r();
const LU = (r: () => number, a: number, b: number) => Math.exp(U(r, Math.log(a), Math.log(b)));

/** Single-reaction systems of the catalogue with their species (rigorous detail). */
interface Sys { id: string; species: string[]; dn: number }
const SYS: Sys[] = [
  { id: 'R1', species: ['N2', 'H2', 'NH3', 'Ar'], dn: -2 },
  { id: 'R2', species: ['SO2', 'O2', 'SO3', 'N2'], dn: -0.5 },
  { id: 'R5', species: ['CO', 'H2O', 'CO2', 'H2'], dn: 0 },
  { id: 'R9', species: ['NO2', 'N2O4', 'N2'], dn: -1 },
];
const reactantsOf = (id: string) => Object.keys(findReaction(id)!.nu).filter((k) => findReaction(id)!.nu[k]! < 0);
const Trange: Record<string, [number, number]> = { R1: [450, 900], R2: [550, 1000], R5: [450, 1000], R9: [280, 450] };

function feedOf(r: () => number, s: Sys): number[] {
  // random feed with every species possibly zero except at least one reactant
  const n = s.species.map(() => (r() < 0.25 ? 0 : LU(r, 0.01, 5)));
  const reac = reactantsOf(s.id).map((id) => s.species.indexOf(id));
  if (reac.every((i) => n[i]! === 0)) n[reac[0]!] = LU(r, 0.1, 3);
  return n;
}
const pick = (r: () => number): Sys => SYS[Math.floor(r() * SYS.length)]!;
const spec = (s: Sys, n0: number[], T: number, P: number, extra: Partial<EqSpec> = {}): EqSpec =>
  ({ species: s.species, n0, T, P, reactions: [s.id], detail: 'rigorous', ...extra });

describe('P7 temperature (Le Chatelier is emergent)', () => {
  it('the extent moves with ln K: exothermic falls, endothermic rises', () => {
    const r = mulberry32(7);
    for (let k = 0; k < N; k++) {
      const s = pick(r);
      const n0 = feedOf(r, s);
      const [a, b] = Trange[s.id]!;
      const T1 = U(r, a, b - 40), T2 = T1 + U(r, 5, 40);
      const P = LU(r, 1, 200) * BAR;
      const x1 = ok(solveEquilibrium(spec(s, n0, T1, P))), x2 = ok(solveEquilibrium(spec(s, n0, T2, P)));
      const dlnK = x2.lnK[0] - x1.lnK[0];
      const dxi = x2.xi[0] - x1.xi[0];
      if (Math.abs(dlnK) < 1e-6) continue;
      expect(Math.sign(dxi) * Math.sign(dlnK) >= 0, `${s.id} T ${T1}->${T2} dlnK ${dlnK} dxi ${dxi}`).toBe(true);
      // and dlnK has the sign of dH (van t Hoff)
      const dH = rxnDH(findReaction(s.id)!.nu, (T1 + T2) / 2, 'rigorous');
      expect(Math.sign(dH)).toBe(Math.sign(dlnK));
    }
  });
});

describe('P8 pressure', () => {
  it('dn < 0: xi up with P; dn > 0: down; dn = 0: unchanged to 1e-9', () => {
    const r = mulberry32(8);
    for (let k = 0; k < N; k++) {
      const s = pick(r);
      const n0 = feedOf(r, s);
      const [a, b] = Trange[s.id]!;
      const T = U(r, a, b);
      const P1 = LU(r, 0.5, 100) * BAR, P2 = P1 * U(r, 1.05, 4);
      const x1 = ok(solveEquilibrium(spec(s, n0, T, P1))), x2 = ok(solveEquilibrium(spec(s, n0, T, P2)));
      const d = x2.xi[0] - x1.xi[0];
      if (s.dn === 0) expect(Math.abs(d), s.id).toBeLessThan(1e-9);
      else if (s.dn < 0) expect(d, `${s.id} ${T} ${P1}`).toBeGreaterThanOrEqual(-1e-12);
      else expect(d).toBeLessThanOrEqual(1e-12);
    }
  });
  it('dn > 0 (N2O4 written as dissociation): xi falls with P', () => {
    const r = mulberry32(80);
    const nu = { N2O4: -1, NO2: 2 };
    for (let k = 0; k < N; k++) {
      const n0 = [LU(r, 0.01, 5), r() < 0.3 ? 0 : LU(r, 0.01, 2)];
      const T = U(r, 280, 450), P1 = LU(r, 0.5, 20) * BAR;
      const f = (P: number) => ok(solveEquilibrium({ species: ['N2O4', 'NO2'], n0, T, P, reactions: [nu], detail: 'rigorous' })).xi[0];
      expect(f(P1 * 2)).toBeLessThanOrEqual(f(P1) + 1e-12);
    }
  });
});

describe('P9 inerts at constant P and constant V', () => {
  it('constant V: xi unchanged; constant P: xi moves with sign(dn) (up when dn > 0, down when dn < 0)', () => {
    const r = mulberry32(9);
    const nu = { N2O4: -1, NO2: 2 };
    for (let k = 0; k < N; k++) {
      const s = pick(r);
      const n0 = feedOf(r, s);
      const [a, b] = Trange[s.id]!;
      const T = U(r, a, b), P = LU(r, 1, 100) * BAR;
      const iIn = s.species.length - 1; // the last species is the inert of the system (Ar, N2); skip systems where it reacts
      const inertIsIdle = !(s.species[iIn]! in findReaction(s.id)!.nu);
      if (!inertIsIdle) continue;
      const add = LU(r, 0.1, 10);
      const n1 = n0.slice(); n1[iIn] = n1[iIn]! + add;
      // constant P
      const p0 = ok(solveEquilibrium(spec(s, n0, T, P))), p1 = ok(solveEquilibrium(spec(s, n1, T, P)));
      const dP = p1.xi[0] - p0.xi[0];
      if (s.dn < 0) expect(dP, `${s.id}`).toBeLessThanOrEqual(1e-12);
      else if (s.dn === 0) expect(Math.abs(dP)).toBeLessThan(1e-9);
      // constant V: size V so that the vessel holds n0 at P
      const R = 8.314462618;
      const ng0 = n0.reduce((x, y) => x + y, 0);
      if (ng0 <= 0) continue;
      const V = (ng0 * R * T) / P;
      const v0 = ok(solveEquilibrium(spec(s, n0, T, undefined as any, { V, mode: 'constV', R }))), v1 = ok(solveEquilibrium(spec(s, n1, T, undefined as any, { V, mode: 'constV', R })));
      expect(Math.abs(v1.xi[0] - v0.xi[0]), `${s.id} constV`).toBeLessThan(1e-9 * (1 + ng0));
    }
    // dn > 0 at constant P: xi rises with inert
    for (let k = 0; k < 2000; k++) {
      const n0 = [LU(r, 0.1, 5), 0, 0];
      const T = U(r, 280, 450), P = LU(r, 1, 20) * BAR;
      const n1 = [n0[0]!, 0, LU(r, 0.1, 10)];
      const f = (n: number[]) => ok(solveEquilibrium({ species: ['N2O4', 'NO2', 'N2'], n0: n, T, P, reactions: [nu], detail: 'rigorous' })).xi[0];
      expect(f(n1)).toBeGreaterThanOrEqual(f(n0) - 1e-12);
    }
  });
});

describe('P10 add reactant -> xi up', () => {
  it('constant V (strict) for every system, and constant P for dn = 0', () => {
    const r = mulberry32(10);
    for (let k = 0; k < N; k++) {
      const s = pick(r);
      const n0 = feedOf(r, s);
      const [a, b] = Trange[s.id]!;
      const T = U(r, a, b);
      const reacs = reactantsOf(s.id).map((id) => s.species.indexOf(id));
      const i = reacs[Math.floor(r() * reacs.length)]!;
      const n1 = n0.slice(); n1[i] = n1[i]! + LU(r, 0.05, 3);
      const ng0 = n0.reduce((x, y) => x + y, 0), ng1 = n1.reduce((x, y) => x + y, 0);
      const R = 8.314462618, V = (ng0 * R * T) / (LU(r, 1, 50) * BAR);
      const f = (n: number[]) => ok(solveEquilibrium(spec(s, n, T, undefined as any, { V, mode: 'constV', R }))).xi[0];
      expect(f(n1), `${s.id} constV`).toBeGreaterThanOrEqual(f(n0) - 1e-12);
      if (s.dn === 0) {
        const P = LU(r, 1, 50) * BAR;
        const g = (n: number[]) => ok(solveEquilibrium(spec(s, n, T, P))).xi[0];
        expect(g(n1)).toBeGreaterThanOrEqual(g(n0) - 1e-12);
      }
      void ng1;
    }
  });
});

describe('P11 direction of reaction', () => {
  it('xi has the sign of 1 - Q/K at the feed', () => {
    const r = mulberry32(11);
    for (let k = 0; k < N; k++) {
      const s = pick(r);
      const n0 = s.species.map(() => (r() < 0.15 ? 0 : LU(r, 0.01, 5)));
      const [a, b] = Trange[s.id]!;
      const T = U(r, a, b), P = LU(r, 0.5, 100) * BAR;
      const sp = spec(s, n0, T, P);
      const res = solveEquilibrium(sp);
      if (!res.ok) continue;
      const q = qOverK(sp);
      if (!q.ok) continue;
      const lq = q.value[0]!;
      if (Number.isNaN(lq)) continue; // a reactant and a product both absent: no reaction is possible
      if (Math.abs(lq) < 1e-9) continue;
      const x = res.value.xi[0]!;
      expect(Math.sign(x), `${s.id} log10 Q/K ${lq} xi ${x}`).toBe(-Math.sign(lq));
    }
  });
});

describe('P18 robustness', () => {
  const NUS: Record<string, number>[] = [
    { Aa: -1, Bb: -2, Cc: 2 }, { Aa: -1, Bb: 1, Cc: 1 }, { Aa: -1, Bb: 2 }, { Aa: -2, Bb: 1 }, { Aa: -1, Bb: -1, Cc: 1 }, { Aa: -1, Bb: -0.5, Cc: 1 },
  ];
  const sp = ['Aa', 'Bb', 'Cc'];
  function rndCase(r: () => number) {
    const nu = NUS[Math.floor(r() * NUS.length)]!;
    const n0 = sp.map((id) => (r() < 0.3 ? 0 : LU(r, 1e-6, 1e3)));
    const lnK = U(r, -69.08, 69.08); // K from 1e-30 to 1e30
    const reacIds = Object.keys(nu).filter((k) => nu[k]! < 0), prodIds = Object.keys(nu).filter((k) => nu[k]! > 0);
    if (reacIds.every((id) => n0[sp.indexOf(id)] === 0) && prodIds.every((id) => n0[sp.indexOf(id)] === 0)) n0[sp.indexOf(reacIds[0]!)] = 1;
    // a reactant and a product both absent blocks the reaction both ways (NO_REACTANT); that case has its own unit test
    if (reacIds.some((id) => n0[sp.indexOf(id)] === 0) && prodIds.some((id) => n0[sp.indexOf(id)] === 0)) {
      for (const id of [...reacIds, ...prodIds]) if (n0[sp.indexOf(id)] === 0) n0[sp.indexOf(id)] = LU(r, 1e-6, 1e3);
    }
    return { nu, n0, lnK, T: U(r, 300, 900), P: LU(r, 0.01, 500) * BAR };
  }
  it('residual <= 1e-10, amounts non-negative, element balance exact (K 1e-30..1e30, zero species)', () => {
    const r = mulberry32(18);
    for (let k = 0; k < N; k++) {
      const c = rndCase(r);
      const sp0: EqSpec = { species: sp, n0: c.n0, T: c.T, P: c.P, reactions: [c.nu], detail: 'book', book: { lnK: c.lnK } };
      const res = ok(solveEquilibrium(sp0));
      expect(res.n.every((v: number) => v >= 0 && Number.isFinite(v))).toBe(true);
      const q = ok(qOverK({ ...sp0, n0: res.n }));
      expect(Math.abs(q[0] * Math.LN10), JSON.stringify(c)).toBeLessThanOrEqual(1e-10);
      // atom balance of the change: n - n0 = nu xi
      sp.forEach((id, i) => expect(Math.abs(res.n[i] - c.n0[i] - (c.nu[id] ?? 0) * res.xi[0])).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(c.n0[i]!) + Math.abs(res.xi[0]))));
    }
  });
  it('X_eq is monotone in K', () => {
    const r = mulberry32(181);
    for (let k = 0; k < N / 10; k++) {
      const c = rndCase(r);
      let last = -Infinity;
      for (let lnK = -60; lnK <= 60; lnK += 6) {
        const res = ok(solveEquilibrium({ species: sp, n0: c.n0, T: c.T, P: c.P, reactions: [c.nu], detail: 'book', book: { lnK } }));
        expect(res.xi[0], JSON.stringify({ c, lnK })).toBeGreaterThanOrEqual(last - 1e-12 * (1 + Math.abs(last)));
        last = res.xi[0];
      }
    }
  });
  it('multi-reaction sets: the same result from 5 different initial extents, residual <= 1e-9', () => {
    const r = mulberry32(182);
    const cases = [
      { set: 'methanol', species: ['CO2', 'H2', 'CH3OH', 'H2O', 'CO'], T: [480, 600], P: [20, 100] },
      { set: 'smr', species: ['CH4', 'H2O', 'CO', 'CO2', 'H2'], T: [900, 1300], P: [1, 30] },
    ];
    for (let k = 0; k < 400; k++) {
      const c = cases[k % 2]!;
      const n0 = c.species.map((id) => (r() < 0.2 ? 0 : LU(r, 0.05, 3)));
      if (c.set === 'methanol') { n0[0] = LU(r, 0.2, 2); n0[1] = LU(r, 1, 6); }
      else { n0[0] = LU(r, 0.2, 2); n0[1] = LU(r, 0.5, 6); }
      const base: EqSpec = { species: c.species, n0, T: U(r, c.T[0]!, c.T[1]!), P: U(r, c.P[0]!, c.P[1]!) * BAR, reactions: [...REACTOR_SETS[c.set]!], detail: 'rigorous' };
      const ref = ok(solveEquilibrium(base));
      for (const v of ref.lnQminusLnK) expect(Math.abs(v), c.set).toBeLessThanOrEqual(1e-9);
      for (let g = 0; g < 5; g++) {
        const xi0 = [U(r, -0.05, 0.3) * 0.2, U(r, -0.05, 0.3) * 0.2];
        const alt = ok(solveEquilibrium({ ...base, xi0 }));
        alt.n.forEach((v: number, i: number) => expect(Math.abs(v - ref.n[i]), `${c.set} guess ${g}`).toBeLessThanOrEqual(1e-7 * (1 + ref.n[i])));
      }
    }
  });
});

describe('P19 a catalyst never changes K', () => {
  it('the API has no catalyst input and ignores one smuggled in', () => {
    const base = spec(SYS[0]!, [1, 3, 0, 0], 700, 100 * BAR);
    const withCat = { ...base, catalystId: 'fe_ammonia' } as EqSpec;
    // @ts-expect-error catalystId is not an input of the equilibrium solver
    const direct: EqSpec = { ...base, catalystId: 'x' } satisfies EqSpec;
    void direct;
    const a = ok(solveEquilibrium(base)), b = ok(solveEquilibrium(withCat));
    expect(b.n).toEqual(a.n);
    expect(b.lnK).toEqual(a.lnK);
    expect(a.lnK[0]).toBe(lnKeq(findReaction('R1')!.nu, 700, 'rigorous'));
  });
});
