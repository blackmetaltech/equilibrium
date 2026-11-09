// SI <-> display conversions (DESIGN §3.1, §8.2). Hand-calculated oracles first, then P22: display -> SI -> display is exact.
import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit';
import * as si from './si';

describe('SI conversions: hand-calculated values', () => {
  it('molar flow: 3600 kmol/h = 1000 mol/s', () => {
    expect(si.kmolhToMolS(3600)).toBeCloseTo(1000, 12);
    expect(si.molSToKmolh(1)).toBeCloseTo(3.6, 12);
  });
  it('temperature: 25 degC = 298.15 K, 0 K = -273.15 degC', () => {
    expect(si.cToK(25)).toBeCloseTo(298.15, 12);
    expect(si.kToC(0)).toBeCloseTo(-273.15, 12);
    expect(si.cToK(450)).toBeCloseTo(723.15, 12);
  });
  it('pressure: 1 bar = 1e5 Pa, 1 atm = 101325 Pa, 1 bar(g) = 201325 Pa', () => {
    expect(si.barToPa(1)).toBe(1e5);
    expect(si.paToBar(101325)).toBeCloseTo(1.01325, 12);
    expect(si.atmToPa(1)).toBe(101325);
    expect(si.bargToPa(1)).toBe(201325);
    expect(si.paToBarg(101325)).toBeCloseTo(0, 12);
    expect(si.bargToPa(150)).toBeCloseTo(15101325, 6);
  });
  it('power: 1 MW = 1e6 W, 1 kW = 1000 W', () => {
    expect(si.mwToW(1)).toBe(1e6); expect(si.kwToW(2.5)).toBe(2500);
    expect(si.wToMw(3.2e6)).toBeCloseTo(3.2, 12); expect(si.wToKw(1500)).toBe(1.5);
  });
  it('mass flow: 36 t/h = 10 kg/s, 86.4 t/d = 1 kg/s', () => {
    expect(si.tphToKgS(36)).toBeCloseTo(10, 12);
    expect(si.tpdToKgS(86.4)).toBeCloseTo(1, 12);
    expect(si.kgSToTpd(1)).toBeCloseTo(86.4, 12);
    expect(si.kgSToTph(10)).toBeCloseTo(36, 12);
  });
  it('specific energy: 28 GJ/t = 2.8e7 J/kg', () => {
    expect(si.gjptToJpkg(28)).toBeCloseTo(2.8e7, 6); expect(si.jpkgToGjpt(2.8e7)).toBeCloseTo(28, 12);
  });
  it('molar energy: 50 kJ/mol = 50000 J/mol', () => {
    expect(si.kjpmolToJpmol(50)).toBe(50000); expect(si.jpmolToKjpmol(-92220)).toBeCloseTo(-92.22, 12);
  });
  it('fractions: 12.5 mol% = 0.125', () => {
    expect(si.molPctToFrac(12.5)).toBe(0.125); expect(si.fracToMolPct(0.021)).toBeCloseTo(2.1, 12);
  });
  it('energy: 1 MMBtu = 1.05505585262 GJ (IT Btu), a gas price converts consistently', () => {
    expect(si.mmbtuToGj(1)).toBeCloseTo(1.05505585262, 12); expect(si.gjToMmbtu(1.05505585262)).toBeCloseTo(1, 12);
    expect(si.perMmbtuToPerGj(11)).toBeCloseTo(11 / 1.05505585262, 12);
    expect(si.perGjToPerMmbtu(si.perMmbtuToPerGj(11))).toBeCloseTo(11, 12);
    expect(si.gjToJ(1)).toBe(1e9);
  });
});

describe('P22: display -> SI -> display is the identity (seeded fuzz, 10 000 cases per pair)', () => {
  const rng = new Rng(2210);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), 1);   // relative above 1 unit, absolute below
  for (const [name, pair] of Object.entries(si.DISPLAY_PAIRS)) {
    it(`${name}`, () => {
      const [lo, hi] = pair.range;
      for (let i = 0; i < 10000; i++) {
        const x = i % 4 === 0 ? rng.range(lo, hi) : rng.range(lo, hi) * (i % 4 === 1 ? 1e-3 : 1);
        const back = pair.fromSI(pair.toSI(x));
        if (!close(back, x)) throw new Error(`${name}: ${x} -> ${pair.toSI(x)} -> ${back}`);
        expect(Number.isFinite(pair.toSI(x))).toBe(true);
      }
    });
  }
  it('SI -> display -> SI too', () => {
    for (const [name, pair] of Object.entries(si.DISPLAY_PAIRS)) {
      for (let i = 0; i < 2000; i++) {
        const x = rng.range(pair.range[0], pair.range[1]); const s = pair.toSI(x);
        expect(Math.abs(pair.toSI(pair.fromSI(s)) - s), name).toBeLessThanOrEqual(1e-12 * Math.max(Math.abs(s), 1));
      }
    }
  });
  it('conversions are monotone and non-finite input stays non-finite (never a silent zero)', () => {
    for (const [name, pair] of Object.entries(si.DISPLAY_PAIRS)) {
      expect(pair.toSI(pair.range[1]), name).toBeGreaterThan(pair.toSI(pair.range[0]));
      expect(Number.isNaN(pair.toSI(NaN)), name).toBe(true);
    }
  });
});
