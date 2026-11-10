// The shift pipeline (DESIGN 2.1, 3.9, 8.2, 8.5): ShiftState and the nine systems in the binding order
//   events, actuators, steadyState, dynamics, safety, alarms, econ, goals, record.
// One core tick = one plant second. The network is quasi-steady: it is re-solved only after a boundary condition changed (event, ramp, trip,
// sintering), at least 5 plant s apart (30 s while an actuator ramps); what the player sees relaxes toward it with per-pipe lags, while reactors (CSTR,
// packed-bed bed temperature) and relief-protected vessels integrate their own ODEs. All timing is in plant seconds and no system draws random numbers
// (the schedule is drawn at shift start), so tick(a); tick(b) is bit-identical to tick(a + b) (property P21).
// The steady-state solve itself is injected (`ShiftEnv`) so this folder stays free of the engine layer.
import { log, type System } from '@core/kit';
import { dmath } from '@core/numerics';
import { findCatalyst } from '../../data/catalysts';
import { findLaw } from '../../data/kinetics';
import { findReaction } from '../../data/reactions';
import {
  AUTO_TRIP_FRAC, CSTR_LOSS_K, CSTR_RELIEF_K, FIRSTRUN_S, MATERIAL_T, MIN_MARGIN_K, MIN_MARGIN_REL, RESOLVE_RAMP_S, RESOLVE_S, SAFE_FLOW,
  TREND_EVERY_S, RELIEF_LIQ, type EventType,
} from '../../data/events';
import { SPECIES } from '../../data/species';
import { ORIFICE_MM2 } from '../../data/vle';
import { t } from '../../i18n';
import type { EqState } from '../../state';
import { rxnDH } from '../chem/reactions';
import { cpFlow, makeMixture, molarMass, totalFlow, type Mixture } from '../thermo';
import { hasThermo } from '../thermo/species';
import { R_GAS } from '../thermo/shomate';
import type { Flowsheet, StreamState, UnitInst } from '../types';
import { cstrStep, type CstrInputs, type CstrModel, type CstrState } from './reactorODE';
import { K7_GAME, lawRate } from '../units/rx_cstr';
import { reliefCapacity } from '../units/relief';
import { has, num, str, UTIL } from '../units/utilities';
import { ackMon, alarmBits, criticalOpen, makeMon, scaleOf, stepMon, type Mon } from './alarms';
import { stepRamps, type Ramp } from './actuators';
import { bedMeanT, bedPeak, bedRetarget, bedStep, bedTau, type BedDyn } from './bedODE';
import { emptyMods, scheduleEvents, stepEvents, type ActiveEvent, type EventInst, type Mods } from './events';
import { alphaOf, lagStream, pipeTaus, volFlow } from './lags';
import { captureIncident, makeFrame, pushFrame, pushTrend, type Incident, type IncidentKind } from './records';
import { containment, designPressure, interlockTrips, jacketWith, liquidReliefOpen, liquidReliefSink, vesselStep, type ReliefRec, type TripRec, type VesselDyn } from './safety';

// ---------------------------------------------------------------------------------------------------------------- state
export interface Acc { prodKg: number; offKg: number; revenue: number; cost: number; co2Kg: number; steamKg: number; elecKwh: number }
export interface Stat { critS: number; critRun: number; critMax: number; highS: number; tripN: number; reliefN: number; events: number; solves: number }
/** Steady rates of the latest solve (per hour unless noted) the econ system integrates. */
export interface Rates { opex: number; fuel: number; credit: number; co2: number; steam: number; elec: number }
export interface ProdInfo { pipe: string; price: number; spec: number; min: number }
export interface CstrDyn { C: number[]; T: number; Tj: number; rel: string; sinkUA: number; Tset: number }
export interface VesselRec extends VesselDyn { u: string; ins: string[]; outs: string[]; rel: string }

export interface ShiftState {
  /** Plant seconds since the shift started. */
  t: number;
  /** Requested speed (0 = paused by the player, else x1 / x4 / x16): the front-end honours it, the engine runs the ticks it is asked for. */
  speed: number;
  kind: 'shift' | 'firstrun';
  len: number;
  idx: number;
  /** Time-dilation scale for the UI: 0 cruise, 1 watch, 2 real time. */
  scale: 0 | 1 | 2;
  /** 1 while a Critical alarm is unacknowledged in Learner mode: the front-end pauses (the engine never does). */
  paused: 0 | 1;
  ended: '' | 'time' | 'loss';
  q: EventInst[];
  act: ActiveEvent[];
  mods: Mods;
  ramps: Record<string, Ramp>;
  trips: Record<string, TripRec>;
  /** Lagged (displayed) stream by pipe id, and the per-second lag weight of each pipe. */
  disp: Record<string, StreamState>;
  al: Record<string, number>;
  /** 1 when a boundary condition changed since the last solve; `last` is the plant second of that solve. */
  dirty: 0 | 1;
  last: number;
  /** Code of the last failed re-solve ('' = fine); the last good steady state stays in force. */
  solveFail: string;
  mon: Mon[];
  db: Record<string, BedDyn>;
  dc: Record<string, CstrDyn>;
  dv: Record<string, VesselRec>;
  rv: Record<string, ReliefRec>;
  /** Unit id -> [main inlet pipe, main outlet pipe, index in the flowsheet]. */
  io: Record<string, [string, string, number]>;
  /** Interlock unit id -> id of the unit it watches. */
  iw: Record<string, string>;
  /** Nominal inlet temperature (K) of each cooling-water cooler at shift start. */
  cw: Record<string, number>;
  /** Kilograms per mole of each active species. */
  mw: number[];
  prod: ProdInfo[];
  acc: Acc;
  stat: Stat;
  rates: Rates;
  incident: Incident | null;
  /** Analyser fault in force (unit / species id, '' = none). Mirrors mods.analyser for the UI. */
  analyser: string;
}

