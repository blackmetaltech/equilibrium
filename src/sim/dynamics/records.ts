// Records (DESIGN 8.2, 8.5 system 9): the trend rings (1 sample per 30 plant s, at most 960 = 8 h), the near-miss replay ring (the last 60 s, one compact
// frame per second) and incident capture (the ring is copied when a relief lifts, an interlock trips or containment is lost). Plain JSON, bounded.
import { REPLAY_FRAMES, TREND_MAX } from '../../data/events';
import type { ReplayFrame } from '../../state';

export type IncidentKind = 'relief' | 'trip' | 'loss' | 'critical';
/** The last incident: what happened where, the key numbers and the 60-second frames leading to it. */
export interface Incident { t: number; kind: IncidentKind; unit: string; code: string; T: number; P: number; frames: ReplayFrame[] }

/** Four significant digits: enough for a trend line, and 8 series x 960 samples stay far below the state budget. */
export const sig4 = (x: number): number => (Number.isFinite(x) && x !== 0 ? Number(x.toPrecision(4)) : 0);

/** Append a trend sample, dropping the oldest beyond the ring size. */
export function pushTrend(trends: Record<string, number[]>, key: string, v: number, max: number = TREND_MAX): void {
  const a = trends[key] ?? (trends[key] = []);
  a.push(sig4(v));
  if (a.length > max) a.splice(0, a.length - max);
}

/** Append a replay frame, dropping the oldest beyond the ring size. */
export function pushFrame(ring: ReplayFrame[], f: ReplayFrame, max: number = REPLAY_FRAMES): void {
  ring.push(f);
  if (ring.length > max) ring.splice(0, ring.length - max);
}

/** Compact frame: per-unit T (0.1 K) and P (1 kPa) and the alarm bits. */
export function makeFrame(t: number, T: readonly number[], P: readonly number[], alarms: number): ReplayFrame {
  return { t, T: T.map((x) => Math.round(x * 10) / 10), P: P.map((x) => Math.round(x / 1000)), alarms };
}

/** Freeze the near-miss ring into an incident record. */
export function captureIncident(ring: readonly ReplayFrame[], kind: IncidentKind, t: number, unit: string, code: string, T: number, P: number): Incident {
  return { t, kind, unit, code, T: Math.round(T * 10) / 10, P: Math.round(P), frames: ring.map((f) => ({ t: f.t, T: f.T.slice(), P: f.P.slice(), alarms: f.alarms })) };
}
