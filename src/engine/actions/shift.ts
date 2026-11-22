// Shift actions (DESIGN 8.3): startShift, setSpeed, setpoint (ramped by the unit's actuator rate), ack, trip, resetTrip; plus the engine side of the shift pipeline:
// the steady-state re-solve the systems call (same solver and packaging as commission, with the boundary conditions the events and trips imposed) and
// the systems list GAME.systems runs. The shift itself lives in src/sim/dynamics/shift.ts.
import { fail, log, need, ok } from '@core/kit';
import type { ActionFn } from '@core/kit';
import { solveFlowsheet } from '../../sim/flowsheet';
import type { Registry } from '../../sim/flowsheet';
import { ackAlarm, initShift, makeSystems, tripCleared, type ShiftEnv } from '../../sim/dynamics/shift';
import { EXTRA_KNOBS, rampRate } from '../../sim/dynamics/actuators';
import { t } from '../../i18n';
import type { Diag, UnitInst } from '../../sim/types';
import type { DiagRec, EqState, SolveResult, UnitResult } from '../../state';
import { bindRegistry, knobOf, phaseHook } from '../registry';
import { ctxOf, economics, fmtDisplay, pricesOf } from '../solved';
import { unitOf } from './design';

type Fn = ActionFn<EqState>;

const toRec = (d: Diag): DiagRec => {
  const r: DiagRec = { code: d.code, severity: d.severity, data: d.data };
  if (d.unitId !== undefined) r.unitId = d.unitId;
  if (d.species !== undefined) r.species = d.species;
  return r;
};
const finiteInfo = (info: Record<string, number> | undefined): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(info ?? {})) if (typeof v === 'number' && Number.isFinite(v)) o[k] = v;
  return o;
};

/** A valve stuck closed passes nothing: its outlet is the inlet state at zero flow. */
function withBlockedValves(reg: Registry): Registry {
  const v = reg.valve;
  if (!v) return reg;
  return {
    ...reg,
    valve: {
      ...v,
      fn: (inlets, u, ctx) => {
        const inn = inlets.in;
        if (u.params.blocked === 1 && inn) return { ok: true, value: { outlets: { out: { n: inn.n.map(() => 0), T: inn.T, P: inn.P } }, info: { blocked: 1 } }, diag: [] };
        return v.fn(inlets, u, ctx);
      },
    },
  };
}

/** The shift's steady-state re-solve: the registry, solver and result packaging of `commission`, on the units the boundary conditions produced. On
 *  failure nothing in `s` changes (the last good steady state stays in force) and the coded failure is returned. */
export const engineEnv: ShiftEnv = {
  solve(s, units: UnitInst[], blocked) {
    const base = bindRegistry(s.species);
    const registry = blocked.length > 0 ? withBlockedValves(base) : base;
    const r = solveFlowsheet({ species: s.species, units, pipes: s.flowsheet.streams, registry, ctx: ctxOf(s), warm: s.warm ?? undefined, options: { phaseOk: phaseHook } });
    if (!r.ok) return { code: r.code, opex: {} };
    const sol = r.value;
    const unitRes: Record<string, UnitResult> = {};
    for (const u of s.flowsheet.units) {
      const o = sol.units[u.id];
      if (!o) continue;
      const e: UnitResult = { info: finiteInfo(o.info) };
      if (o.duty !== undefined) e.duty = o.duty;
      if (o.work !== undefined) e.work = o.work;
      unitRes[u.id] = e;
    }
    const streams: SolveResult['streams'] = {};
    for (const p of s.flowsheet.streams) { const st = sol.streams[p.id]; if (st) streams[p.id] = { n: st.n.slice(), T: st.T, P: st.P }; }
    const econ = economics(s, streams, unitRes);
    const solved: SolveResult = {
      ok: true, streams, units: unitRes, diag: [...r.diag.map(toRec), ...econ.diag], failure: null, failedUnits: [], iterations: sol.passes, method: sol.method,
      loops: sol.loops.length, topologyHash: sol.topologyHash, kpis: econ.kpis,
    };
    s.solved = solved;
    s.warm = sol.warm;
    return { code: '', opex: econ.opex };
  },
};

/** GAME.systems: events, actuators, steadyState, dynamics, safety, alarms, econ, goals, record (DESIGN 8.5). */
export const shiftSystems = makeSystems(engineEnv);

// ---- actions ----
const running = (s: EqState): boolean => (s.phase === 'shift' || s.phase === 'firstrun') && s.shift !== null && s.shift.ended === '';
const needRunning = (s: EqState): void => need(running(s), t('err.shift.not_running'));