/** What the engine layer provides: the steady-state solve of the effective plant (it writes `s.solved` and `s.warm`) and the unit price helper. */
export interface ShiftEnv {
  /** '' when solved, else the failure code; `opex` is the cost breakdown per hour of the new steady state. */
  solve: (s: EqState, units: UnitInst[], blocked: readonly string[]) => { code: string; opex: Record<string, number> };
}

const BED_TYPES = ['packed_bed', 'multibed'];
const T_TYPES = ['stoich_reactor', 'burner', 'gasifier', 'co_burner', 'eq_reactor', 'eq_bed', 'packed_bed', 'multibed', 'cstr', 'boiler', 'heater'];
const P_TYPES = ['flash', 'nh3_sep', 'absorber', 'packed_bed', 'multibed', 'eq_reactor', 'eq_bed', 'compressor'];
const VESSEL_TYPES = ['flash', 'nh3_sep', 'absorber', 'packed_bed', 'multibed', 'eq_reactor', 'eq_bed', 'stoich_reactor', 'burner', 'gasifier', 'co_burner', 'cstr'];
const VOL_BASIS: Record<string, number> = { flash: 60, nh3_sep: 60, absorber: 60 };
const BC_EVENTS: readonly EventType[] = ['cw_pump_trip', 'cw_hot_day', 'feed_inerts', 'feed_surge', 'blower_wear', 'compressor_trip', 'catalyst_age', 'catalyst_poison', 'power_dip', 'valve_fails_closed'];

const live = (s: EqState): ShiftState | null => {
  const sh = s.shift;
  return sh !== null && sh.ended === '' && (s.phase === 'shift' || s.phase === 'firstrun') ? sh : null;
};
const unitOf = (s: EqState, sh: ShiftState, id: string): UnitInst | undefined => { const i = sh.io[id]?.[2]; return i === undefined ? undefined : s.flowsheet.units[i]; };
const sum = (n: readonly number[]): number => { let a = 0; for (let i = 0; i < n.length; i++) a += n[i]!; return a; };
const hasRamps = (r: Record<string, Ramp>): boolean => { for (const _k in r) return true; return false; };

/** Feed unit parameters from a feed spec (the same mapping the engine uses to solve). */
function feedParams(x: readonly number[], flow: number, T: number, P: number, species: readonly string[]): Record<string, number> {
  const p: Record<string, number> = { flow, T, P };
  species.forEach((id, i) => { p['y_' + id] = x[i] ?? 0; });
  return p;
}

// ---------------------------------------------------------------------------------------------------------------- boundary conditions
/** Any trip of this action in force. */
const tripped = (sh: ShiftState, act: string): boolean => { for (const k in sh.trips) if (sh.trips[k]!.act === act) return true; return false; };
/** Multiplier of every feed: events (surge, power dip, compressor trip) and the cut-feed safe states. */
export function feedMult(sh: ShiftState): number {
  let m = sh.mods.feed * sh.mods.motors;
  if (sh.mods.comp === 1 || tripped(sh, 'cut_feed') || tripped(sh, 'dump')) m *= SAFE_FLOW;
  if (tripped(sh, 'stop')) m *= SAFE_FLOW;
  return m;
}

/** Jacket (UA, Tc) of a reactor under the events (cooling-water trip and hot day) and the full-coolant safe state. */
export function cstrJacket(u: UnitInst, mods: Mods, fullCoolant: boolean): { UA: number; Tc: number } {
  return jacketWith(num(u, 'UA', K7_GAME.UA) * mods.cwUa, num(u, 'Tc', K7_GAME.Tc) + mods.cwdT, 0, 0, fullCoolant);
}

/** The units the steady-state solve sees: events and trips applied on top of the player's setpoints (a pure function of the boundary conditions). */
export function effectiveUnits(s: EqState, sh: ShiftState): UnitInst[] {
  const units = structuredClone(s.flowsheet.units);
  const sp = s.species, mods = sh.mods, mult = feedMult(sh);
  const o2 = sp.indexOf('O2');
  let main = '', mainFlow = -1;
  for (const id of Object.keys(s.feeds)) { const f = s.feeds[id]!; if (f.flow > mainFlow && !(o2 >= 0 && (f.x[o2] ?? 0) >= 0.15)) { main = id; mainFlow = f.flow; } }
  for (const u of units) {
    if (u.type === 'feed') {
      const f = s.feeds[u.id];
      if (!f) continue;
      const air = o2 >= 0 && (f.x[o2] ?? 0) >= 0.15;
      let x = f.x.slice();
      if (u.id === main) {
        let add = 0;
        for (const id of Object.keys(mods.inerts)) add += mods.inerts[id]!;
        if (add > 0) {
          x = x.map((v) => v / (1 + add));
          for (const id of Object.keys(mods.inerts)) { const i = sp.indexOf(id); if (i >= 0) x[i] = x[i]! + mods.inerts[id]! / (1 + add); }
        }
      }
      let flow = f.flow * mult * (air ? mods.air : 1);
      if (sh.trips[u.id]?.act === 'stop_feed') flow *= SAFE_FLOW;
      u.params = feedParams(x, flow, f.T, f.P, sp);
    } else if (BED_TYPES.includes(u.type)) {
      const base = num(u, 'activity', 1);
      u.params.activity = Math.round(Math.min(1, Math.max(0, base * mods.act * (mods.actBed[u.id] ?? 1) * (sh.db[u.id]?.a ?? 1))) * 1e4) / 1e4;
    } else if (u.type === 'cooler' && str(u, 'utility') === 'cw' && has(u, 'T') && (mods.cwUa !== 1 || mods.cwdT !== 0) && sh.cw[u.id] !== undefined) {
      const Tin = sh.cw[u.id]!, Tspec = num(u, 'T'), Tcw = UTIL.cw.T;
      if (Tin > Tspec && Tin > Tcw) {
        const eps = Math.min(1, Math.max(0, (Tin - Tspec) / (Tin - Tcw)));
        const eps2 = 1 - powNonNeg(1 - eps, mods.cwUa);
        u.params.T = Tin - eps2 * Math.max(0, Tin - (Tcw + mods.cwdT));
      }
    } else if (u.type === 'cstr') {
      const j = cstrJacket(u, mods, tripped(sh, 'full_coolant') || tripped(sh, 'dump'));
      u.params.UA = j.UA; u.params.Tc = j.Tc;
    } else if (u.type === 'valve' && mods.blocked.includes(u.id)) u.params.blocked = 1;
  }
  return units;
}
const powNonNeg = (b: number, e: number): number => (b <= 0 ? 0 : dmath.pow(b, e));

