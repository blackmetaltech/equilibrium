import { describe, expect, it } from 'vitest';
import { shomateCp, shomateH, shomateS, shomateDcp, nasa7Cp, nasa7H, nasa7S, nasa7Dcp, R_GAS } from './shomate';

// NIST N2 Shomate 500-2000 K (docs/research/thermo.py)
const N2 = [19.50583, 19.88705, -8.598535, 1.369784, 0.527601, -4.935202, 212.39, 0.0];
// NASA TM-4513 H2O low set
const H2O_NASA = [4.19864056, -0.0020364341, 6.52040211e-06, -5.48797062e-09, 1.77197817e-12, -30293.7267, -0.849032208];

describe('Shomate / NASA evaluators (J, mol, K)', () => {
  it('Shomate: N2 at 1000 K reproduces NIST-JANAF (Cp 32.697, S 228.170, H(1000)-H(500) 15.552 kJ/mol)', () => {
    // NIST's Shomate fit reproduces the JANAF table to a few 1e-3
    expect(Math.abs(shomateCp(N2, 1000) - 32.697)).toBeLessThan(0.01);
    expect(Math.abs(shomateS(N2, 1000) - 228.170)).toBeLessThan(0.01);
    // JANAF N2: H(1000) - H(500) = 21.463 - 5.911 kJ/mol (this polynomial is the 500-2000 K one)
    expect(Math.abs((shomateH(N2, 1000) - shomateH(N2, 500)) / 1000 - 15.552)).toBeLessThan(0.01);
  });

  it('dH/dT = Cp, dS/dT = Cp/T and analytic dCp/dT agree with central differences', () => {
    const cps = [
      { f: (T: number) => shomateCp(N2, T), h: (T: number) => shomateH(N2, T), s: (T: number) => shomateS(N2, T), d: (T: number) => shomateDcp(N2, T) },
      { f: (T: number) => nasa7Cp(H2O_NASA, T), h: (T: number) => nasa7H(H2O_NASA, T), s: (T: number) => nasa7S(H2O_NASA, T), d: (T: number) => nasa7Dcp(H2O_NASA, T) },
    ];
    for (const c of cps) {
      for (const T of [350, 600, 900]) {
        const e = 1e-3;
        expect((c.h(T + e) - c.h(T - e)) / (2 * e) / c.f(T)).toBeCloseTo(1, 7);
        expect((c.s(T + e) - c.s(T - e)) / (2 * e) / (c.f(T) / T)).toBeCloseTo(1, 7);
        expect((c.f(T + e) - c.f(T - e)) / (2 * e)).toBeCloseTo(c.d(T), 6);
      }
    }
  });

  it('NASA7: H2O(g) at 298.15 K gives dHf ~ -241.8 kJ/mol and S ~ 188.8 J/(mol K)', () => {
    expect(nasa7H(H2O_NASA, 298.15) / 1000).toBeCloseTo(-241.83, 1);
    expect(nasa7S(H2O_NASA, 298.15)).toBeCloseTo(188.84, 1);
    expect(R_GAS).toBe(8.314462618);
  });
});
