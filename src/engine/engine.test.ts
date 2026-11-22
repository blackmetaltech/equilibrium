// Engine glue tests: design -> commission round trip on a loop of real units, save / load, determinism, state and snapshot budgets, undo / redo,
// query purity, the query set, coded-message templates for every rule-code failure, invariants, personas and the solve time budget.
import { describe, expect, it } from 'vitest';
import { Engine, MemoryKV, hashOf, play } from '@core/kit';
import { Rng } from '@core/kit/rng';
import { GAME, metricsOf } from '../game';
import { i18n, t } from '../i18n';
import { en } from '../locales/en';
import type { EqState } from '../state';
import { MAX_UNDO } from '../state';
import { messageOf } from './solved';
import { buildLoop, must, newEngine, reject } from './test-helpers';

const hashState = (e: Engine<EqState>): string => hashOf(e.state);

/** A 21-unit, 20-stream plant: four branches (feed, heater, cooler, valve) into a mixer, a purge, a compressor and a product tank. */
function buildBig(e: Engine<EqState>): void {
  const mix = must(e, 'placeUnit', 'mixer4', 20, 12, 0).id as string;
  const sp = must(e, 'placeUnit', 'splitter', 20, 8, 0).id as string, vent = must(e, 'placeUnit', 'vent', 20, 4, 0).id as string;
  const comp = must(e, 'placeUnit', 'compressor', 20, 0, 0).id as string, prod = must(e, 'placeUnit', 'product', 16, 0, 0).id as string;
  for (let b = 0; b < 4; b++) {
    const ids = ['feed', 'heater', 'cooler', 'valve'].map((t, k) => must(e, 'placeUnit', t, k * 4, b * 4, 0).id as string);
    must(e, 'setFeed', ids[0], { x: [0.25, 0.25, 0.25, 0.25], flow: 1, T: 300, P: 5e6 });
    must(e, 'setParam', ids[1], 'T', 420); must(e, 'setParam', ids[2], 'T', 330); must(e, 'setParam', ids[3], 'P', 2e6);
    must(e, 'connect', ids[0], 'out', ids[1], 'in'); must(e, 'connect', ids[1], 'out', ids[2], 'in'); must(e, 'connect', ids[2], 'out', ids[3], 'in');
    must(e, 'connect', ids[3], 'out', mix, 'in' + (b + 1));
  }
  must(e, 'connect', mix, 'out', sp, 'in'); must(e, 'connect', sp, 'purge', vent, 'in'); must(e, 'connect', sp, 'out', comp, 'in'); must(e, 'connect', comp, 'out', prod, 'in');
  must(e, 'setParam', comp, 'P', 4e6);
}

/** The recycle loop with the ammonia separator replaced by a plain splitter chain: no phase change, so energy closes on stream enthalpies. */
function buildDry(e: Engine<EqState>): void {
  const id = (type: string, x: number, y: number) => must(e, 'placeUnit', type, x, y, 0).id as string;
  const f = id('feed', 0, 0), m = id('mixer', 4, 0), k = id('compressor', 8, 0), c = id('cooler', 14, 0), x = id('splitter', 18, 0), v = id('valve', 18, 4), vent = id('vent', 14, 4), pr = id('product', 20, 8);
  const x2 = id('splitter', 8, 8);
  must(e, 'setFeed', f, { x: [0.24, 0.73, 0.01, 0.02], flow: 1, T: 300, P: 2e6 });
  must(e, 'setParam', k, 'P', 1e7); must(e, 'setParam', k, 'stages', 2); must(e, 'setParam', c, 'T', 320); must(e, 'setParam', c, 'utility', 'cw');
  must(e, 'setParam', x, 'frac', 0.05); must(e, 'setParam', v, 'P', 2e6); must(e, 'setParam', x2, 'frac', 0.5);
  for (const [a, ap, b, bp] of [[f, 'out', m, 'in1'], [m, 'out', k, 'in'], [k, 'out', c, 'in'], [c, 'out', x, 'in'], [x, 'purge', vent, 'in'], [x, 'out', x2, 'in'], [x2, 'purge', pr, 'in'], [x2, 'out', v, 'in'], [v, 'out', m, 'in2']] as const)
    must(e, 'connect', a, ap, b, bp);
}

