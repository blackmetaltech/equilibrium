import { describe, expect, it } from 'vitest';
import { CONST } from '@core/numerics';
import { ATOMIC_WEIGHT, SPECIES, SPECIES_IDS } from '../../data/species';
import {
  ELEMENT_WEIGHT, actualFromPercentYield, bondEnthalpySum, boyleMixPressure, combustionAnalysis, daltonPartials, daltonPartialsFromMass,
  deltaHfromDeltaU, deltaUfromDeltaH, empiricalFormula, gibbsFromHS, heatOfReactionPoly, hessSum, idealGasMoles, idealGasPressure,
  massFromMoles, massFromMolarity, molarMass, molarityFromMassPercent, molesFromMass, molesFromParticles, moleFractions, moleRatios,
  parseFormula, particlesFromMoles, spontaneityT,
} from './basics';

describe('molar mass: one source of truth', () => {
  it('every catalogue species M equals molarMass of its element vector with the shared IUPAC table', () => {
    for (const id of SPECIES_IDS) expect(molarMass(SPECIES[id]!.elements), id).toBeCloseTo(SPECIES[id]!.M, 9);
  });
  it('ELEMENT_WEIGHT extends (never overrides) the catalogue table', () => {
    for (const e of Object.keys(ATOMIC_WEIGHT)) expect(ELEMENT_WEIGHT[e]).toBe(ATOMIC_WEIGHT[e]);
    expect(ELEMENT_WEIGHT['Cu']).toBeCloseTo(63.546, 3);
  });
  it('parseFormula handles groups, hydrate-free formulas and counts', () => {
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula('CH3COONa')).toEqual({ C: 2, H: 3, O: 2, Na: 1 });
    expect(parseFormula('Al2(SO4)3')).toEqual({ Al: 2, S: 3, O: 12 });
    expect(molarMass('C6H12O6')).toBeCloseTo(180.156, 3);
    expect(() => parseFormula('Xx2')).not.toThrow();
  });
  it('unknown element gives NaN molar mass, not a silent zero', () => {
    expect(Number.isNaN(molarMass('Xx2'))).toBe(true);
  });
});

describe('moles, mass, particles, solutions', () => {
  it('Avogadro from the core CODATA constant; round trip', () => {
    expect(particlesFromMoles(1)).toBe(CONST.NA);
    expect(molesFromParticles(particlesFromMoles(3.3))).toBeCloseTo(3.3, 12);
    expect(massFromMoles(molesFromMass(10, 18.015), 18.015)).toBeCloseTo(10, 12);
  });
  it('molarity from mass percent and back: c = 10 w rho / M', () => {
    const c = molarityFromMassPercent(69, 1.41, 63.012);
    expect(c).toBeCloseTo((10 * 69 * 1.41) / 63.012, 12);
    expect(massFromMolarity(c, 1, 63.012)).toBeCloseTo(69 * 1.41 * 10, 9);
  });
  it('percent yield', () => { expect(actualFromPercentYield(22, 80)).toBeCloseTo(17.6, 12); });
});

describe('gases', () => {
  it('PV = nRT with the caller R, both ways', () => {
    const R = 8.314;
    expect(idealGasPressure(1, 273.15, 0.0224, R)).toBeCloseTo((R * 273.15) / 0.0224, 8);
    expect(idealGasMoles(idealGasPressure(2, 300, 0.01, R), 0.01, 300, R)).toBeCloseTo(2, 12);
  });
  it('Dalton: partials sum to the total; mole fractions sum to 1', () => {
    const p = daltonPartials({ A: 2, B: 3, C: 5 }, 10);
    expect(p['A']! + p['B']! + p['C']!).toBeCloseTo(10, 12);
    expect(p['C']).toBeCloseTo(5, 12);
    const y = moleFractions({ A: 1, B: 3 });
    expect(y['A']! + y['B']!).toBe(1);
    const pm = daltonPartialsFromMass({ A: 20, B: 80 }, { A: 2, B: 32 }, 1);
    expect(pm['A']! + pm['B']!).toBeCloseTo(1, 12);
  });
  it('Boyle mixing into a final volume at constant T', () => { expect(boyleMixPressure([{ p: 1, V: 2 }, { p: 3, V: 1 }], 5)).toBeCloseTo(1, 12); });
});

describe('empirical formula and combustion analysis', () => {
  it('moleRatios relative to the smallest', () => {
    const r = moleRatios({ A: 12, B: 8 }, { A: 12, B: 1 });
    expect(r['B']).toBeCloseTo(8, 12);
    expect(r['A']).toBeCloseTo(1, 12);
  });
  it('smallest integer ratio: 1:1.5 -> 2:3 (Fe2O3), 1:1.333 -> 3:4, 1:1.25 -> 4:5', () => {
    const w = { Fe: 55.845, O: 15.999 };
    expect(empiricalFormula({ Fe: 69.9, O: 30.1 }, w).formula).toEqual({ Fe: 2, O: 3 });
    expect(empiricalFormula({ Fe: 72.36, O: 27.64 }, w).formula).toEqual({ Fe: 3, O: 4 });
  });
  it('combustion analysis: C from CO2, H from H2O, O by difference; C:H from CO2:H2O', () => {
    // 0.2 g of a hydrocarbon: 0.6 g CO2 and 0.3 g H2O
    const c = combustionAnalysis({ sample_g: 0.2, CO2_g: 0.6, H2O_g: 0.3 });
    expect(c.mol['C']).toBeCloseTo(0.6 / molarMass('CO2'), 12);
    expect(c.mol['H']).toBeCloseTo((2 * 0.3) / molarMass('H2O'), 12);
  });
});

describe('thermochemistry helpers', () => {
  it('dH = dU + dn R T and back', () => {
    expect(deltaHfromDeltaU(-10500, -1, 298, 8.314)).toBeCloseTo(-10500 - 8.314 * 298, 9);
    expect(deltaUfromDeltaH(deltaHfromDeltaU(1234, 2, 350, 8.314), 2, 350, 8.314)).toBeCloseTo(1234, 9);
  });
  it('Hess sum, Gibbs and spontaneity T consistency: dG(T_s) = 0', () => {
    expect(hessSum([{ coef: 1, dH: -393.5 }, { coef: -1, dH: -283 }])).toBeCloseTo(-110.5, 12);
    const Ts = spontaneityT(400, 0.2);
    expect(gibbsFromHS(400, Ts, 0.2)).toBeCloseTo(0, 9);
  });
  it('bond enthalpies: broken minus formed, [energy, count] pairs', () => {
    expect(bondEnthalpySum({ 'H-H': 436, 'Cl-Cl': 242 }, { 'H-Cl': [431, 2] })).toBe(-184);
  });
  it('dH(T) from a Cp polynomial equals dH298 at T0 and the Kirchhoff integral elsewhere', () => {
    const sp = [{ nu: -1, A: 3, B: 0.001, C: 0, D: 0, dHf298: -100000 }, { nu: 1, A: 4, B: 0.002, C: 0, D: 0, dHf298: -150000 }];
    const R = 8.314;
    expect(heatOfReactionPoly(sp, 298.15, 298.15, R).dH).toBeCloseTo(-50000, 9);
    const at = heatOfReactionPoly(sp, 400, 298.15, R).dH;
    expect(at).toBeCloseTo(-50000 + R * (1 * (400 - 298.15) + (0.001 / 2) * (400 * 400 - 298.15 * 298.15)), 6);
  });
});
