// Nitric acid chain of L26: gauze burner (K9 selectivity vs T), N2O abater, HNO3 absorber. Oracles: ICI flammability (300 C: 13.1-34.3 %), EU BREF Table 3.2 yield bands,
// atom and energy balances, and the 60 wt % acid arithmetic.
import { describe, expect, it } from 'vitest';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlowAt, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { gauzeBurner, hno3Absorber, n2oAbater, nh3Envelope, noSelectivity } from './nitric';

const SP = ['NH3', 'O2', 'N2', 'NO', 'NO2', 'N2O', 'H2O', 'HNO3(l)', 'H2O(l)'];
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const U = (type: string, params: Record<string, number | string> = {}): UnitInst => ({ id: 'G1', type, pos: { x: 0, y: 0 }, rot: 0, params });
const mix = (yNH3: number, T: number, P = 4e5): StreamState => { const n = new Array<number>(SP.length).fill(0); n[0] = yNH3; n[1] = (1 - yNH3) * 0.21; n[2] = (1 - yNH3) * 0.79; return { n, T, P }; };
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const ok = (r: ReturnType<typeof gauzeBurner>): Out & { diag: unknown } => { if (!r.ok) throw new Error(r.code + JSON.stringify(r.data)); return { ...(r.value as Out), diag: r.diag }; };
const burn = (y: number, T: number, P = 4e5, p: Record<string, number> = {}) => gauzeBurner({ in: mix(y, T, P) }, U('gauze_burner', p), ctx);