describe('design -> commission round trip on real units', () => {
  it('the recycle loop converges, closes atoms and energy, and reports finite KPIs', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    const r = must(e, 'commission');
    expect(r.commissioned).toBe(true); expect(e.state.phase).toBe('commissioned');
    const sol = e.state.solved!;
    expect(sol.ok).toBe(true); expect(sol.loops).toBe(1); expect(Object.keys(sol.streams).length).toBe(e.state.flowsheet.streams.length);
    for (const v of Object.values(sol.kpis)) expect(Number.isFinite(v)).toBe(true);
    expect(sol.kpis.product_t_per_h).toBeGreaterThan(0); expect(sol.kpis.cost_usd_per_t).toBeGreaterThan(0);
    const led = e.q('ledger') as any;
    expect(led.atomRel).toBeLessThan(1e-9); expect(led.atoms.map((a: any) => a.element)).toEqual(['Ar', 'H', 'N']);
    expect(led.cost.capex.length).toBeGreaterThan(0); expect(led.cost.annual).toBeGreaterThan(0);
    expect(GAME.invariants!(e.state, null)).toEqual([]);
    expect(e.state.runs).toHaveLength(1); expect(e.state.runs[0]!.setpoints[ids.split!]).toMatchObject({ frac: 0.05 });
    expect(e.state.warm!.tears).toBeDefined();
  });
  it('energy closes to 1e-6 on a plant without phase change, and atoms to 1e-9', () => {
    const e = newEngine(); buildDry(e); must(e, 'commission');
    const led = e.q('ledger') as any;
    expect(led.energy.closure).not.toBeNull(); expect(led.energy.closure).toBeLessThan(1e-6); expect(led.atomRel).toBeLessThan(1e-9);
  });
  it('a second commission warm-starts from the stored tears and keeps up to 10 runs', () => {
    const e = newEngine(); const { ids } = buildLoop(e); must(e, 'commission'); const first = e.state.solved!.iterations;
    must(e, 'setParam', ids.split, 'frac', 0.051); must(e, 'commission'); expect(e.state.solved!.iterations).toBeLessThanOrEqual(first);
    for (let i = 0; i < 12; i++) { must(e, 'setParam', ids.split, 'frac', 0.04 + i / 1000); must(e, 'commission'); }
    expect(e.state.runs).toHaveLength(10);
  });
  it('a different thermo detail re-solves the same plant', () => {
    const e = newEngine(); buildLoop(e); must(e, 'commission'); const a = e.state.solved!.kpis.electric_kw!;
    must(e, 'setThermoDetail', 'textbook'); expect(e.state.phase).toBe('design'); must(e, 'commission'); expect(e.state.solved!.ok).toBe(true);
    expect(Math.abs(e.state.solved!.kpis.electric_kw! - a)).toBeLessThan(a);
  });
});

describe('saves, determinism, budgets', () => {
  it('save and load round-trip a commissioned plant bit for bit', () => {
    const kv = new MemoryKV(); const e = new Engine(GAME, { storage: kv }); e.autosave = false;
    must(e, 'setSpecies', ['N2', 'H2', 'Ar', 'NH3']); buildLoop(e); must(e, 'commission');
    const h = hashState(e);
    expect(e.act('save', ['slot2']).ok).toBe(true);
    must(e, 'deleteUnit', e.state.flowsheet.units[0]!.id); expect(hashState(e)).not.toBe(h);
    expect(e.act('load', ['slot2']).ok).toBe(true); expect(hashState(e)).toBe(h); expect(e.state.phase).toBe('commissioned');
    const e2 = new Engine(GAME, { storage: kv }); expect((e2.q('saves') as any[]).find((x) => x.slot === 'slot2').label).toContain('Commissioned · 9 units');
  });
  it('the same actions give the same state hash', () => {
    const a = newEngine(), b = newEngine(); buildLoop(a); buildLoop(b); must(a, 'commission'); must(b, 'commission');
    expect(hashState(a)).toBe(hashState(b));
  });
  it('state stays under 256 KB and the snapshot under 8 KB on a 21-unit, 20-stream plant', () => {
    const e = newEngine(); buildBig(e); must(e, 'commission');
    expect(e.state.flowsheet.units.length).toBe(21); expect(e.state.flowsheet.streams.length).toBe(20);
    expect(JSON.stringify(e.state).length).toBeLessThan(256 * 1024);
    const snap = JSON.stringify(e.snapshot());
    expect(snap.length).toBeLessThan(8 * 1024);
    expect(JSON.stringify(newEngine().snapshot()).length).toBeLessThan(2048);
    const sn = e.snapshot() as any;
    expect(sn.units).toHaveLength(21); expect(sn.streams).toHaveLength(20); expect(sn.phase).toBe('commissioned'); expect(sn.colours).toHaveLength(4);
    expect(sn.units.every((u: any) => u.glow >= 0 && u.glow <= 1)).toBe(true);
  });
  it('state with 10 runs and a full undo stack still fits 256 KB', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    for (let i = 0; i < 12; i++) { must(e, 'setParam', ids.split, 'frac', 0.04 + i / 1000); must(e, 'commission'); }
    expect(e.state.undo.past.length).toBeLessThanOrEqual(MAX_UNDO);
    expect(JSON.stringify(e.state).length).toBeLessThan(256 * 1024);
  });
  it('commission time on a 12-unit loop: p95 under 25 ms of CPU (desktop), reported', () => {
    const times: number[] = [], walls: number[] = [];
    for (let i = 0; i < 40; i++) {
      const e = newEngine(); const { ids } = buildLoop(e, true); expect(e.state.flowsheet.units.length).toBe(12);
      must(e, 'setParam', ids.split, 'frac', 0.03 + i / 500);
      // Phase C: the budget is compute, so time this thread's CPU (user + system), not the wall clock. Under a parallel suite the worker is
      // descheduled and wall time counted that wait (57-936 ms seen under load, 4 ms alone). Same 25 ms bound; wall time is still reported.
      const w0 = performance.now(), c0 = process.threadCpuUsage(); const r = e.act('commission', []);
      const c1 = process.threadCpuUsage(c0); times.push((c1.user + c1.system) / 1000); walls.push(performance.now() - w0);
      expect(r.commissioned).toBe(true);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    walls.sort((a, b) => a - b);
    console.log(`commission 12-unit loop (thread CPU): median ${times[20]!.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${times[39]!.toFixed(2)} ms; wall p95 ${walls[38]!.toFixed(2)} ms`);
    expect(p95).toBeLessThan(25);
  });
});

