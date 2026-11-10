// Display lags (DESIGN 3.9): tau = holdup / volumetric flow clamped to 5-300 s; a step input is 63 % there after tau seconds.
import { dmath } from '@core/numerics';
import { describe, expect, it } from 'vitest';
import { alphaOf, clampTau, lagStream, lagValue, pipeTaus, tauOf } from './lags';
import type { Flowsheet, StreamState } from '../types';

describe('lags', () => {
  it('tau is holdup over flow, clamped to 5-300 s', () => {
    expect(tauOf(10, 0.5)).toBe(20);
    expect(tauOf(0.001, 1)).toBe(5);
    expect(tauOf(1e6, 1)).toBe(300);
    expect(tauOf(1, 0)).toBe(300);
    expect(clampTau(Number.NaN)).toBe(300);
  });
  it('step response reaches 1 - 1/e = 63.2 % after tau seconds (tau = 5, 20, 60, 300)', () => {
    for (const tau of [5, 20, 60, 300]) {
      const a = alphaOf(tau);
      let v = 0;
      for (let i = 0; i < tau; i++) v = lagValue(v, 1, a);
      expect(Math.abs(v - (1 - dmath.exp(-1))), 'tau ' + tau).toBeLessThan(1e-12);
    }
  });
  it('a lag never overshoots and converges (99 % after 5 tau)', () => {
    const a = alphaOf(40);
    let v = 10;
    for (let i = 0; i < 200; i++) { v = lagValue(v, 4, a); expect(v).toBeGreaterThanOrEqual(4); }
    expect(v - 4).toBeLessThan(6 * dmath.exp(-5) * 1.01);
  });
  it('lagStream moves composition, T and P together toward the target', () => {
    const cur: StreamState = { n: [1, 0], T: 300, P: 1e5 }, tgt: StreamState = { n: [0, 1], T: 400, P: 2e5 };
    lagStream(cur, tgt, 0.5);
    expect(cur).toEqual({ n: [0.5, 0.5], T: 350, P: 1.5e5 });
  });
  it('pipeTaus: a vessel holds 60 s of its inlet flow, so its outlet pipe has tau 60 at the same flow', () => {
    const fs: Flowsheet = { units: [
      { id: 'F', type: 'feed', pos: { x: 0, y: 0 }, rot: 0, params: {} }, { id: 'D', type: 'flash', pos: { x: 4, y: 0 }, rot: 0, params: {} },
      { id: 'P', type: 'product', pos: { x: 8, y: 0 }, rot: 0, params: {} },
    ], streams: [{ id: 'S1', from: { unit: 'F', port: 'out' }, to: { unit: 'D', port: 'in' } }, { id: 'S2', from: { unit: 'D', port: 'vap' }, to: { unit: 'P', port: 'in' } }], nextId: 3 };
    const st: Record<string, StreamState> = { S1: { n: [1], T: 300, P: 1e5 }, S2: { n: [1], T: 300, P: 1e5 } };
    const tau = pipeTaus(fs, st);
    expect(tau.S1).toBe(5);
    expect(Math.abs(tau.S2! - 60)).toBeLessThan(1e-9);
  });
});
