import { describe, expect, it } from 'vitest';
import { enthalpyFlow, makeMixture, massFlow } from '../thermo';
import type { SimCtx, UnitInst } from '../types';
import burner from '../../oracle/fixtures/sulfur_burner.json';
import { STEAM, BFW } from '../../data/vle';
import { boiler } from './boiler';

const SP = ['SO2', 'O2', 'N2'], mx = makeMixture(SP), ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (params: Record<string, number | string>): UnitInst => ({ id: 'B1', type: 'boiler', pos: { x: 0, y: 0 }, rot: 0, params });
const gas = (T: number) => ({ n: [100e3 / 3600, 110e3 / 3600, 790e3 / 3600], T, P: 1.3e5 });

describe('waste-heat boiler (L05)', () => {
  it('10 % SO2 burner gas 931 C -> 420 C, HP steam: 4.93 MW and 7.52 t/h within the fixture tolerance', () => {
    const c = (burner as any).cases.find((x: any) => x.y_SO2 === 0.1);
    const r = boiler({ in: gas(c.T_ad_C + 273.15) }, mk({ T: 693.15, steam: 'HP' }), ctx);
    if (!r.ok) throw new Error(r.code);
    expect(Math.abs(-r.value.duty! / 1e6 / c.boiler_duty_MW - 1)).toBeLessThan(0.003);
    expect(Math.abs(r.value.info!.steam_t_h! / c.steam_t_h - 1)).toBeLessThan(0.003);
    expect(Math.abs(r.value.info!.steam_t_h! - 7.52)).toBeLessThan(0.03);
  });
  it('dh = h_g - h_BFW = 2360.7 kJ/kg at 40 bar (DESIGN 2361); steam = duty/dh exactly', () => {
    expect(Math.abs((STEAM.HP.hg - BFW.h) / 1e3 - 2361)).toBeLessThan(0.5);
    const r = boiler({ in: gas(1204.3) }, mk({ T: 693.15 }), ctx);
    if (!r.ok) throw new Error(r.code);
    expect(r.value.info!.steam_kg_s).toBeCloseTo(-r.value.duty! / r.value.info!.dh_steam!, 9);
  });
  it('closure: duty = H_out - H_in, mass conserved; LP steam makes more per MW than HP', () => {
    const s = gas(1100);
    const a = boiler({ in: s }, mk({ T: 600, steam: 'LP' }), ctx), b = boiler({ in: s }, mk({ T: 600, steam: 'HP' }), ctx);
    if (!a.ok || !b.ok) throw new Error('fail');
    expect(a.value.duty).toBe(enthalpyFlow(mx, a.value.outlets.out!) - enthalpyFlow(mx, s));
    expect(massFlow(mx, a.value.outlets.out!.n)).toBe(massFlow(mx, s.n));
    expect(a.value.info!.steam_kg_s!).toBeGreaterThan(b.value.info!.steam_kg_s!);
  });
  it('coded failures', () => {
    const code = (p: Record<string, number | string>) => { const r = boiler({ in: gas(1100) }, mk(p), ctx); return r.ok ? 'ok' : r.code; };
    expect(code({ T: 1200 })).toBe('TEMPERATURE_CROSS');
    expect(code({ T: 500, steam: 'HP' })).toBe('TEMPERATURE_CROSS');
    expect(code({})).toBe('SPEC_MISSING'); expect(code({ T: 700, steam: 'XX' })).toBe('SPEC_RANGE');
  });
});
