// Actuators (DESIGN 8.5 system 2): a setpoint requested during a shift moves the real parameter at the unit's actuator rate, never in a jump.
// Rates are fractions of the knob's range per plant second (valves 10 %/s, heater duty 5 %/s, compressor speed 2 %/s: DESIGN 8.5); a ramp is plain
// data {unit, key, goal, rate} and ends exactly on its goal, so the move is the same for any way of batching the plant seconds (P21).
export interface Ramp { u: string; k: string; to: number; rate: number }

/** Fraction of the range per second by unit type and key (`rel`: of the larger of the current and goal value instead, for flows). */
export const ACT_FRAC: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  valve: { P: 0.1 },
  heater: { T: 0.05, duty: 0.05, dP: 0.1 },
  cooler: { T: 0.05, duty: 0.05, dP: 0.1 },
  compressor: { P: 0.02 },
  feed: { flow: 0.1, T: 0.05, P: 0.05 },
  splitter: { frac: 0.1 },
  purge: { frac: 0.1 },
  relief: { Pset: 1 },
  interlock: { setpoint: 1 },
  cstr: { Tc: 0.05 },
};
export const ACT_DEFAULT = 0.05;
/** Keys whose rate is relative to the value (flows span orders of magnitude from plant to plant). */
export const ACT_REL: readonly string[] = ['feed.flow'];
/** Numeric parameters a player may ask for that have no palette knob (a cstr's coolant temperature): [min, max, default] in SI. */
export const EXTRA_KNOBS: Readonly<Record<string, Readonly<Record<string, readonly [number, number, number]>>>> = { cstr: { Tc: [250, 450, 298.15] } };

/** Rate in parameter units per plant second for a move from `cur` to `to` of a knob spanning [min, max]. */
export function rampRate(type: string, key: string, min: number, max: number, cur: number, to: number): number {
  const f = ACT_FRAC[type]?.[key] ?? ACT_DEFAULT;
  const span = ACT_REL.includes(type + '.' + key) ? Math.max(Math.abs(cur), Math.abs(to), 1e-9) : max - min;
  return f * span;
}

/** One plant second of a ramp: the next value (exactly `to` when it arrives). */
export function rampStep(cur: number, to: number, rate: number): number {
  return cur < to ? Math.min(cur + rate, to) : Math.max(cur - rate, to);
}

/** Advance every ramp one plant second. `read`/`write` access the real parameter. Returns true if any parameter moved. */
export function stepRamps(ramps: Record<string, Ramp>, read: (u: string, k: string) => number, write: (u: string, k: string, v: number) => void): boolean {
  let moved = false;
  for (const key of Object.keys(ramps)) {
    const r = ramps[key]!;
    const cur = read(r.u, r.k);
    const v = rampStep(cur, r.to, r.rate);
    if (v !== cur) { write(r.u, r.k, v); moved = true; }
    if (v === r.to) delete ramps[key];
  }
  return moved;
}
