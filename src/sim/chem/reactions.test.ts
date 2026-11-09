import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { REACTIONS, reactionOf } from '../../data/reactions';
import { R_GAS } from '../../data/species';
import { deltaH298, deltaS298, deltaHrxn, thermoOf } from '../thermo';
import { Keq, kcFromKp, kpFromKc, lnKeq, lnKOfReaction, rxnDG, rxnDH, rxnDS, scaleNu, textbookKRatio } from './reactions';

const thermoRx = REACTIONS.filter((r) => r.thermo);
const T_GRID = [300, 400, 500, 600, 700, 800, 900, 1000];
const R1 = reactionOf('R1').nu, R2 = reactionOf('R2').nu;

describe('K(T): rigorous, textbook, book', () => {
  it('P5 van t Hoff: central-difference d lnK/dT = dH/(R T^2) to 1e-5 relative, for every reaction with thermo', () => {
    for (const r of thermoRx) {
      // inside the polynomial ranges: skip grid points within 2 h of any species segment junction (Cp is discontinuous there)
      const junctions = Object.keys(r.nu).flatMap((id) => { const t = thermoOf(id); return [...t.Tlo, ...t.Thi]; });
      for (const T of T_GRID) {
        const h = 0.5;
        if (junctions.some((j) => Math.abs(j - T) < 2 * h)) continue;
        const d = (lnKeq(r.nu, T + h, 'rigorous') - lnKeq(r.nu, T - h, 'rigorous')) / (2 * h);
        const dH = rxnDH(r.nu, T, 'rigorous');
        const rhs = dH / (R_GAS * T * T);
        expect(Math.abs(d - rhs), `${r.id} @ ${T}`).toBeLessThanOrEqual(1e-5 * Math.abs(rhs) + 1e-12);
      }
    }
  });

  it('P5: dG = dH - T dS exactly and lnK = -dG/(RT), in every detail level', () => {
    for (const r of thermoRx) for (const T of T_GRID) for (const d of ['rigorous', 'textbook'] as const) {
      const g = rxnDG(r.nu, T, d);
      expect(g, `${r.id} ${d} ${T}`).toBe(rxnDH(r.nu, T, d) - T * rxnDS(r.nu, T, d));
      expect(lnKeq(r.nu, T, d)).toBeCloseTo(-g / (R_GAS * T), 12);
    }
  });

  it('P6: textbook ln K is exactly linear in 1/T with slope -dH298/R and intercept dS298/R', () => {
    for (const r of thermoRx) {
      const slope0 = -deltaH298(r.nu) / R_GAS;
      let prev: [number, number] | null = null;
      for (const T of [280, 350, 480, 640, 900, 1300]) {
        const x = 1 / T, y = lnKeq(r.nu, T, 'textbook');
        expect(y, r.id).toBeCloseTo(slope0 * x + deltaS298(r.nu) / R_GAS, 10);
        if (prev !== null) expect(((y - prev[1]) / (x - prev[0])) / slope0, r.id).toBeCloseTo(1, 11);
        prev = [x, y];
      }
    }
  });

  it('P4 Hess identity: rigorous dH(T0) = textbook dH = sum nu dHf; and rigorous = textbook at 298.15 K', () => {
    for (const r of thermoRx) {
      expect(rxnDH(r.nu, 298.15, 'rigorous'), r.id).toBeCloseTo(deltaHrxn(r.nu, 298.15), 6);
      expect(rxnDH(r.nu, 298.15, 'textbook'), r.id).toBeCloseTo(rxnDH(r.nu, 298.15, 'rigorous'), 6);
      expect(lnKeq(r.nu, 298.15, 'textbook'), r.id).toBeCloseTo(lnKeq(r.nu, 298.15, 'rigorous'), 9);
    }
  });

  it('Hess additivity: C->CO + CO->CO2 = C->CO2 (R14 + R15 vs the sum of formation enthalpies)', () => {
    const a = rxnDH(reactionOf('R14').nu, 298.15, 'rigorous') + rxnDH(reactionOf('R15').nu, 298.15, 'rigorous');
    expect(a / 1000).toBeCloseTo(-393.51, 1);
    expect(rxnDH(reactionOf('R14').nu, 298.15, 'rigorous') / 1000).toBeCloseTo(-110.53, 1);
  });

  it('textbook-mode error numbers of the Codex (DESIGN 4.2): R1 K_vH/K = 1.76 at 500 K and 3.91 at 723 K', () => {
    expect(textbookKRatio(R1, 500)).toBeGreaterThan(1.74);
    expect(Math.abs(textbookKRatio(R1, 500) - 1.76)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(textbookKRatio(R1, 723) - 3.91)).toBeLessThanOrEqual(0.05);
  });

  it('R2 textbook error: 1.064 +- 0.01 at 723 K is the 2SO2 + O2 form (the catalogue R2 is the half form: its ratio is the square root)', () => {
    const full = scaleNu(R2, 2);
    expect(Math.abs(textbookKRatio(full, 723) - 1.064)).toBeLessThanOrEqual(0.01);
    expect(textbookKRatio(R2, 723)).toBeCloseTo(Math.sqrt(textbookKRatio(full, 723)), 12);
    // "R2 only +6 %" at 500 K in the full form
    expect(Math.abs(textbookKRatio(full, 500) - 1.057)).toBeLessThanOrEqual(0.01);
  });

  it('DESIGN 4.2 table: R1 K(500 K) = 9.93e-2, K(700 K) = 8.75e-5; R2 K(500 K) = 2.58e5; R9 K(298.15) = 6.74', () => {
    const rel = (a: number, b: number) => Math.abs(a / b - 1);
    expect(rel(Keq(R1, 500, 'rigorous'), 9.93e-2)).toBeLessThan(0.01);
    expect(rel(Keq(R1, 700, 'rigorous'), 8.75e-5)).toBeLessThan(0.01);
    expect(rel(Keq(R2, 500, 'rigorous'), 2.58e5)).toBeLessThan(0.01);
    expect(rel(Keq(reactionOf('R9').nu, 298.15, 'rigorous'), 6.74)).toBeLessThan(0.01);
  });

  it('NH3 textbook vs Cp at 700 K: constant dH 3.08e-4 against 8.56e-5, a factor 3.6 (DESIGN 3.3, EQ-CE-026)', () => {
    const f = Keq(R1, 700, 'textbook') / Keq(R1, 700, 'rigorous');
    expect(f).toBeGreaterThan(3.4);
    expect(f).toBeLessThan(3.8);
    // 3.08e-4 / 8.56e-5 are the Smith-data oracle values (dH298 = -92.22 kJ); the engine's NIST data give 3.18e-4 / 8.75e-5: 5 % band
    expect(Math.abs(Keq(R1, 700, 'textbook') / 3.08e-4 - 1)).toBeLessThan(0.05);
  });

  it('L10 claim: K(R1) = N2 + 3H2 <=> 2NH3 in bar^-2 is 1.8e-4 at 400 C and 5.7e-6 at 550 C (about 32 x lower)', () => {
    const k400 = Keq(R1, 673.15, 'rigorous'), k550 = Keq(R1, 823.15, 'rigorous');
    expect(Math.abs(k400 / 1.8e-4 - 1)).toBeLessThan(0.01);
    expect(Math.abs(k550 / 5.7e-6 - 1)).toBeLessThan(0.01);
    expect(k400 / k550).toBeGreaterThan(30);
    expect(k400 / k550).toBeLessThan(33);
  });

  it('book mode: {K at T}, {K at T and dH}, {dH, dS}, {lnK}; the caller R is used, never a global', () => {
    const nu = R1;
    expect(Keq(nu, 400, 'book', { K: 85.9, T: 400 })).toBeCloseTo(85.9, 10);
    expect(Keq(nu, 900, 'book', { K: 85.9, T: 400 })).toBeCloseTo(85.9, 10); // constant K without dH
    expect(lnKeq(nu, 123, 'book', { lnK: -3 })).toBeCloseTo(-3, 14);
    // dH and dS: ln K = -dH/(RT) + dS/R with the caller's R
    const b = { dH: -92000, dS: -198, R: 8.314 };
    expect(lnKeq(nu, 500, 'book', b)).toBeCloseTo(92000 / (8.314 * 500) - 198 / 8.314, 12);
    expect(rxnDG(nu, 500, 'book', b)).toBeCloseTo(-92000 + 500 * 198, 9);
    // K at T0 with dH: integrated van t Hoff, consistent dG = dH - T dS and dlnK/dT
    const bk = { K: 6.74, T: 298.15, dH: -57110 };
    expect(lnKeq(nu, 298.15, 'book', bk)).toBeCloseTo(dmath.log(6.74), 12);
    const T = 400, h = 0.01;
    const d = (lnKeq(nu, T + h, 'book', bk) - lnKeq(nu, T - h, 'book', bk)) / (2 * h);
    expect(d).toBeCloseTo(-57110 / (R_GAS * T * T), 8);
    expect(rxnDG(nu, T, 'book', bk)).toBeCloseTo(rxnDH(nu, T, 'book', bk) - T * rxnDS(nu, T, 'book', bk), 6);
    // the NCERT N2O4 problem: Kp 85.9 bar at 400 K vs NIST-JANAF rigorous 51.1 bar
    const n2o4 = reactionOf('R9').nu;
    expect(Keq(scaleNu(n2o4, -1), 400, 'rigorous')).toBeGreaterThan(45);
    expect(Keq(scaleNu(n2o4, -1), 400, 'rigorous')).toBeLessThan(57);
  });

  it('book mode without data is NaN (never a silent default)', () => {
    expect(Number.isNaN(lnKeq(R1, 400, 'book'))).toBe(true);
    expect(Number.isNaN(lnKeq(R1, 400, 'book', { dH: -1 }))).toBe(true);
  });

  it('Kp <-> Kc with the caller R: Kp = Kc (RT)^dn, and they invert each other', () => {
    const R = 0.083145; // L bar /(mol K): Kc in (mol/L)^dn, Kp in bar^dn
    for (const dn of [-2, -0.5, 0, 1, 2]) {
      const Kc = 3.7, T = 650;
      const Kp = kpFromKc(Kc, T, dn, R);
      expect(Kp).toBeCloseTo(Kc * dmath.pow(R * T, dn), 12);
      expect(kcFromKp(Kp, T, dn, R)).toBeCloseTo(Kc, 12);
    }
    expect(kpFromKc(2, 500, 0, 0.1)).toBe(2);
  });

  it('lnKOfReaction: catalogue rows with thermo match the nu functions; lab rows without species thermo give NaN', () => {
    const r1 = reactionOf('R1');
    expect(lnKOfReaction(r1, 700, 'rigorous')).toBe(lnKeq(r1.nu, 700, 'rigorous'));
    expect(Number.isNaN(lnKOfReaction(reactionOf('R18'), 300, 'rigorous'))).toBe(true);
    expect(Number.isNaN(lnKOfReaction(reactionOf('R17'), 300, 'textbook'))).toBe(true);
    // book mode works for any row
    expect(lnKOfReaction(reactionOf('R17'), 300, 'book', { lnK: 40 })).toBe(40);
  });

  it('is deterministic: the same call twice is bit-identical', () => {
    expect(lnKeq(R1, 733.3, 'rigorous')).toBe(lnKeq(R1, 733.3, 'rigorous'));
  });
});
