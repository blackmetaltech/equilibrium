// Display lags (DESIGN 3.9): what the player sees relaxes toward the latest steady state with a first-order lag per pipe,
// tau = holdup / volumetric flow clamped to 5-300 s. The discrete step is the exact one for a 1 s step (alpha = 1 - exp(-1/tau)), so a step input
// has reached 1 - 1/e = 63 % after tau steps; alpha is computed once per steady-state solve, never per tick.
import { dmath } from '@core/numerics';
import { TAU_DEFAULT_S, TAU_MAX_S, TAU_MIN_S, TAU_REACTOR_S, TAU_VESSEL_S } from '../../data/events';
import { totalFlow } from '../thermo';
import { R_GAS } from '../thermo/shomate';
import type { Flowsheet, StreamState, UnitInst } from '../types';

export const clampTau = (tau: number): number => (Number.isFinite(tau) ? Math.min(TAU_MAX_S, Math.max(TAU_MIN_S, tau)) : TAU_MAX_S);
/** tau of a holdup volume (m3) passing a volumetric flow (m3/s). */
export const tauOf = (holdupM3: number, qM3s: number): number => (qM3s > 0 ? clampTau(holdupM3 / qM3s) : TAU_MAX_S);
/** Per-second weight of a lag with time constant tau. */
export const alphaOf = (tau: number): number => 1 - dmath.exp(-1 / clampTau(tau));
/** One step of a scalar lag. */
export const lagValue = (cur: number, target: number, alpha: number): number => cur + (target - cur) * alpha;

/** Ideal-gas volumetric flow of a stream, m3/s (used as the volume scale of every stream, liquids included: their tau then clamps low). */
export const volFlow = (st: StreamState): number => (st.P > 0 ? (totalFlow(st.n) * R_GAS * st.T) / st.P : 0);

/** One lag step of a stream toward its target, in place. */
export function lagStream(cur: StreamState, target: StreamState, alpha: number): void {
  const n = cur.n, m = target.n;
  for (let i = 0; i < n.length; i++) n[i] = n[i]! + (m[i]! - n[i]!) * alpha;
  cur.T += (target.T - cur.T) * alpha;
  cur.P += (target.P - cur.P) * alpha;
}

const VESSELS = ['flash', 'nh3_sep', 'absorber'];
const REACTORS = ['packed_bed', 'multibed', 'eq_reactor', 'eq_bed', 'stoich_reactor', 'burner', 'gasifier', 'co_burner'];

/** Holdup volume (m3) of a unit from its inlet volumetric flow: vessels and reactors by their sizing time, a stirred reactor by its volume V. */
export function holdupOf(u: UnitInst, vIn: number, vOut: number): number {
  if (u.type === 'cstr') { const v = u.params.V; return typeof v === 'number' && v > 0 ? v : 0.1; }
  const basis = VESSELS.includes(u.type) ? TAU_VESSEL_S : REACTORS.includes(u.type) ? TAU_REACTOR_S : TAU_DEFAULT_S;
  return basis * Math.max(vIn, vOut);
}

/** tau of every pipe of a solved flowsheet: the holdup of the unit it leaves over the volumetric flow in the pipe. */
export function pipeTaus(fs: Flowsheet, streams: Readonly<Record<string, StreamState>>): Record<string, number> {
  const byId: Record<string, UnitInst> = {};
  for (const u of fs.units) byId[u.id] = u;
  const vIn: Record<string, number> = {}, vOut: Record<string, number> = {};
  for (const p of fs.streams) {
    const st = streams[p.id];
    if (!st) continue;
    const v = volFlow(st);
    vIn[p.to.unit] = (vIn[p.to.unit] ?? 0) + v;
    vOut[p.from.unit] = (vOut[p.from.unit] ?? 0) + v;
  }
  const tau: Record<string, number> = {};
  for (const p of fs.streams) {
    const st = streams[p.id], u = byId[p.from.unit];
    if (!st || !u) continue;
    tau[p.id] = tauOf(holdupOf(u, vIn[u.id] ?? 0, vOut[u.id] ?? 0), volFlow(st));
  }
  return tau;
}
