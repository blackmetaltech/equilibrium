// Actuators (DESIGN 8.5): ramps move at the unit's rate and end exactly on the goal.
import { describe, expect, it } from 'vitest';
import { ACT_FRAC, rampRate, rampStep, stepRamps, type Ramp } from './actuators';

describe('actuators', () => {
  it('rates are the stated fractions of the range per second (valve 10 %, heater 5 %, compressor 2 %)', () => {
    expect(rampRate('valve', 'P', 0, 100, 0, 50)).toBe(10);
    expect(rampRate('heater', 'T', 150, 1500, 300, 900)).toBeCloseTo(0.05 * 1350, 12);
    expect(rampRate('compressor', 'P', 1e4, 4e7, 1e7, 2e7)).toBeCloseTo(0.02 * (4e7 - 1e4), 6);
    expect(ACT_FRAC.valve!.P).toBe(0.1);
    expect(rampRate('mixer', 'x', 0, 10, 0, 1)).toBe(0.5);
  });
  it('a feed flow ramps by a share of its own size, not of the knob range', () => {
    expect(rampRate('feed', 'flow', 0, 1e4, 2, 4)).toBeCloseTo(0.4, 12);
  });
  it('rampStep never overshoots and is exact on arrival, up and down', () => {
    let v = 0; const seen: number[] = [];
    while (v !== 1) { v = rampStep(v, 1, 0.3); seen.push(v); }
    expect(seen).toEqual([0.3, 0.6, 0.8999999999999999, 1]);
    v = 5; while (v !== 2) v = rampStep(v, 2, 1.25);
    expect(v).toBe(2);
  });
  it('stepRamps moves every ramp, reports movement, deletes arrived ramps', () => {
    const p: Record<string, number> = { 'A.x': 0, 'B.y': 10 };
    const ramps: Record<string, Ramp> = { 'A.x': { u: 'A', k: 'x', to: 2, rate: 1 }, 'B.y': { u: 'B', k: 'y', to: 9, rate: 5 } };
    const read = (u: string, k: string) => p[u + '.' + k]!, write = (u: string, k: string, v: number) => { p[u + '.' + k] = v; };
    expect(stepRamps(ramps, read, write)).toBe(true);
    expect(p).toEqual({ 'A.x': 1, 'B.y': 9 });
    expect(Object.keys(ramps)).toEqual(['A.x']);
    expect(stepRamps(ramps, read, write)).toBe(true);
    expect(Object.keys(ramps)).toEqual([]);
    expect(stepRamps(ramps, read, write)).toBe(false);
  });
});
