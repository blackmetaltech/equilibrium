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

export function snapshotOf(s: Readonly<EqState>): unknown {
  const sol = s.solved;
  const pl = plumbing(s);
  const units: UnitDisplay[] = s.flowsheet.units.map((u) => {
    let T = 0, P = 0, flow = 0;
    if (sol?.ok && hasUnitType(u.type)) {
      const d = defOf(u.type);
      const ports = [...d.outlets.map((p) => pl.outPipe(u.id, p)), ...d.inlets.map((p) => pl.inPipe(u.id, p))];
      const id = ports.find((x) => x !== undefined && sol.streams[x] !== undefined);
      const st = id ? sol.streams[id] : undefined;
      if (st) { T = st.T; P = st.P; flow = st.n.reduce((a, b) => a + b, 0); }
    }
    return { id: u.id, type: u.type, x: u.pos.x, y: u.pos.y, rot: u.rot, T: r1(T), P: Math.round(P), flow: sig4(flow), glow: Math.round(glowOf(T) * 100) / 100, failed: sol?.failedUnits.includes(u.id) ?? false };
  });
  const streams: StreamDisplay[] = [];
  if (sol?.ok) {
    for (const p of s.flowsheet.streams) {
      const st = sol.streams[p.id];
      if (!st) continue;
      const tot = st.n.reduce((a, b) => a + b, 0);
      const w = tot > 0 ? st.n.map((n, i) => [i, n / tot] as [number, number]).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([i, v]) => [i, sig4(v)] as [number, number]) : [];
      streams.push({ id: p.id, flow: sig4(tot), T: r1(st.T), P: Math.round(st.P), w });
    }
  }
  return {
    phase: s.phase, tick: s.tick, level: s.level, status: s.status, thermoDetail: s.thermoDetail, mode: s.mode,
    ok: sol?.ok ?? null, failure: sol?.failure ? { code: sol.failure.code, unitId: sol.failure.unitId ?? null } : null,
    kpis: sol?.ok ? Object.fromEntries(Object.entries(sol.kpis).map(([k, v]) => [k, sig4(v)])) : {},
    goals: [], alarms: [], clock: s.shift ? { t: s.shift.t, speed: s.shift.speed } : null,
    colours: s.species.map(colourOf), units, streams, undo: [s.undo.past.length, s.undo.future.length],
  };
}
