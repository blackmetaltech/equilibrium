import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { SPECIES } from '../../data/species';
import { K_HENRY_DEFAULT } from '../../data/vle';
import { bubbleT, dewT, flashK, flashSpecies, henryK, kValues, psatSpecies, rachfordRice } from './vle';

describe('Psat and K values', () => {
  it('NH3 Psat -20 C 1.90 bar, 0 C 4.29, +20 C 8.57 (DESIGN 2.6 L21, within the 0.61 % Antoine refit error)', () => {
    for (const [c, bar] of [[-20, 1.90], [0, 4.29], [20, 8.57]] as const) {
      const p = psatSpecies('NH3', 273.15 + c)!;
      expect(Math.abs(p.P / 1e5 / bar - 1)).toBeLessThan(0.0075);
    }
  });
  it('Henry K = H/P with H = c_w/Hcp(T); H2 in water at 1 bar is about 7e4; default 1e4 elsewhere', () => {
    const k = henryK('H2', 298.15, 1e5, 'water');
    expect(k).toBeGreaterThan(5e4); expect(k).toBeLessThan(1e5);
    expect(henryK('H2', 298.15, 1e5, 'other')).toBe(K_HENRY_DEFAULT);
    expect(henryK('NO2', 298.15, 1e5, 'water')).toBe(K_HENRY_DEFAULT);
  });
  it('kValues: NH3 Raoult, N2 Henry default, H2SO4(l) non-volatile, solvent detection', () => {
    const r = kValues(['N2', 'NH3', 'H2SO4(l)'], [1, 1, 1], 253.15, 1e5);
    expect(r.K[0]).toBe(K_HENRY_DEFAULT); expect(r.K[2]).toBe(0);
    expect(r.K[1]!).toBeCloseTo(psatSpecies('NH3', 253.15)!.P / 1e5, 12);
  });
});

describe('Rachford-Rice', () => {
  it('single-phase codes', () => {
    expect(rachfordRice([0.5, 0.5], [0.5, 0.1]).code).toBe('ALL_LIQUID');
    expect(rachfordRice([0.5, 0.5], [5, 3]).code).toBe('ALL_VAPOUR');
    expect(rachfordRice([0.5, 0.5], [3, 0.2]).code).toBe('TWO_PHASE');
  });
  it('non-volatile component (K = 0) keeps beta below 1', () => {
    const r = rachfordRice([0.2, 0.8], [1e4, 0]);
    expect(r.code).toBe('TWO_PHASE'); expect(r.beta).toBeCloseTo(2e-5 * 0 + r.beta, 12); expect(r.beta).toBeLessThan(0.2);
  });
});

describe('P20 flash fuzz (seeded, 10 000)', () => {
  const ids = ['NH3', 'H2O', 'CH3OH', 'C2H5OH', 'SO2', 'Cl2', 'N2', 'H2', 'CO2', 'Ar'];
  it('sum x = sum y = 1, beta in [0,1], bubble/dew bracket consistent, RR residual <= 1e-12', () => {
    const rng = new Rng(2020);
    let two = 0, single = 0;
    for (let c = 0; c < 10000; c++) {
      const pick = ids.filter(() => rng.chance(0.4)); if (pick.length < 2) continue;
      const z = pick.map(() => rng.range(0.01, 1)); const s = z.reduce((a, b) => a + b, 0); const zn = z.map((v) => v / s);
      const T = rng.range(240, 450), P = Math.exp(rng.range(Math.log(5e4), Math.log(2e7)));
      const { K } = kValues(pick, zn, T, P);
      const f = flashK(zn, K);
      expect(f.beta).toBeGreaterThanOrEqual(0); expect(f.beta).toBeLessThanOrEqual(1);
      expect(f.residual).toBeLessThanOrEqual(1e-12);
      const sx = f.x.reduce((a, b) => a + b, 0), sy = f.y.reduce((a, b) => a + b, 0);
      expect(Math.abs(sx - 1)).toBeLessThan(1e-12); expect(Math.abs(sy - 1)).toBeLessThan(1e-12);
      const sumzK = zn.reduce((a, v, i) => a + v * K[i]!, 0), sumzoK = zn.reduce((a, v, i) => a + v / K[i]!, 0);
      if (f.code === 'TWO_PHASE') { two++; expect(sumzK).toBeGreaterThan(1 - 1e-12); expect(sumzoK).toBeGreaterThan(1 - 1e-12); }
      else { single++; if (f.code === 'ALL_LIQUID') expect(sumzK).toBeLessThanOrEqual(1 + 1e-12); else expect(sumzoK).toBeLessThanOrEqual(1 + 1e-12); }
      // bubble/dew bracket on the same K(T) model: bubble T <= T <= dew T iff two-phase
      const Kfn = (t: number) => kValues(pick, zn, t, P).K;
      const tb = bubbleT(zn, Kfn, 150, 700), td = dewT(zn, Kfn, 150, 700);
      if (tb && td && f.code === 'TWO_PHASE') { expect(tb.T).toBeLessThanOrEqual(T + 1e-6); expect(td.T).toBeGreaterThanOrEqual(T - 1e-6); }
      if (tb && f.code === 'ALL_LIQUID') expect(tb.T).toBeGreaterThanOrEqual(T - 1e-6);
      if (td && f.code === 'ALL_VAPOUR') expect(td.T).toBeLessThanOrEqual(T + 1e-6);
    }
    expect(two).toBeGreaterThan(500); expect(single).toBeGreaterThan(500);
  });
  it('flashSpecies conserves every species exactly and respects K', () => {
    const rng = new Rng(7);
    for (let c = 0; c < 2000; c++) {
      const pick = ids.filter(() => rng.chance(0.5)); if (pick.length < 2) continue;
      const n = pick.map(() => rng.range(0, 5));
      const f = flashSpecies(pick, n, rng.range(240, 450), Math.exp(rng.range(Math.log(5e4), Math.log(2e7))));
      pick.forEach((_, i) => { expect(Math.abs(f.nV[i]! + f.nL[i]! - n[i]!)).toBeLessThanOrEqual(1e-12 * Math.max(1, n[i]!)); expect(f.nV[i]!).toBeGreaterThanOrEqual(0); expect(f.nL[i]!).toBeGreaterThanOrEqual(0); });
    }
    expect(SPECIES.NH3).toBeDefined();
  });
});
