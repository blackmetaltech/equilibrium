// DESIGN 9.2.2 data oracle: thermo vs NIST-JANAF tables (docs/research/janaf/*.html, parsed into the fixture by
// scripts/port-thermo.py). H-H298 within 0.02 kJ/mol, S within 0.02 J/(mol K), Cp within 0.1 J/(mol K).
import { describe, expect, it } from 'vitest';
import fx from './fixtures/janaf.json';
import { THERMO, cpOf, hOf, sOf } from '../sim/thermo/species';

const TOL = { dH: 0.02, S: 0.02, Cp: 0.1 };
const T0 = 298.15;

// Genuine disagreements between the NIST Shomate fit (or the game's single liquid-sulfur polynomial) and the NIST-JANAF
// table. NOT widened tolerances: each case is pinned at its observed value (+3 %) so it cannot get worse, and is
// reported to the director. Key: `${id}@${T}` -> max allowed |dCp| (only Cp breaks the 0.1 band).
const KNOWN_CP: Record<string, number> = {
  'CH4@1500': 0.1195 * 1.03, // NIST Shomate 1300-6000 K vs JANAF
  'C2H4@1500': 0.1906 * 1.03, // NIST Shomate 1200-6000 K vs JANAF
  'N2O4@1000': 0.1029 * 1.03, // at the 1000 K break the upper NIST segment (1000-6000 K) is used; the lower one is 0.026 off
  'S@500': 0.4897 * 1.03, // liquid sulfur: NIST 432-882 K Shomate vs JANAF (lambda transition region)
  'S@700': 0.1974 * 1.03,
};

type Row = { T: number; Cp: number; S: number; dH: number; inRange: boolean };
type Sp = { id: string; janaf: string; extra: boolean; rows: Row[]; logKf: Record<string, number> };
const species = fx.species as unknown as Sp[];

describe('JANAF data oracles (DESIGN 9.2.2)', () => {
  it('fixture covers the 17 research species at the design temperatures (+ graphite and N2O extras)', () => {
    expect(species.filter((s) => !s.extra)).toHaveLength(17);
    expect(species.filter((s) => s.extra).map((s) => s.id).sort()).toEqual(['C', 'N2O']);
    for (const s of species) {
      expect(s.rows.length).toBeGreaterThanOrEqual(2);
      for (const r of s.rows) expect([300, 500, 700, 1000, 1500]).toContain(r.T);
    }
    // 17 x 5 minus H2O(l) (JANAF H-063 stops at 500 K: 3 missing) = 82 rows for the 17, 87 with extras
    expect(species.filter((s) => !s.extra).reduce((a, s) => a + s.rows.length, 0)).toBe(82);
  });

  for (const s of species) {
    for (const r of s.rows) {
      const name = `${s.id} (${s.janaf}) at ${r.T} K`;
      if (!r.inRange) {
        it.skip(`${name}: outside the modelled range (JANAF reference state is S2 vapour above 882 K)`, () => {});
        continue;
      }
      it(`${name}: H-H298, S, Cp`, () => {
        const th = THERMO[s.id]!;
        const dH = (hOf(th, r.T) - hOf(th, T0)) / 1000;
        expect(Math.abs(dH - r.dH)).toBeLessThan(TOL.dH);
        expect(Math.abs(sOf(th, r.T) - r.S)).toBeLessThan(TOL.S);
        const dCp = Math.abs(cpOf(th, r.T) - r.Cp);
        const known = KNOWN_CP[`${s.id}@${r.T}`];
        if (known === undefined) expect(dCp).toBeLessThan(TOL.Cp);
        else {
          expect(dCp).toBeGreaterThan(TOL.Cp); // if this starts passing, delete the KNOWN_CP entry
          expect(dCp).toBeLessThan(known);
        }
      });
    }
  }

  it('standard-state anchors: S298 and dHf298 of the JANAF table match the species data', () => {
    for (const s of species) {
      const th = THERMO[s.id]!;
      if (s.id === 'S') continue; // JANAF S-001 dHf is the element (0); our rhombic S298 is CODATA 32.054 vs 32.057 fitted
      expect(Math.abs(sOf(th, T0) - (fx.species as any[]).find((x) => x.id === s.id).S298)).toBeLessThan(0.02);
    }
  });
});