// ---------------------------------------------------------------------------------------------------------------- CSTR setup
interface CstrSetup { model: CstrModel; inputs: CstrInputs; idx: number[]; Q: number }
/** The CSTR model and inputs of a jacketed reactor from its params and its (lagged) inlet; mirrors the unit operation's parsing. */
export function cstrSetup(u: UnitInst, inn: StreamState, species: readonly string[]): CstrSetup | null {
  const lawId = str(u, 'law', 'K7');
  const rate = lawRate(lawId, u.catalystId ?? str(u, 'catalystId', 'none'));
  const law = findLaw(lawId);
  const rx = law === undefined ? undefined : findReaction(law.reactions[0]!);
  if (rate === undefined || law === undefined || rx === undefined) return null;
  const ids = Object.keys(rx.nu);
  const idx = ids.map((id) => species.indexOf(id));
  if (idx.some((i) => i < 0)) return null;
  const V = num(u, 'V', K7_GAME.V), UA = num(u, 'UA', K7_GAME.UA), Tc = num(u, 'Tc', K7_GAME.Tc), T0 = num(u, 'T0', inn.T);
  const Q = has(u, 'Q') ? num(u, 'Q') : totalFlow(inn.n) / num(u, 'cTot', 5.5e4);
  if (!(V > 0) || !(Q > 0) || !(UA >= 0) || !(Tc > 0) || !(T0 > 0)) return null;
  const dH = has(u, 'dH') ? num(u, 'dH') : lawId === 'K7' ? K7_GAME.dH : rx.dH298book !== undefined ? rx.dH298book * 1e3 : rxnDH(rx.nu, T0, 'rigorous');
  const model: CstrModel = {
    V, rhoCp: num(u, 'rhoCp', K7_GAME.rhoCp), dH, nu: ids.map((id) => rx.nu[id]!), key: ids.indexOf(law.species['A']!), k: rate.k, dk: rate.dk,
    ...(has(u, 'Cj') ? { Cj: num(u, 'Cj') } : {}),
  };
  const inputs: CstrInputs = { C0: idx.map((i) => inn.n[i]! / Q), T0, Q, UA, Tc, ...(has(u, 'mcpC') ? { mcpC: num(u, 'mcpC') } : {}) };
  return { model, inputs, idx, Q };
}

// ---------------------------------------------------------------------------------------------------------------- init
/** Thermo mixture of the species, or null when a species has no thermo data (the lab pseudo-species of L18 / L24: molar mass only). */
const mixtureOf = (sp: readonly string[]): Mixture | null => (sp.every(hasThermo) ? makeMixture(sp) : null);

export interface InitOpts {
  kind: 'shift' | 'firstrun';
  /** Draw the event schedule (false in sandbox unless the player asked). */
  events: boolean;
  /** Price per kg of a region price key (0 when unknown). */
  priceOf: (key: string) => number;
  /** Cost breakdown per hour of the commissioned steady state. */
  opex: Record<string, number>;
}