describe('undo / redo', () => {
  it('undo reverts the last step exactly, redo reapplies it, a new edit clears redo', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    const h0 = hashOf(e.state.flowsheet), f0 = structuredClone(e.state.feeds);
    must(e, 'setParam', ids.split, 'frac', 0.2); const h1 = hashOf(e.state.flowsheet);
    must(e, 'undo'); expect(hashOf(e.state.flowsheet)).toBe(h0); expect(e.state.feeds).toEqual(f0);
    must(e, 'redo'); expect(hashOf(e.state.flowsheet)).toBe(h1);
    must(e, 'undo'); must(e, 'setParam', ids.split, 'frac', 0.3); expect(e.state.undo.future).toEqual([]); expect(reject(e, 'redo')).toMatch(/Nothing to redo/);
  });
  it('undoing every step of the build returns the empty plot; delete, move, rotate, connect and feed edits are all undoable', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    must(e, 'moveUnit', ids.mix, 20, 12); must(e, 'rotateUnit', ids.mix); must(e, 'setFeed', ids.feed, { flow: 2 }); must(e, 'deleteUnit', ids.vent);
    const steps = e.state.undo.past.length; expect(steps).toBeLessThanOrEqual(MAX_UNDO);
    while (e.state.undo.past.length) must(e, 'undo');
    expect(e.state.flowsheet).toEqual({ units: [], streams: [], nextId: 1 }); expect(e.state.feeds).toEqual({});
    while (e.state.undo.future.length) must(e, 'redo');
    expect(e.state.flowsheet.units.some((u) => u.id === ids.vent)).toBe(false); expect(e.state.flowsheet.units.find((u) => u.id === ids.mix)!.rot).toBe(1);
    expect(e.state.feeds[ids.feed!]!.flow).toBe(2);
  });
  it('the stack is bounded at 30 and each entry is a small diff', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    for (let i = 0; i < 50; i++) must(e, 'setParam', ids.split, 'frac', 0.01 + i / 100);
    expect(e.state.undo.past).toHaveLength(30);
    expect(Math.max(...e.state.undo.past.map((x) => JSON.stringify(x).length))).toBeLessThan(600);
  });
  it('undo of a commissioned plant is a design edit (phase back to design)', () => {
    const e = newEngine(); const { ids } = buildLoop(e); must(e, 'commission'); expect(e.state.phase).toBe('commissioned');
    must(e, 'undo'); expect(e.state.phase).toBe('design'); expect(e.state.flowsheet.streams.some((p) => p.id === ids.v_m)).toBe(false);
  });
});

