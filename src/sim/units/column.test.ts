// Shortcut distillation column (Fenske-Underwood-Gilliland on the ethanol-water NRTL equilibrium, DESIGN L23). Oracles: the azeotrope wall at 94.9 wt %
// (DESIGN 4.5.1), mass and energy balances, an independent McCabe-Thiele stage count on the same equilibrium curve, and the monotone trends of the shortcut.
import { describe, expect, it } from 'vitest';
import { elementTotals } from '../chem/stoich';
import { enthalpyFlow, makeMixture } from '../thermo';
import { azeotrope, yOfX } from '../thermo/nrtl';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { column } from './column';

const SP = ['C2H5OH(l)', 'H2O(l)', 'CO2', 'C6H12O6'];
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
// beer: 8 mol % ethanol in water, a little residual glucose and dissolved CO2; liquid at 80 C, 1 atm
const BEER: StreamState = { n: [0.8, 9.0, 0.02, 0.01], T: 353.15, P: 101325 };
const mk = (params: Record<string, number | string> = {}): UnitInst => ({ id: 'C1', type: 'column', pos: { x: 0, y: 0 }, rot: 0, params });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const call = (u: UnitInst, s: StreamState = BEER) => column({ in: s }, u, ctx);
const run = (u: UnitInst, s: StreamState = BEER) => {
  const r = call(u, s);
  if (!r.ok) throw new Error(r.code + JSON.stringify(r.data));
  return { ...(r.value as Out), diag: r.diag };
};

/** Independent McCabe-Thiele: step from the top with the enriching and stripping operating lines (q = 1) on the NRTL equilibrium; returns the stage count. */
function mtStages(xD: number, xB: number, zF: number, R: number, D: number, F: number): number {
  const L = R * D, V = L + D, Ls = L + F, Vs = V;
  const B = F - D;
  const yOf = (x: number) => yOfX('C2H5OH', 'H2O', x, 101325).y;
  const xOf = (y: number) => { let lo = 1e-9, hi = 0.8801; for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (yOf(m) < y) lo = m; else hi = m; } return 0.5 * (lo + hi); };
  let y = xD, n = 0;
  while (n < 200) {
    const x = xOf(y); n++;
    if (x <= xB) return n;
    const enrich = x >= zF;
    y = enrich ? (L / V) * x + (D / V) * xD : (Ls / Vs) * x - (B / Vs) * xB;
  }
  return n;
}

