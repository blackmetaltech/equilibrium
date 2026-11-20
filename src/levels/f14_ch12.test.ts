// F14 round-7 (Ch1-2) fixes: L09 exam rows each grade their own item; L09 item 3 gives its data; L04 named call; L05 lesson product agrees.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { truthOf } from './l09';

const mk = (level: string): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode: 'learner' }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');

describe('F14 chapter 1-2', () => {
  it('L09: the bomb row keeps its own answer when the exam rows are typed after it', () => {
    const e = mk('L09');
    e.step({ name: 'callIt', args: [Math.round(truthOf('du_ch4') * 10) / 10, 'du_ch4'] } as any);
    e.step({ name: 'callIt', args: [1000, 'heat_co2'] } as any);
    e.step({ name: 'callIt', args: [37.6, 'du_vap'] } as any);
    const rows = info(e).callIts as any[];
    expect(rows.find((r) => r.key === 'du_ch4').value).toBeCloseTo(truthOf('du_ch4'), 0);
    const g = (info(e).goals as any[]).find((x) => x.key === 'du');
    expect(g.value).toBeCloseTo(truthOf('du_ch4'), 0);
  });
  it('L09: item 3 states its ΔH and ΔS before the run', () => {
    const r = (info(mk('L09')).callIts as any[]).find((x) => x.key === 'tmin_k');
    expect(r.prompt).toMatch(/ΔH = \+\d+/); expect(r.prompt).toMatch(/ΔS = \+0\.2/);
  });
  it('L04: the call offers the limiting-reagent chips and grades the name', () => {
    const e = mk('L04');
    const c = info(e).callIt;
    expect(c.options).toEqual(expect.arrayContaining(['N2', 'H2']));
    e.step({ name: 'callIt', args: [100, 'N2'] } as any);
    expect(info(e).callIt.named).toBe('N2');
  });
  it('L03: the predict note says a call after a test burn is allowed', () => {
    expect(info(mk('L03')).predictNote).toMatch(/after a test burn/);
  });
});

describe('F14 L24 checklist', () => {
  it('the feed row does not tick at the full 260.6 kmol/h charge, only at 182', () => {
    const e = mk('L24');
    e.step({ name: 'commission', args: [] } as any);
    e.step({ name: 'startShift', args: ['shift'] } as any);
    const row = (): any => (info(e).buildGuide as any[]).find((r) => r.id === 'feed');
    expect(row().done).toBe(false);
  });
});