describe('queries', () => {
  it('never mutate: the state hash is unchanged after every query, with and without a solve', () => {
    for (const solved of [false, true]) {
      const e = newEngine(); const { ids, pipes } = buildLoop(e); if (solved) must(e, 'commission');
      const h = hashState(e);
      const calls: [string, unknown[]][] = [['plant', []], ['palette', []], ['kpis', []], ['runs', []], ['ledger', []], ['unitCard', [ids.comp]], ['unitCard', [ids.feed]],
        ['legalPorts', [ids.split, 'out']], ['legalPorts', [ids.mix, 'in1']], ['streamTable', []], ['streamTable', [{ ids: [pipes.f_m] }]], ['stream', [pipes.k_c]], ['eqWindow', [ids.comp]],
        ['lens', [pipes.k_c, 50]], ['lens', [ids.feed, 20]], ['loopHistory', []], ['solutionCode', []], ['metrics', []]];
      for (const [name, args] of calls) { try { e.q(name, args); } catch { /* a query may teach on an unsolved plant */ } expect(hashState(e), `${name} (solved ${solved})`).toBe(h); }
    }
  });
  it('plant: units, streams, phase, KPIs, plot and failed units', () => {
    const e = newEngine(); buildLoop(e); must(e, 'commission');
    const p = e.q('plant') as any;
    expect(p.phase).toBe('commissioned'); expect(p.units).toHaveLength(9); expect(p.streams).toHaveLength(9); expect(p.species).toEqual(['N2', 'H2', 'Ar', 'NH3']);
    expect(p.kpis.cost_usd_per_t).toBeGreaterThan(0); expect(p.failed).toEqual([]); expect(p.plot).toEqual({ w: 24, h: 16 });
  });
  it('unitCard: params with knob specs, ports with streams, results and coded diagnostics with messages', () => {
    const e = newEngine(); const { ids, pipes } = buildLoop(e); must(e, 'commission');
    const c = e.q('unitCard', [ids.comp]) as any;
    expect(c.type).toBe('compressor'); expect(c.label).toBe('Compressor'); expect(c.footprint).toEqual({ w: 4, h: 2 });
    expect(c.knobs.map((k: any) => k.key)).toEqual(['P', 'stages']);
    expect(c.knobs[0]).toMatchObject({ value: 1e7, unit: 'bar', unitLabel: 'bar(a)', min: 1e4, max: 4e7, label: 'Pressure (absolute)', isDefault: false });
    expect(c.inlets).toEqual([{ port: 'in', label: 'In', stream: pipes.m_k }]); expect(c.outlets[0].stream).toBe(pipes.k_c);
    expect(c.results.work).toBeGreaterThan(0); expect(c.results.info.shaft_kW).toBeGreaterThan(0);
    const sp = e.q('unitCard', [ids.split]) as any; expect(sp.knobs[0]).toMatchObject({ key: 'frac', value: 0.05, unit: 'mol%' });
    expect((e.q('unitCard', [ids.feed]) as any).feed.x).toEqual([0.24, 0.73, 0.01, 0.02]);
    expect(() => e.q('unitCard', ['Q-9'])).toThrow(/no unit Q-9/);
  });
  it('stream and streamTable: flow, T, P, mass flow, top-3 species and colours from the species DB', () => {
    const e = newEngine(); const { pipes } = buildLoop(e);
    expect((e.q('streamTable') as any).rows).toEqual([]); expect(() => e.q('stream', [pipes.f_m])).toThrow(/no stream/);
    must(e, 'commission');
    const s = e.q('stream', [pipes.f_m]) as any;
    expect(s.flow).toBeCloseTo(1, 9); expect(s.T).toBe(300); expect(s.P).toBe(2e6);
    expect(s.top.map((x: any) => x.id)).toEqual(['H2', 'N2', 'NH3']); expect(s.top[0].colour).toMatch(/^#[0-9A-F]{6}$/);
    expect(s.mass).toBeCloseTo(0.24 * 28.014e-3 + 0.73 * 2.016e-3 + 0.01 * 39.948e-3 + 0.02 * 17.031e-3, 5);
    expect(s.species.reduce((a: number, x: any) => a + x.x, 0)).toBeCloseTo(1, 12);
    const tab = e.q('streamTable') as any; expect(tab.ok).toBe(true); expect(tab.rows).toHaveLength(9);
  });
  it('legalPorts lists only the ports connect() would accept', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    const a = e.q('legalPorts', [ids.vent, 'in']) as any;   // vent inlet is taken
    expect(a.direction).toBe('in'); expect(a.targets).toEqual([]);
    const f = must(e, 'placeUnit', 'feed', 0, 12, 0).id as string; const fl = must(e, 'placeUnit', 'flash', 4, 12, 0).id as string; const k = must(e, 'placeUnit', 'compressor', 8, 12, 0).id as string;
    const out = (e.q('legalPorts', [f, 'out']) as any).targets; expect(out).toEqual(expect.arrayContaining([{ unit: fl, port: 'in' }, { unit: k, port: 'in' }]));
    expect((e.q('legalPorts', [fl, 'liq']) as any).targets.some((x: any) => x.unit === k)).toBe(false);
    expect((e.q('legalPorts', [fl, 'vap']) as any).targets.some((x: any) => x.unit === k)).toBe(true);
    for (const x of out) expect(e.probe({ name: 'connect', args: [f, 'out', x.unit, x.port] })).toBe(true);
    expect(() => e.q('legalPorts', [f, 'bogus'])).toThrow(/no port called bogus/);
  });
  it('palette lists categories with availability and count limits', () => {
    const e = newEngine(); const s = structuredClone(e.state) as EqState; s.palette = ['mixer', 'heater']; s.limits = { heater: 1 }; e.setState(s);
    must(e, 'placeUnit', 'heater', 0, 0, 0);
    const p = e.q('palette') as any; const all = p.cats.flatMap((c: any) => c.items);
    const get = (t: string) => all.find((i: any) => i.type === t);
    expect(get('mixer')).toMatchObject({ available: true, why: null }); expect(get('heater')).toMatchObject({ available: false, why: 'err.place.limit', count: 1, limit: 1 });
    expect(get('compressor')).toMatchObject({ available: false, why: 'err.place.locked' }); expect(get('feed').available).toBe(true); expect(get('product').available).toBe(true);
    expect(p.cats[0].label).toBe('Sources');
  });
  it('lens: molecule counts by largest remainder always sum to n', () => {
    const e = newEngine(); const { pipes, ids } = buildLoop(e); must(e, 'commission');
    for (const n of [1, 7, 50, 100, 333]) {
      const l = e.q('lens', [pipes.f_m, n]) as any;
      expect(l.counts.reduce((a: number, c: any) => a + c.count, 0)).toBe(n);
    }
    const l = e.q('lens', [pipes.f_m, 100]) as any; expect(l.counts.map((c: any) => c.count)).toEqual([24, 73, 1, 2]);
    expect((e.q('lens', [ids.feed, 100]) as any).counts.reduce((a: number, c: any) => a + c.count, 0)).toBe(100);
  });
  it('eqWindow explains why a unit has no window; loopHistory gives the tear snapshots; ledger and runs are empty before a solve', () => {
    const e = newEngine(); const { ids } = buildLoop(e);
    expect(e.q('eqWindow', [ids.comp])).toEqual({ window: null, reason: 'NO_REACTOR' }); expect(e.q('ledger')).toBeNull(); expect(e.q('runs')).toEqual([]);
    const h = e.q('loopHistory') as any; expect(h.ok).toBe(true); expect(h.history.length).toBeGreaterThan(1); expect(h.history.length).toBeLessThanOrEqual(60);
  });
});

