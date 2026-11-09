import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { SPECIES, SPECIES_IDS } from '../../data/species';
import { THERMO, T_REF, cpOf, hOf, sOf, gOf, dHvapOf, isExtrapolated, thermoOf, hasThermo, eval3, extrapolationDiag } from './species';

const withThermo = SPECIES_IDS.filter((id) => SPECIES[id]!.hasThermo);
const R = 8.314462618;

describe('h / s / cp / g of every species', () => {
  it('h(298.15) = dHf and s(298.15) = S298 (heat-of-formation basis)', () => {
    for (const id of withThermo) {
      const t = THERMO[id]!;
      expect(Math.abs(hOf(t, T_REF) - SPECIES[id]!.dHf298! * 1000), id).toBeLessThan(1e-6);
      expect(Math.abs(sOf(t, T_REF) - SPECIES[id]!.S298!), id).toBeLessThan(0.0015); // S298 is stored rounded to 1e-3
    }
  });

  it('pseudo-species without thermo are refused', () => {
    expect(hasThermo('H2O2(aq)')).toBe(false);
    expect(() => thermoOf('C3H8O2')).toThrow();
    expect(hasThermo('N2')).toBe(true);
  });

  it('identities: dh/dT = cp, ds/dT = cp/T (central differences, 1e-6), g = h - T s exactly', () => {
    for (const id of withThermo) {
      const t = THERMO[id]!;
      const segs = SPECIES[id]!.segments;
      const lo = segs.length ? segs[0]!.Tlo : 200, hi = segs.length ? segs[segs.length - 1]!.Thi : 400;
      for (const f of [0.2, 0.45, 0.8]) {
        const T = lo + f * Math.min(hi - lo, 800) + 7.3;
        // stay away from segment breaks (the identities hold inside a segment)
        if (segs.some((s) => Math.abs(T - s.Tlo) < 3 || Math.abs(T - s.Thi) < 3)) continue;
        if (id === 'NH3(l)' && T > SPECIES['NH3']!.Tc! - 5) continue;
        const e = 1e-2;
        const dh = (hOf(t, T + e) - hOf(t, T - e)) / (2 * e);
        const ds = (sOf(t, T + e) - sOf(t, T - e)) / (2 * e);
        expect(Math.abs(dh / cpOf(t, T) - 1), `${id} dh/dT at ${T}`).toBeLessThan(1e-6);
        expect(Math.abs(ds / (cpOf(t, T) / T) - 1), `${id} ds/dT at ${T}`).toBeLessThan(1e-6);
        expect(gOf(t, T)).toBe(hOf(t, T) - T * sOf(t, T));
      }
    }
  });

  it('eval3 returns the same numbers as cpOf/hOf/sOf', () => {
    const out = [0, 0, 0];
    for (const id of ['N2', 'H2O', 'S', 'NH3(l)', 'C']) {
      const t = THERMO[id]!;
      eval3(t, 640, out);
      expect(out).toEqual([cpOf(t, 640), hOf(t, 640), sOf(t, 640)]);
    }
  });
});

