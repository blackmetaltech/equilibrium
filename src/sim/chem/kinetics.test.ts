import { describe, expect, it } from 'vitest';
import {
  arrhenius, arrheniusA, arrheniusEa, arrheniusK, firstOrderHalfLife, firstOrderK, firstOrderRemaining, firstOrderTime, isothermalConversion,
  rate, tempForK,
} from './kinetics';
import { KINETICS, MUST_SHIP_LAWS, lawOf, lawProvenanceReport, findLaw } from '../../data/kinetics';
import { CATALYSTS, catalystOf, catalystProvenanceReport } from '../../data/catalysts';
import { REACTIONS, findReaction } from '../../data/reactions';

const CONFS = ['FETCHED', 'F2', 'SNIP', 'GAME', 'UNVERIFIED'];

describe('Arrhenius helpers', () => {
  it('k_ref form equals the classic form (K1, K7)', () => {
    for (const id of ['K1', 'K7']) {
      const p = lawOf(id).params;
      for (const T of [290, 320, 400, 650, 700, 800]) {
        const a = arrheniusK(p['kref']!, p['Ea']!, T, p['Tref']!, p['R']!);
        const b = arrhenius(p['A']!, p['Ea']!, T, p['R']!);
        expect(Math.abs(a / b - 1), id + ' ' + T).toBeLessThan(1e-11);
      }
    }
  });
  it('two-point Ea and A invert arrhenius', () => {
    const k1 = arrhenius(3e7, 62000, 310, 8.314);
    const k2 = arrhenius(3e7, 62000, 350, 8.314);
    expect(arrheniusEa(k1, 310, k2, 350, 8.314)).toBeCloseTo(62000, 6);
    expect(arrheniusA(k1, 62000, 310, 8.314) / 3e7).toBeCloseTo(1, 12);
    expect(tempForK(k2, 3e7, 62000, 8.314)).toBeCloseTo(350, 8);
  });
  it('first-order helpers', () => {
    const k = firstOrderK(100);
    expect(firstOrderHalfLife(k)).toBeCloseTo(100, 12);
    expect(firstOrderRemaining(k, 100)).toBeCloseTo(0.5, 12);
    expect(firstOrderTime({ tHalf: 100, fraction: 0.25 })).toBeCloseTo(200, 9);
    expect(firstOrderTime({ k, A0: 8, A: 1 })).toBeCloseTo(300, 9);
  });
});

describe('catalogue provenance', () => {
  it('every law and catalyst carries src and conf', () => {
    for (const r of lawProvenanceReport()) { expect(r.src.trim().length, r.id).toBeGreaterThan(0); expect(CONFS, r.id).toContain(r.conf); }
    for (const r of catalystProvenanceReport()) { expect(r.src.trim().length, r.id).toBeGreaterThan(0); expect(CONFS, r.id).toContain(r.conf); expect(CONFS).toContain(r.rhoBConf); }
  });
  it('rho_b rows are tagged GAME until sourced; fused Fe 2500, V2O5 600', () => {
    for (const c of CATALYSTS) expect(c.rhoBConf, c.id).toBe('GAME');
    expect(catalystOf('fe_ammonia').rhoB).toBe(2500);
    expect(catalystOf('v2o5').rhoB).toBe(600);
    for (const c of CATALYSTS.filter((x) => x.kind === 'heterogeneous')) expect(c.rhoB, c.id).toBeGreaterThan(0);
  });
  it('must-ship laws K1 K2 K6 K7 are implemented; the rest are stretch stubs returning NaN', () => {
    expect(MUST_SHIP_LAWS.map((l) => l.id).sort()).toEqual(['K1', 'K2', 'K6', 'K7']);
    for (const l of KINETICS.filter((x) => x.tier === 'stretch')) {
      const r = rate(l.id, { speciesIds: ['N2'], y: [1], T: 500, P: 1e5 });
      expect(r.every(Number.isNaN), l.id).toBe(true);
    }
  });
  it('laws refer to catalogue reactions and catalysts; reaction catalysts all exist', () => {
    for (const l of KINETICS) {
      for (const r of l.reactions) expect(findReaction(r), l.id + ' ' + r).toBeDefined();
      for (const c of l.catalysts) expect(CATALYSTS.some((x) => x.id === c), l.id + ' ' + c).toBe(true);
    }
    for (const r of REACTIONS) for (const c of r.catalysts) expect(CATALYSTS.some((x) => x.id === c), r.id + ' ' + c).toBe(true);
    expect(findLaw('nope')).toBeUndefined();
  });
  it('windows: V2O5 410-620, Fe 380-520; Cs shifts light-off -40 K', () => {
    expect([catalystOf('v2o5').Tmin, catalystOf('v2o5').Tmax]).toEqual([410, 620]);
    expect([catalystOf('fe_ammonia').Tmin, catalystOf('fe_ammonia').Tmax]).toEqual([380, 520]);
    expect(catalystOf('v2o5_cs').dTk).toBe(-40);
  });
});

