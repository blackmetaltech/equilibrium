import { describe, expect, it } from 'vitest';
import { azeotrope, bubbleBinary, nrtlGamma, pairParams, yOfX } from './nrtl';

const P1 = 101325;
describe('NRTL binary pairs (ChemSep / DECHEMA, docs/research/vle_binary.py)', () => {
  it('ethanol-water activity coefficients at 80 C match the research script (gamma at x=0.4 and infinite dilution)', () => {
    // script, T = bubble point of x=0.4 (80.35 C): gam = [1.438, 1.323]
    const g = nrtlGamma('C2H5OH', 'H2O', 0.4, 353.5);
    expect(g[0]).toBeCloseTo(1.438, 1); expect(g[1]).toBeCloseTo(1.323, 1);
    // gamma_inf at 360 K from the script: 5.22 (ethanol in water), 2.62 (water in ethanol)
    expect(nrtlGamma('C2H5OH', 'H2O', 1e-9, 360)[0]).toBeCloseTo(5.22, 1); expect(nrtlGamma('C2H5OH', 'H2O', 1 - 1e-9, 360)[1]).toBeCloseTo(2.62, 1);
    // pure limits give gamma = 1
    expect(nrtlGamma('C2H5OH', 'H2O', 1, 350)[0]).toBeCloseTo(1, 9); expect(nrtlGamma('C2H5OH', 'H2O', 0, 350)[1]).toBeCloseTo(1, 9);
  });
  it('argument order is symmetric: (water, ethanol) returns the same numbers swapped', () => {
    const a = nrtlGamma('C2H5OH', 'H2O', 0.3, 350), b = nrtlGamma('H2O', 'C2H5OH', 0.7, 350);
    expect(b[0]).toBeCloseTo(a[1]!, 12); expect(b[1]).toBeCloseTo(a[0]!, 12);
  });
  it('Gibbs-Duhem holds: x1 dln(g1)/dx1 + x2 dln(g2)/dx1 = 0', () => {
    const h = 1e-6, f = (x: number) => nrtlGamma('C2H5OH', 'H2O', x, 350);
    for (const x of [0.1, 0.4, 0.8]) {
      const a = f(x + h), b = f(x - h);
      const d1 = (Math.log(a[0]!) - Math.log(b[0]!)) / (2 * h), d2 = (Math.log(a[1]!) - Math.log(b[1]!)) / (2 * h);
      expect(Math.abs(x * d1 + (1 - x) * d2)).toBeLessThan(1e-6);
    }
  });
  it('the ethanol-water azeotrope at 1 atm: x = 0.880 mol, 94.9 wt %, 78.1 C (DESIGN 4.5.1; the catalogue Antoine moves it by a fraction of a percent)', () => {
    const a = azeotrope('C2H5OH', 'H2O', P1);
    expect(a).not.toBeNull();
    expect(a!.x).toBeGreaterThan(0.875); expect(a!.x).toBeLessThan(0.886);
    expect(a!.wt).toBeGreaterThan(0.945); expect(a!.wt).toBeLessThan(0.953);
    expect(a!.T - 273.15).toBeGreaterThan(77.6); expect(a!.T - 273.15).toBeLessThan(78.6);
    expect(Math.abs(yOfX('C2H5OH', 'H2O', a!.x, P1).y - a!.x)).toBeLessThan(1e-6);
  });
  it('bubble points and y-x from the script: x=0.1 -> y 0.442 at 86.5 C; x=0.4 -> y 0.624 at 80.4 C (loose: catalogue Antoine differs from the script NIST rows)', () => {
    const b1 = bubbleBinary('C2H5OH', 'H2O', 0.1, P1), b4 = bubbleBinary('C2H5OH', 'H2O', 0.4, P1);
    expect(b1.y).toBeGreaterThan(0.42); expect(b1.y).toBeLessThan(0.47); expect(b1.T - 273.15).toBeGreaterThan(85.5); expect(b1.T - 273.15).toBeLessThan(87.5);
    expect(b4.y).toBeGreaterThan(0.60); expect(b4.y).toBeLessThan(0.65); expect(b4.T - 273.15).toBeGreaterThan(79.5); expect(b4.T - 273.15).toBeLessThan(81.3);
  });
  it('methanol-water has no azeotrope (script: gamma_inf about 2.3)', () => {
    expect(azeotrope('CH3OH', 'H2O', P1)).toBeNull();
    const y = yOfX('CH3OH', 'H2O', 0.5, P1).y; expect(y).toBeGreaterThan(0.5);
  });
  it('unknown pairs have no parameters', () => { expect(pairParams('N2', 'H2O')).toBeNull(); });
});
