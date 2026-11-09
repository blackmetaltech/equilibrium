import { describe, expect, it } from 'vitest';
import { type Nu, deltaH298, deltaS298, deltaHrxn, deltaSrxn, lnKRigorous, lnKTextbook } from './textbook';
import { dmath } from '@core/numerics';

const HABER = { N2: -1, H2: -3, NH3: 2 };
const SO2OX = { SO2: -2, O2: -1, SO3: 2 };
const R = 8.314462618;

describe('reaction thermodynamics at 298.15 K and textbook mode', () => {
  it('Haber: dH298 = -91.80 kJ, dS298 = -198.1 J/K (research thermo.py)', () => {
    expect(deltaH298(HABER) / 1000).toBeCloseTo(-91.8, 1);
    expect(deltaS298(HABER)).toBeCloseTo(-198.1, 0);
  });

  it('Hess identity: rigorous dH(T0) equals the textbook constant dH', () => {
    for (const nu of [HABER, SO2OX]) {
      expect(deltaHrxn(nu, 298.15)).toBeCloseTo(deltaH298(nu), 6);
      expect(deltaSrxn(nu, 298.15)).toBeCloseTo(deltaS298(nu), 9);
    }
  });

  it('P6: ln K_textbook is exactly linear in 1/T with slope -dH298/R', () => {
    const T = [300, 400, 550, 700, 900];
    for (let i = 1; i < T.length; i++) {
      const slope = (lnKTextbook(HABER, T[i]!) - lnKTextbook(HABER, T[i - 1]!)) / (1 / T[i]! - 1 / T[i - 1]!);
      expect(slope / (-deltaH298(HABER) / R)).toBeCloseTo(1, 12);
    }
  });

  it('P5: d lnK/dT = dH(T)/(R T^2) for the rigorous K (central difference, 1e-5 relative)', () => {
    for (const nu of [HABER, SO2OX]) {
      for (const T of [350, 450, 600, 850]) { // away from the polynomial breaks of N2 (500), O2 (700)
        const e = 1e-3;
        const d = (lnKRigorous(nu, T + e) - lnKRigorous(nu, T - e)) / (2 * e);
        expect(Math.abs(d / (deltaHrxn(nu, T) / (R * T * T)) - 1)).toBeLessThan(1e-5);
      }
    }
  });

  it('dG = dH - T dS exactly; rigorous Haber K(700 K) = 8.7537e-5 (docs/research/thermo.py)', () => {
    const T = 700;
    const lnK = -(deltaHrxn(HABER, T) - T * deltaSrxn(HABER, T)) / (R * T);
    expect(lnKRigorous(HABER, T)).toBe(lnK);
    // the generated dHf298 is rounded to 1e-3 kJ/mol (elements exactly 0), worth up to ~5e-4 in ln K at 700 K
    expect(Math.abs(dmath.exp(lnKRigorous(HABER, T)) / 8.753716564674931e-5 - 1)).toBeLessThan(5e-4);
  });

  it('textbook-mode errors quoted in the Codex (DESIGN 9.2.2): R1 K_vH/K = 1.76 at 500 K, 3.91 at 723 K; R2 at 723 K = 1.064', () => {
    const ratio = (nu: Nu, T: number) => dmath.exp(lnKTextbook(nu, T) - lnKRigorous(nu, T));
    expect(Math.abs(ratio(HABER, 500) - 1.76)).toBeLessThan(0.02);
    expect(Math.abs(ratio(HABER, 723.15) - 3.91)).toBeLessThan(0.05);
    expect(Math.abs(ratio(SO2OX, 723.15) - 1.064)).toBeLessThan(0.01);
  });
});
