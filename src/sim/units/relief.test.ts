import { describe, expect, it } from 'vitest';
import type { SimCtx, UnitInst } from '../types';
import { coefC, criticalRatio, isCritical, relief, reliefArea, reliefCapacity, selectOrifice } from './relief';
import { ORIFICE_MM2 } from '../../data/vle';

const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'R1', type: 'relief', pos: { x: 0, y: 0 }, rot: 0, params });

describe('API 520 / 526', () => {
  it('C(k) table: 1.4 -> 0.02703, 1.3 -> 0.02634, 1.67 -> 0.02869; k->1 limit 0.023946', () => {
    expect(coefC(1.4)).toBeCloseTo(0.02703, 5); expect(coefC(1.3)).toBeCloseTo(0.02634, 5); expect(coefC(1.67)).toBeCloseTo(0.02869, 5);
    expect(coefC(1.0)).toBeCloseTo(0.023946, 5);
  });
  it('worked case: 10 000 kg/h NH3, k 1.31, 400 K, 1000 kPa abs -> 1882 mm2 (REVIEW 1881.7) -> letter M', () => {
    const A = reliefArea(10000, 1000, 400, 1, 17.03, 1.31);
    expect(Math.abs(A - 1882)).toBeLessThan(1); expect(Math.abs(A - 1881.7)).toBeLessThan(0.6);
    expect(selectOrifice(A)).toBe('M'); expect(selectOrifice(1841)).toBe('L'); expect(selectOrifice(20000)).toBeNull();
  });
  it('capacity and area are inverse; critical ratio 0.528 at k = 1.4', () => {
    const W = reliefCapacity(ORIFICE_MM2.M!, 1000, 400, 1, 17.03, 1.31);
    expect(reliefArea(W, 1000, 400, 1, 17.03, 1.31)).toBeCloseTo(ORIFICE_MM2.M!, 9);
    expect(criticalRatio(1.4)).toBeCloseTo(0.528, 3); expect(isCritical(1e5, 5e5, 1.4)).toBe(true); expect(isCritical(4e5, 5e5, 1.4)).toBe(false);
  });
  it('orifice table has the 14 letters D..T with M = 2323 mm2', () => { expect(Object.keys(ORIFICE_MM2).length).toBe(14); expect(ORIFICE_MM2.M).toBe(2323); expect(ORIFICE_MM2.T).toBe(16774); });
  it('static unit: RELIEF_UNDERSIZED when the load exceeds the capacity of the chosen letter', () => {
    const ctx: SimCtx = { species: ['NH3'], thermoDetail: 'rigorous' };
    const s = { n: [400 / 17.031 * 1000 / 3600 * 10], T: 400, P: 10e5 };
    const small = relief({ in: s }, mk({ Pset: 10e5, orifice: 'D' }), ctx), big = relief({ in: s }, mk({ Pset: 10e5, orifice: 'T' }), ctx);
    if (!small.ok || !big.ok) throw new Error('fail');
    expect(small.diag.some((d) => d.code === 'RELIEF_UNDERSIZED')).toBe(true); expect(big.diag.length).toBe(0);
    expect(small.value.info!.required_area_mm2).toBeCloseTo(big.value.info!.required_area_mm2!, 9);
    const bad = relief({ in: s }, mk({ orifice: 'Z' }), ctx); expect(bad.ok).toBe(false);
  });
});