/** (code, data as the rule code produces it) for every coded failure, warning and info of src/sim. Each must have a template. */
const SAMPLES: [string, string, Record<string, number | string>][] = [
  ['fail', 'NO_INLET', { port: 0 }], ['fail', 'PRESSURE_NONPOSITIVE', { Pin: 1e5, dP: 2e5 }], ['fail', 'VALVE_P_RISE', { Pin: 1e5, Pout: 2e5 }],
  ['fail', 'SPEC_RANGE', { T: -1 }], ['fail', 'SPEC_MISSING', {}], ['fail', 'FEED_SPEC', { T: 300, P: 1e5, flow: 1 }],
  ['fail', 'TEMPERATURE_CROSS', { T_hot_in: 500, T_cold_in: 400 }], ['fail', 'NOT_A_REACTANT', { index: 0 }], ['fail', 'NO_REACTANT', { index: 0 }],
  ['fail', 'CONVERSION_RANGE', { asked: 1.5 }], ['fail', 'CONVERSION_EXCEEDS_LIMITING', { asked: 1, max: 0.64, limiting: 'H2', limitingIndex: 1 }],
  ['fail', 'SPECIES_MISSING', {}], ['fail', 'SERVICE_UNKNOWN', {}], ['fail', 'UTILITY_UNKNOWN', {}],
  ['fail', 'UTILITY_CANNOT_REACH', { utility: 'cw', T_out: 280, T_limit: 308.15, Q: -1 }], ['fail', 'SPLIT_RANGE', { frac: 1.2 }],
  ['fail', 'NOT_PFR_LAW', { law: 'x' }], ['fail', 'BED_STEPS', { w: 1 }], ['fail', 'BED_NEWTON', { w: 1 }], ['fail', 'BED_NONFINITE', { w: 1 }],
  ['fail', 'DUTY_UNREACHABLE', { duty: 1e9, Tlo: 150, Thi: 900 }], ['fail', 'BAD_INPUT', { T: -1 }], ['fail', 'UNKNOWN_REACTION', {}], ['fail', 'NO_THERMO', {}],
  ['fail', 'T_BRACKET', { H: 1, Hlo: 0, Hhi: 2 }], ['fail', 'ZERO_FLOW', { H: 0 }], ['fail', 'NO_CONVERGE', { stage: 1, T: 300 }],
  ['fail', 'EQUILIBRIUM_NOT_CONVERGED', { residual: 1e-3, iterations: 50 }], ['fail', 'COMPRESSOR_STAGES', { stages: 7 }], ['fail', 'COMPRESSOR_ETA', { eta: 2 }],
  ['fail', 'COMPRESSOR_P_FALL', { Pin: 2e5, Pout: 1e5 }], ['fail', 'COMPRESSOR_LIQUID_IN', { n_liquid: 0.5 }],
  ['fail', 'DISCHARGE_TOO_HOT', { stage: 1, T_out: 600, T_max: 473.15, ratio: 9 }], ['fail', 'CEPCI_YEAR', { year: 1999 }], ['fail', 'EQUIP_UNKNOWN', { type: 'x' }],
  ['fail', 'SIZE_BAD', { type: 'x', size: 0 }], ['fail', 'PRESSURE_BAD', { type: 'x' }], ['fail', 'PRESSURE_CLASS', { type: 'x', p: 500, max: 300 }],
  ['fail', 'PRICE_MISSING', { key: 'x' }], ['fail', 'PRICE_UNIT', {}], ['fail', 'OPEX_NAN', {}], ['fail', 'DUTY_NEGATIVE', {}], ['fail', 'COP_BAD', {}], ['fail', 'LIFE_BAD', {}], ['fail', 'PROD_BAD', {}],
  ['fail', 'TOPOLOGY_OPEN_PORT', { port: 'in', inlet: 1 }], ['fail', 'TOPOLOGY_UNKNOWN_UNIT', { pipe: 'S' }], ['fail', 'TOPOLOGY_UNKNOWN_PORT', { pipe: 'S', port: 'p' }],
  ['fail', 'TOPOLOGY_DUPLICATE_UNIT', {}], ['fail', 'TOPOLOGY_DOUBLE_INLET', { pipe: 'S', port: 'in' }], ['fail', 'TOPOLOGY_DOUBLE_OUTLET', { pipe: 'S', port: 'out' }],
  ['fail', 'TOPOLOGY_PHASE', { pipe: 'S', port: 'in' }], ['fail', 'NO_EXIT', { species: 'Ar', scc: 'a,b', inflow: 0.01 }],
  ['fail', 'ACCUMULATION', { species: 'Ar', gain: 0.9, extrapolated: 0.4, inventory: 3, passes: 100, scc: 'a', tears: 1 }], ['fail', 'LOOP_GAIN_GE_1', { gain: 1 }],
  ['fail', 'LOOP_OSCILLATING', { species: 'Ar', ratio: -0.9, amplitude: 1 }], ['fail', 'NUMERIC_GUARD', { thrown: 1 }], ['fail', 'ELEMENT_BALANCE', { imbalance: 0.1 }],
  ['info', 'NO_REACTANT', { reaction: 0 }], ['info', 'EQUILIBRIUM_NOT_CONVERGED', { residual: 1e-3, iterations: 50 }], ['info', 'ALL_LIQUID', { T: 300, P: 1e5 }],
  ['info', 'ALL_VAPOUR', { T: 300, P: 1e5 }], ['info', 'PROPERTY_EXTRAPOLATED', { T: 3000, Tlo: 100, Thi: 2000 }], ['info', 'MIXER_PRESSURE_MISMATCH', { Pmax: 2e6, Pmin: 1e6 }],
  ['info', 'DT_MIN_VIOLATED', { dT_min: 3, limit: 10 }], ['info', 'WATER_ABSORBER_MIST', { acid: 0.985 }], ['info', 'RELIEF_UNDERSIZED', { load: 9e3, capacity: 5e3, area: 71, need: 130 }],
  ['info', 'MATERIAL_FALLBACK', { from: 'Ni', to: 'SS' }], ['info', 'PRESSURE_RANGE', { p: 150, max: 100 }], ['info', 'SIZE_CLAMPED', { size: 1, min: 10 }],
  ['info', 'SIZE_SPLIT', { units: 2, size: 9e3, max: 5e3 }], ['info', 'RATING_CLASS', { class: 200, p: 150 }], ['info', 'NO_PRODUCT', {}], ['info', 'PRICE_SKIPPED', { key: 'ethanol' }],
];

