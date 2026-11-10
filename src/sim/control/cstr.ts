// L33 rig: a jacketed CSTR with a first-order exothermic reaction (Arrhenius), a loss-of-cooling demand, and a safety trip made of redundant temperature
// sensors, k-out-of-n voting, a trip point and a final element. Self-contained (does not use the L24 level). States are plain numbers; time step 1 s with
// sub-stepping (reaction time constants fall to a fraction of a second near runaway). Sensor noise is a hash of (sensor, time): no random state.
// GAME numbers (UNVERIFIED), calibrated so the textbook story holds: without a trip the reactor passes T_CRIT minutes after the cooling is lost.
import { dmath } from '@core/numerics';
import { vote } from './structures';

export const CSTR = {
  V: 2, F: 0.004, Tin: 300, Cin: 2000, rhoCp: 2e6, dH: 2e5, E_R: 6000, k330: 6e-3, UA: 0, Tc: 300, sigma: 1.0,
  /** The reactor above this temperature has failed (relief lifts, vessel damaged): a miss. K. */
  T_CRIT: 392, T_NORMAL: 330, len: 900, lossAt: 120, debounce: 3,
};
const k0 = CSTR.k330 * dmath.exp(CSTR.E_R / CSTR.T_NORMAL);
const rate = (T: number): number => k0 * dmath.exp(-CSTR.E_R / T);
/** Steady state at T_NORMAL: conversion from the residence time, and the jacket conductance UA that closes the heat balance exactly (so the plant starts at rest). */
const C_SS = CSTR.Cin / (1 + (CSTR.k330 * CSTR.V) / CSTR.F);
const UA_SS = (CSTR.dH * CSTR.k330 * C_SS * CSTR.V - CSTR.F * CSTR.rhoCp * (CSTR.T_NORMAL - CSTR.Tin)) / (CSTR.T_NORMAL - CSTR.Tc);

export type Action = 'cut_feed' | 'full_coolant' | 'dump';
export const ACTIONS: Action[] = ['cut_feed', 'full_coolant', 'dump'];
export interface Design { sensors: number; k: number; tripK: number; action: Action }

export interface Fault { sensor: number; kind: 'low' | 'high' | 'spike'; at: number; len: number }
export interface Scenario { id: string; demand: boolean; /** UA multiplier after lossAt (1 = no loss). */ ua: number; faults: Fault[]; /** Events per year. */ perYear: number }
export const SCENARIOS: Scenario[] = [
  { id: 'loss', demand: true, ua: 0, faults: [], perYear: 0.5 },
  { id: 'loss_stuck_low', demand: true, ua: 0, faults: [{ sensor: 0, kind: 'low', at: 0, len: 9999 }], perYear: 0.2 },
  { id: 'stuck_high', demand: false, ua: 1, faults: [{ sensor: 0, kind: 'high', at: 200, len: 9999 }], perYear: 2 },
  { id: 'spikes', demand: false, ua: 1, faults: [{ sensor: 0, kind: 'spike', at: 150, len: 5 }, { sensor: 1, kind: 'spike', at: 400, len: 5 }, { sensor: 2, kind: 'spike', at: 650, len: 5 }], perYear: 20 },
  { id: 'cooling_upset', demand: false, ua: 0.75, faults: [], perYear: 6 },
];
export const COST = { miss: 2_000_000, trip: 60_000, dump: 25_000 };

