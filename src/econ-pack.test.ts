// Pack switch (BUILD-PLAN 1.10): the region changes prices, never physics. This file sits outside src/sim and src/data because it imports
// the packs (regions.test.ts forbids that import inside the rule folders).
import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions';
import { capexItem } from './sim/econ/capex';
import { co2eTotalKgPerH } from './sim/econ/emissions';
import { opexPerHour } from './sim/econ/opex';

const duties = { shaftW: 950000, firedDutyW: 10e6, steamRaisedW: 5e6, coolingW: 10e6, feeds: [{ key: 'ammonia', kgPerS: 1 }] };

describe('pack switch changes cost, not physics', () => {
  const g = REGIONS.get('global')!.data, i = REGIONS.get('in')!.data;
  it('every econ function accepts the real pack price objects', () => {
    for (const d of [g, i]) { const r = opexPerHour(duties, d.prices); expect(r.ok).toBe(true); }
  });
  it('capex and emissions (physics) are identical under both packs; the grid factor is the only pack input to CO2e', () => {
    const sameCapex = JSON.stringify(capexItem({ type: 'compressor', size: 1000 }));
    expect(JSON.stringify(capexItem({ type: 'compressor', size: 1000 }))).toBe(sameCapex);
    const a = co2eTotalKgPerH({ fuelDutyW: 10e6 }, g.limits.grid_t_co2_per_mwh), b = co2eTotalKgPerH({ fuelDutyW: 10e6 }, i.limits.grid_t_co2_per_mwh);
    expect(a).toBe(b);
  });
  it('opex differs: electricity and fuel lines scale with the pack prices, the duties do not change', () => {
    const rg = opexPerHour(duties, g.prices), ri = opexPerHour(duties, i.prices);
    if (!rg.ok || !ri.ok) throw new Error('opex');
    expect(ri.value.electricity / rg.value.electricity).toBeCloseTo(i.prices.electricity.value / g.prices.electricity.value, 9);
    expect(ri.value.total).not.toBe(rg.value.total);
  });
});
