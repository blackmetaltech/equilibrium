// Oracles for the chapter 2-7 instrument queries: xtDiagram (L13 staircase), semenov (L24 steady states), heatLedger (L07 Hess's road).
import { describe, expect, it } from 'vitest';
import { Engine } from '@core/kit';
import { GAME } from '../../game';
import type { EqState } from '../../state';
import { must, newEngine } from '../test-helpers';

const K = 273.15;
const unit = (e: Engine<EqState>, id: string) => e.state.flowsheet.units.find((u) => u.id === id)!;

/** Contact plant: feed -> eq_bed -> boiler -> eq_bed -> boiler -> eq_bed -> boiler -> product, 410 C inlet to every bed. */
function staircase(e: Engine<EqState>, Tin = 683.15): string[] {
  const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string;
  const beds: string[] = [], coolers: string[] = [];
  for (let i = 0; i < 3; i++) { beds.push(must(e, 'placeUnit', 'eq_bed', 3 + 5 * i, 0, 0).id as string); coolers.push(must(e, 'placeUnit', 'boiler', 3 + 5 * i, 6, 0).id as string); }
  const p = must(e, 'placeUnit', 'product', 22, 0, 0).id as string;
  must(e, 'setFeed', f, { x: [0.1, 0.11, 0, 0.79], flow: 1000e3 / 3600, T: Tin, P: 1.2e5 });
  must(e, 'connect', f, 'out', beds[0], 'in');
  for (let i = 0; i < 3; i++) { must(e, 'connect', beds[i], 'out', coolers[i], 'in'); must(e, 'connect', coolers[i], 'out', i < 2 ? beds[i + 1] : p, 'in'); }
  for (const b of beds) { Object.assign(unit(e, b).params, { reactions: 'R2', mode: 'adiabatic', Tmin: 683.15, Tmax: 893.15 }); }
  for (const c of coolers.slice(0, 2)) must(e, 'setParam', c, 'T', Tin);
  must(e, 'setParam', coolers[2], 'T', Tin);
  must(e, 'commission');
  return beds;
}

describe('xtDiagram', () => {
  it('L13 oracle: 410 C inlet beds climb 70.6 / 95.7 / 98.95 % (within 0.5 % abs), coolers drop back to the inlet T, window bands from the catalyst', () => {
    const e = newEngine(['SO2', 'O2', 'SO3', 'N2']);
    staircase(e);
    expect(e.state.solved?.ok).toBe(true);
    const x = e.q('xtDiagram') as any;
    expect(x.beds).toHaveLength(3);
    const want = [0.706, 0.957, 0.9895];
    x.beds.forEach((b: any, i: number) => {
      expect(Math.abs(b.outX - want[i]!)).toBeLessThan(0.005);
      expect(b.inT).toBeCloseTo(410 + K, 3);
      expect(b.outT).toBeGreaterThan(b.inT);
    });
    expect(x.beds[0].inX).toBe(0);
    expect(x.beds[1].inX).toBeCloseTo(x.beds[0].outX, 9);
    expect(x.coolers.length).toBeGreaterThanOrEqual(2);
    for (const c of x.coolers) { expect(c.toT).toBeLessThan(c.fromT); expect(c.toT).toBeCloseTo(410 + K, 3); }
    expect(x.lightOffT).toBeCloseTo(410 + K, 3);
    expect(x.sinterT).toBeGreaterThan(x.lightOffT);
    expect(x.eq.length).toBeGreaterThan(20);
    // every bed exit sits on the equilibrium curve (adiabatic equilibrium bed): X within 1.5 % abs of the curve at its exit T
    const at = (T: number): number => { const i = x.eq.findIndex((p: any) => p.T >= T); const a = x.eq[Math.max(i - 1, 0)], b = x.eq[Math.max(i, 1)]; return a.X + ((b.X - a.X) * (T - a.T)) / (b.T - a.T); };
    x.beds.forEach((b: any) => expect(Math.abs(at(b.outT) - b.outX)).toBeLessThan(0.015));
    expect(JSON.stringify(x)).not.toMatch(/null|NaN|Infinity/);
  });
  it('a multibed converter gives the same staircase from its per-bed info', () => {
    const e = newEngine(['SO2', 'O2', 'SO3', 'N2']);
    const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string, m = must(e, 'placeUnit', 'multibed', 4, 0, 0).id as string, p = must(e, 'placeUnit', 'product', 12, 0, 0).id as string;
    must(e, 'setFeed', f, { x: [0.1, 0.11, 0, 0.79], flow: 1000e3 / 3600, T: 683.15, P: 1.2e5 });
    const q = must(e, 'placeUnit', 'feed', 0, 6, 0).id as string; must(e, 'setFeed', q, { x: [0, 0, 0, 1], flow: 1e-6, T: 683.15, P: 1.2e5 });
    must(e, 'connect', f, 'out', m, 'in'); must(e, 'connect', q, 'out', m, 'quench'); must(e, 'connect', m, 'out', p, 'in');
    Object.assign(unit(e, m).params, { beds: 3, reactions: 'R2', Tcool1: 683.15, Tcool2: 683.15 }); must(e, 'setCatalyst', m, 'v2o5');
    must(e, 'commission');
    expect(e.state.solved?.ok).toBe(true);
    const x = e.q('xtDiagram') as any;
    expect(x.beds).toHaveLength(3);
    expect(Math.abs(x.beds[0].outX - 0.706)).toBeLessThan(0.005);
    expect(Math.abs(x.beds[2].outX - 0.9895)).toBeLessThan(0.005);
    expect(x.coolers).toHaveLength(2);
  });
  it('a plant with no adiabatic beds returns an empty diagram, not an error', () => {
    const e = newEngine();
    const x = e.q('xtDiagram') as any;
    expect(x.beds).toEqual([]); expect(x.eq).toEqual([]); expect(x.coolers).toEqual([]);
  });
});

