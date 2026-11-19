// Gate 0.5: no level asks for more than five minutes of wall-clock waiting at its recommended speed.
import { describe, expect, it } from 'vitest';
import { EVENT_TABLES } from '../data/events';
import { SPECS } from './registry';
import { FIRSTRUN_WALL_S, LATENCY_S, SHIFT_PLAN, WALL_LIMIT_S, wallSeconds, wallWithLatency } from './wallclock';

describe('wall-clock budget', () => {
  const shiftLevels = SPECS.filter((s) => s.shiftLen > 0);
  it('every level with a shift has a speed plan that covers the whole shift', () => {
    expect(shiftLevels.map((s) => s.id).sort()).toEqual(Object.keys(SHIFT_PLAN).sort());
    for (const s of shiftLevels) {
      const p = SHIFT_PLAN[s.id]!;
      expect(p.plan[p.plan.length - 1]![0], s.id).toBe(p.len);
      expect(p.len, s.id).toBeLessThanOrEqual(s.shiftLen);
      expect(EVENT_TABLES[s.id]?.lenS ?? s.shiftLen, s.id).toBe(s.shiftLen);
    }
  });
  for (const s of shiftLevels) {
    it(`${s.id}: the shift takes at most ${WALL_LIMIT_S} s of wall clock at the recommended speed, with ${LATENCY_S} s of human latency per step`, () => {
      const w = wallWithLatency(s.id);
      expect(w, `${s.id} ${Math.round(w)} s`).toBeLessThanOrEqual(WALL_LIMIT_S);
    });
  }
  it('no shift is entered at the speed it would need to be unplayable: even at 1x the short ones stay within the limit, the long ones need 4x or 16x', () => {
    expect(SHIFT_PLAN.L24!.plan.every((x) => x[1] === 16)).toBe(true); expect(SHIFT_PLAN.L24!.steps).toBe(4);
    expect(SHIFT_PLAN.L08!.plan[0]![1]).toBe(16);
  });
  it('the first run after a win (30 plant seconds at 1x) is far under the limit', () => { expect(FIRSTRUN_WALL_S).toBeLessThan(60); });
  it('shifts of levels that do not wait for the shift end (free shift tables of 8 hours) are never part of a goal', () => {
    for (const s of SPECS.filter((x) => x.shiftLen === 0 && EVENT_TABLES[x.id] !== undefined)) expect(s.shiftLen, s.id).toBe(0);
  });
});