describe('coded messages: every code has a template, filled with the player\'s numbers', () => {
  it('covers at least 60 codes, each with a template and no unfilled variable', () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(60);
    i18n.clearMissing();
    for (const [sev, code, data] of SAMPLES) {
      expect(`${sev}.${code}` in en, `${sev}.${code}`).toBe(true);
      const msg = messageOf({ code, severity: sev as 'fail' | 'info', unitId: 'E-101', species: 'Ar', data }, 'global');
      expect(msg, code).not.toMatch(/\{[A-Za-z_]+\}/); expect(msg.length, code).toBeGreaterThan(20); expect(msg).not.toContain('NaN');
    }
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
  it('numbers are pack-formatted: temperatures in degC, pressures in bar, flows in kmol/h, fractions in %', () => {
    expect(messageOf({ code: 'UTILITY_CANNOT_REACH', severity: 'fail', unitId: 'C-1', data: { utility: 'cw', T_out: 263.15, T_limit: 308.15, Q: -1 } }, 'global'))
      .toBe('The cw utility cannot take C-1 to -10 °C: its limit is 35 °C. Use a utility that reaches the temperature you want.');
    expect(messageOf({ code: 'VALVE_P_RISE', severity: 'fail', unitId: 'V-1', data: { Pin: 1e5, Pout: 2.5e5 } }, 'global')).toContain('receives 1 bar and was asked for 2.5 bar');
    expect(messageOf({ code: 'NO_EXIT', severity: 'fail', species: 'Ar', data: { species: 'Ar', scc: 'a', inflow: 1 / 3.6 } }, 'global')).toMatch(/^Ar enters the loop at 1 kmol\/h/);
    expect(messageOf({ code: 'CONVERSION_EXCEEDS_LIMITING', severity: 'fail', data: { asked: 1, max: 0.64, limiting: 'H2', limitingIndex: 1 } }, 'global')).toContain('asked for 100 % of the key reactant, but H₂ runs out at 64 %');
  });
  it('an unknown code still gets a message (fail.UNKNOWN), never a missing key', () => {
    i18n.clearMissing();
    expect(messageOf({ code: 'MADE_UP', severity: 'fail', unitId: 'E-1', data: {} }, 'global')).toMatch(/Something went wrong in E-1 \(code MADE_UP\)/);
    expect(i18n.missingKeys()).toEqual([]);
  });
  it('the same plant renders its messages in the other region without a missing key', () => {
    const e = new Engine(GAME, { region: 'in' }); e.autosave = false; must(e, 'setSpecies', ['N2', 'H2']);
    i18n.clearMissing(); const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id; expect(e.act('commission', []).ok).toBe(false); void f;
    expect(i18n.missingKeys()).toEqual([]);
  });
});

describe('invariants and metrics', () => {
  it('flag negative flows, T and P out of range, atom imbalance and a failure without a message key', () => {
    const e = newEngine(); buildLoop(e); must(e, 'commission');
    const bad = structuredClone(e.state) as any;
    const id = Object.keys(bad.solved.streams)[0]!;
    bad.solved.streams[id].n[0] = -1; bad.solved.streams[id].T = 5; bad.solved.streams[id].P = 0;
    const rules = GAME.invariants!(bad, null).map((v) => v.rule);
    expect(rules).toEqual(expect.arrayContaining(['no negative flows', 'T in 50..3000 K', 'P in (0, 1000 bar]']));
    const bad2 = structuredClone(e.state) as any; const feedPipe = bad2.flowsheet.streams[0].id; bad2.solved.streams[feedPipe].n[0] *= 2;
    expect(GAME.invariants!(bad2, null).map((v) => v.rule)).toContain('atom balance closes to 1e-9');
    const bad3 = structuredClone(e.state) as any; bad3.solved = { ...bad3.solved, ok: false, failure: { code: 'MADE_UP', data: {} }, diag: [{ code: 'MADE_UP', severity: 'fail', data: {} }] };
    expect(GAME.invariants!(bad3, null).map((v) => v.rule)).toEqual(expect.arrayContaining(['every diagnostic has a message key', 'every failure has a message key']));
  });
  it('metrics keys are stable snake_case and always finite, with and without a solve', () => {
    const e = newEngine(); const before = metricsOf(e.state); buildLoop(e); must(e, 'commission'); const after = metricsOf(e.state);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const k of Object.keys(after)) { expect(k).toMatch(/^[a-z][a-z0-9_]*$/); expect(Number.isFinite(after[k]!)).toBe(true); expect(Number.isFinite(before[k]!)).toBe(true); }
    expect(before.cost_usd_per_t).toBe(1e9); expect(after.cost_usd_per_t).toBeLessThan(1e9); expect(after.energy_gj_per_t).toBeGreaterThan(0);
    expect(e.q('metrics')).toEqual(after);
  });
  it('a plant with no product tank has worst-case per-tonne figures, not zero, and says so', () => {
    const e = newEngine(); const f = must(e, 'placeUnit', 'feed', 0, 0, 0).id as string, k = must(e, 'placeUnit', 'sink', 4, 0, 0).id as string;
    must(e, 'connect', f, 'out', k, 'in'); must(e, 'commission');
    const m = metricsOf(e.state);
    expect(m.cost_usd_per_t).toBe(1e9); expect(m.energy_gj_per_t).toBe(1e9); expect(e.state.solved!.diag.map((d) => d.code)).toContain('NO_PRODUCT');
    expect(GAME.invariants!(e.state, null)).toEqual([]);
  });
});