describe('semenov', () => {
  function cstrPlant(): { e: Engine<EqState>; r: string } {
    const e = newEngine([]);
    { const st: EqState = structuredClone(e.state); st.species = ['C3H6O', 'H2O(l)', 'C3H8O2']; e.setState(st); }
    const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string, r = must(e, 'placeUnit', 'cstr', 4, 0, 0).id as string, p = must(e, 'placeUnit', 'product', 10, 0, 0).id as string;
    must(e, 'setFeed', f, { x: [2114 / 52114, 50000 / 52114, 0], flow: (5 / 3600) * 52114, T: 298.15, P: 7e5 });
    unit(e, r).params.Q = 5 / 3600;
    must(e, 'connect', f, 'out', r, 'in'); must(e, 'connect', r, 'out', p, 'in');
    must(e, 'commission');
    return { e, r };
  }
  it('L24 oracle: three steady states 27.6 / 63.1 / 117.0 C within 0.5 K; stable, unstable, stable; the operating point is a steady state', () => {
    const { e, r } = cstrPlant();
    expect(e.state.solved?.ok).toBe(true);
    const s = e.q('semenov', [r]) as any;
    expect(s.states).toHaveLength(3);
    [27.6, 63.1, 117.0].forEach((c, i) => expect(Math.abs(s.states[i].T - (c + K))).toBeLessThan(0.5));
    expect(s.states.map((x: any) => x.stable)).toEqual([true, false, true]);
    expect(s.T.length).toBe(s.G.length); expect(s.T.length).toBe(s.R.length); expect(s.T.length).toBeGreaterThan(50);
    expect(s.states.some((x: any) => Math.abs(x.T - s.op.T) < 0.5)).toBe(true);
    // G = R at every steady state (interpolated on the plotted lines)
    const gm = Math.max(...s.G);
    for (const st of s.states) { const i = s.T.findIndex((t: number) => t >= st.T); const d = (s.G[i] - s.R[i]) - (s.G[i - 1] - s.R[i - 1]); expect(Math.abs(s.G[i] - s.R[i])).toBeLessThan(Math.abs(d) + 1e-6 * gm); }
    expect(JSON.stringify(s)).not.toMatch(/null|NaN|Infinity/);
  });
  it('less cooling rotates the R line: lower UA gives a shallower R slope and a single hot state', () => {
    const { e, r } = cstrPlant();
    const a = e.q('semenov', [r]) as any;
    unit(e, r).params.UA = (10e6 / 3600) * 0.3; must(e, 'commission');
    const b = e.q('semenov', [r]) as any;
    const slope = (s: any) => (s.R[s.R.length - 1] - s.R[0]) / (s.T[s.T.length - 1] - s.T[0]);
    expect(slope(b)).toBeLessThan(slope(a));
    expect(b.states.length).toBeLessThan(a.states.length + 1);
  });
  it('a unit that is not a CSTR is a failure, not a crash', () => {
    const e = newEngine();
    const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string;
    expect(() => e.q('semenov', [f])).toThrow();
    expect(() => e.q('semenov', ['nope'])).toThrow();
  });
});

