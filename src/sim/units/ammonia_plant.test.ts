// Ammonia-plant units of L28: reformer (R6 + R5 equilibrium, fired), CO2 removal (fixed recovery, GAME energy per tonne), methanator (fixed). Oracles: DESIGN L28 data (SMR at
// 800 C, 25 bar, S/C 3: 67.3 % CH4 conversion), atom and energy balances, the heat of methanation.
import { describe, expect, it } from 'vitest';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlowAt, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { CO2_GJ_PER_T, co2Removal, methanator, reformer } from './ammonia_plant';

const SP = ['CH4', 'H2O', 'CO', 'CO2', 'H2', 'N2'];
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const U = (type: string, params: Record<string, number | string> = {}): UnitInst => ({ id: 'X1', type, pos: { x: 0, y: 0 }, rot: 0, params });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const call = (fn: typeof reformer, s: StreamState, u: UnitInst): Out => { const r = fn({ in: s }, u, ctx); if (!r.ok) throw new Error(r.code + JSON.stringify(r.data)); return r.value as Out; };

describe('reformer', () => {
  it('800 C, 25 bar, S/C 3: CH4 conversion 67.3 % at equilibrium (DESIGN L28), fired duty positive, atoms close', () => {
    const s: StreamState = { n: [1, 3, 0, 0, 0, 0], T: 773.15, P: 25e5 };
    const v = call(reformer, s, U('reformer', { T: 1073.15 }));
    // DESIGN quotes 67.3 %; the engine's rigorous JANAF K gives 68.5 % (1.2 points, 1.8 % relative): the window is +-2 points
    expect(v.info.x_ch4!).toBeGreaterThan(0.673 - 0.02); expect(v.info.x_ch4!).toBeLessThan(0.673 + 0.02);
    expect(v.duty).toBeGreaterThan(0); expect(v.info.fired_W).toBeCloseTo(v.duty, 6);
    const a = elementTotals(SP, s.n), b = elementTotals(SP, v.outlets.out!.n); for (const e of Object.keys(a)) expect(Math.abs(a[e]! - (b[e] ?? 0))).toBeLessThan(1e-12);
    expect(v.outlets.out!.T).toBeCloseTo(1073.15, 9);
  });
  it('higher T and more steam raise the conversion; higher P lowers it (Le Chatelier, delta n = +2)', () => {
    const x = (T: number, sc: number, P: number) => call(reformer, { n: [1, sc, 0, 0, 0, 0], T: 773.15, P }, U('reformer', { T })).info.x_ch4!;
    expect(x(1123.15, 3, 25e5)).toBeGreaterThan(x(1023.15, 3, 25e5)); expect(x(1073.15, 4, 25e5)).toBeGreaterThan(x(1073.15, 2.5, 25e5)); expect(x(1073.15, 3, 10e5)).toBeGreaterThan(x(1073.15, 3, 40e5));
  });
});
describe('CO2 removal', () => {
  it('takes the asked fraction of the CO2 to the co2 outlet, cooled to 40 C, with the GAME regeneration energy per tonne', () => {
    const s: StreamState = { n: [0.01, 0.2, 0.01, 0.3, 1.2, 0.4], T: 400, P: 25e5 };
    const v = call(co2Removal, s, U('co2_removal', { recovery: 0.99 }));
    expect(v.outlets.co2!.n[3]!).toBeCloseTo(0.297, 12); expect(v.outlets.out!.n[3]!).toBeCloseTo(0.003, 12);
    expect(v.info.regen_W!).toBeCloseTo(0.297 * 44.0095 / 1000 * CO2_GJ_PER_T * 1e9 / 1000, -1); // kg/s x GJ/t x 1e6 J/GJ / 1000 kg/t
    expect(v.outlets.out!.T).toBeCloseTo(313.15, 9);
    const a = elementTotals(SP, s.n), b = elementTotals(SP, v.outlets.out!.n.map((n, i) => n + v.outlets.co2!.n[i]!)); for (const e of Object.keys(a)) expect(Math.abs(a[e]! - (b[e] ?? 0))).toBeLessThan(1e-12);
    expect(() => call(co2Removal, s, U('co2_removal', { recovery: 1.1 }))).toThrow();
  });
});
describe('methanator', () => {
  it('turns the CO and CO2 slip to CH4 with H2 (R-methanation), warms the gas, closes atoms; 0.5 % CO gives about 60-75 K', () => {
    const s: StreamState = { n: [0, 0.003, 0.005, 0.0005, 0.75, 0.25], T: 573.15, P: 25e5 };
    const v = call(methanator, s, U('methanator', {}));
    const o = v.outlets.out!; expect(o.n[2]!).toBeCloseTo(0, 12); expect(o.n[3]!).toBeCloseTo(0, 12); expect(o.n[0]!).toBeCloseTo(0.0055, 12); expect(o.n[4]!).toBeCloseTo(0.75 - 3 * 0.005 - 4 * 0.0005, 12);
    expect(o.T - s.T).toBeGreaterThan(20); expect(o.T - s.T).toBeLessThan(90);
    const a = elementTotals(SP, s.n), b = elementTotals(SP, o.n); for (const e of Object.keys(a)) expect(Math.abs(a[e]! - (b[e] ?? 0))).toBeLessThan(1e-12);
    const mx = makeMixture(SP); expect(enthalpyFlowAt(mx, o.n, o.T)).toBeCloseTo(enthalpyFlowAt(mx, s.n, s.T), 0);
  });
});
