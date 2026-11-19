// F8a L25 build walkthrough, L28 first knob, and the one pre-built-plant accounting rule (L21, L22, L28).
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import type { EqState } from '../state';
import { L25_W_KG, L25_T_K } from './l25';
import { L28_REF } from './l28';

const mk = (level: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
function play(e: Env<EqState>, ticks: number): void {
  const agent = SPEC_BY_ID[e.state.level!]!.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < ticks && e.state.status === 'playing'; t++) {
    for (const a of agent(e.state, e.ctx(rng))) { e.step(a); if (e.state.status !== 'playing') break; }
    if (e.state.status === 'playing') e.step(TICK);
  }
}

describe('L25 build walkthrough', () => {
  it('the checklist names every part in order, the numbers of the build, and that build wins', () => {
    const e = mk('L25');
    const rows = (info(e).buildGuide as { text: string }[]).map((r) => r.text);
    const txt = (info(e).note as string[]).join(' ') + ' ' + rows.join(' ');
    const order = ['Packed bed 1', 'Cooler 1', 'Packed bed 2', 'Cooler 2', 'Packed bed 3', 'Absorber 1', 'Heater', 'Packed bed 4', 'Absorber 2', 'Stack'].map((n) => rows.findIndex((r) => r === `Place ${n}`));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
    expect(txt).toContain(`${L25_W_KG} kg`); expect(txt).toContain(`${Math.round(L25_T_K - 273.15)} °C`);
    for (const w of ['OUT', 'IN', 'ACID', 'V₂O₅', '98 %']) expect(txt, w).toContain(w);
    play(e, 200);
    expect(e.state.status).toBe('won');
    const kinds = (t: string): number => e.state.flowsheet.units.filter((u) => u.type === t).length;
    expect([kinds('packed_bed'), kinds('cooler'), kinds('heater'), kinds('absorber'), kinds('product'), kinds('stack')]).toEqual([4, 2, 1, 2, 2, 1]);
  });
});

describe('L28 first knob and the pre-built accounting rule', () => {
  it('the notebook gives the 880 C first knob and explains the calibrated best; nothing is spent before the player builds', () => {
    const e = mk('L28', 'engineer');
    const txt = (info(e).note as string[]).join(' ');
    expect(txt).toContain(`${Math.round(L28_REF.T - 273.15)} °C`); expect(txt).toMatch(/calibrated best/); expect(txt).toMatch(/reference engineer/);
    expect(info(e).spentUSD).toBe(0);
  });
  it('L21: the loop you start with is free; buying the chiller, drum and tank counts; the reference stays in budget', () => {
    const e = mk('L21', 'engineer');
    expect(info(e).spentUSD).toBe(0);
    expect((info(e).note as string[]).join(' ')).toMatch(/already paid for/);
    play(e, 40);
    expect(e.state.status).toBe('won');
    expect(info(e).spentUSD).toBe(28000); expect(info(e).spentUSD).toBeLessThanOrEqual(info(e).budgetUSD);
  });
  it('L22: the loop is free, the tube counts', () => {
    const e = mk('L22', 'engineer');
    expect(info(e).spentUSD).toBe(0);
    expect((info(e).note as string[]).join(' ')).toMatch(/already paid for/);
    e.step({ name: 'placeUnit', args: ['tubular', 10, 0, 0] });
    expect(info(e).spentUSD).toBe(90000);
  });
});