describe('heatLedger', () => {
  const carbon = (twoStep: boolean): Engine<EqState> => {
    const e = newEngine(['C', 'O2', 'CO', 'CO2']);
    const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string;
    must(e, 'setFeed', f, { x: [0.5, 0.5, 0, 0], flow: 10, T: 298.15, P: 1e5 });
    const p = must(e, 'placeUnit', 'product', 20, 0, 0).id as string;
    if (twoStep) {
      const g = must(e, 'placeUnit', 'gasifier', 4, 0, 0).id as string, b = must(e, 'placeUnit', 'co_burner', 10, 0, 0).id as string;
      must(e, 'setFeed', f, { x: [1 / 3, 2 / 3, 0, 0], flow: 6, T: 298.15, P: 1e5 });
      Object.assign(unit(e, g).params, { mode: 'isothermal', T: 298.15 }); Object.assign(unit(e, b).params, { mode: 'isothermal', T: 298.15 });
      must(e, 'connect', f, 'out', g, 'in'); must(e, 'connect', g, 'out', b, 'in'); must(e, 'connect', b, 'out', p, 'in');
    } else {
      const d = must(e, 'placeUnit', 'stoich_reactor', 4, 0, 0).id as string;
      must(e, 'setFeed', f, { x: [1 / 3, 2 / 3, 0, 0], flow: 6, T: 298.15, P: 1e5 });
      Object.assign(unit(e, d).params, { reactions: 'R14,R15', mode: 'isothermal', T: 298.15 });
      must(e, 'connect', f, 'out', d, 'in'); must(e, 'connect', d, 'out', p, 'in');
    }
    must(e, 'commission');
    return e;
  };
  it('L07 oracle: C -> CO -> CO2 in two units totals the direct C -> CO2 (393.5 kJ/mol x flow) within 0.5 %', () => {
    const two = carbon(true), one = carbon(false);
    expect(two.state.solved?.ok).toBe(true); expect(one.state.solved?.ok).toBe(true);
    const a = two.q('heatLedger') as any, b = one.q('heatLedger') as any;
    const carbonFlow = 6 / 3; // mol/s of C in the 6 mol/s feed
    const want = (393.5e3 * carbonFlow) / 1e6;
    expect(Math.abs(a.totalMW - want) / want).toBeLessThan(0.005);
    expect(Math.abs(b.totalMW - want) / want).toBeLessThan(0.005);
    const rel = a.items.filter((i: any) => i.kind === 'release');
    expect(rel).toHaveLength(2);
    expect(rel.every((i: any) => i.MW > 0 && typeof i.tag === 'string' && typeof i.unitId === 'string')).toBe(true);
    expect(rel[0].MW).toBeCloseTo((110.5e3 * carbonFlow) / 1e6, 2);
    expect(JSON.stringify(a)).not.toMatch(/null|NaN|Infinity/);
  });
  it('heat taken out by boilers is recovered, by coolers lost, a heater is duty; an unsolved plant has no items', () => {
    const e = newEngine(['SO2', 'O2', 'SO3', 'N2']);
    staircase(e);
    const l = e.q('heatLedger') as any;
    expect(l.items.some((i: any) => i.kind === 'release')).toBe(true);
    expect(l.items.filter((i: any) => i.kind === 'recovered').length).toBeGreaterThanOrEqual(2);
    const e2 = newEngine();
    const z = e2.q('heatLedger') as any;
    expect(z.items).toEqual([]); expect(z.totalMW).toBe(0);
  });
});

describe('eqBeam and live solve', () => {
  it('Equilibrium Window of a bed: the operating point lies on the curve; after a design edit (solved cleared) it still answers with the new plant', () => {
    const e = newEngine(['SO2', 'O2', 'SO3', 'N2']);
    const beds = staircase(e);
    const a = e.q('eqBeam', [beds[0]!]) as any;
    expect(a.window.X.length).toBeGreaterThan(20);
    expect(Math.abs(a.point.X - 0.706)).toBeLessThan(0.005);
    const at = (T: number): number => { const i = a.window.T.findIndex((t: number) => t >= T); return a.window.X[i - 1] + ((a.window.X[i] - a.window.X[i - 1]) * (T - a.window.T[i - 1])) / (a.window.T[i] - a.window.T[i - 1]); };
    expect(Math.abs(at(a.point.T) - a.point.X)).toBeLessThan(0.015);
    expect(Math.abs(a.beam.out)).toBeLessThan(0.05);
    const feed = e.state.flowsheet.units.find((u) => u.type === 'feed')!.id;
    must(e, 'setFeed', feed, { T: 703.15 });
    expect(e.state.solved).toBeNull();
    const b = e.q('eqBeam', [beds[0]!]) as any;
    expect(b.point.T).toBeGreaterThan(a.point.T);
    expect(b.point.X).toBeLessThan(a.point.X);
    expect((e.q('xtDiagram') as any).beds).toHaveLength(3);
    expect(JSON.stringify(b)).not.toMatch(/NaN|Infinity/);
  });
  it('a non-reactor has no window (coded reason), an unknown unit is an error', () => {
    const e = newEngine(['SO2', 'O2', 'SO3', 'N2']);
    const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string;
    expect((e.q('eqBeam', [f]) as any).reason).toBe('NO_REACTOR');
    expect(() => e.q('eqBeam', ['nope'])).toThrow();
  });
});
