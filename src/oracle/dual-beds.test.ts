// DESIGN 9.2.3 dual-implementation fixtures for the converter units: SO2 adiabatic equilibrium staircases at 410 / 420 / 430 C
// (L13 numbers), the double-contact 3 + 1 process with an intermediate absorber (99.983 %), and the L17 / L13 quoted numbers.
import { describe, expect, it } from 'vitest';
import beds from './fixtures/so2_beds.json';
import dcda from './fixtures/dcda.json';
import { absorber } from '../sim/units/absorber';
import { heater } from '../sim/units/heater';
import { eqReactor } from '../sim/units/rx_equil';
import { multibed } from '../sim/units/rx_multibed';
import type { SimCtx, StreamState, UnitInst } from '../sim/types';

const K0 = 273.15;
const SP = ['SO2', 'O2', 'SO3', 'N2', 'H2SO4(l)', 'H2O(l)'];
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (type: string, params: Record<string, number | string> = {}, catalystId?: string): UnitInst => ({ id: type + '1', type, pos: { x: 0, y: 0 }, rot: 0, params, catalystId });
const feed = (Tc: number): StreamState => ({ n: [10, 11, 0, 79, 0, 0], T: Tc + K0, P: 1.2e5 });
const ok = <T,>(r: { ok: boolean } & Record<string, unknown>): T => { if (!r.ok) throw new Error(String(r.code) + JSON.stringify(r.data)); return r.value as T; };
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };

describe('SO2 staircases (so2_beds fixture, multi-bed converter on the equilibrium bed model)', () => {
  for (const st of beds.staircases) {
    it(`inlet ${st.Tin_C} C each bed: Tout within ${beds.tolerance.abs_T_K} K and X_cum within ${beds.tolerance.abs_X} of the fixture, all four beds`, () => {
      const u = mk('multibed', { beds: 4, Tcool1: st.Tin_C + K0, Tcool2: st.Tin_C + K0, Tcool3: st.Tin_C + K0, reactions: 'R2' });
      const v = ok<Out>(multibed({ in: feed(st.Tin_C) }, u, ctx));
      for (const b of st.beds) {
        expect(Math.abs(v.info[`b${b.bed}_Tout`]! - K0 - b.Tout_C), `Tout bed ${b.bed}`).toBeLessThanOrEqual(beds.tolerance.abs_T_K);
        expect(Math.abs(v.info[`b${b.bed}_Xout`]! - b.X_cum), `X bed ${b.bed}`).toBeLessThanOrEqual(beds.tolerance.abs_X);
        expect(Math.abs(v.info[`b${b.bed}_Tin`]! - (st.Tin_C + K0)), `Tin bed ${b.bed}`).toBeLessThan(1e-9);
      }
      expect(Math.abs(v.info.X! - st.beds[3]!.X_cum)).toBeLessThanOrEqual(beds.tolerance.abs_X);
    });
  }
  it('L13 quoted conversions at 410 C: 70.6 -> 95.7 -> 98.95 -> 99.16 %; at 420 C: 69.1 -> 94.7 -> 98.6 -> 98.9 %; at 430 C: 67.5 -> 93.5 -> 98.2 %', () => {
    const run = (T: number) => {
      const u = mk('multibed', { beds: 4, Tcool1: T + K0, Tcool2: T + K0, Tcool3: T + K0, reactions: 'R2' }, 'v2o5');
      const v = ok<Out>(multibed({ in: feed(T) }, u, ctx));
      return [1, 2, 3, 4].map((j) => 100 * v.info[`b${j}_Xout`]!);
    };
    const a = run(410), b = run(420), c = run(430);
    [70.6, 95.7, 98.95, 99.16].forEach((w, i) => expect(Math.abs(a[i]! - w), '410 bed ' + (i + 1)).toBeLessThan(0.06));
    [69.1, 94.7, 98.6, 98.9].forEach((w, i) => expect(Math.abs(b[i]! - w), '420 bed ' + (i + 1)).toBeLessThan(0.06));
    [67.5, 93.5, 98.2].forEach((w, i) => expect(Math.abs(c[i]! - w), '430 bed ' + (i + 1)).toBeLessThan(0.06));
  });
  it('L13: three beds at 410-415 C reach >= 98 % (reference solution), one bed stalls at 69 % on the curve, inlet below 410 C is asleep (ideal V2O5)', () => {
    const three = ok<Out>(multibed({ in: feed(412) }, mk('multibed', { beds: 2, Tcool1: 412 + K0, reactions: 'R2' }, 'v2o5'), ctx));
    expect(three.info.X!).toBeLessThan(0.98);
    const full = ok<Out>(multibed({ in: feed(412) }, mk('multibed', { beds: 4, Tcool1: 412 + K0, Tcool2: 412 + K0, Tcool3: 413 + K0, reactions: 'R2' }, 'v2o5'), ctx));
    expect(full.info.X!).toBeGreaterThan(0.98);
    const one = ok<Out>(eqReactor({ in: feed(420) }, mk('eq_bed', { mode: 'adiabatic', reactions: 'R2' }, 'v2o5'), ctx));
    expect(one.info.X!).toBeCloseTo(0.691, 2);
    const asleep = ok<Out>(multibed({ in: feed(405) }, mk('multibed', { beds: 3, Tcool1: 405 + K0, Tcool2: 405 + K0, reactions: 'R2' }, 'v2o5'), ctx));
    expect(asleep.info.X).toBe(0); expect(asleep.outlets.out!.T).toBeCloseTo(405 + K0, 9);
  });
  it('L17: lower inlet, higher adiabatic-equilibrium conversion: 410 -> 70.6 %, 380 -> 75.1 %, 370 -> 76.5 % (the Cs catalyst lights off lower)', () => {
    const x = (T: number, cat: string) => ok<Out>(eqReactor({ in: feed(T) }, mk('eq_bed', { mode: 'adiabatic', reactions: 'R2' }, cat), ctx)).info.X!;
    expect(x(410, 'v2o5')).toBeCloseTo(0.706, 3);
    expect(x(380, 'v2o5_cs')).toBeCloseTo(0.751, 3);
    expect(x(370, 'v2o5_cs')).toBeCloseTo(0.765, 3);
    expect(x(380, 'v2o5')).toBe(0); // the plain catalyst is asleep there
  });
});

