// Alarms (DESIGN 5.5, 8.5 system 6; IEC 62682 / ISA-18.2 practice): three tiers per monitored variable (1 Low advisory, 2 High, 3 Critical), each with an
// on-delay in plant seconds (the value must stay beyond the threshold that long) and a deadband (it must fall that far below to clear), so a value hovering
// at a limit cannot chatter. A High or Critical alarm latches until acknowledged after it returns to normal (`rtn`); an escalation re-annunciates.
// Everything counts plant seconds (one call = one second), never calls, so the result is the same for any batching of ticks (P21).
import { ALARM_DEADBAND, ALARM_DELAY_S, ALARM_FRAC, WATCH_DTDT } from '../../data/events';

export type MonKind = 'pipe' | 'bed' | 'cstr' | 'vessel';

/** One monitored variable (T in K or P in Pa) of one unit, with its thresholds and alarm state. Plain JSON. */
export interface Mon {
  id: string;
  u: string;
  v: 'T' | 'P';
  kind: MonKind;
  /** Pipe whose lagged stream carries the value (kind 'pipe' and the fallback of 'vessel'). */
  pipe: string;
  nom: number;
  lim: number;
  /** Containment limit: material T (K) or design P (Pa); loss beyond it (T) or beyond 1.5 x it (P). */
  hard: number;
  thr: [number, number, number];
  db: number;
  /** On-delay counters per tier and the bitmask of tiers in alarm. */
  c: [number, number, number];
  m: number;
  tier: 0 | 1 | 2 | 3;
  ack: 0 | 1;
  rtn: 0 | 1;
  t0: number;
  last: number;
  rate: number;
}

/** Tier thresholds from the nominal value and the limit: fractions of the margin, High / Critical optionally pinned by the level (`hi`, `crit`). */
export function thresholds(nom: number, lim: number, minMargin: number, pin: { hi?: number; crit?: number } = {}): { thr: [number, number, number]; margin: number; db: number } {
  const margin = Math.max(lim - nom, minMargin);
  const thr: [number, number, number] = [nom + ALARM_FRAC[0] * margin, nom + ALARM_FRAC[1] * margin, nom + ALARM_FRAC[2] * margin];
  if (pin.hi !== undefined) thr[1] = pin.hi;
  if (pin.crit !== undefined) thr[2] = pin.crit;
  if (pin.hi !== undefined && pin.crit === undefined && thr[2] <= thr[1]) thr[2] = thr[1] + 0.3 * margin;
  if (thr[0] > thr[1]) thr[0] = thr[1];
  return { thr, margin, db: ALARM_DEADBAND * margin };
}

export function makeMon(id: string, u: string, v: 'T' | 'P', kind: MonKind, pipe: string, nom: number, lim: number, hard: number, minMargin: number, pin: { hi?: number; crit?: number } = {}): Mon {
  const th = thresholds(nom, lim, minMargin, pin);
  return { id, u, v, kind, pipe, nom, lim, hard, thr: th.thr, db: th.db, c: [0, 0, 0], m: 0, tier: 0, ack: 1, rtn: 0, t0: 0, last: nom, rate: 0 };
}

export type MonEvent = 'raise' | 'escalate' | 'drop' | 'clear' | 'none';

/** Advance one monitor by one plant second at time `t` with the value `val`. */
export function stepMon(m: Mon, val: number, t: number): MonEvent {
  m.rate = Math.abs(val - m.last);
  m.last = val;
  let bits = m.m;
  for (let k = 0; k < 3; k++) {
    const bit = 1 << k;
    if (bits & bit) {
      if (val < m.thr[k]! - m.db) { bits &= ~bit; m.c[k] = 0; }
    } else {
      m.c[k] = val > m.thr[k]! ? m.c[k]! + 1 : 0;
      if (m.c[k]! >= ALARM_DELAY_S[k]!) bits |= bit;
    }
  }
  m.m = bits;
  const now = (bits & 4 ? 3 : bits & 2 ? 2 : bits & 1 ? 1 : 0) as 0 | 1 | 2 | 3;
  const was = m.tier;
  if (now === was) return 'none';
  m.tier = now;
  if (now > was) {
    m.ack = now === 1 ? 1 : 0; m.rtn = 0; m.t0 = t;
    return was === 0 ? 'raise' : 'escalate';
  }
  if (now === 0) { m.rtn = was >= 2 && m.ack === 0 ? 1 : 0; return 'clear'; }
  return 'drop';
}

/** Acknowledge (no-op on a normal, already-acknowledged alarm). Returns false when the alarm does not exist or has nothing to acknowledge. */
export function ackMon(m: Mon): boolean {
  if (m.tier === 0 && m.rtn === 0) return false;
  m.ack = 1; m.rtn = 0;
  return true;
}

/** Time-dilation scale of the shift clock (DESIGN 3.9): 2 real time (an unacknowledged Critical), 1 watch (any High, or a reactor dT/dt above 0.2 K/s), 0 cruise. */
export function scaleOf(mons: readonly Mon[]): 0 | 1 | 2 {
  let high = false, fast = false;
  for (const m of mons) {
    if (m.tier === 3 && m.ack === 0) return 2;
    if (m.tier >= 2) high = true;
    if (m.v === 'T' && (m.kind === 'bed' || m.kind === 'cstr') && m.rate > WATCH_DTDT) fast = true;
  }
  return high || fast ? 1 : 0;
}

/** True when any Critical alarm is active and unacknowledged (the Learner auto-pause flag). */
export const criticalOpen = (mons: readonly Mon[]): boolean => mons.some((m) => m.tier === 3 && m.ack === 0);
/** Bitmask of the monitors in High or Critical alarm (the replay frame's alarm bits; the first 30 monitors). */
export function alarmBits(mons: readonly Mon[]): number {
  let b = 0;
  for (let i = 0; i < mons.length && i < 30; i++) if (mons[i]!.tier >= 2) b |= 1 << i;
  return b;
}
