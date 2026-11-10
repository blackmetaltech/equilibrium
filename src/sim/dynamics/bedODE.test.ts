// Packed-bed dynamics (DESIGN 3.9): lumped bed temperature lag and catalyst sintering.
import { dmath } from '@core/numerics';
import { describe, expect, it } from 'vitest';
import { SINTER_AFTER_S, SINTER_K } from '../../data/events';
import { BED_TAU_MAX, BED_TAU_MIN, bedMeanT, bedPeak, bedRetarget, bedStep, bedTau, type BedDyn } from './bedODE';

const bed = (over: Partial<BedDyn> = {}): BedDyn => ({ T: 700, a: 1, over: 0, Tss: 700, Tpk: 750, alpha: 0.1, Tm: 800, as: 1, ...over });

describe('bed temperature', () => {
  it('tau = m_cat cp_cat / (m cp), clamped', () => {
    expect(bedTau(100, 300)).toBe(300);
    expect(bedTau(1, 1e6)).toBe(BED_TAU_MIN);
    expect(bedTau(1e6, 1)).toBe(BED_TAU_MAX);
    expect(bedTau(10, 0)).toBe(BED_TAU_MAX);
  });
  it('63 % of a step in the steady temperature after tau seconds', () => {
    const tau = 120, d = bed({ T: 600, Tss: 600, Tpk: 650 });
    bedRetarget(d, 700, 750, tau);
    for (let i = 0; i < tau; i++) bedStep(d);
    expect(Math.abs((d.T - 600) / 100 - (1 - dmath.exp(-1)))).toBeLessThan(1e-12);
  });
  it('the steady state of the lag is the mean of the steady profile (trapezoid in W)', () => {
    const info: Record<string, number> = { np: 3, p0_W: 0, p0_T: 600, p1_W: 50, p1_T: 700, p2_W: 100, p2_T: 800 };
    expect(bedMeanT(info)).toBeCloseTo(700, 12);
    expect(bedMeanT({ T_out: 650 })).toBe(650);
    const b: Record<string, number> = { b2_np: 2, b2_p0_W: 0, b2_p0_T: 500, b2_p1_W: 10, b2_p1_T: 700 };
    expect(bedMeanT(b, 'b2_')).toBeCloseTo(600, 12);
  });
  it('hot spot = steady peak moved by the lag offset', () => {
    expect(bedPeak(bed({ T: 650 }))).toBe(700);
  });
});

describe('catalyst sintering', () => {
  it('lowers activity only above T_max, and only after 30 s', () => {
    const d = bed({ Tpk: 830, Tss: 700, T: 700, alpha: 0 });           // peak 30 K above Tm = 800
    for (let i = 0; i < SINTER_AFTER_S; i++) bedStep(d);
    expect(d.a).toBe(1);
    bedStep(d);
    expect(d.a).toBeLessThan(1);
    expect(d.a).toBeCloseTo(dmath.exp(-SINTER_K * 30), 12);
  });
  it('never sinters below T_max however long it stays hot-but-legal', () => {
    const d = bed({ Tpk: 799, alpha: 0 });
    for (let i = 0; i < 5000; i++) bedStep(d);
    expect(d.a).toBe(1);
  });
  it('a short excursion (< 30 s) resets: no damage, however often it repeats', () => {
    const d = bed({ alpha: 0 });
    for (let k = 0; k < 20; k++) {
      d.Tpk = 900; for (let i = 0; i < 25; i++) bedStep(d);
      d.Tpk = 750; bedStep(d);
    }
    expect(d.a).toBe(1);
    expect(d.over).toBe(0);
  });
  it('damage is permanent: cooling back down leaves the lowered activity', () => {
    const d = bed({ Tpk: 850, alpha: 0 });
    for (let i = 0; i < 60; i++) bedStep(d);
    const a = d.a;
    expect(a).toBeLessThan(1);
    d.Tpk = 700; for (let i = 0; i < 100; i++) bedStep(d);
    expect(d.a).toBe(a);
  });
});
