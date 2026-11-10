// Shared helpers of the chapter-4 levels (Speed, DESIGN 2.6 L15-L18): reading one packed bed (or the batch rig) off the solved plant. Rule code: SI inside;
// temperatures in K here, deg C at the edges. No sentences (keys only).
import { plumbing } from '../engine/solved';
import type { StreamState, UnitInst } from '../sim/types';
import type { EqState } from '../state';

type S = Readonly<EqState>;
export const C0 = 273.15;
export const toC = (K: number): number => K - C0;

/** What the bed of the plant reports after a commission (undefined before one or when the unit is missing). */
export interface BedRead {
  unit: UnitInst; info: Record<string, number>; inlet: StreamState | undefined; outlet: StreamState | undefined;
  /** NH3 / SO3 etc. are read by the level from `outlet` and `inlet`. */
}
export function readUnit(s: S, type: string): BedRead | undefined {
  const unit = s.flowsheet.units.find((u) => u.type === type);
  if (!unit || !s.solved || !s.solved.ok) return undefined;
  const pl = plumbing(s);
  const ip = pl.inPipe(unit.id, 'in'), op = pl.outPipe(unit.id, 'out');
  const info = s.solved.units[unit.id]?.info;
  if (!info) return undefined;
  return { unit, info, inlet: ip ? s.solved.streams[ip] : undefined, outlet: op ? s.solved.streams[op] : undefined };
}

/** mol % of species `id` in a stream. */
export function molPct(s: S, st: StreamState | undefined, id: string): number {
  const i = s.species.indexOf(id);
  if (!st || i < 0) return 0;
  const tot = st.n.reduce((a, b) => a + b, 0);
  return tot > 0 ? (st.n[i]! / tot) * 100 : 0;
}

/** Conversion of species `id` from the inlet to the outlet of a unit (0..1). */
export function convOf(s: S, rd: BedRead, id: string): number {
  const i = s.species.indexOf(id);
  if (i < 0 || !rd.inlet || !rd.outlet || !(rd.inlet.n[i]! > 0)) return 0;
  return Math.max(0, 1 - rd.outlet.n[i]! / rd.inlet.n[i]!);
}

/** Does the diag list of the solve carry code `code`? */
export const hasDiag = (s: S, code: string): boolean => s.solved !== null && s.solved.diag.some((d) => d.code === code);