describe('personas and the env on the real game', () => {
  it('random play of design actions never violates an invariant or crashes (several seeds)', () => {
    for (const seed of [1, 2, 3]) {
      const r = play(GAME, { persona: 'random', seed, ticks: 120 });
      expect(r.violations, `seed ${seed}`).toEqual([]);
    }
  });
  it('legal actions are probe-clean for placement, connect and knobs on a built plant', () => {
    const e = newEngine(); buildLoop(e);
    const acts = GAME.legalActions!(e.state, false);
    expect(acts.length).toBeGreaterThan(25);
    const names = new Set(acts.map((a) => a.name));
    for (const n of ['placeUnit', 'setParam', 'deleteUnit', 'commission', 'undo', 'predict']) expect(names.has(n), n).toBe(true);
    expect(acts.filter((a) => e.probe(a)).length).toBeGreaterThan(15);
    must(e, 'disconnect', e.state.flowsheet.streams.find((p) => p.to.port === 'in2')!.id);
    const conn = GAME.legalActions!(e.state, true).filter((a) => a.name === 'connect');
    expect(conn.length).toBeGreaterThan(0); expect(conn.every((a) => e.probe(a))).toBe(true);
    expect(GAME.legalActions!(e.state, true).length).toBeGreaterThan(acts.length);
  });
});