describe('continuity at polynomial breaks', () => {
  // Genuine NIST discontinuities between adjacent Shomate fits (measured by scripts and reported): up to 13 J/mol in h,
  // 0.012 J/(mol K) in s and 0.33 J/(mol K) in Cp (C2H4 1200 K). Phase changes of S / NaOH are latent-heat steps.
  const GENERIC = { h: 15, s: 0.015, cp: 0.35 };
  const SPECIAL: Record<string, { h: number; s: number; cp: number }> = {
    'S@432': { h: 40, s: 0.06, cp: 7.4 }, // lambda transition of liquid sulfur: two fits of one phase, Cp genuinely jumps
  };
  const eps = 1e-9;
  for (const id of withThermo) {
    const segs = SPECIES[id]!.segments;
    for (let i = 1; i < segs.length; i++) {
      const T = segs[i]!.Tlo;
      const t = THERMO[id]!;
      if (segs[i]!.phaseChange) {
        it(`${id} at ${T} K is a phase change: latent-heat step with dS = dH/T`, () => {
          const dh = hOf(t, T) - hOf(t, T - eps), ds = sOf(t, T) - sOf(t, T - eps);
          expect(dh).toBeGreaterThan(300); // J/mol: 0.4 kJ/mol (rh->mono) ... 1.7 kJ/mol (fusion), NaOH 7.2
          expect(Math.abs(ds / (dh / T) - 1)).toBeLessThan(0.15); // S: coexisting-phase step; tabulated polynomials are not exact
        });
        continue;
      }
      it(`${id} at ${T} K: h, s, cp continuous within the source's own jump`, () => {
        const tol = SPECIAL[`${id}@${T}`] ?? GENERIC;
        expect(Math.abs(hOf(t, T) - hOf(t, T - eps))).toBeLessThan(tol.h);
        expect(Math.abs(sOf(t, T) - sOf(t, T - eps))).toBeLessThan(tol.s);
        expect(Math.abs(cpOf(t, T) - cpOf(t, T - eps))).toBeLessThan(tol.cp);
      });
    }
  }
});

describe('extrapolation outside the polynomial range', () => {
  it('is linear in Cp from the boundary, continuous in h, s, cp, and flagged', () => {
    for (const id of ['H2', 'H2O(l)', 'CO2', 'NH3', 'C3H8']) {
      const t = THERMO[id]!;
      const seg = SPECIES[id]!.segments;
      const Tl = seg[0]!.Tlo, Th = seg[seg.length - 1]!.Thi;
      expect(isExtrapolated(t, (Tl + Th) / 2)).toBe(false);
      for (const [Tb, dir] of [[Tl, -1], [Th, 1]] as const) {
        const e = 1e-6;
        expect(isExtrapolated(t, Tb + dir * 40)).toBe(true);
        expect(Math.abs(hOf(t, Tb + dir * e) - hOf(t, Tb))).toBeLessThan(1e-3);
        expect(Math.abs(sOf(t, Tb + dir * e) - sOf(t, Tb))).toBeLessThan(1e-5);
        expect(Math.abs(cpOf(t, Tb + dir * e) - cpOf(t, Tb))).toBeLessThan(1e-4);
        // Cp is linear: second differences of cp vanish away from the boundary (unless clamped)
        const c1 = cpOf(t, Tb + dir * 50), c2 = cpOf(t, Tb + dir * 100), c3 = cpOf(t, Tb + dir * 150);
        expect(Math.abs(c1 - 2 * c2 + c3)).toBeLessThan(1e-9 * Math.abs(c2) + 1e-9);
        // and h still integrates cp: central difference identity holds in the extrapolated region
        const T = Tb + dir * 80, d = 1e-2;
        expect((hOf(t, T + d) - hOf(t, T - d)) / (2 * d) / cpOf(t, T)).toBeCloseTo(1, 6);
        expect((sOf(t, T + d) - sOf(t, T - d)) / (2 * d) / (cpOf(t, T) / T)).toBeCloseTo(1, 6);
      }
    }
  });

  it('Cp never collapses to zero or negative at 50 K or 3500 K (the solveT bracket)', () => {
    for (const id of withThermo) {
      if (id === 'NH3(l)') continue;
      for (const T of [50, 3500]) expect(cpOf(THERMO[id]!, T), `${id} ${T}`).toBeGreaterThan(0);
    }
  });

  it('PROPERTY_EXTRAPOLATED is an info diagnostic with species and T', () => {
    expect(extrapolationDiag('N2', 1000)).toBeNull();
    const d = extrapolationDiag('N2', 50)!;
    expect(d.code).toBe('PROPERTY_EXTRAPOLATED');
    expect(d.severity).toBe('info');
    expect(d.species).toBe('N2');
    expect(d.data['T']).toBe(50);
  });
});