describe('NH3-air envelope (ICI)', () => {
  it('reproduces the three ICI points and interpolates linearly in T', () => {
    expect(nh3Envelope(20)).toEqual({ lfl: 16.6, ufl: 27.2 }); expect(nh3Envelope(300)).toEqual({ lfl: 13.1, ufl: 34.3 }); expect(nh3Envelope(400).lfl).toBeCloseTo(11.2, 12);
    const m = nh3Envelope(160); expect(m.lfl).toBeCloseTo(16.6 + (13.1 - 16.6) * (140 / 280), 9); expect(m.ufl).toBeCloseTo(27.2 + (34.3 - 27.2) * 0.5, 9);
    expect(nh3Envelope(500).lfl).toBeLessThan(11.2); expect(nh3Envelope(500).lfl).toBeGreaterThan(5);
  });
});
describe('K9 selectivity (BREF bands, GAME cold penalty)', () => {
  it('the band yields at 4 bar (850-900 C: 96 %), 1.5 bar (97 %) and 10 bar (95 %); 5 % less per 50 K below the band; N2 and N2O take the rest', () => {
    expect(noSelectivity(4e5, 873.15 + 273.15).no).toBeCloseTo(0.96, 9); expect(noSelectivity(1.5e5, 830 + 273.15).no).toBeCloseTo(0.97, 9); expect(noSelectivity(10e5, 920 + 273.15).no).toBeCloseTo(0.95, 9);
    expect(noSelectivity(4e5, 800 + 273.15).no).toBeCloseTo(0.96 - 0.05, 9);
    const c = noSelectivity(4e5, 750 + 273.15); expect(c.no + c.n2o + c.n2).toBeCloseTo(1, 12); expect(c.n2o).toBeGreaterThan(noSelectivity(4e5, 873.15 + 273.15).n2o); expect(c.n2).toBeGreaterThan(0.03);
  });
});
describe('gauze burner', () => {
  it('10 % NH3 in air preheated to 200 C at 4 bar: adiabatic exit in the band, NO yield 96 %, N2O about 6 kg per t HNO3 (BREF medium-pressure 6-7.5)', () => {
    const v = ok(burn(0.1, 473.15));
    expect(v.info.T_out! - 273.15).toBeGreaterThan(850); expect(v.info.T_out! - 273.15).toBeLessThan(1000);
    expect(v.info.s_no!).toBeCloseTo(0.96, 6); expect(v.info.nh3_conv!).toBeCloseTo(1, 9);
    expect(v.info.n2o_kg_per_t!).toBeGreaterThan(4.5); expect(v.info.n2o_kg_per_t!).toBeLessThan(8);
    const mx = makeMixture(SP); expect(enthalpyFlowAt(mx, v.outlets.out!.n, v.outlets.out!.T)).toBeCloseTo(enthalpyFlowAt(mx, mix(0.1, 473.15).n, 473.15), 1); expect(v.duty).toBeCloseTo(0, 1);
  });
  it('closes the atoms and conserves the O2 it burns; a lean mixture runs cold and loses NO to N2 and N2O', () => {
    const v = ok(burn(0.1, 473.15)), a = elementTotals(SP, mix(0.1, 473.15).n), b = elementTotals(SP, v.outlets.out!.n);
    for (const e of Object.keys(a)) expect(Math.abs(a[e]! - (b[e] ?? 0))).toBeLessThan(1e-12);
    const cold = ok(burn(0.06, 373.15));
    expect(cold.info.T_out!).toBeLessThan(v.info.T_out!); expect(cold.info.s_no!).toBeLessThan(0.95); expect(cold.info.n2o_kg_per_t!).toBeGreaterThan(v.info.n2o_kg_per_t!);
  });
  it('EXPLOSIVE_MIXTURE inside the envelope at the inlet T (20 % at 20 C; 12 % at 400 C), not at 10 % or 12 % at 200 C', () => {
    for (const [y, T] of [[0.2, 293.15], [0.12, 673.15]] as const) { const r = burn(y, T); expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe('EXPLOSIVE_MIXTURE'); expect(r.data.y).toBeCloseTo(y * 100, 6); expect(r.data.lfl).toBeLessThanOrEqual(y * 100); } }
    expect(burn(0.12, 473.15).ok).toBe(true); expect(burn(0.1, 293.15).ok).toBe(true);
  });
  it('an oxygen-starved mixture fails with a code; an empty stream passes through', () => {
    const rich = mix(0.1, 473.15); rich.n[1] = 0.001; const r = gauzeBurner({ in: rich }, U('gauze_burner'), ctx); expect(r.ok).toBe(false);
    expect(ok(gauzeBurner({ in: { n: new Array<number>(SP.length).fill(0), T: 400, P: 4e5 } }, U('gauze_burner'), ctx)).duty).toBe(0);
  });
});
describe('N2O abater', () => {
  it('converts the asked fraction of N2O to N2 and O2, warms the gas, closes atoms', () => {
    const g = ok(burn(0.1, 473.15)).outlets.out!, v = ok(n2oAbater({ in: g }, U('n2o_abater', { X: 0.85 }), ctx) as ReturnType<typeof gauzeBurner>);
    const o = v.outlets.out!; expect(o.n[5]!).toBeCloseTo(g.n[5]! * 0.15, 12); expect(o.T).toBeGreaterThan(g.T);
    const a = elementTotals(SP, g.n), b = elementTotals(SP, o.n); for (const e of Object.keys(a)) expect(Math.abs(a[e]! - b[e]!)).toBeLessThan(1e-12);
    expect(v.info.n2o_removed_pct!).toBeCloseTo(85, 9);
    expect(n2oAbater({ in: g }, U('n2o_abater', { X: 1.2 }), ctx).ok).toBe(false);
  });
});
describe('HNO3 absorber', () => {
  it('absorbs the asked fraction of NOx to 60 wt % acid with its O2 and water; atoms close with the make-up water', () => {
    const g: StreamState = { n: [0, 0.05, 0.8, 0.002, 0.08, 0.001, 0.1, 0, 0], T: 313.15, P: 4e5 };
    const r = hno3Absorber({ in: g }, U('hno3_absorber', { recovery: 0.99, acid: 0.6 }), ctx);
    if (!r.ok) throw new Error(r.code); const v = r.value as Out;
    const nAcid = v.outlets.acid!.n[7]!, nW = v.outlets.acid!.n[8]!;
    expect(nAcid).toBeCloseTo(0.99 * 0.082, 12); expect((nAcid * 63.0128) / (nAcid * 63.0128 + nW * 18.015)).toBeCloseTo(0.6, 4);
    const inA = elementTotals(SP, g.n), outA = elementTotals(SP, v.outlets.out!.n.map((n, i) => n + v.outlets.acid!.n[i]!)), mk = v.info.water_makeup_mol_s!;
    expect(Math.abs((inA.N ?? 0) - (outA.N ?? 0))).toBeLessThan(1e-12); expect(Math.abs((inA.O ?? 0) + mk - (outA.O ?? 0))).toBeLessThan(1e-12); expect(Math.abs((inA.H ?? 0) + 2 * mk - (outA.H ?? 0))).toBeLessThan(1e-12);
    expect(v.outlets.out!.n[4]!).toBeCloseTo(0.08 * 0.01, 12); expect(v.outlets.out!.n[5]!).toBeCloseTo(0.001, 12);
    expect(hno3Absorber({ in: g }, U('hno3_absorber', { recovery: 1.5 }), ctx).ok).toBe(false);
  });
  it('needs the O2 for the NO it takes: an oxygen-poor gas fails with a code', () => {
    const g: StreamState = { n: [0, 0.0001, 0.8, 0.1, 0, 0, 0, 0, 0], T: 313.15, P: 4e5 };
    expect(hno3Absorber({ in: g }, U('hno3_absorber', { recovery: 0.99 }), ctx).ok).toBe(false);
  });
});