/** Build the state of a new shift from the commissioned plant. Pure; the caller stores it in `s.shift` and sets the phase. */
export function initShift(s: EqState, o: InitOpts): ShiftState {
  const sol = s.solved!;
  const fs: Flowsheet = s.flowsheet;
  const sp = s.species;
  const idx = (s.shift?.idx ?? -1) + 1;
  const io: ShiftState['io'] = {};
  fs.units.forEach((u, i) => {
    const ip = fs.streams.find((p) => p.to.unit === u.id), op = fs.streams.find((p) => p.from.unit === u.id);
    io[u.id] = [ip?.id ?? '', op?.id ?? '', i];
  });
  const disp: Record<string, StreamState> = {};
  for (const p of fs.streams) { const st = sol.streams[p.id]; if (st) disp[p.id] = { n: st.n.slice(), T: st.T, P: st.P }; }
  const tau = pipeTaus(fs, sol.streams);
  const al: Record<string, number> = {};
  for (const id of Object.keys(tau)) al[id] = alphaOf(tau[id]!);
  const mx = mixtureOf(sp);
  const mw = sp.map((id) => (SPECIES[id]?.M ?? 0) / 1000);
  const sched = scheduleEvents({
    seed: s.seed, level: s.level, idx, mode: s.mode, enabled: o.kind === 'shift' && o.events, species: sp, units: fs.units,
    feedX: Object.fromEntries(Object.entries(s.feeds).map(([k, f]) => [k, f.x])),
  });
  const sh: ShiftState = {
    t: 0, speed: 1, kind: o.kind, len: o.kind === 'firstrun' ? FIRSTRUN_S : sched.lenS, idx, scale: 0, paused: 0, ended: '', q: sched.q, act: [], mods: emptyMods(),
    ramps: {}, trips: {}, disp, al, dirty: 0, last: 0, solveFail: '', mon: [], db: {}, dc: {}, dv: {}, rv: {}, io, iw: {}, cw: {}, mw, prod: [],
    acc: { prodKg: 0, offKg: 0, revenue: 0, cost: 0, co2Kg: 0, steamKg: 0, elecKwh: 0 },
    stat: { critS: 0, critRun: 0, critMax: 0, highS: 0, tripN: 0, reliefN: 0, events: 0, solves: 0 },
    rates: { opex: 0, fuel: 0, credit: 0, co2: 0, steam: 0, elec: 0 }, incident: null, analyser: '',
  };
  const tgt = (p: string): StreamState | undefined => (p === '' ? undefined : disp[p]);
  // relief valves and the vessel each protects
  const reliefOf = new Map<string, string>();
  const vessels = fs.units.filter((u) => VESSEL_TYPES.includes(u.type));
  for (const r of fs.units.filter((u) => u.type === 'relief')) {
    let cur: string = r.id, found = '';
    for (let hop = 0; hop < 4 && found === ''; hop++) {
      const pipe = fs.streams.find((p) => p.to.unit === cur);
      if (!pipe) break;
      cur = pipe.from.unit;
      if (VESSEL_TYPES.includes(fs.units[io[cur]![2]]!.type)) found = cur;
    }
    if (found === '' && vessels.length > 0) {
      const ru = r;
      let best = Infinity;
      for (const v of vessels) { const d = Math.abs(v.pos.x - ru.pos.x) + Math.abs(v.pos.y - ru.pos.y); if (d < best) { best = d; found = v.id; } }
    }
    if (found !== '' && !reliefOf.has(found)) { reliefOf.set(found, r.id); sh.rv[r.id] = { open: 0, seen: 0, t0: 0, kg: 0 }; }
  }
  // dynamic units, monitors
  for (const u of fs.units) {
    const [ip, op] = io[u.id]!;
    const inS = tgt(ip), outS = tgt(op);
    const info = sol.units[u.id]?.info ?? {};
    const rel = reliefOf.get(u.id) ?? '';
    const relU = rel === '' ? undefined : fs.units[io[rel]![2]];
    if (BED_TYPES.includes(u.type) && inS && outS) {
      let Tss = 0, W = 0;
      if (u.type === 'multibed') { const nb = num(u, 'beds', 0); for (let j = 1; j <= nb; j++) { Tss += bedMeanT(info, 'b' + j + '_') / nb; W += num(u, 'W' + j, 0); } } else { Tss = bedMeanT(info); W = num(u, 'W', 0); }
      const cat = u.catalystId !== undefined ? findCatalyst(u.catalystId) : undefined;
      const Tm = has(u, 'Tmax') ? num(u, 'Tmax') : cat !== undefined ? cat.Tmax + 273.15 : 1e9;
      const mcp = mx ? cpFlow(mx, inS.n, inS.T) : 0;
      const d: BedDyn = { T: Tss, a: 1, over: 0, Tss, Tpk: info.Tmax ?? Tss, alpha: 0, Tm, as: 1 };
      bedRetarget(d, Tss, info.Tmax ?? Tss, bedTau(W, mcp));
      sh.db[u.id] = d;
    }
    if (u.type === 'cstr' && inS && outS) {
      const cs = cstrSetup(u, inS, sp);
      if (cs !== null) {
        const Tset = relU !== undefined ? num(relU, 'Tset', CSTR_RELIEF_K) : CSTR_RELIEF_K;
        const A = relU !== undefined ? ORIFICE_MM2[str(relU, 'orifice', 'D')] ?? 0 : 0;
        const cap = A > 0 ? reliefCapacity(A, RELIEF_LIQ.Pabs / 1000, Tset, 1, RELIEF_LIQ.M, RELIEF_LIQ.k) / 3600 : 0;
        sh.dc[u.id] = { C: cs.idx.map((i) => outS.n[i]! / cs.Q), T: info.T ?? outS.T, Tj: cs.inputs.Tc, rel, sinkUA: liquidReliefSink(cap), Tset };
      }
    } else if (rel !== '' && inS && outS) {
      const Pss = outS.P, bas = VOL_BASIS[u.type] ?? 30;
      sh.dv[u.id] = {
        u: u.id, ins: fs.streams.filter((p) => p.to.unit === u.id).map((p) => p.id), outs: fs.streams.filter((p) => p.from.unit === u.id).map((p) => p.id),
        rel, P: Pss, Pss, V: Math.max(1e-6, volFlow(inS) * bas), Pset: num(relU!, 'Pset', designPressure(Pss)), capKgS: 0, M: 0.028,
      };
    }
    // interlock: the unit watched is the one it names or the nearest other unit
    if (u.type === 'interlock') {
      const named = str(u, 'watch');
      let w = named !== '' && io[named] !== undefined ? named : '', best = Infinity;
      if (w === '') for (const v of fs.units) if (v.type !== 'interlock' && v.type !== 'relief') { const d = Math.abs(v.pos.x - u.pos.x) + Math.abs(v.pos.y - u.pos.y); if (d < best) { best = d; w = v.id; } }
      sh.iw[u.id] = w;
    }
    if (u.type === 'cooler' && str(u, 'utility') === 'cw' && inS) sh.cw[u.id] = inS.T;
    if (u.type === 'product' && inS) {
      const sk = str(u, 'spec');
      sh.prod.push({ pipe: ip, price: o.priceOf(str(u, 'priceKey')), spec: sk === '' ? -1 : sp.indexOf(sk), min: num(u, 'specMin', 0) });
    }
    // monitors
    const dyn = sh.db[u.id] !== undefined ? 'bed' : sh.dc[u.id] !== undefined ? 'cstr' : 'pipe';
    if (T_TYPES.includes(u.type) && (outS || sh.dc[u.id])) {
      const nomT = has(u, 'Tnom') ? num(u, 'Tnom') : dyn === 'bed' ? bedPeak(sh.db[u.id]!) : dyn === 'cstr' ? sh.dc[u.id]!.T : outS!.T;
      const mat = has(u, 'Tlim') ? num(u, 'Tlim') : MATERIAL_T[u.type] ?? 1273.15;
      let lim = mat;
      if (dyn === 'bed') lim = Math.min(lim, sh.db[u.id]!.Tm);
      if (dyn === 'cstr' && rel !== '') lim = Math.min(lim, sh.dc[u.id]!.Tset);
      const pin: { hi?: number; crit?: number } = {};
      if (has(u, 'T_hi')) pin.hi = num(u, 'T_hi');
      if (has(u, 'T_crit')) pin.crit = num(u, 'T_crit');
      sh.mon.push(makeMon(u.id + '.T', u.id, 'T', dyn, op, nomT, lim, u.type === 'cstr' ? Math.min(mat, CSTR_LOSS_K) : mat, MIN_MARGIN_K, pin));
    }
    if (P_TYPES.includes(u.type) && (outS || inS)) {
      const src = u.type === 'compressor' ? outS : (outS ?? inS);
      if (src) {
        const nomP = src.P, Pd = has(u, 'Pdes') ? num(u, 'Pdes') : designPressure(nomP);
        const pin: { hi?: number; crit?: number } = {};
        if (has(u, 'P_hi')) pin.hi = num(u, 'P_hi');
        if (has(u, 'P_crit')) pin.crit = num(u, 'P_crit');
        sh.mon.push(makeMon(u.id + '.P', u.id, 'P', 'vessel', u.type === 'compressor' ? op : (op !== '' ? op : ip), nomP, Pd, Pd, MIN_MARGIN_REL * nomP, pin));
      }
    }
  }
  retarget(s, sh, o.opex, true);
  return sh;
}

