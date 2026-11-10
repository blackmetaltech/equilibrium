// Hand-built shift states for the dynamics tests (not shipped): the L24 jacketed CSTR (propylene oxide hydrolysis, pseudo-species the catalogue cannot
// host through setSpecies yet) with a splitter to a relief valve and a product tank, and a stand-in steady-state solve that re-runs the unit operations
// on the boundary conditions the events imposed, so the tests exercise the real events -> re-solve -> lag chain without the engine's thermo.
import { Engine, Rng } from '@core/kit';
import { GAME } from '../../game';
import { buildLoop, must, SPECIES, type Loop } from '../../engine/test-helpers';
import type { EqState, SolveResult } from '../../state';
import type { StreamState, UnitInst } from '../types';
import { cstrSteadyStates, cstrUnit, k7Game } from '../units/rx_cstr';
import { initShift, makeSystems, type ShiftEnv } from './shift';

export const L24_SPECIES = ['C3H6O', 'H2O(l)', 'C3H8O2'];
const K = 273.15;
/** Feed flow that gives the K7 inlet concentration (2114 mol/m3 of propylene oxide in 52 114 mol/m3 of liquid) at 5 m3/h. */
const FLOW = (5 / 3600) * 52114;

const unit = (id: string, type: string, x: number, y: number, params: Record<string, number | string> = {}): UnitInst => ({ id, type, pos: { x, y }, rot: 0, params });

/** Steady state of the plant from the (effective) units: feed -> cstr -> splitter (1 % to the relief line, rest to product). */
export function steadyOf(units: UnitInst[], species: string[]): { streams: Record<string, StreamState>; info: Record<string, number>; ok: boolean } {
  const f = units.find((u) => u.id === 'F-1')!, r = units.find((u) => u.id === 'R-1')!, x = units.find((u) => u.id === 'X-1')!;
  const flow = f.params.flow as number;
  const s1: StreamState = { n: species.map((id) => flow * ((f.params['y_' + id] as number) ?? 0)), T: f.params.T as number, P: f.params.P as number };
  const o = cstrUnit({ in: s1 }, r, { species, thermoDetail: 'rigorous' });
  if (!o.ok) return { streams: {}, info: {}, ok: false };
  const s2 = o.value.outlets.out!;
  const frac = (x.params.frac as number) ?? 0.01;
  return {
    streams: { S1: s1, S2: s2, S3: { n: s2.n.map((v) => v * (1 - frac)), T: s2.T, P: s2.P }, S4: { n: s2.n.map((v) => v * frac), T: s2.T, P: s2.P } },
    info: o.value.info ?? {}, ok: true,
  };
}

/** The stand-in solve: re-runs the unit operations on the effective units and replaces `s.solved`. */
export const testEnv: ShiftEnv = {
  solve(s, units) {
    const r = steadyOf(units, s.species);
    if (!r.ok) return { code: 'NO_SOLVE', opex: {} };
    const prev = s.solved!;
    s.solved = { ...prev, streams: r.streams, units: { ...prev.units, 'R-1': { info: r.info } } };
    return { code: '', opex: {} };
  },
};

export interface PlantOpts { Tlim?: number; hot?: boolean; orifice?: string; mode?: string; ilk?: { setpoint: number; variable?: string; action?: string }; events?: boolean; level?: string | null }