describe('knob fuzz on valid plants (seeded)', () => {
  it('random knob moves then commission: every outcome keeps the invariants; every failure is coded with a message; success closes atoms', () => {
    const rng = new Rng(2026);
    let okN = 0, failN = 0;
    for (const build of [(e: Engine<EqState>) => buildLoop(e, true), buildDry as unknown as (e: Engine<EqState>) => unknown]) {
      const e = newEngine(); build(e);
      const knobs = e.state.flowsheet.units.flatMap((u) => (GAME.legalActions!(e.state, true)).filter((a) => a.name === 'setParam' && a.args![0] === u.id));
      for (let i = 0; i < 80; i++) {
        const a = knobs[Math.floor(rng.next() * knobs.length)]!;
        e.act(a.name, a.args);
        const r = e.act('commission', []);
        expect(r.ok, r.message).toBe(true);
        expect(GAME.invariants!(e.state, null), `${a.args}`).toEqual([]);
        if (r.commissioned) { okN++; expect((e.q('ledger') as any).atomRel).toBeLessThan(1e-9); } else {
          failN++; expect(e.state.solved!.ok).toBe(false); expect(r.message.length).toBeGreaterThan(20); expect(e.state.phase).toBe('design');
        }
      }
    }
    console.log(`knob fuzz: ${okN} solved, ${failN} coded failures`);
    expect(okN).toBeGreaterThan(20); expect(failN).toBeGreaterThan(0);
  });
});

describe('strings', () => {
  it('every key used by the engine files exists in en (no sentence literals needed)', () => {
    expect(t('err.connect.occupied')).toBe('That inlet already has a pipe. Mix two streams with a Mixer first.');
    expect(t('err.split.range')).toBe('A split fraction is a share of the stream: it must be between 0 and 1.');
    expect(t('err.commission.open_port', { unit: 'E-101', port: 'OUT' })).toBe('Stream from E-101 OUT goes nowhere \u2014 pipe it to the next unit\'s IN, a product tank or the stack. Every outlet must end somewhere.');
  });
});