/** Point the lags, beds and vessels at the steady state in `s.solved` (after a solve, and at shift start). */
function retarget(s: EqState, sh: ShiftState, opex: Record<string, number>, first = false): void {
  const sol = s.solved!;
  const tau = pipeTaus(s.flowsheet, sol.streams);
  for (const id of Object.keys(tau)) sh.al[id] = alphaOf(tau[id]!);
  const mx = mixtureOf(s.species);
  for (const id of Object.keys(sh.db)) {
    const u = unitOf(s, sh, id)!, info = sol.units[id]?.info ?? {}, d = sh.db[id]!;
    let Tss = 0, W = 0;
    if (u.type === 'multibed') { const nb = num(u, 'beds', 0); for (let j = 1; j <= nb; j++) { Tss += bedMeanT(info, 'b' + j + '_') / nb; W += num(u, 'W' + j, 0); } } else { Tss = bedMeanT(info); W = num(u, 'W', 0); }
    const inS = sol.streams[sh.io[id]![0]];
    bedRetarget(d, Tss, info.Tmax ?? Tss, bedTau(W, inS && mx ? cpFlow(mx, inS.n, inS.T) : 0));
    d.as = d.a;
  }
  for (const id of Object.keys(sh.dv)) {
    const v = sh.dv[id]!, outS = sol.streams[v.outs[0] ?? ''] ?? sol.streams[v.ins[0] ?? ''];
    if (!outS) continue;
    v.Pss = outS.P;
    const relU = unitOf(s, sh, v.rel);
    const A = relU !== undefined ? ORIFICE_MM2[str(relU, 'orifice', 'D')] ?? 0 : 0;
    const tot = totalFlow(outS.n);
    if (A > 0 && tot > 0 && mx) {
      const M = molarMass(mx, outS.n) * 1000, cp = cpFlow(mx, outS.n, outS.T) / tot, k = cp / (cp - R_GAS);
      const Pset = has(relU!, 'Pset') ? num(relU!, 'Pset') : designPressure(v.Pss);
      v.Pset = Pset; v.M = M / 1000;
      v.capKgS = reliefCapacity(A, (Pset * (1 + num(relU!, 'overpressure', 0.1))) / 1000, outS.T, num(relU!, 'Z', 1), M, k) / 3600;
    }
  }
  const k = sol.kpis;
  sh.rates = { opex: opex.total ?? k.opex_usd_per_h ?? 0, fuel: opex.fuel ?? 0, credit: opex.steamCredit ?? 0, co2: k.co2e_kg_per_h ?? 0, steam: k.steam_raised_t_per_h ?? 0, elec: k.electric_kw ?? 0 };
  if (!first) sh.stat.solves++;
}

