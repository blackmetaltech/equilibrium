// Fermenter (batch, K8 Luong x Monod x cardinal T, docs/research/kinetics_ferment.py). Oracles: the research script (scipy LSODA) trajectory at 32 C,
// DESIGN L23 data (150 g/L glucose at 32 C: 90 % used in 22.5 h, 69 g/L ethanol; 42 C stalls, 45 C kills the yeast), atom balance and the Gibbs-free sanity of the yield.
import { describe, expect, it } from 'vitest';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlowAt, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { fermenter, glucoseFeed } from './fermenter';

const SP = ['C6H12O6', 'H2O(l)', 'C2H5OH(l)', 'CO2'];
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const x = glucoseFeed(150);
const FEED: StreamState = { n: [x.glucose * 0.5, x.water * 0.5, 0, 0], T: 298.15, P: 101325 };
const mk = (params: Record<string, number | string> = {}): UnitInst => ({ id: 'F1', type: 'fermenter', pos: { x: 0, y: 0 }, rot: 0, params });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const call = (u: UnitInst, s: StreamState = FEED) => fermenter({ in: s }, u, ctx);
const run = (u: UnitInst, s: StreamState = FEED) => {
  const r = call(u, s);
  if (!r.ok) throw new Error(r.code + JSON.stringify(r.data));
  return { ...(r.value as Out), diag: r.diag };
};
const H = (T: number, hours: number) => mk({ T, time: hours * 3600 });

describe('glucoseFeed helper', () => { it('150 g/L solution: mole fractions of a feed that holds 150 g glucose per litre of solution', () => { expect(x.glucose + x.water).toBeCloseTo(1, 12); expect(x.glucose).toBeGreaterThan(0.015); expect(x.glucose).toBeLessThan(0.018); }); });

describe('fermenter', () => {
  it('32 C: the research-script trajectory (6 h, 12 h, 22.5 h) in g/L within 1 %; 90 % of the glucose used at 22.5 h (DESIGN L23)', () => {
    const cases: [number, number, number, number][] = [[6, 1.7330, 134.8855, 6.9527], [12, 3.0082, 108.6310, 19.0297], [22.5, 7.6123, 14.2709, 62.4354]];
    for (const [h, X, S, P] of cases) {
      const i = run(H(305.15, h)).info;
      expect(i.X_gL!, 'X ' + h).toBeCloseTo(X, 1); expect(Math.abs(i.S_gL! - S) / S, 'S ' + h).toBeLessThan(0.01); expect(Math.abs(i.P_gL! - P) / P, 'P ' + h).toBeLessThan(0.01);
    }
    expect(run(H(305.15, 22.5)).info.conv!).toBeGreaterThan(0.895); expect(run(H(305.15, 22.5)).info.conv!).toBeLessThan(0.915);
  });
  it('long run at 32 C: glucose gone, 69.0 g/L ethanol (0.46 g/g yield, under the 0.511 stoichiometric limit)', () => {
    const v = run(H(305.15, 72));
    expect(v.info.P_gL!).toBeCloseTo(69.0, 0); expect(v.info.conv!).toBeGreaterThan(0.999);
    expect(v.info.P_gL! / 150).toBeLessThan(0.5114);
  });
  it('42 C stalls (script: 56.1 g/L ethanol and 28 g/L glucose left after 120 h), 45 C kills the yeast (YEAST_KILLED), 20 C is just slow', () => {
    const h42 = run(H(315.15, 120)).info;
    expect(h42.P_gL!).toBeCloseTo(56.1, 0); expect(h42.S_gL!).toBeCloseTo(27.95, 0); expect(h42.X_gL!).toBeCloseTo(0.6911, 1);
    const r = call(H(318.15, 22.5));
    expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe('YEAST_KILLED'); expect(r.data.T).toBeCloseTo(318.15, 9); }
    const cold = run(H(293.15, 22.5)).info; expect(cold.conv!).toBeLessThan(0.6);
  });
  it('balances: atoms close; ethanol and CO2 in the stoichiometric 2 : 2 per glucose fermented; the lumped rest stays on the glucose line', () => {
    const v = run(H(305.15, 22.5)), o = v.outlets.out!, g = v.outlets.vap!;
    const a = elementTotals(SP, FEED.n), b = elementTotals(SP, o.n.map((n, i) => n + g.n[i]!));
    for (const e of Object.keys(a)) expect(Math.abs(a[e]! - b[e]!) / a[e]!).toBeLessThan(1e-12);
    expect(g.n[3]!).toBeCloseTo(o.n[2]!, 12); expect(g.n[0]! + g.n[1]! + g.n[2]!).toBe(0); // the overhead is CO2 only
    expect(o.T).toBeCloseTo(305.15, 9);
  });
  it('energy: duty = H_out - H_in; the fermentation heat leaves to the cooling coil (negative duty at the broth temperature)', () => {
    const v = run(H(305.15, 22.5)), mx = makeMixture(SP);
    const Hin = enthalpyFlowAt(mx, FEED.n, FEED.T), Hout = enthalpyFlowAt(mx, v.outlets.out!.n, 305.15) + enthalpyFlowAt(mx, v.outlets.vap!.n, 305.15);
    expect(v.duty).toBeCloseTo(Hout - Hin, 3);
    expect(v.info.cw_duty_W!).toBeGreaterThan(0);
    // about -67.6 kJ per mol glucose fermented (R12), plus the 7 K sensible heat of the charge
    const molGlc = v.info.eth_mol_s! / 2; expect(v.info.Q_rxn_W!).toBeGreaterThan(molGlc * 55e3); expect(v.info.Q_rxn_W!).toBeLessThan(molGlc * 75e3);
  });
  it('time 0 is a pass-through; display numbers are finite and bounded', () => {
    const v = run(H(305.15, 0)); expect(v.outlets.out!.n).toEqual(FEED.n); expect(v.outlets.vap!.n.every((n) => n === 0)).toBe(true);
    const i = run(H(305.15, 22.5)).info; for (const k of ['level', 'gas', 'spin']) { expect(i[k]!, k).toBeGreaterThanOrEqual(0); expect(i[k]!, k).toBeLessThanOrEqual(1); }
    expect(i.T_K).toBe(305.15);
    for (const k of Object.keys(i)) expect(Number.isFinite(i[k]!), k).toBe(true);
  });
  it('bad specs: no glucose, T or time out of range', () => {
    expect(call(H(305.15, 22.5), { ...FEED, n: [0, 1, 0, 0] }).ok).toBe(false);
    for (const p of [{ T: -1, time: 100 }, { T: 305, time: -1 }]) { const r = call(mk(p)); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('SPEC_RANGE'); }
  });
});
