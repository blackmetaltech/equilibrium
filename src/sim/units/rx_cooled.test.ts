// Cooled tubular reactor (K3 methanol on Cu/ZnO/Al2O3). Oracles: DESIGN L22 data and docs/research/kinetics_methanol.py (250 C, 70 bar, 10 CO / 5 CO2 / 70 H2 / 15 inert).
import { describe, expect, it } from 'vitest';
import { elementTotals } from '../chem/stoich';
import { solveEquilibrium } from '../chem/equilibrium';
import { rate } from '../chem/kinetics';
import { enthalpyFlow, makeMixture } from '../thermo';
import type { SimCtx, StreamState, UnitInst } from '../types';
import { bedProfile } from './rx_pfr';
import { tubular, TUBE_UAW } from './rx_cooled';

const SP = ['H2', 'CO', 'CO2', 'CH3OH', 'H2O', 'N2'];
const ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const FEED: StreamState = { n: [0.7, 0.1, 0.05, 0, 0, 0.15], T: 523.15, P: 70e5 };
const mk = (params: Record<string, number | string> = {}): UnitInst => ({ id: 'R1', type: 'tubular', pos: { x: 0, y: 0 }, rot: 0, params, catalystId: 'cu_zn_meoh' });
type Out = { outlets: Record<string, StreamState>; duty: number; info: Record<string, number> };
const run = (u: UnitInst, s: StreamState = FEED) => {
  const r = tubular({ in: s }, u, ctx);
  if (!r.ok) throw new Error(r.code + JSON.stringify(r.data));
  return { ...(r.value as Out), diag: r.diag };
};
const yMeOH = (s: StreamState): number => s.n[3]! / s.n.reduce((a, b) => a + b, 0);

describe('K3 rate law', () => {
  it('is exactly zero at the equilibrium composition of R4 + R5 and has the sign of 1 - Q/K on either side', () => {
    const eq = solveEquilibrium({ species: SP, reactions: ['R4', 'R5'], n0: FEED.n, T: 523.15, P: 70e5, mode: 'isothermal', detail: 'rigorous' });
    if (!eq.ok) throw new Error(eq.code);
    const r = rate('K3', { speciesIds: SP, n: eq.value.n, T: 523.15, P: 70e5, catalystId: 'cu_zn_meoh' });
    const r0 = rate('K3', { speciesIds: SP, n: FEED.n, T: 523.15, P: 70e5, catalystId: 'cu_zn_meoh' });
    expect(Math.abs(r[0]!)).toBeLessThan(1e-6 * Math.abs(r0[0]!)); expect(Math.abs(r[1]!)).toBeLessThan(1e-4 * Math.abs(r0[1]!) + 1e-12);
    expect(r0[0]!).toBeGreaterThan(0); // methanol forms from the fresh gas
    // the VdB bench inlet of the research script (493.2 K, 50 bar, 4 % CO, 3 % CO2, 82 % H2): r_MeOH about 0.0526 mol/(kg s), r_RWGS about 0.0079
    const bench = rate('K3', { speciesIds: ['H2', 'CO', 'CO2', 'CH3OH', 'H2O'], y: [0.82, 0.04, 0.03, 0, 0], T: 493.2, P: 50e5, catalystId: 'cu_zn_meoh' });
    expect(bench[0]!).toBeGreaterThan(0.03); expect(bench[0]!).toBeLessThan(0.09); expect(-bench[1]!).toBeGreaterThan(0.004);
  });
});

describe('cooled tubular reactor', () => {
  it('isothermal 250 C, 70 bar, a long tube: the exit sits on the equilibrium, y_MeOH about 9.9 % (DESIGN L22)', () => {
    const v = run(mk({ W: 60, mode: 'isothermal', T: 523.15 }), FEED);
    // DESIGN / research script: 9.9 % with the Graaf constants. The engine's K(R4) (rigorous JANAF thermo) is 22 % above Graaf's at 250 C, so its equilibrium is 10.6 %: 7 % relative.
    expect(yMeOH(v.outlets.out!)).toBeGreaterThan(0.099 * 0.93); expect(yMeOH(v.outlets.out!)).toBeLessThan(0.099 * 1.08);
    const eq = solveEquilibrium({ species: SP, reactions: ['R4', 'R5'], n0: FEED.n, T: 523.15, P: 70e5, mode: 'isothermal', detail: 'rigorous' });
    if (!eq.ok) throw new Error(eq.code);
    expect(Math.abs(yMeOH(v.outlets.out!) - eq.value.n[3]! / eq.value.n.reduce((a, b) => a + b, 0))).toBeLessThan(1e-3);
  });
  it('default coolant (250 C): the hot spot is about 298 C near the inlet and the exit is back at the coolant (DESIGN L22, research script 298.2)', () => {
    const v = run(mk({ W: 60 }));
    expect(v.info.Tmax! - 273.15).toBeGreaterThan(295); expect(v.info.Tmax! - 273.15).toBeLessThan(301);
    expect(v.info.T_out! - 273.15).toBeLessThan(255); expect(v.info.hot_W!).toBeLessThan(5);
    const p = bedProfile(v.info); expect(Math.max(...p.T)).toBeCloseTo(v.info.Tmax!, 6);
    expect(v.diag.map((d) => d.code)).toContain('CATALYST_OVERTEMP'); // the Cu sinters above 280 C
  });
  it('a colder coolant or a bigger heat-transfer area pulls the hot spot below 280 C (no sintering diag)', () => {
    const cold = run(mk({ W: 60, Tc: 503.15 })), big = run(mk({ W: 60, UaW: 4 * TUBE_UAW }));
    expect(cold.info.Tmax!).toBeLessThan(run(mk({ W: 60 })).info.Tmax!);
    expect(big.info.Tmax!).toBeLessThan(553.15); expect(big.diag.map((d) => d.code)).not.toContain('CATALYST_OVERTEMP');
  });
  it('adiabatic (no coolant): the tube stalls at the equilibrium of its own exit temperature (research script +61.2 K; the engine, with its rigorous dH, +71 K)', () => {
    const v = run(mk({ W: 60, mode: 'adiabatic' }));
    expect(v.info.dT!).toBeGreaterThan(61.2 * 0.95); expect(v.info.dT!).toBeLessThan(61.2 * 1.2);
    expect(v.info.eta!).toBeGreaterThan(0.99);
  });
  it('closes the atom ledger and the energy balance (duty = H_out - H_in; adiabatic duty 0)', () => {
    const v = run(mk({ W: 5 })), out = v.outlets.out!;
    const a = elementTotals(SP, FEED.n), b = elementTotals(SP, out.n);
    for (const e of Object.keys(a)) expect(Math.abs(a[e]! - b[e]!)).toBeLessThan(1e-12);
    const mx = makeMixture(SP);
    expect(v.duty).toBeCloseTo(enthalpyFlow(mx, out) - enthalpyFlow(mx, FEED), 3);
    expect(v.duty).toBeLessThan(0); // heat leaves into the coolant
    expect(Math.abs(run(mk({ W: 5, mode: 'adiabatic' })).duty)).toBeLessThan(1e-3);
  });
  it('no catalyst, no methanol: W = 0 passes the gas through', () => {
    const v = run(mk({ W: 0 })); expect(v.outlets.out!.n).toEqual(FEED.n);
  });
});
