// F10 L26: the pre-built line is paid for (one rule: notebook spent = goal spent = what the player adds); the plot has room for the gauze burner and the abater with a gap round
// the notebook's own spots; the whole notebook build fits and wins.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { footprint } from '../engine/registry';
import type { EqState } from '../state';
import { L26_BUDGET, L26_UNITS } from './l26';

const mk = (mode = 'engineer'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 7, level: 'L26', mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const rect = (t: string, x: number, y: number) => ({ x, y, ...footprint(t, 0) });
const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('L26 money and room', () => {
  it('spent is 0 at the start in the notebook and in the budget goal; it counts only what the player places', () => {
    const e = mk(); const i = info(e);
    expect(i.spentUSD).toBe(0);
    const b = i.goals.find((g: any) => g.key === 'budget');
    expect(b.text).toContain('spent 0 USD');
    e.step({ name: 'placeUnit', args: ['gauze_burner', 10, 0, 0] } as any);
    expect(info(e).spentUSD).toBe(L26_UNITS.gauze_burner!.price);
    expect(info(e).goals.find((g: any) => g.key === 'budget').text).toContain('spent 70,000 USD');
    expect(L26_BUDGET).toBeGreaterThanOrEqual(L26_UNITS.gauze_burner!.price + L26_UNITS.n2o_abater!.price);
  });
  it('the plot has many anchors for the 4x4 gauze burner, and a one-tile gap round the notebook spots', () => {
    const e = mk(); const us = e.state.flowsheet.units.map((u) => rect(u.type, u.pos.x, u.pos.y));
    let n = 0;
    for (let y = 0; y + 4 <= e.state.plot.h; y++) for (let x = 0; x + 4 <= e.state.plot.w; x++) if (!us.some((u) => hit(rect('gauze_burner', x, y), u))) n++;
    expect(n).toBeGreaterThanOrEqual(12);
    const gap = (t: string, x: number, y: number): boolean => { const r = rect(t, x, y); return !us.some((u) => hit({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, u)); };
    expect(gap('gauze_burner', 10, 0)).toBe(true);
    expect(gap('n2o_abater', 4, 9)).toBe(true);
  });
  it('the notebook build (gauze at 10,0, abater at 4,9) places, pipes and commissions', () => {
    const e = mk(); const a = (name: string, args: unknown[] = []) => e.step({ name, args } as any);
    a('placeUnit', ['gauze_burner', 10, 0, 0]); a('placeUnit', ['n2o_abater', 4, 9, 0]);
    expect(e.state.flowsheet.units.map((u) => u.type)).toEqual(expect.arrayContaining(['gauze_burner', 'n2o_abater']));
  });
});