describe('double contact (DCDA 3 + 1) with an intermediate absorber (dcda fixture)', () => {
  it('overall conversion 99.983 % within 0.002 % abs; conversion after bed 3 and bed-4 exit T as the fixture', () => {
    const T = dcda.inputs.Tin_C + K0;
    const m3 = ok<Out>(multibed({ in: feed(dcda.inputs.Tin_C) }, mk('multibed', { beds: 3, Tcool1: T, Tcool2: T, reactions: 'R2' }), ctx));
    expect(Math.abs(m3.info.X! - dcda.conv_after_bed3)).toBeLessThanOrEqual(1e-3);
    const ab = ok<Out>(absorber({ in: m3.outlets.out! }, mk('absorber', { recovery: dcda.inputs.absorber_removal, acid: 0.98 }), ctx));
    const absorbed = ab.info.absorbed_mol_s!;
    const reheated = ok<Out>(heater({ in: ab.outlets.out! }, mk('heater', { T }), ctx));
    const b4 = ok<Out>(eqReactor({ in: reheated.outlets.out! }, mk('eq_bed', { mode: 'adiabatic', reactions: 'R2' }), ctx));
    const sulfurOut = b4.outlets.out!.n[2]!;
    const conv = (absorbed + sulfurOut) / 10;
    expect(Math.abs(100 * conv - dcda.conv_overall_pct)).toBeLessThanOrEqual(dcda.tolerance.abs_conv_pct);
    expect(Math.abs(b4.outlets.out!.T - K0 - dcda.bed4_Tout_C)).toBeLessThanOrEqual(0.3);
    expect(b4.outlets.out!.n[0]!).toBeCloseTo(dcda.SO2_left_kmol_per_10_fed, 4);
    // atoms of sulfur: SO2 + SO3 gas + acid = 10 fed
    expect(b4.outlets.out!.n[0]! + b4.outlets.out!.n[2]! + absorbed).toBeCloseTo(10, 9);
  });
  it('without the intermediate absorption three beds plus a fourth only reach the single-contact staircase (99.1 %), so the absorber is what buys the extra 0.8 %', () => {
    const T = dcda.inputs.Tin_C + K0;
    const four = ok<Out>(multibed({ in: feed(dcda.inputs.Tin_C) }, mk('multibed', { beds: 4, Tcool1: T, Tcool2: T, Tcool3: T, reactions: 'R2' }), ctx));
    expect(four.info.X!).toBeLessThan(0.9895);
    expect(dcda.conv_overall).toBeGreaterThan(0.9995);
  });
});