// ---------------------------------------------------------------------------------------------------------------- helpers for systems
const dispT = (sh: ShiftState, pipe: string): number => sh.disp[pipe]?.T ?? 0;
const dispP = (sh: ShiftState, pipe: string): number => sh.disp[pipe]?.P ?? 0;

function monValue(sh: ShiftState, m: Mon): number {
  if (m.v === 'T') return m.kind === 'bed' ? bedPeak(sh.db[m.u]!) : m.kind === 'cstr' ? sh.dc[m.u]!.T : dispT(sh, m.pipe);
  return sh.dv[m.u]?.P ?? dispP(sh, m.pipe);
}
const monOf = (sh: ShiftState, id: string): Mon | undefined => sh.mon.find((m) => m.id === id);

function incident(sh: ShiftState, s: EqState, kind: IncidentKind, unit: string, code: string, T: number, P: number): void {
  sh.incident = captureIncident(s.replay, kind, sh.t, unit, code, T, P);
}

/** Variable an interlock watches, from the lagged plant. */
function watched(sh: ShiftState, unit: string, v: string): number {
  if (v === 'flow') { const p = sh.io[unit]?.[0] ?? ''; return p === '' ? 0 : totalFlow(sh.disp[p]?.n ?? []); }
  const m = monOf(sh, unit + '.' + (v === 'P' ? 'P' : 'T'));
  if (m) return monValue(sh, m);
  const op = sh.io[unit]?.[1] ?? '';
  return v === 'P' ? dispP(sh, op) : dispT(sh, op);
}

/** Has the condition that tripped this interlock / unit cleared (so that resetTrip may release it)? */
export function tripCleared(s: EqState, id: string): boolean {
  const sh = s.shift;
  if (!sh || sh.trips[id] === undefined) return true;
  if (id.startsWith('auto.')) {
    const u = id.slice(5);
    for (const m of sh.mon) if (m.u === u && monValue(sh, m) > m.nom + AUTO_TRIP_FRAC * Math.max(m.lim - m.nom, 1e-9)) return false;
    return true;
  }
  const u = unitOf(s, sh, id);
  if (u === undefined || u.type !== 'interlock') return true;
  return !interlockTrips(str(u, 'variable', 'T'), watched(sh, sh.iw[id] ?? '', str(u, 'variable', 'T')), num(u, 'setpoint', 0));
}

// ---------------------------------------------------------------------------------------------------------------- systems
function sysEvents(s: EqState, sh: ShiftState): void {
  const r = stepEvents(sh);
  for (const e of r.fired) {
    sh.stat.events++;
    if (BC_EVENTS.includes(e.type)) sh.dirty = 1;
    if (e.type === 'analyser_fault') sh.analyser = e.target;
    log(s, t('log.event', { title: t('event.' + e.type + '.title'), id: e.id }), 'warn');
  }
  for (const e of r.ended) {
    if (BC_EVENTS.includes(e.type)) sh.dirty = 1;
    if (e.type === 'analyser_fault') sh.analyser = '';
    log(s, t('log.event_end', { title: t('event.' + e.type + '.title'), id: e.id }), 'info');
  }
}

function sysActuators(s: EqState, sh: ShiftState): void {
  if (!hasRamps(sh.ramps)) return;
  const read = (u: string, k: string): number => {
    const x = unitOf(s, sh, u)!;
    if (x.type === 'feed' && s.feeds[u] !== undefined && (k === 'flow' || k === 'T' || k === 'P')) return s.feeds[u]![k];
    return num(x, k, 0);
  };
  const write = (u: string, k: string, v: number): void => {
    const x = unitOf(s, sh, u)!;
    if (x.type === 'feed' && s.feeds[u] !== undefined && (k === 'flow' || k === 'T' || k === 'P')) s.feeds[u]![k] = v; else x.params[k] = v;
  };
  if (stepRamps(sh.ramps, read, write)) sh.dirty = 1;
}

function sysSteady(s: EqState, sh: ShiftState, env: ShiftEnv): void {
  if (sh.dirty === 0) return;
  if (sh.t - sh.last < (hasRamps(sh.ramps) ? RESOLVE_RAMP_S : RESOLVE_S)) return;
  const units = effectiveUnits(s, sh);
  const r = env.solve(s, units, sh.mods.blocked);
  sh.dirty = 0; sh.last = sh.t;
  if (r.code === '') {
    sh.solveFail = '';
    retarget(s, sh, r.opex);
    for (const id of Object.keys(sh.db)) sh.db[id]!.as = sh.db[id]!.a;
  } else if (sh.solveFail !== r.code) { sh.solveFail = r.code; log(s, t('log.shift_solve', { code: r.code }), 'warn'); } else sh.solveFail = r.code;
}

