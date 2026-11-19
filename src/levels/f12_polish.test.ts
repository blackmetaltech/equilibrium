// F12: L26 notebook states the flammable limit the engine uses; every call result states its tolerance; L23/L26 calibrated-best flasks carry their number;
// the Semenov plot says which feed its steady states are for.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import type { Action } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { L26, L26_COST_MAX, L26_REF, l26RefEnvelope, nitricScript } from './l26';
import { L23_COST_MAX } from './l23';

const mk = (id: string, mode = 'engineer'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 7, level: id, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');

describe('L26 flammable limit', () => {
  it('the notebook gives the lower flammable limit at the feed temperature, equal to the engine number on the solved plant', () => {
    const e = mk('L26');
    const text = (info(e).note as string[]).join(' ');
    const env = l26RefEnvelope();
    expect(text).toContain(`${(Math.round(env.lfl * 10) / 10)} mol %`);
    expect(text).toContain(`${Math.round(L26_REF.mix_c)} °C`);
    for (const a of nitricScript(L26_REF.air, L26_REF.preheat, L26_REF.X, 0, false) as Action[]) e.step(a);
    const m = L26.measures(e.state);
    expect(Math.abs(m.v.mix_c! - L26_REF.mix_c)).toBeLessThan(0.1);
    expect(Math.abs(m.v.lfl! - env.lfl)).toBeLessThan(0.05);
    expect(m.v.y_nh3!).toBeLessThan(env.lfl);
  });
});

describe('call results state their tolerance', () => {
  it('every call-it row, answered or not, carries "within ±X %" (or exactly)', () => {
    for (const id of ['L24', 'L26', 'L23']) {
      const e = mk(id);
      const ci = info(e).callIt;
      expect(ci.tol, id).toMatch(/^(within ±[0-9.]+ %|exactly)$/);
    }
    const e = mk('L26');
    expect(info(e).callIt.tol).toBe('within ±3 %');
    e.step({ name: 'callIt', args: [860] } as any);
    expect(info(e).callIt.tol).toBe('within ±3 %'); expect(info(e).callIt.answered).toBe(true);
  });
});

describe('calibrated-best flasks carry their number', () => {
  it('L23 and L26 star 3 name the cost per tonne', () => {
    const r23 = info(mk('L23')).stars.rules[2] as string, r26 = info(mk('L26')).stars.rules[2] as string;
    expect(Number(/: ([0-9.]+) USD\/t/.exec(r23)![1])).toBeCloseTo(L23_COST_MAX, 0);
    expect(Number(/: ([0-9.]+) USD\/t/.exec(r26)![1])).toBeCloseTo(L26_COST_MAX, 0);
  });
});

describe('Semenov plot', () => {
  it('names the feed its steady states are for', () => {
    const e = mk('L24', 'learner');
    e.step({ name: 'commission' } as any); e.step({ name: 'startShift', args: ['shift'] } as any);
    const sem: any = e.engine.q('semenov', ['R-103']);
    expect(sem.feedKmolH).toBeGreaterThan(200);
    expect(sem.feedKmolH).toBeLessThan(300);
  });
});
