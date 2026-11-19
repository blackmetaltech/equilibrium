// Wall-clock budget of the levels that make the player wait for a shift (GATE 0.5: no level asks for more than five minutes of waiting).
// The speed key offers 1x, 4x and 16x (src/engine/actions/shift.ts). A plan lists, for each stretch of the shift in plant seconds, the speed the level's notes recommend.
// wallSeconds = sum of stretch / speed. wallclock.test.ts checks every level with a shift against WALL_LIMIT_S.
import { FIRSTRUN_S } from '../data/events';
import { L00_DECIDED_S } from './l00';
import { L05_LEN_S } from './l05';
import { L06_LEN_S } from './l06';
import { L08_LEN_S } from './l08';
import { L24_RECIPE, L24_SHIFT_S } from './l24';

export const WALL_LIMIT_S = 300;
export type SpeedPlan = [untilPlantS: number, speed: 1 | 4 | 16][];

/** L24: 4x until the reactor is lit (the chart passes the 110 C cue at about 450 plant seconds) and the player has made the two step-3 edits (a hand up to L24_RECIPE.lateS plant seconds after the cue, the two clicks included), 16x for the rest. */
export const L24_LIGHT_OFF_S = 450 + L24_RECIPE.lateS;
export const SHIFT_PLAN: Readonly<Record<string, { len: number; plan: SpeedPlan }>> = {
  L00: { len: L00_DECIDED_S, plan: [[L00_DECIDED_S, 1]] },
  L05: { len: L05_LEN_S, plan: [[L05_LEN_S, 1]] },
  L06: { len: L06_LEN_S, plan: [[L06_LEN_S, 4]] },
  L08: { len: L08_LEN_S, plan: [[L08_LEN_S, 16]] },
  L24: { len: L24_SHIFT_S, plan: [[L24_LIGHT_OFF_S, 4], [L24_SHIFT_S, 16]] },
};
/** The first run that follows a win in the levels with `firstRun` is client-paced at 1x. */
export const FIRSTRUN_WALL_S = FIRSTRUN_S;

export function wallSeconds(plan: SpeedPlan): number {
  let at = 0, wall = 0;
  for (const [until, speed] of plan) { wall += Math.max(0, until - at) / speed; at = Math.max(at, until); }
  return wall;
}