describe('Watson liquid (NH3(l)) and dHvap', () => {
  it('dHvap at Tb equals the table values: NH3 23.33, H2O 40.65 kJ/mol', () => {
    expect(dHvapOf(THERMO['NH3']!, SPECIES['NH3']!.Tb!)).toBeCloseTo(23330, 6);
    expect(dHvapOf(THERMO['H2O']!, SPECIES['H2O']!.Tb!)).toBeCloseTo(40650, 6);
    expect(dHvapOf(THERMO['NH3(l)']!, SPECIES['NH3']!.Tb!)).toBeCloseTo(23330, 6);
  });

  it('Watson exponent 0.38: dHvap(T) = dHvap(Tb) ((Tc-T)/(Tc-Tb))^0.38, zero at Tc', () => {
    const t = THERMO['NH3']!, s = SPECIES['NH3']!;
    for (const T of [250, 298.15, 350, 400]) {
      const want = 23330 * dmath.pow((s.Tc! - T) / (s.Tc! - s.Tb!), 0.38);
      expect(dHvapOf(t, T)).toBeCloseTo(want, 6);
    }
    expect(dHvapOf(t, s.Tc!)).toBe(0);
    expect(dHvapOf(t, 500)).toBe(0);
  });

  it('NH3(l): h_l = h_g - dHvap(T); liquid dHf298 is about -65.7 kJ/mol; Cp_l = Cp_g + 0.38 dHvap/(Tc-T)', () => {
    const l = THERMO['NH3(l)']!, g = THERMO['NH3']!;
    for (const T of [240, 298.15, 350]) {
      expect(hOf(l, T)).toBeCloseTo(hOf(g, T) - dHvapOf(g, T), 6);
      const Tc = SPECIES['NH3']!.Tc!;
      expect(cpOf(l, T)).toBeCloseTo(cpOf(g, T) + (0.38 * dHvapOf(g, T)) / (Tc - T), 9);
    }
    expect(SPECIES['NH3(l)']!.dHf298).toBeCloseTo(-65.68, 1);
  });

  it('NH3(l) at Tb: g_l = g_g(1 atm) (phase equilibrium at the normal boiling point)', () => {
    const l = THERMO['NH3(l)']!, g = THERMO['NH3']!, Tb = SPECIES['NH3']!.Tb!;
    const gGas1atm = gOf(g, Tb) + R * Tb * dmath.log(1.01325);
    expect(Math.abs(gOf(l, Tb) - gGas1atm)).toBeLessThan(1e-6);
  });

  it('NH3(l) S298 is within 4 % of the literature 111.3 J/(mol K) (Watson overshoots liquid Cp: reported)', () => {
    expect(Math.abs(sOf(THERMO['NH3(l)']!, 298.15) / 111.3 - 1)).toBeLessThan(0.04);
  });

  it('H2O: polynomial h_g - h_l at Tb is the ideal-gas dHvap 40.88 kJ/mol, 0.23 above the real-vapour 40.65 (reported)', () => {
    const Tb = SPECIES['H2O']!.Tb!;
    const d = (hOf(THERMO['H2O']!, Tb) - hOf(THERMO['H2O(l)']!, Tb)) / 1000;
    expect(Math.abs(d - 40.88)).toBeLessThan(0.02); // both polynomials reproduce JANAF to 0.002 kJ/mol; the 0.23 is vapour non-ideality
    expect(Math.abs(d - 40.65)).toBeLessThan(0.3);
  });

  it('H2O(l) polynomial at 298.15 K: Cp 75.3 and S 69.95', () => {
    expect(cpOf(THERMO['H2O(l)']!, 298.15)).toBeCloseTo(75.3, 0);
    expect(sOf(THERMO['H2O(l)']!, 298.15)).toBeCloseTo(69.95, 2);
  });
});

describe('sulfur phases', () => {
  it('rhombic -> monoclinic (368.3 K) -> liquid (388.36 K): h and s step up', () => {
    const t = THERMO['S']!;
    expect(hOf(t, 368.3 + 1e-9) - hOf(t, 368.3 - 1e-9)).toBeGreaterThan(300);
    expect(hOf(t, 388.36 + 1e-9) - hOf(t, 388.36 - 1e-9)).toBeGreaterThan(1500);
    expect(hOf(t, 300)).toBeLessThan(hOf(t, 500));
  });
});
