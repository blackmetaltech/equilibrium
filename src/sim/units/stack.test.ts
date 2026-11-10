import { describe, expect, it } from 'vitest';
import type { SimCtx, UnitInst } from '../types';
import { NM3_PER_MOL, stack } from './stack';
import { UNIT_DEFS_B } from './registryB';
import { INTERLOCK_ACTIONS, interlock } from './interlock';

const SP = ['N2', 'SO2', 'NO', 'NO2', 'O2'], ctx: SimCtx = { species: SP, thermoDetail: 'rigorous' };
const mk = (type: string, params: Record<string, number | string> = {}): UnitInst => ({ id: 'X1', type, pos: { x: 0, y: 0 }, rot: 0, params });

describe('stack + analyser', () => {
  it('concentrations, kg/h and mg/Nm3 are consistent', () => {
    const r = stack({ in: { n: [100, 0.5, 0.1, 0.05, 20], T: 400, P: 1.1e5 } }, mk('stack'), ctx);
    if (!r.ok) throw new Error(r.code);
    const i = r.value.info!;
    expect(i.ppmv_SO2).toBeCloseTo((1e6 * 0.5) / 120.65, 6);
    expect(i.kg_h_SO2).toBeCloseTo(0.5 * 0.06406 * 3600, 1);
    expect(i.mg_Nm3_SO2).toBeCloseTo((i.kg_h_SO2! / 3600 * 1e6) / (120.65 * NM3_PER_MOL), 6);
    expect(i.kg_h_NOx).toBeCloseTo(0.15 * 0.0460055 * 3600, 2);
    expect(Object.keys(r.value.outlets).length).toBe(0);
  });
  it('empty stream gives zeros, not NaN', () => {
    const r = stack({ in: { n: [0, 0, 0, 0, 0], T: 300, P: 1e5 } }, mk('stack'), ctx);
    if (!r.ok) throw new Error(r.code);
    for (const v of Object.values(r.value.info!)) expect(Number.isFinite(v)).toBe(true);
  });
});
describe('registryB + interlock', () => {
  it('registers the director names', () => {
    expect(Object.keys(UNIT_DEFS_B).sort()).toEqual(['absorber', 'boiler', 'co2_removal', 'column', 'fermenter', 'flare', 'flash', 'gauze_burner', 'hno3_absorber', 'interlock', 'methanator', 'n2o_abater', 'nh3_sep', 'reformer', 'relief', 'stack']);
    expect(UNIT_DEFS_B.flash!.outlets).toEqual(['vap', 'liq']); expect(UNIT_DEFS_B.stack!.isSink).toBe(true);
    expect(UNIT_DEFS_B.nh3_sep!.exits!(mk('nh3_sep'), 0, ['NH3'])).toBe(true);
  });
  it('interlock is static data', () => {
    expect(INTERLOCK_ACTIONS).toEqual(['cut_feed', 'full_coolant', 'dump']);
    const r = interlock({}, mk('interlock', { setpoint: 413 }), ctx); expect(r.ok && r.value.info!.setpoint).toBe(413);
  });
});
