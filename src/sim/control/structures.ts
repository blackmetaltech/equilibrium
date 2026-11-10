// Control structures: a ratio station (follower set point = R x measured leader, clamped), a cascade (master output scaled onto the slave's set-point range) and
// k-out-of-n voting with the spurious-trip / miss tally of a safety function.
import { pidStep, type PidCfg, type PidState } from './pid';

export const ratioSetpoint = (ratio: number, leaderMeas: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, ratio * leaderMeas));

export interface CascadeState { master: PidState; slave: PidState }
/** One cascade step: the master (pv, sp) produces 0-100 %, scaled onto [slaveLo, slaveHi] as the slave's set point; the slave drives the valve. Returns valve % and the slave sp. */
export function cascadeStep(mCfg: PidCfg, sCfg: PidCfg, st: CascadeState, sp: number, masterPv: number, slavePv: number, slaveLo: number, slaveHi: number, dt: number): { op: number; slaveSp: number } {
  const m = pidStep(mCfg, st.master, sp, masterPv, dt);
  const slaveSp = slaveLo + (m / 100) * (slaveHi - slaveLo);
  return { op: pidStep(sCfg, st.slave, slaveSp, slavePv, dt), slaveSp };
}

/** k-out-of-n: true when at least k of the channels vote to trip. */
export const vote = (channels: boolean[], k: number): boolean => channels.filter(Boolean).length >= k;
/** Fraction of demands a single dangerous (stuck-low) channel can hide: the system still trips on a demand iff at least k healthy channels remain. */
export const survivesStuckLow = (n: number, k: number, stuck: number): boolean => n - stuck >= k;
export interface Tally { spurious: number; missed: number; caught: number }
export const emptyTally = (): Tally => ({ spurious: 0, missed: 0, caught: 0 });
