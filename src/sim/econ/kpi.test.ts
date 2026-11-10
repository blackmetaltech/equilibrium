import { describe, expect, it } from 'vitest';
import { annualCost, costPerTonne, gjPerTonne, kgSo2PerTonneAcid, steamPerTonne, tco2ePerTonne, OPERATING_HOURS } from './kpi';
import { annualisedCapex } from './capex';

const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('per-tonne KPIs', () => {
  it('operates 8000 h/yr (DESIGN §4.6)', () => { expect(OPERATING_HOURS).toBe(8000); });
  it('annual cost = annualised C_BM + hourly opex x 8000 h', () => {
    const a = annualCost(10e6, 1000); near(a.capital, annualisedCapex(10e6)); near(a.opex, 8e6); near(a.total, a.capital + a.opex);
  });
  it('cost per tonne = annual cost / (t/h x 8000): $10 M capex + $1000/h opex over 10 t/h = $121.43/t', () => { near(costPerTonne(annualCost(10e6, 1000).total, 10), (annualisedCapex(10e6) + 8e6) / 80000); near(costPerTonne(annualCost(10e6, 1000).total, 10), 121.4342, 1e-6); });
  it('the steam credit lowers the cost per tonne when opex is negative-signed (L00 acid)', () => { expect(costPerTonne(annualCost(1e6, 100 - 300).total, 5)).toBeLessThan(costPerTonne(annualCost(1e6, 100).total, 5)); });
  it('zero or negative production is a code', () => { expect(() => costPerTonne(1, 0)).toThrow('PROD_BAD'); expect(() => costPerTonne(1, -1)).toThrow('PROD_BAD'); });
  it('GJ/t: 28 MW of energy per 1 kg/s (0.001 t/s) of product is 28 GJ/t', () => { near(gjPerTonne(28e6, 1), 28); });
  it('t CO2e/t: 1600 kg/h CO2e over 1 t/h is 1.6 t/t', () => { near(tco2ePerTonne(1600, 1), 1.6); });
  it('steam t/t: 5 t/h per 4.5 t/h acid', () => { near(steamPerTonne(5, 4.5), 5 / 4.5); });
  it('kg SO2 per t of 100 % acid from a stack and an acid flow: 46.12 kg/h over 20 t/h', () => { near(kgSo2PerTonneAcid(46.12176, 20), 2.306088); });
});