/** Deterministic roughly-gaussian noise in [-3, 3] sigma-ish: sum of four hashed uniforms. */
function noise(sensor: number, k: number): number {
  let a = 0;
  for (let j = 0; j < 4; j++) {
    let h = (Math.imul(sensor + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b) ^ Math.imul(j + 7, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
    a += (h >>> 0) / 4294967296 - 0.5;
  }
  return a * 1.7320508;   // variance of the sum of four U(-0.5, 0.5) is 1/3
}
export const reading = (sc: Scenario, sensor: number, k: number, T: number): number => {
  let v = T + CSTR.sigma * noise(sensor, k);
  for (const f of sc.faults) {
    if (f.sensor !== sensor || k < f.at || k >= f.at + f.len) continue;
    v = f.kind === 'low' ? CSTR.T_NORMAL + CSTR.sigma * noise(sensor, k) : f.kind === 'high' ? 460 : v + 25;
  }
  return v;
};

export interface RunOut { T: number[]; trippedAt: number; crit: boolean; critAt: number; peak: number }
/** One scenario at one design. `design` null = no trip at all (the open-loop plant). */
export function runScenario(sc: Scenario, d: Design | null): RunOut {
  const P = CSTR, T: number[] = [];
  const nS = d === null ? 0 : d.sensors, kk = d === null ? 1 : Math.min(d.k, d.sensors);
  let temp = P.T_NORMAL, C = C_SS;
  let trippedAt = -1, run = 0, crit = false, critAt = -1, peak = temp;
  for (let k = 0; k < P.len; k++) {
    const ua = k >= P.lossAt ? UA_SS * sc.ua : UA_SS;
    // trip logic on the readings of this second
    if (d !== null && trippedAt < 0) {
      const votes: boolean[] = [];
      for (let j = 0; j < nS; j++) votes.push(reading(sc, j, k, temp) >= d.tripK);
      run = vote(votes, kk) ? run + 1 : 0;
      if (run >= P.debounce) trippedAt = k;
    }
    // final element: first-order-ish ramps after a valve delay
    const since = trippedAt < 0 ? -1 : k - trippedAt;
    const F = d !== null && d.action === 'cut_feed' && since >= 0 ? P.F * Math.max(0, 1 - since / 10) : P.F;
    const uaEff = d !== null && d.action === 'full_coolant' && since >= 10 ? ua * 1.6 + (sc.ua === 1 ? 0 : 0) : ua;
    const Tc = d !== null && d.action === 'full_coolant' && since >= 10 ? 280 : P.Tc;
    const dumping = d !== null && d.action === 'dump' && since >= 12;
    for (let s = 0; s < 4; s++) {   // 0.25 s sub-steps, reaction advanced exactly over each (first order): conversion can never exceed the reactant present
      const h = 0.25, used = C * (1 - dmath.exp(-rate(temp) * h));
      const dump = dumping ? C * (1 - dmath.exp(-h / 6)) : 0;
      temp += (h * (F * P.rhoCp * (P.Tin - temp) - uaEff * (temp - Tc))) / (P.rhoCp * P.V) + (P.dH * used) / P.rhoCp;
      C = Math.max(0, C + (h * F * (P.Cin - C)) / P.V - used - dump);
    }
    peak = Math.max(peak, temp); T.push(temp);
    if (!crit && temp >= P.T_CRIT) { crit = true; critAt = k; }
  }
  return { T, trippedAt, crit, critAt, peak };
}

export interface Verdict { id: string; demand: boolean; tripped: boolean; trippedAt: number; crit: boolean; peak: number; spurious: boolean; missed: boolean }
export interface Eval { scenarios: Verdict[]; misses: number; spurious: number; annualCost: number; hwCost: number }
export const HW = { sensor: 6000, logic: 9000, cut_feed: 8000, full_coolant: 11000, dump: 20000 };
export const hwCost = (d: Design): number => d.sensors * HW.sensor + HW.logic + HW[d.action];

export function evaluate(d: Design): Eval {
  const out: Verdict[] = [];
  let misses = 0, spurious = 0, cost = 0;
  for (const sc of SCENARIOS) {
    const r = runScenario(sc, d);
    const tripped = r.trippedAt >= 0, missed = sc.demand && r.crit, spur = !sc.demand && tripped;
    if (missed) misses++;
    if (spur) spurious++;
    cost += sc.perYear * ((missed ? COST.miss : 0) + (tripped ? COST.trip + (d.action === 'dump' ? COST.dump : 0) : 0));
    out.push({ id: sc.id, demand: sc.demand, tripped, trippedAt: r.trippedAt, crit: r.crit, peak: r.peak, spurious: spur, missed });
  }
  return { scenarios: out, misses, spurious, annualCost: cost, hwCost: hwCost(d) };
}
/** Seconds from the loss of cooling to T_CRIT with no trip at all (the Call-it of L33). */
export function secondsToCritical(): number {
  const r = runScenario(SCENARIOS[0]!, null);
  return r.critAt < 0 ? CSTR.len : r.critAt - CSTR.lossAt;
}