describe('column', () => {
  it('a 70 mol % distillate: balances close (atoms, keys), the distillate is a liquid at its bubble point, the bottoms nearly pure water', () => {
    const v = run(mk({ xD: 0.7, rec: 0.99, rr: 1.3 }));
    const D = v.outlets.vap!, B = v.outlets.liq!;
    const a = elementTotals(SP, BEER.n), d = elementTotals(SP, D.n), b = elementTotals(SP, B.n);
    for (const e of Object.keys(a)) expect(Math.abs(a[e]! - d[e]! - b[e]!)).toBeLessThan(1e-12);
    expect(D.n[0]! / (D.n[0]! + D.n[1]!)).toBeCloseTo(0.7, 9);
    expect(D.n[0]! / BEER.n[0]!).toBeCloseTo(0.99, 9);
    expect(D.n[2]!).toBeCloseTo(BEER.n[2]!, 12); // dissolved CO2 leaves with the overhead
    expect(B.n[3]!).toBeCloseTo(BEER.n[3]!, 12); // glucose stays in the bottoms
    expect(D.T - 273.15).toBeGreaterThan(78); expect(D.T - 273.15).toBeLessThan(83);
    expect(B.T - 273.15).toBeGreaterThan(99); expect(B.T - 273.15).toBeLessThan(101.5);
    expect(v.info.xB!).toBeLessThan(0.002);
  });
  it('energy: duty = H_out - H_in = Q_reb - Q_cond, both positive, steam and cooling water follow', () => {
    const v = run(mk({ xD: 0.7 })), mx = makeMixture(SP);
    const dH = enthalpyFlow(mx, v.outlets.vap!) + enthalpyFlow(mx, v.outlets.liq!) - enthalpyFlow(mx, BEER);
    expect(v.duty).toBeCloseTo(dH, 3);
    expect(v.info.Q_reb!).toBeGreaterThan(0); expect(v.info.Q_cond!).toBeGreaterThan(0);
    expect(v.info.Q_reb! - v.info.Q_cond!).toBeCloseTo(v.duty, 3);
    expect(v.info.steam_kg_s!).toBeGreaterThan(0); expect(v.info.cw_duty_W!).toBeCloseTo(v.info.Q_cond!, 6);
    // rough size: about 1.5-3 MJ per kg of ethanol-water distillate is a plant-like reboiler for a 8 mol % beer
    const kgEtOH = v.outlets.vap!.n[0]! * 0.046069; expect(v.info.Q_reb! / kgEtOH).toBeGreaterThan(3e6); expect(v.info.Q_reb! / kgEtOH).toBeLessThan(2.5e7);
  });
  it('stage count: the shortcut agrees with an independent McCabe-Thiele count on the same NRTL curve within 25 %', () => {
    const v = run(mk({ xD: 0.8, rec: 0.995, rr: 1.5 }));
    const zF = BEER.n[0]! / (BEER.n[0]! + BEER.n[1]!), F = BEER.n[0]! + BEER.n[1]!;
    const Dk = v.outlets.vap!.n[0]! + v.outlets.vap!.n[1]!;
    const xB = v.info.xB!;
    const mt = mtStages(0.8, xB, zF, v.info.R!, Dk, F);
    expect(v.info.N!).toBeGreaterThan(mt * 0.75); expect(v.info.N!).toBeLessThan(mt * 1.25);
    expect(v.info.Nmin!).toBeLessThan(v.info.N!); expect(v.info.R!).toBeCloseTo(1.5 * v.info.Rmin!, 9);
  });
  it('purer distillate costs more stages, more reflux and more steam; a higher reflux ratio buys fewer stages', () => {
    const a = run(mk({ xD: 0.6 })).info, b = run(mk({ xD: 0.75 })).info, c = run(mk({ xD: 0.85 })).info;
    expect(b.N!).toBeGreaterThan(a.N!); expect(c.N!).toBeGreaterThan(b.N!);
    expect(c.Rmin!).toBeGreaterThan(a.Rmin!); expect(c.Q_reb!).toBeGreaterThan(a.Q_reb!);
    expect(run(mk({ xD: 0.75, rr: 2.5 })).info.N!).toBeLessThan(b.N!);
    expect(run(mk({ xD: 0.75, rr: 2.5 })).info.Q_reb!).toBeGreaterThan(b.Q_reb!);
  });
  it('the azeotrope wall: a distillate at or above 94.9 wt % cannot be reached (AZEOTROPE_LIMIT), however much reflux (DESIGN L23 Part B: 99.5 wt %)', () => {
    const az = azeotrope('C2H5OH', 'H2O', 101325)!;
    const xWt = (wt: number) => (wt / 46.069) / (wt / 46.069 + (1 - wt) / 18.015);
    const r = call(mk({ xD: xWt(0.995), rr: 50 }));
    expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe('AZEOTROPE_LIMIT'); expect(r.data.x_az).toBeCloseTo(az.x, 9); expect(r.data.xD).toBeCloseTo(xWt(0.995), 9); }
    expect(call(mk({ xD: az.x + 0.001 })).ok).toBe(false);
    expect(call(mk({ xD: xWt(0.92) })).ok).toBe(true); // 92 wt % is under the wall
    const near = run(mk({ xD: az.x - 0.03 })); expect(near.info.N!).toBeGreaterThan(run(mk({ xD: 0.8 })).info.N!);
  });
  it('infeasible or malformed specs fail with codes, never NaN', () => {
    expect(call(mk({ xD: 0.03 })).ok).toBe(false); // purer than the feed is required
    for (const p of [{ xD: 0.7, rec: 1.2 }, { xD: 0.7, rr: 0.5 }, { xD: 1.1 }]) { const r = call(mk(p as unknown as Record<string, number>)); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('SPEC_RANGE'); }
    const empty = run(mk({ xD: 0.7 }), { n: [0, 0, 0, 0], T: 350, P: 101325 }); expect(Object.values(empty.info).every(Number.isFinite)).toBe(true);
    const r = call(mk({ xD: 0.7 }), { n: [0, 0.5, 0, 0], T: 350, P: 101325 }); expect(r.ok).toBe(false); // no ethanol in the feed: nothing to recover
  });
  it('display numbers: trays top to bottom (T_K) rise monotonically from the overhead to the sump', () => {
    const v = run(mk({ xD: 0.75 })), n = v.info.tray_n!;
    expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(20);
    const T = Array.from({ length: n }, (_, i) => v.info['tray_T' + i]!);
    for (let i = 1; i < n; i++) expect(T[i]!).toBeGreaterThanOrEqual(T[i - 1]! - 1e-9);
    expect(T[0]!).toBeCloseTo(v.info.T_top!, 6); expect(T[n - 1]!).toBeCloseTo(v.info.T_bot!, 6);
    expect(v.info.level!).toBeGreaterThan(0); expect(v.info.reflux!).toBeGreaterThan(0);
  });
});