function sysDynamics(s: EqState, sh: ShiftState): void {
  const sol = s.solved;
  if (!sol || !sol.ok) return;
  const tg = sol.streams;
  for (const id in sh.disp) { const tgt = tg[id]; if (tgt) lagStream(sh.disp[id]!, tgt, sh.al[id] ?? 0.2); }
  for (const id in sh.db) {
    const d = sh.db[id]!;
    bedStep(d);
    if (Math.abs(d.a - d.as) > 0.002) sh.dirty = 1;
    const o = sh.io[id]![1], tgtO = tg[o], dO = sh.disp[o];
    if (tgtO && dO) dO.T = tgtO.T + (d.T - d.Tss);
  }
  const cool = tripped(sh, 'full_coolant') || tripped(sh, 'dump');
  for (const id in sh.dc) {
    const c = sh.dc[id]!, u = unitOf(s, sh, id)!, [ip, op] = sh.io[id]!;
    const inn = sh.disp[ip], out = sh.disp[op];
    if (!inn || !out) continue;
    const cs = cstrSetup(u, inn, s.species);
    if (cs === null) continue;
    const rv = c.rel !== '' ? sh.rv[c.rel] : undefined;
    if (rv) rv.open = liquidReliefOpen(c.T, c.Tset, rv.open);
    const jk = cstrJacket(u, sh.mods, cool);
    const j = jacketWith(jk.UA, jk.Tc, rv && rv.open === 1 && c.T > c.Tset ? c.sinkUA : 0, c.Tset, false);
    const inp: CstrInputs = { ...cs.inputs, UA: j.UA, Tc: j.Tc };
    const st: CstrState = cstrStep(cs.model, { C: c.C, T: c.T, Tj: c.Tj }, inp, 1);
    if (Number.isFinite(st.T)) { c.C = st.C.map((x) => Math.max(0, x)); c.T = st.T; c.Tj = st.Tj; } else sh.solveFail = 'NUMERIC_GUARD';
    out.T = c.T;
    cs.idx.forEach((si, k) => { out.n[si] = c.C[k]! * cs.Q; });
  }
  const vent = tripped(sh, 'dump') ? 10 : 1;
  for (const id in sh.dv) {
    const v = sh.dv[id]!, rv = sh.rv[v.rel];
    if (!rv) continue;
    let nIn = 0, nOut = 0;
    for (const p of v.ins) nIn += sum(sh.disp[p]?.n ?? []);
    for (const p of v.outs) nOut += sum(sh.disp[p]?.n ?? []);
    const T = sh.disp[v.outs[0] ?? v.ins[0] ?? '']?.T ?? 300;
    const r = vesselStep(v, T, nIn, nOut, rv.open, vent);
    v.P = r.P; rv.open = r.open; rv.kg += r.nRel * v.M;
  }
}

function sysSafety(s: EqState, sh: ShiftState): void {
  // interlocks (player-placed) and, in Learner mode, the automatic ones at 90 % of the margin
  for (const id in sh.iw) {
    if (sh.trips[id] !== undefined) continue;
    const u = unitOf(s, sh, id)!, v = str(u, 'variable', 'T');
    const sp = num(u, 'setpoint', 0);
    if (interlockTrips(v, watched(sh, sh.iw[id]!, v), sp)) {
      sh.trips[id] = { act: str(u, 'action', 'cut_feed'), t: sh.t, by: id };
      sh.dirty = 1; sh.stat.tripN++;
      log(s, t('log.trip', { unit: id, watch: sh.iw[id]! }), 'bad');
      incident(sh, s, 'trip', id, v, watched(sh, sh.iw[id]!, 'T'), watched(sh, sh.iw[id]!, 'P'));
    }
  }
  if (s.mode === 'learner') {
    for (const m of sh.mon) {
      const key = 'auto.' + m.u;
      if (sh.trips[key] !== undefined) continue;
      const val = monValue(sh, m);
      if (val > m.nom + AUTO_TRIP_FRAC * Math.max(m.lim - m.nom, 1e-9)) {
        sh.trips[key] = { act: 'cut_feed', t: sh.t, by: 'auto' };
        sh.dirty = 1; sh.stat.tripN++;
        log(s, t('log.trip', { unit: m.u, watch: m.u }), 'bad');
        incident(sh, s, 'trip', m.u, m.v, m.v === 'T' ? val : 0, m.v === 'P' ? val : 0);
      }
    }
  }
  // relief valves: lift and seat events
  for (const id in sh.rv) {
    const r = sh.rv[id]!;
    if (r.open === 1 && r.seen === 0) {
      r.seen = 1; r.t0 = sh.t; sh.stat.reliefN++;
      log(s, t('log.relief_open', { unit: id }), 'bad');
      const v = sh.dv[Object.keys(sh.dv).find((k) => sh.dv[k]!.rel === id) ?? ''], c = sh.dc[Object.keys(sh.dc).find((k) => sh.dc[k]!.rel === id) ?? ''];
      incident(sh, s, 'relief', id, 'R', c ? c.T : 0, v ? v.P : 0);
    } else if (r.open === 0 && r.seen === 1) { r.seen = 0; log(s, t('log.relief_seat', { unit: id }), 'info'); }
  }
  // containment loss ends the shift
  for (const m of sh.mon) {
    const val = monValue(sh, m);
    const c = m.v === 'P' ? containment(val, m.hard, 0, 1e9) : containment(0, 1e9, val, m.hard);
    if (c !== 0) {
      s.status = 'lost'; s.statusReason = c === 1 ? 'shift.loss.pressure' : 'shift.loss.temperature';
      s.phase = 'report'; sh.ended = 'loss';
      incident(sh, s, 'loss', m.u, m.v, m.v === 'T' ? val : 0, m.v === 'P' ? val : 0);
      log(s, t(s.statusReason, { unit: m.u }), 'bad');
      return;
    }
  }
}

