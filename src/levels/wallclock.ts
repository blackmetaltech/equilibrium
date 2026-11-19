// Wall-clock budget of the levels that make the player wait for a shift (GATE 0.5: no level asks for more than five minutes of waiting).
// The speed key offers 1x, 4x and 16x (src/engine/actions/shift.ts). A plan lists, for each stretch of the shift in plant seconds, the speed the level's notes recommend.
// wallSeconds = sum of stretch / speed. wallclock.test.ts checks every level with a shift against WALL_LIMIT_S.
import { FIRSTRUN_S } from '../data/events';
import { L00_DECIDED_S } from './l00';
import { L05_LEN_S } from './l05';
import { L06_LEN_S } from './l06';
import { L08_LEN_S } from './l08';
import { L24_SHIFT_S } from './l24';

export const WALL_LIMIT_S = 300;
/** A human needs this long, in real seconds, to read the chart and make the edits of one checklist step (the notebook's numbered steps); the waiting at speed comes on top. */
export const LATENCY_S = 30;
export type SpeedPlan = [untilPlantS: number, speed: 1 | 4 | 16][];

/** L24: 16x throughout. The recipe tolerates a hand up to 480 plant seconds (30 s at 16x) late at either edit (f9b_l24.test.ts). Four numbered steps: set up, light, ease, hold. */
export const SHIFT_PLAN: Readonly<Record<string, { len: number; plan: SpeedPlan; steps: number }>> = {
  L00: { len: L00_DECIDED_S, plan: [[L00_DECIDED_S, 1]], steps: 1 },
  L05: { len: L05_LEN_S, plan: [[L05_LEN_S, 1]], steps: 1 },
  L06: { len: L06_LEN_S, plan: [[L06_LEN_S, 4]], steps: 2 },
  L08: { len: L08_LEN_S, plan: [[L08_LEN_S, 16]], steps: 2 },
  L24: { len: L24_SHIFT_S, plan: [[L24_SHIFT_S, 16]], steps: 4 },
};
/** The first run that follows a win in the levels with `firstRun` is client-paced at 1x. */
export const FIRSTRUN_WALL_S = FIRSTRUN_S;

/** Wall seconds of a level's shift including the human latency of each of its steps. */
export const wallWithLatency = (id: string): number => wallSeconds(SHIFT_PLAN[id]!.plan) + SHIFT_PLAN[id]!.steps * LATENCY_S;

export function wallSeconds(plan: SpeedPlan): number {
  let at = 0, wall = 0;
  for (const [until, speed] of plan) { wall += Math.max(0, until - at) / speed; at = Math.max(at, until); }
  return wall;
}
