// P12 (second law) and P19 (catalysts never change K) for every reversible rate law, seeded 10 000 random states each.
import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { rate } from './kinetics';
import { lnKOfReaction } from './reactions';
import { reactionOf } from '../../data/reactions';
import { KINETICS } from '../../data/kinetics';

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const N = 10000;
const BAR = 1e5;

interface Case { law: string; ids: string[]; rx: string; Tlo: number; Thi: number; Plo: number; Phi: number; cat: string }
const CASES: Case[] = [
  { law: 'K1', ids: ['N2', 'H2', 'NH3', 'Ar'], rx: 'R1', Tlo: 640, Thi: 800, Plo: 50, Phi: 300, cat: 'fe_ammonia' },
  { law: 'K2', ids: ['SO2', 'O2', 'SO3', 'N2'], rx: 'R2', Tlo: 640, Thi: 900, Plo: 1, Phi: 5, cat: 'v2o5' },
];
const lnK = (c: Case, T: number) => lnKOfReaction(reactionOf(c.rx), T, 'rigorous');
/** ln Q in the bar-based standard state for the 3 reacting species (index 0, 1 reactants, 2 product) from mole fractions. */
function lnQ(c: Case, y: number[], P: number): number {
  const nu = reactionOf(c.rx).nu;
  let s = 0;
  c.ids.slice(0, 3).forEach((id, i) => { s += nu[id]! * dmath.log((y[i]! * P) / BAR); });
  return s;
}
const dirichlet = (rnd: () => number): number[] => {
  const g = [0, 0, 0, 0].map(() => -dmath.log(1e-3 + 0.998 * rnd()));
  const t = g.reduce((a, b) => a + b, 0);
  return g.map((v) => v / t);
};

for (const c of CASES) {
  describe(`P12 second law, ${c.law}`, () => {
    it('sign(r) = sign(1 - Q/K) on 10 000 random states (floor off and on)', () => {
      const rnd = mulberry32(12345);
      let checked = 0;
      for (let i = 0; i < N; i++) {
        const T = c.Tlo + (c.Thi - c.Tlo) * rnd();
        const P = (c.Plo + (c.Phi - c.Plo) * rnd()) * BAR;
        const y = dirichlet(rnd);
        const d = lnQ(c, y, P) - lnK(c, T);
        if (Math.abs(d) < 1e-9) continue;
        for (const floor of [false, true]) {
          const r = rate(c.law, { speciesIds: c.ids, y, T, P, floor, catalystId: c.cat })[0]!;
          expect(Number.isFinite(r), `finite ${c.law} #${i}`).toBe(true);
          expect(Math.sign(r), `${c.law} #${i} floor=${floor} d=${d}`).toBe(-Math.sign(d));
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(N * 0.99);
    });

    it('r = 0 (|r| < 1e-12 of the rate at Q = K/4) exactly at Q = K, floor off and on, any activity', () => {
      const rnd = mulberry32(777);
      let checked = 0;
      let tries = 0;
      while (checked < N && tries < 20 * N) {
        tries++;
        const T = c.Tlo + (c.Thi - c.Tlo) * rnd();
        const P = (c.Plo + (c.Phi - c.Plo) * rnd()) * BAR;
        const yr = [0.01 + 0.5 * rnd(), 0.01 + 0.5 * rnd()];
        const K = dmath.exp(lnK(c, T));
        // product mole fraction giving Q = K, from  K = (yP/b)^nu_p ...  solved on the log scale
        const nu = reactionOf(c.rx).nu;
        const [a, b, p] = c.ids.slice(0, 3);
        const lnrest = nu[a!]! * dmath.log((yr[0]! * P) / BAR) + nu[b!]! * dmath.log((yr[1]! * P) / BAR);
        const lnyp = (lnK(c, T) - lnrest) / nu[p!]! - dmath.log(P / BAR);
        void K;
        const yp = dmath.exp(lnyp);
        const yi = 1 - yr[0]! - yr[1]! - yp;
        if (!(yp > 1e-12) || yi < 1e-3) continue;
        const y = [yr[0]!, yr[1]!, yp, yi];
        const ref = Math.abs(rate(c.law, { speciesIds: c.ids, y: [y[0]!, y[1]!, yp / 4, yi + (3 * yp) / 4], T, P })[0]!);
        for (const floor of [false, true]) for (const activity of [1, 0.3]) {
          const r = rate(c.law, { speciesIds: c.ids, y, T, P, floor, activity })[0]!;
          expect(Math.abs(r), `${c.law} T=${T} P=${P} floor=${floor}`).toBeLessThan(1e-12 * Math.max(ref, 1e-300));
        }
        checked++;
      }
      expect(checked).toBe(N);
    });

    it('catalyst activity scales the rate linearly and never moves the zero (K is not an input of the catalyst)', () => {
      const rnd = mulberry32(99);
      for (let i = 0; i < 500; i++) {
        const T = c.Tlo + (c.Thi - c.Tlo) * rnd();
        const P = (c.Plo + (c.Phi - c.Plo) * rnd()) * BAR;
        const y = dirichlet(rnd);
        const r1 = rate(c.law, { speciesIds: c.ids, y, T, P, floor: true })[0]!;
        const r2 = rate(c.law, { speciesIds: c.ids, y, T, P, floor: true, activity: 0.37 })[0]!;
        expect(Math.abs(r2 / r1 - 0.37)).toBeLessThan(1e-12);
        // same lnK whatever catalyst: lnKOfReaction has no catalyst argument; the sign of r is catalyst independent
        for (const cat of KINETICS.find((l) => l.id === c.law)!.catalysts) {
          expect(Math.sign(rate(c.law, { speciesIds: c.ids, y, T, P, floor: true, catalystId: cat })[0]!)).toBe(Math.sign(r1));
        }
      }
    });
  });
}

describe('irreversible first-order laws', () => {
  it('r >= 0, zero without reactant, linear in concentration', () => {
    for (const [id, sp] of [['K6', 'H2O2(aq)'], ['K7', 'C3H6O']] as const) {
      expect(rate(id, { speciesIds: [sp], conc: [0], T: 300, P: 1e5 })[0]).toBe(0);
      const a = rate(id, { speciesIds: [sp], conc: [1], T: 330, P: 1e5 })[0]!;
      const b = rate(id, { speciesIds: [sp], conc: [3], T: 330, P: 1e5 })[0]!;
      expect(a).toBeGreaterThan(0);
      expect(b / a).toBeCloseTo(3, 12);
    }
  });
});
