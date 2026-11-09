import { describe, expect, it } from 'vitest';
import type { SimCtx, UnitInst } from '../types';
import { UNIT_DEFS } from './registry';

const ctx: SimCtx = { species: ['N2', 'H2'], thermoDetail: 'rigorous' };
const U = (type: string, params: Record<string, number | string> = {}): UnitInst => ({ id: 'X', type, pos: { x: 0, y: 0 }, rot: 0, params });

describe('UNIT_DEFS registry', () => {
  it('has every unit type of lane M1.6 with its fixed port names', () => {
    for (const t of ['feed', 'mixer', 'mixer3', 'mixer4', 'splitter', 'heater', 'cooler', 'hx', 'compressor', 'valve', 'sink', 'product', 'vent'])
      expect(UNIT_DEFS[t], t).toBeDefined();
    expect(UNIT_DEFS.feed).toMatchObject({ inlets: [], outlets: ['out'], isSource: true });
    expect(UNIT_DEFS.mixer!.inlets).toEqual(['in1', 'in2']); expect(UNIT_DEFS.mixer3!.inlets).toEqual(['in1', 'in2', 'in3']);
    expect(UNIT_DEFS.splitter!.outlets).toEqual(['purge', 'out']);
    expect(UNIT_DEFS.hx!.inlets).toEqual(['hot_in', 'cold_in']); expect(UNIT_DEFS.hx!.outlets).toEqual(['hot_out', 'cold_out']);
    for (const t of ['sink', 'product', 'vent']) expect(UNIT_DEFS[t]).toMatchObject({ inlets: ['in'], outlets: [], isSink: true });
    expect(UNIT_DEFS.compressor!.phaseIn).toEqual({ in: 'V' });
  });
  it('sinks let every species exit; the splitter exit depends on the purge fraction; feeds do not', () => {
    expect(UNIT_DEFS.vent!.exits!(U('vent'), 0, ['N2', 'H2'])).toBe(true);
    expect(UNIT_DEFS.splitter!.exits!(U('splitter', { frac: 0.1 }), 1, ['N2', 'H2'])).toBe(true);
    expect(UNIT_DEFS.splitter!.exits!(U('splitter', { frac: 0 }), 1, ['N2', 'H2'])).toBe(false);
    expect(UNIT_DEFS.splitter!.exits!(U('splitter', { frac: 0 }), 1, ['N2', 'H2'])).toBe(false);
  });
  it('every fn returns exactly the outlet ports it declares', () => {
    const s = { n: [1, 3], T: 400, P: 1e6 }, c = { n: [1, 1], T: 300, P: 1e6 };
    const cases: [string, Record<string, number | string>, Record<string, typeof s>][] = [
      ['feed', { flow: 1, y_N2: 1, T: 300, P: 1e5 }, {}], ['mixer', {}, { in1: s, in2: c }], ['mixer3', {}, { in1: s, in2: c, in3: c }],
      ['mixer4', {}, { in1: s, in2: c }], ['splitter', { frac: 0.3 }, { in: s }], ['heater', { T: 450 }, { in: s }], ['cooler', { T: 350 }, { in: s }],
      ['hx', { area: 5 }, { hot_in: s, cold_in: c }], ['compressor', { P: 2e6 }, { in: c }], ['valve', { P: 5e5 }, { in: s }],
      ['sink', {}, { in: s }], ['product', {}, { in: s }], ['vent', {}, { in: s }],
    ];
    for (const [t, p, inl] of cases) {
      const d = UNIT_DEFS[t]!, r = d.fn(inl, U(t, p), ctx);
      if (!r.ok) throw new Error(t + ' ' + r.code);
      expect(Object.keys(r.value.outlets).sort(), t).toEqual([...d.outlets].sort());
    }
  });
});