const startShift: Fn = (s, kind: unknown = 'shift', events?: unknown) => {
  need(s.phase === 'commissioned' && s.solved?.ok === true, t('err.shift.not_commissioned'));
  need(kind === 'shift' || kind === 'firstrun', t('err.shift.kind'));
  const sol = s.solved!;
  const prices = pricesOf(s);
  const priceOf = (key: string): number => {
    const p = prices[key as keyof typeof prices] as { value: number; unit?: string } | undefined;
    if (!p) return 0;
    return p.unit === 'per kg' ? p.value : p.unit === 'per t' ? p.value / 1000 : 0;
  };
  const opex = economics(s, sol.streams, sol.units).opex;
  s.shift = initShift(s, { kind, events: events === true || (events === undefined && s.mode !== 'sandbox'), priceOf, opex });
  s.phase = kind;
  s.trends = {}; s.replay = [];
  const msg = t('log.shift_start', { len: s.shift.len, events: s.shift.q.length });
  log(s, msg, 'info');
  return ok(msg);
};

const SPEEDS = [0, 1, 4, 16];
const setSpeed: Fn = (s, n: unknown) => {
  needRunning(s);
  need(typeof n === 'number' && SPEEDS.includes(n), t('err.shift.speed'));
  s.shift!.speed = n as number;
};

const setpoint: Fn = (s, unitId: unknown, key: unknown, value: unknown) => {
  needRunning(s);
  const sh = s.shift!;
  const u = unitOf(s, unitId);
  need(typeof key === 'string', t('err.shift.key', { unit: u.id }));
  const k = knobOf(u.type, key as string), extra = EXTRA_KNOBS[u.type]?.[key as string];
  need(k !== undefined || extra !== undefined, t('err.param.unknown', { unit: u.id, key: String(key), keys: '-' }));
  if (k !== undefined && k.kind === 'choice') {
    need(typeof value === 'string' && k.options!.includes(value), t('err.param.choice', { key: k.key, unit: u.id, options: k.options!.map((o) => o || '-').join(', ') }));
    if (value === '') delete u.params[k.key]; else u.params[k.key] = value as string;
    sh.dirty = 1;
    return;
  }
  const min = k?.min ?? extra![0], max = k?.max ?? extra![1];
  need(typeof value === 'number' && Number.isFinite(value), t('err.param.number', { key: String(key) }));
  const disp = (x: number): string => (k ? fmtDisplay(x, k.unit, s.region) : String(x));
  need((value >= min && value <= max) || (k !== undefined && value === k.off), t('err.param.range', { key: String(key), unit: u.id, min: disp(min), max: disp(max), value: disp(value) }));
  const isFeed = u.type === 'feed' && s.feeds[u.id] !== undefined && (key === 'flow' || key === 'T' || key === 'P');
  const cur = isFeed ? (s.feeds[u.id] as unknown as Record<string, number>)[key as string]! : typeof u.params[key as string] === 'number' ? (u.params[key as string] as number) : (typeof k?.def === 'number' ? k.def : extra![2]);
  const id = u.id + '.' + String(key);
  (sh.edits ??= {})[id] = sh.t;
  (sh.firstEdits ??= {})[id] ??= sh.t;
  if (cur === value) { delete sh.ramps[id]; return; }
  // D-B2 (LOOK2 phase B): a level may give one actuator its own speed (unit param `act_<key>`, a fraction of the knob's range per plant second), e.g. L00's slow cooler
  const own = u.params['act_' + String(key)];
  const rate = typeof own === 'number' && own > 0 ? own * (max - min) : rampRate(u.type, key as string, min, max, cur, value);
  sh.ramps[id] = { u: u.id, k: key as string, to: value, rate };
};

const ack: Fn = (s, alarmId: unknown) => {
  needRunning(s);
  need(typeof alarmId === 'string', t('err.shift.no_alarm', { id: String(alarmId) }));
  need(ackAlarm(s, alarmId as string) > 0, t('err.shift.no_alarm', { id: String(alarmId) }));
};

const trip: Fn = (s, unitId: unknown) => {
  needRunning(s);
  const sh = s.shift!;
  const u = unitOf(s, unitId);
  need(sh.trips[u.id] === undefined, t('err.shift.already_tripped', { unit: u.id }));
  if (u.type === 'interlock') sh.trips[u.id] = { act: typeof u.params.action === 'string' ? u.params.action : 'cut_feed', t: sh.t, by: 'player' };
  else if (u.type === 'feed') sh.trips[u.id] = { act: 'stop_feed', t: sh.t, by: 'player' };
  else if (u.type === 'compressor') sh.trips[u.id] = { act: 'stop', t: sh.t, by: 'player' };
  else fail(t('err.shift.cannot_trip', { unit: u.id }));
  sh.dirty = 1; sh.stat.tripN++;
};

const resetTrip: Fn = (s, unitId: unknown) => {
  needRunning(s);
  const sh = s.shift!;
  let id = typeof unitId === 'string' ? unitId : '';
  if (sh.trips[id] === undefined && sh.trips['auto.' + id] !== undefined) id = 'auto.' + id;
  need(sh.trips[id] !== undefined, t('err.shift.not_tripped', { unit: id }));
  need(tripCleared(s, id), t('err.shift.still_tripped', { unit: id }));
  delete sh.trips[id];
  sh.dirty = 1;
};

export const shiftActions: Record<string, Fn> = { startShift, setSpeed, setpoint, ack, trip, resetTrip };
