// The compact UI snapshot (GameDef.snapshot, DESIGN §8.2): phase, KPIs, goal meters, alarms, per-unit display, per-stream display, shift
// clock. No trends, replay, runs, levelActions or full solve (those are queries). Numbers are rounded for display; target <= 8 KB on L20.
import type { EqState } from '../state';
import { colourOf } from './queries/stream';
import { defOf, hasUnitType } from './registry';
import { plumbing } from './solved';

const r1 = (x: number): number => Math.round(x * 10) / 10;
const sig4 = (x: number): number => (x === 0 || !Number.isFinite(x) ? 0 : Number(x.toPrecision(4)));
/** Glow 0..1 from temperature: dark below 500 K, full at 1200 K. */
export const glowOf = (T: number): number => Math.min(1, Math.max(0, (T - 500) / 700));

export interface UnitDisplay { id: string; type: string; x: number; y: number; rot: number; T: number; P: number; flow: number; glow: number; failed: boolean }
export interface StreamDisplay { id: string; flow: number; T: number; P: number; w: [number, number][] }

/** Open alarms for the console: id, unit, variable, tier (1 low, 2 high, 3 critical), acknowledged, returned-to-normal. */
function alarmsOf(s: Readonly<EqState>): { id: string; unit: string; v: string; tier: number; ack: number; rtn: number; t0: number }[] {
  return (s.shift?.mon ?? []).filter((m) => m.tier > 0 || m.rtn === 1).map((m) => ({ id: m.id, unit: m.u, v: m.v, tier: m.tier, ack: m.ack, rtn: m.rtn, t0: m.t0 }));
}
/** Shift clock and the time-dilation scale the front-end applies (0 cruise, 1 watch, 2 real time); `paused` is the Learner auto-pause flag. */
function clockOf(s: Readonly<EqState>): unknown {
  const h = s.shift;
  return h ? { t: h.t, len: h.len, speed: h.speed, scale: h.scale, paused: h.paused, kind: h.kind, ended: h.ended } : null;
}
/** Shift accumulators and the events in force, for the HUD. */
function shiftOf(s: Readonly<EqState>): unknown {
  const h = s.shift;
  if (!h) return null;
  const a = h.acc;
  return {
    acc: { prodKg: sig4(a.prodKg), offKg: sig4(a.offKg), revenue: sig4(a.revenue), cost: sig4(a.cost), co2Kg: sig4(a.co2Kg) },
    stat: h.stat, events: h.act.map((e) => ({ id: e.id, type: e.type })),
    trips: Object.keys(h.trips), relief: Object.keys(h.rv).filter((k) => h.rv[k]!.open === 1), solveFail: h.solveFail, analyser: h.analyser,
  };
}

export function snapshotOf(s: Readonly<EqState>): unknown {
  const sol = s.solved;
  const pl = plumbing(s);
  /** During a shift the plant shows its lagged (displayed) streams, not the steady state it is relaxing toward. */
  const src = s.shift !== null ? s.shift.disp : sol?.streams;
  const units: UnitDisplay[] = s.flowsheet.units.map((u) => {
    let T = 0, P = 0, flow = 0;
    if (sol?.ok && hasUnitType(u.type)) {
      const d = defOf(u.type);
      const ports = [...d.outlets.map((p) => pl.outPipe(u.id, p)), ...d.inlets.map((p) => pl.inPipe(u.id, p))];
      const id = ports.find((x) => x !== undefined && src?.[x] !== undefined);
      const st = id ? src?.[id] : undefined;
      if (st) { T = st.T; P = st.P; flow = st.n.reduce((a, b) => a + b, 0); }
    }
    return { id: u.id, type: u.type, x: u.pos.x, y: u.pos.y, rot: u.rot, T: r1(T), P: Math.round(P), flow: sig4(flow), glow: Math.round(glowOf(T) * 100) / 100, failed: sol?.failedUnits.includes(u.id) ?? false };
  });
  const streams: StreamDisplay[] = [];
  if (sol?.ok) {
    for (const p of s.flowsheet.streams) {
      const st = src?.[p.id];
      if (!st) continue;
      const tot = st.n.reduce((a, b) => a + b, 0);
      const w = tot > 0 ? st.n.map((n, i) => [i, n / tot] as [number, number]).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([i, v]) => [i, sig4(v)] as [number, number]) : [];
      streams.push({ id: p.id, flow: sig4(tot), T: r1(st.T), P: Math.round(st.P), w });
    }
  }
  return {
    phase: s.phase, tick: s.tick, level: s.level, status: s.status, statusReason: (s as any).statusReason ?? "", thermoDetail: s.thermoDetail, mode: s.mode,
    ok: sol?.ok ?? null, failure: sol?.failure ? { code: sol.failure.code, unitId: sol.failure.unitId ?? null } : null,
    kpis: sol?.ok ? Object.fromEntries(Object.entries(sol.kpis).map(([k, v]) => [k, sig4(v)])) : {},
    goals: [], alarms: alarmsOf(s), clock: clockOf(s), shift: shiftOf(s),
    colours: s.species.map(colourOf), species: [...s.species], units, streams, undo: [s.undo.past.length, s.undo.future.length],
  };
}