/** A commissioned L24-style plant on the lazy (low) branch, with the shift started (no solver involved). */
export function cstrShift(o: PlantOpts = {}): EqState {
  const s = structuredClone(new Engine(GAME).state) as EqState;
  s.mode = o.mode ?? 'engineer'; s.level = o.level ?? null; s.species = L24_SPECIES;
  const x = L24_SPECIES.map((id) => (id === 'C3H6O' ? 2114 / 52114 : id === 'H2O(l)' ? 50000 / 52114 : 0));
  const units = [unit('F-1', 'feed', 0, 0), unit('R-1', 'cstr', 4, 0, { Q: 5 / 3600, ...(o.Tlim ? { Tlim: o.Tlim } : {}) }), unit('X-1', 'splitter', 8, 0, { frac: 0.01 }), unit('V-1', 'relief', 12, 0, { orifice: o.orifice ?? 'T' }), unit('P-1', 'product', 12, 4)];
  if (o.ilk) units.push(unit('I-1', 'interlock', 4, 4, { setpoint: o.ilk.setpoint, variable: o.ilk.variable ?? 'T', action: o.ilk.action ?? 'cut_feed', watch: 'R-1' }));
  s.flowsheet = {
    units, nextId: 10, streams: [
      { id: 'S1', from: { unit: 'F-1', port: 'out' }, to: { unit: 'R-1', port: 'in' } }, { id: 'S2', from: { unit: 'R-1', port: 'out' }, to: { unit: 'X-1', port: 'in' } },
      { id: 'S3', from: { unit: 'X-1', port: 'out' }, to: { unit: 'P-1', port: 'in' } }, { id: 'S4', from: { unit: 'X-1', port: 'purge' }, to: { unit: 'V-1', port: 'in' } },
    ],
  };
  s.feeds = { 'F-1': { x, flow: FLOW, T: 25 + K, P: 1e6, priceKey: '' } };
  const eff = structuredClone(units);
  Object.assign(eff[0]!.params, { flow: FLOW, T: 25 + K, P: 1e6 }); L24_SPECIES.forEach((id, i) => { eff[0]!.params['y_' + id] = x[i]!; });
  const st = steadyOf(eff, L24_SPECIES);
  if (o.hot) {   // the plant sits on its upper steady state (117 C): the commissioned state of a reactor that was ignited and cooled back
    const g = k7Game(), hot = cstrSteadyStates(g.model, g.inputs).states[2]!;
    const xi = (g.inputs.Q * g.inputs.C0[g.model.key]! * hot.X) / Math.abs(g.model.nu[g.model.key]!);
    const inn = st.streams.S1!, n = inn.n.slice();
    ['C3H6O', 'H2O(l)', 'C3H8O2'].forEach((id, j) => { n[L24_SPECIES.indexOf(id)] = inn.n[j]! + g.model.nu[j]! * xi; });
    st.streams.S2 = { n, T: hot.T, P: inn.P }; st.streams.S3 = { n: n.map((v) => v * 0.99), T: hot.T, P: inn.P }; st.streams.S4 = { n: n.map((v) => v * 0.01), T: hot.T, P: inn.P };
    st.info = { ...st.info, T: hot.T, X: hot.X };
  }
  const solved: SolveResult = { ok: true, streams: st.streams, units: { 'R-1': { info: st.info } }, diag: [], failure: null, failedUnits: [], iterations: 1, method: 'direct', loops: 0, topologyHash: '', kpis: {} };
  s.solved = solved; s.phase = 'commissioned';
  s.shift = initShift(s, { kind: 'shift', events: o.events === true, priceOf: () => 0, opex: {} });
  s.phase = 'shift';
  return s;
}

const SYSTEMS = makeSystems(testEnv);
/** Run n plant seconds the way the core engine's tick does (systems in order, then the tick counter), stopping when the level is over. */
export function run(s: EqState, n: number, each?: (s: EqState) => void): void {
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    const rng = new Rng(s.rng);
    for (const sys of SYSTEMS) sys.run(s, rng);
    s.rng = rng.state; s.tick += 1;
    if (each) each(s);
  }
}
export const TdegC = (s: EqState): number => s.shift!.dc['R-1']!.T - K;

export interface LoopOpts { /** Replace the purge vent by a relief valve with this set pressure (it protects the ammonia separator upstream of the splitter). */ relief?: number; seed?: number; mode?: string; /** true / false force the events; 'default' leaves it to the mode (off in sandbox). Default false. */ events?: boolean | 'default'; ilk?: number; pdes?: number; start?: boolean }
/** The 13-unit ammonia recycle loop (engine test helper), commissioned, with an optional interlock on the cooler's outlet T and the shift started. */
export function loopShift(o: LoopOpts = {}): { e: Engine<EqState>; L: Loop; S: () => EqState; il: string } {
  const e = new Engine(GAME);
  e.autosave = false;
  must(e, 'newGame', o.seed ?? 1, o.mode ?? 'engineer');
  must(e, 'setSpecies', SPECIES);
  const L = buildLoop(e, true);
  let il = '';
  if (o.ilk !== undefined) {
    il = must(e, 'placeUnit', 'interlock', 20, 12, 0).id as string;
    must(e, 'setParam', il, 'setpoint', o.ilk);
  }
  if (o.relief !== undefined) {
    must(e, 'deleteUnit', L.ids.vent);
    const rv = must(e, 'placeUnit', 'relief', 22, 6, 0).id as string;
    must(e, 'connect', L.ids.split, 'purge', rv, 'in'); must(e, 'setParam', rv, 'Pset', o.relief);
    L.ids.relief = rv;
  }
  must(e, 'commission');
  const S = (): EqState => e.state as EqState;
  if (il) S().flowsheet.units.find((u) => u.id === il)!.params.watch = L.ids.cool!;
  if (o.pdes !== undefined) S().flowsheet.units.find((u) => u.id === L.ids.comp)!.params.Pdes = o.pdes;
  if (o.start !== false) must(e, 'startShift', ...(o.events === 'default' ? ['shift'] : ['shift', o.events === true]));
  return { e, L, S, il };
}
/** Queue an event on the running shift (tests only: the schedule normally comes from the seed). */
export function queueEvent(s: EqState, type: string, at: number, v: number, dur = 0, target = ''): void {
  s.shift!.q.push({ id: 'T' + s.shift!.q.length, type: type as never, at, dur, v, target });
  s.shift!.q.sort((a, b) => a.at - b.at);
}