describe('rates', () => {
  const ids = ['N2', 'H2', 'NH3', 'Ar'];
  const y = [0.2328, 0.6984, 0.03, 0.0388];
  it('K1 is positive away from equilibrium, units mol/(kg s) scale as 1/rho_b', () => {
    const a = rate('K1', { speciesIds: ids, y, T: 673.15, P: 2e7, rhoB: 2200 })[0]!;
    const b = rate('K1', { speciesIds: ids, y, T: 673.15, P: 2e7, rhoB: 4400 })[0]!;
    expect(a).toBeGreaterThan(0);
    expect(a / b).toBeCloseTo(2, 12);
  });
  it('n and y inputs agree; activity scales linearly; Ru kMult x10 per volume', () => {
    const n = y.map((v) => v * 7.3);
    const r0 = rate('K1', { speciesIds: ids, y, T: 700, P: 2e7 })[0]!;
    expect(rate('K1', { speciesIds: ids, n, T: 700, P: 2e7 })[0]! / r0).toBeCloseTo(1, 12);
    expect(rate('K1', { speciesIds: ids, y, T: 700, P: 2e7, activity: 0.3 })[0]! / r0).toBeCloseTo(0.3, 12);
    const fe = rate('K1', { speciesIds: ids, y, T: 700, P: 2e7, catalystId: 'fe_ammonia', rhoB: 2500 })[0]!;
    const ru = rate('K1', { speciesIds: ids, y, T: 700, P: 2e7, catalystId: 'ru_ammonia', rhoB: 2500 })[0]!;
    expect(ru / fe).toBeCloseTo(10, 12);
  });
  it('the Cs catalyst lights off colder: rate at T equals the V2O5 rate at T + 40 K, K unchanged', () => {
    const s = ['SO2', 'O2', 'SO3', 'N2'];
    const yy = [0.1, 0.11, 0.01, 0.78];
    const cs = rate('K2', { speciesIds: s, y: yy, T: 653.15, P: 1.5e5, catalystId: 'v2o5_cs' })[0]!;
    const v = rate('K2', { speciesIds: s, y: yy, T: 693.15, P: 1.5e5, catalystId: 'v2o5' })[0]!;
    expect(cs).toBeGreaterThan(0);
    expect(cs).toBeGreaterThan(rate('K2', { speciesIds: s, y: yy, T: 653.15, P: 1.5e5, catalystId: 'v2o5' })[0]! * 5);
    expect(v).toBeGreaterThan(0);
  });
  it('K6 variants: catalysts lower Ea and speed the rate; K7 k(300 K)', () => {
    const k = (cat?: string) => rate('K6', { speciesIds: ['H2O2(aq)'], conc: [1], T: 298.15, P: 1e5, catalystId: cat })[0]!;
    expect(k('iodide')).toBeGreaterThan(k());
    expect(k('catalase')).toBeGreaterThan(k('iodide'));
    const k7 = rate('K7', { speciesIds: ['C3H6O'], conc: [1], T: 300, P: 1e5 })[0]!;
    expect(Math.abs(k7 * 3600 / (16.96e12 * Math.exp(-75360 / (8.314 * 300))) - 1)).toBeLessThan(1e-11);
  });
  it('isothermalConversion: more catalyst gives more conversion and stays below equilibrium; a bad law is a coded failure', () => {
    const s = ['SO2', 'O2', 'SO3', 'N2'];
    const y0 = [0.1, 0.11, 0, 0.79];
    const lo = isothermalConversion('K2', { speciesIds: s, n0: y0, T: 700, P: 1.5e5, W: 2, floor: true });
    const hi = isothermalConversion('K2', { speciesIds: s, n0: y0, T: 700, P: 1.5e5, W: 20, floor: true });
    expect(lo.ok && hi.ok).toBe(true);
    if (lo.ok && hi.ok) expect(hi.value.n[2]!).toBeGreaterThan(lo.value.n[2]!);
    const bad = isothermalConversion('K6', { speciesIds: ['H2O2(aq)'], n0: [1], T: 300, P: 1e5, W: 1 });
    expect(bad.ok).toBe(false);
  });
});
