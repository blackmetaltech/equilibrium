// F16 (round 7): the feed card shows the target the player typed while a setpoint ramps; the L24 checklist's wait row counts; runs open at the level's recommended speed.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { L24, L24_GUIDE, L24_RECIPE as R, l24SteadyS } from './l24';
import { buildGuideOf } from './build_guide';
import { recommendedSpeed } from './wallclock';

const K = 273.15, KMOL_H_TO_MOL_S = 1 / 3.6;
const mk = (id = 'L24'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode: 'learner' }); return e; };
const act = (e: Env<EqState>, name: string, args: unknown[] = []): void => { e.step({ name, args } as any); };

describe('F16 feed knob', () => {
  it('the feed card (and its knobs) show the ramp target, not the value the feed is passing through', () => {
    const e = mk();
    act(e, 'setParam', ['I-106', 'setpoint', 125 + K]); act(e, 'setParam', ['R-104', 'orifice', 'T']); act(e, 'commission'); act(e, 'startShift', ['shift']);
    const full = (e.engine.q('unitCard', ['F-101']) as any).feed.flow as number;
    act(e, 'setpoint', ['F-101', 'flow', R.feedKmolH * KMOL_H_TO_MOL_S]);
    expect(e.state.shift!.ramps['F-101.flow']).toBeDefined();            // still heading there
    expect(e.state.feeds['F-101']!.flow).toBeGreaterThan(R.feedKmolH * KMOL_H_TO_MOL_S + 1e-9);   // the live feed has not arrived
    const c = e.engine.q('unitCard', ['F-101']) as any;
    expect(c.feed.flow).toBeCloseTo(R.feedKmolH * KMOL_H_TO_MOL_S, 9);
    expect(c.feed.flow).toBeLessThan(full);
    // a ramping non-feed knob (the reactor coolant) reads its target as well
    act(e, 'setpoint', ['R-103', 'Tc', R.warmC + K]);
    const r = e.engine.q('unitCard', ['R-103']) as any;
    expect(r.knobs.find((k: any) => k.key === 'Tc').value).toBeCloseTo(R.warmC + K, 9);
  });
});

describe('F16 L24 checklist rows', () => {
  it('the wait row is its own row with a countdown, and ticks on the wait', () => {
    expect(L24_GUIDE.map((g) => g.id)).toEqual(['ilk', 'relief', 'start', 'feed', 'warm', 'lit', 'ease_c', 'ease_f', 'steady', 'cooled', 'fed']);
    const e = mk(), s = (): EqState => e.state;
    act(e, 'setParam', ['I-106', 'setpoint', 125 + K]); act(e, 'setParam', ['R-104', 'orifice', 'T']); act(e, 'commission'); act(e, 'startShift', ['shift']);
    const rows = () => buildGuideOf(s(), L24)!;
    expect(rows().find((r) => r.id === 'start')!.text).not.toMatch(/speed key/);
    act(e, 'setpoint', ['F-101', 'flow', R.feedKmolH * KMOL_H_TO_MOL_S]); act(e, 'setpoint', ['R-103', 'Tc', R.warmC + K]);
    while (e.state.status === 'playing' && (s().shift!.dc['R-103']!.T - K) <= R.coolAtC) act(e, 'tick', [1]);
    expect(l24SteadyS(s())).toBeNull();
    act(e, 'setpoint', ['R-103', 'Tc', R.easeC + K]); act(e, 'setpoint', ['F-101', 'flow', R.easeKmolH * KMOL_H_TO_MOL_S]);
    for (let i = 0; i < 60; i++) act(e, 'tick', [1]);
    const mid = rows().find((r) => r.id === 'steady')!;
    expect(mid.done).toBe(false);
    expect(mid.text).toMatch(/steady 6\d \/ 120 plant s/);
    for (let i = 0; i < 70; i++) act(e, 'tick', [1]);
    expect(rows().find((r) => r.id === 'steady')!.done).toBe(true);
    expect(rows().find((r) => r.id === 'cooled')!.done).toBe(false);
  });
});

describe('F16 recommended speed', () => {
  it('first-run levels and ordinary levels open at 1x, the shift levels at their plan', () => {
    for (const id of ['L15', 'L16', 'L17', 'L18', 'L00', 'L05']) expect(recommendedSpeed(id), id).toBe(1);
    expect(recommendedSpeed('L06')).toBe(4); expect(recommendedSpeed('L08')).toBe(16); expect(recommendedSpeed('L24')).toBe(16);
    expect((mk('L15').engine.q('levelInfo') as any).recommendedSpeed).toBe(1);
    expect((mk('L24').engine.q('levelInfo') as any).recommendedSpeed).toBe(16);
  });
});