function sysAlarms(s: EqState, sh: ShiftState): void {
  let crit = false, high = false;
  for (const m of sh.mon) {
    const val = monValue(sh, m);
    const ev = stepMon(m, val, sh.t);
    if (ev === 'raise' || ev === 'escalate') {
      if (m.tier >= 2) log(s, t('log.alarm', { unit: m.u, tier: t('alarm.tier.' + m.tier) }), m.tier === 3 ? 'bad' : 'warn');
      if (m.tier === 3) incident(sh, s, 'critical', m.u, m.v, m.v === 'T' ? val : 0, m.v === 'P' ? val : 0);
    }
    if (m.tier === 3) crit = true;
    if (m.tier >= 2) high = true;
  }
  sh.scale = scaleOf(sh.mon);
  sh.paused = s.mode === 'learner' && criticalOpen(sh.mon) ? 1 : 0;
  if (crit) { sh.stat.critS++; sh.stat.critRun++; if (sh.stat.critRun > sh.stat.critMax) sh.stat.critMax = sh.stat.critRun; } else sh.stat.critRun = 0;
  if (high) sh.stat.highS++;
}

function sysEcon(sh: ShiftState): void {
  const a = sh.acc, r = sh.rates, mods = sh.mods;
  for (const p of sh.prod) {
    const st = sh.disp[p.pipe];
    if (!st) continue;
    let kg = 0, tot = 0;
    for (let i = 0; i < st.n.length; i++) { kg += st.n[i]! * sh.mw[i]!; tot += st.n[i]!; }
    const ok = p.spec < 0 || (tot > 0 && st.n[p.spec]! / tot >= p.min);
    if (ok) { a.prodKg += kg; a.revenue += kg * p.price * mods.product; } else a.offKg += kg;
  }
  a.cost += (r.opex + r.fuel * (mods.fuel - 1) + r.credit * (mods.steam - 1)) / 3600;
  a.co2Kg += r.co2 / 3600; a.steamKg += (r.steam * 1000) / 3600; a.elecKwh += r.elec / 3600;
}

function sysGoals(sh: ShiftState): void {
  // the level's goal predicates read acc / stat; nothing here needs to move them (kept as a system so the order of DESIGN 8.5 is the order run)
  void sh;
}

function sysRecord(s: EqState, sh: ShiftState): void {
  const fs = s.flowsheet;
  const T: number[] = [], P: number[] = [];
  for (const u of fs.units) {
    const mt = sh.mon.find((m) => m.u === u.id && m.v === 'T'), mp = sh.mon.find((m) => m.u === u.id && m.v === 'P');
    const op = sh.io[u.id]![1] || sh.io[u.id]![0];
    T.push(mt ? monValue(sh, mt) : dispT(sh, op));
    P.push(mp ? monValue(sh, mp) : dispP(sh, op));
  }
  sh.t += 1;
  pushFrame(s.replay, makeFrame(sh.t, T, P, alarmBits(sh.mon)));
  if (sh.t % TREND_EVERY_S === 0) {
    let kg = 0, tmax = 0, pmax = 0, nal = 0, tmaxS = 0, pmaxS = 0;
    for (const p of sh.prod) { const st = sh.disp[p.pipe]; if (st) for (let i = 0; i < st.n.length; i++) kg += st.n[i]! * sh.mw[i]!; }
    for (const m of sh.mon) { const v = monValue(sh, m); if (m.v === 'T' && v > tmax) tmax = v; if (m.v === 'P' && v > pmax) pmax = v; if (m.tier >= 2) nal++; }
    // no monitor on the plant: the hottest / highest stream stands in (never a 0 K / 0 Pa placeholder)
    if (tmax <= 0 || pmax <= 0) for (const k in sh.disp) { const st = sh.disp[k]!; if (tmax <= 0 && st.T > tmaxS) tmaxS = st.T; if (pmax <= 0 && st.P > pmaxS) pmaxS = st.P; }
    if (tmax <= 0) tmax = tmaxS;
    if (pmax <= 0) pmax = pmaxS;
    pushTrend(s.trends, 'product_kg_s', kg); if (tmax > 0) pushTrend(s.trends, 'tmax_K', tmax);
    if (pmax > 0) pushTrend(s.trends, 'pmax_Pa', pmax); pushTrend(s.trends, 'alarms', nal);
    let n = 0;
    for (const w of s.ui.pinned) {
      if (n >= 3) break;
      const m = /^([TP]):(.+)$/.exec(w);
      if (!m) continue;
      const mon = monOf(sh, m[2]! + '.' + m[1]!);
      if (mon) { pushTrend(s.trends, w, monValue(sh, mon)); n++; }
    }
  }
  if (sh.t >= sh.len) { sh.ended = 'time'; s.phase = sh.kind === 'firstrun' ? 'commissioned' : 'report'; }
}

/** The nine systems of DESIGN 8.5, in order. `env` supplies the steady-state solve. */
export function makeSystems(env: ShiftEnv): System<EqState>[] {
  const on = (id: string, f: (s: EqState, sh: ShiftState) => void): System<EqState> => ({ id, run: (s) => { const sh = live(s); if (sh !== null) f(s, sh); } });
  return [
    on('events', sysEvents), on('actuators', sysActuators), on('steadyState', (s, sh) => sysSteady(s, sh, env)), on('dynamics', sysDynamics),
    on('safety', sysSafety), on('alarms', sysAlarms), on('econ', (_s, sh) => sysEcon(sh)), on('goals', (_s, sh) => sysGoals(sh)), on('record', sysRecord),
  ];
}

/** Acknowledge an alarm by id (`unit.T` / `unit.P`); 'all' acknowledges every open one. Returns how many were acknowledged. */
export function ackAlarm(s: EqState, id: string): number {
  const sh = s.shift;
  if (!sh) return 0;
  let n = 0;
  for (const m of sh.mon) if ((id === 'all' || m.id === id) && ackMon(m)) n++;
  return n;
}

