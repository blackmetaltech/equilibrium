import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_IDS, MUST_SHIP, ATOMIC_WEIGHT, findSpecies, atomMatrix, molarMassOf } from './species';

// DESIGN 4.1 table: key -> [M g/mol, dHf kJ/mol, S J/(mol K)]
const TABLE: Record<string, [number, number | null, number | null]> = {
  N2: [28.014, 0, 191.61], H2: [2.016, 0, 130.68], O2: [31.998, 0, 205.15], Ar: [39.95, 0, 154.84],
  CH4: [16.043, -74.87, 186.25], NH3: [17.031, -45.9, 192.77], H2O: [18.015, -241.82, 188.83],
  'H2O(l)': [18.015, -285.83, 69.95], CO: [28.01, -110.52, 197.66], CO2: [44.009, -393.53, 213.79],
  SO2: [64.058, -296.84, 248.21], SO3: [80.057, -395.77, 256.77], S: [32.06, 0, 32.05],
  'H2SO4(l)': [98.072, -813.99, 156.9], NO: [30.006, 90.29, 210.76], NO2: [46.005, 33.1, 240.04],
  N2O4: [92.01, 9.08, 304.38], N2O: [44.013, 82.05, 219.96], // DESIGN 4.1 lists 81.6 / 220.0 (placeholder 'add from NIST'); NIST-JANAF N-026 is 82.048 / 219.957
  'HNO3(l)': [63.012, -174.1, 155.6],
  CH3OH: [32.042, -200.94, 239.81], 'CH3OH(l)': [32.042, -239.5, 127.19], C2H5OH: [46.069, -234.95, 280.59],
  'C2H5OH(l)': [46.069, -276.9, 159.86], C6H12O6: [180.156, -1273.3, 209.19], Cl2: [70.9, 0, 223.08],
  HCl: [36.458, -92.31, 186.9], C3H8: [44.097, -104.68, 270.32], C: [12.011, 0, 5.74],
};

describe('species database', () => {
  it('IUPAC 2021 conventional atomic weights (DESIGN 3.2)', () => {
    expect(ATOMIC_WEIGHT).toMatchObject({ H: 1.008, C: 12.011, N: 14.007, O: 15.999, S: 32.06, Cl: 35.45, Na: 22.99, Ar: 39.95 });
  });

  it('must-ship species of DESIGN 10.1 are all present', () => {
    for (const id of ['N2', 'H2', 'O2', 'Ar', 'CH4', 'NH3', 'NH3(l)', 'H2O', 'H2O(l)', 'CO', 'CO2', 'SO2', 'SO3', 'S', 'H2SO4(l)', 'NO2', 'N2O4', 'C3H8', 'C', 'H2O2(aq)', 'C3H6O', 'C3H8O2'])
      expect(findSpecies(id), id).toBeDefined();
    expect(MUST_SHIP.length).toBeGreaterThanOrEqual(22);
  });

  it('ids are unique and consistent with the record id', () => {
    expect(new Set(SPECIES_IDS).size).toBe(SPECIES_IDS.length);
    for (const id of SPECIES_IDS) expect(SPECIES[id]!.id).toBe(id);
  });

  for (const [id, [M, dHf, S]] of Object.entries(TABLE)) {
    it(`${id}: M, dHf, S against the DESIGN table`, () => {
      const s = SPECIES[id]!;
      expect(s, id).toBeDefined();
      expect(Math.abs(s.M - M)).toBeLessThan(0.0015);
      if (dHf !== null) expect(Math.abs(s.dHf298! - dHf)).toBeLessThan(0.02);
      if (S !== null) expect(Math.abs(s.S298! - S)).toBeLessThan(0.02);
    });
  }

  it('molar mass is computed from the element vector (glucose 180.156, EQ-NC-001)', () => {
    for (const id of SPECIES_IDS) expect(SPECIES[id]!.M).toBeCloseTo(molarMassOf(SPECIES[id]!.elements), 9);
    expect(SPECIES['C6H12O6']!.M).toBeCloseTo(180.156, 9);
    expect(SPECIES['biomass']!.M).toBeCloseTo(24.626, 3);
  });

  it('element vectors: atom matrix rows', () => {
    expect(SPECIES['NH3']!.elements).toEqual({ N: 1, H: 3 });
    const { elements, A } = atomMatrix(['N2', 'H2', 'NH3']);
    expect(elements.sort()).toEqual(['H', 'N']);
    // conservation of N2 + 3 H2 -> 2 NH3 through the matrix
    const ids = ['N2', 'H2', 'NH3'];
    const nu = [-1, -3, 2];
    const { A: A2, elements: el2 } = atomMatrix(ids);
    for (let e = 0; e < el2.length; e++) expect(nu.reduce((a, v, i) => a + v * A2[e]![i]!, 0)).toBe(0);
    expect(A.length).toBe(elements.length);
  });

  it('critical constants and Tb where DESIGN 4.1 lists them', () => {
    const nh3 = SPECIES['NH3']!;
    expect(nh3.Tc).toBeCloseTo(405.56, 2);
    expect(nh3.Pc! / 1e5).toBeCloseTo(113.634, 3);
    expect(nh3.omega).toBeCloseTo(0.2557, 4);
    expect(nh3.Tb).toBeCloseTo(239.83, 2);
    expect(SPECIES['H2O']!.Tc).toBeCloseTo(647.1, 1);
    expect(SPECIES['H2O(l)']!.Tc).toBeCloseTo(647.096, 3); // liquid inherits the fluid's critical constants
    expect(SPECIES['SO3']!.confCrit).toBe('UNVERIFIED');
  });

  it('species colours follow DESIGN 5.6 and are valid hex', () => {
    for (const id of SPECIES_IDS) expect(SPECIES[id]!.colour).toMatch(/^#[0-9A-F]{6}$/);
    expect(SPECIES['NH3']!.colour).toBe('#9D4EDD');
    expect(SPECIES['H2SO4(l)']!.colour).toBe('#B5651D');
    expect(SPECIES['Ar']!.colour).toBe('#6C757D');
  });

  it('records are plain JSON (no functions, no NaN)', () => {
    const s = JSON.stringify(SPECIES);
    expect(s).not.toContain('null,null');
    expect(JSON.parse(s)).toEqual(SPECIES);
  });
});
