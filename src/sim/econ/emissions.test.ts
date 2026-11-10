import { describe, expect, it } from 'vitest';
import { GWP, co2eFromCh4, co2eFromN2o, co2FromFuelKgPerH, co2FromGridKgPerH, co2eTotalKgPerH, so2KgPerH, so2KgPerTonneAcid, conversionFromSo2KgPerTonne } from './emissions';
import { SPECIES } from '../../data/species';

const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel);

describe('GWP100 (IPCC AR6)', () => { it('N2O 273, CH4 29.8', () => { expect(GWP.N2O).toBe(273); expect(GWP.CH4).toBe(29.8); near(co2eFromN2o(1), 273); near(co2eFromCh4(1), 29.8); }); });

describe('CO2 from energy', () => {
  it('fired fuel: 10 MW duty burns 11.76 MW of fuel = 42.35 GJ/h x 56.1 kg/GJ = 2376 kg/h', () => { near(co2FromFuelKgPerH(10e6), 2376.0); });
  it('the natural-gas factor is within 3 % of pure-methane stoichiometry (CH4 LHV from the species data)', () => {
    const dHc = SPECIES['CO2']!.dHf298! + 2 * SPECIES['H2O']!.dHf298! - SPECIES['CH4']!.dHf298!;   // kJ/mol, gaseous water
    const stoich = SPECIES['CO2']!.M / -dHc;                                                          // g/kJ = kg/MJ
    expect(Math.abs(56.1 / (stoich * 1000) - 1)).toBeLessThan(0.03);
  });
  it('grid electricity: 1 MW electric at 0.47 t/MWh = 470 kg/h; the pack factor is an argument', () => { near(co2FromGridKgPerH(1e6, 0.47), 470); near(co2FromGridKgPerH(1e6, 0.213), 213); });
  it('co2e total adds fuel, grid, N2O and CH4 lines', () => {
    near(co2eTotalKgPerH({ fuelDutyW: 10e6, electricW: 1e6, n2oKgPerH: 1, ch4KgPerH: 10 }, 0.47), 2376 + 470 + 273 + 298);
  });
});

describe('SO2', () => {
  it('stack flow: 100 mol/s at 0.2 % SO2 is 0.2 mol/s = 46.12 kg/h (M from the species data)', () => { near(so2KgPerH(100, 0.002), 100 * 0.002 * SPECIES['SO2']!.M * 3.6); near(so2KgPerH(100, 0.002), 46.12176, 1e-6); });
  it('the DESIGN §4.8 identity per tonne of 100 % H2SO4: 97 % -> 20.2, 99.5 % -> 3.3, 99.7 % -> 1.97, 99.8 % -> 1.31, 99.9 % -> 0.65', () => {
    for (const [x, e] of [[0.97, 20.2], [0.995, 3.3], [0.997, 1.97], [0.998, 1.31], [0.999, 0.65]] as const) expect(Math.abs(so2KgPerTonneAcid(x) - e), `X=${x}`).toBeLessThan(0.02 * (e > 10 ? 2 : 1));
  });
  it('the identity is E = M_SO2/M_H2SO4 * 1000 * (1-X)/X, and its inverse recovers X', () => {
    near(so2KgPerTonneAcid(0.97), (SPECIES['SO2']!.M / SPECIES['H2SO4(l)']!.M) * 1000 * 0.03 / 0.97);
    for (const x of [0.9, 0.97, 0.997, 0.9995]) near(conversionFromSo2KgPerTonne(so2KgPerTonneAcid(x)), x, 1e-12);
  });
  it('100 % conversion emits nothing; zero conversion is a code, not Infinity', () => { expect(so2KgPerTonneAcid(1)).toBe(0); expect(() => so2KgPerTonneAcid(0)).toThrow('CONV_BAD'); });
  it('the L25 limits map to conversions: 2.0 kg/t is 99.70 %, 1.3 kg/t 99.80 %, 0.65 kg/t 99.90 %', () => {
    near(conversionFromSo2KgPerTonne(2.0), 0.997, 1e-3); near(conversionFromSo2KgPerTonne(1.3), 0.998, 1e-3); near(conversionFromSo2KgPerTonne(0.65), 0.999, 1e-3);
  });
});
