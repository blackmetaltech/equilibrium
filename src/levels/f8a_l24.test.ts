// F8a L24: start-up recipe in the notebook, cold commissioning, interlock set point, resetInterlock, post-mortem numbers.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import type { EqState } from '../state';
import { L24_SOLVE } from './l24';

const K = 273.15;
const mk = (level: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>, id: string): any => e.engine.q('unitCard', [id]);
const run = (e: Env<EqState>, acts: { name: string; args?: unknown[] }[]): void => { for (const a of acts) e.step(a as any); };

describe('L24 start-up recipe and cold commissioning', () => {
  it('the recipe in the notebook carries the numbers of the scripted start-up, and following it wins (>= 1 star, no trip)', () => {
    const e = mk('L24');
    const notes = (info(e).note as string[]).join(' ');
    for (const frag of [`${L24_SOLVE.warmK - K} °C`, `${L24_SOLVE.starve * 100} %`, `${L24_SOLVE.litC} °C`, `${L24_SOLVE.holdK - K} °C`, `${Math.round(L24_SOLVE.rampStep * 1000) / 10} %`, `${L24_SOLVE.rampEvery} seconds`, 'Reset']) expect(notes, frag).toContain(frag);
    const coachTexts: string[] = [];
    const base = SPEC_BY_ID.L24!.solver(1003), rng = new Rng(1003);
    for (let t = 0; t < 4300 && e.state.status === 'playing'; t++) {
      for (const a of base(e.state, e.ctx(rng))) e.step(a);
      const c = info(e).coach; if (c && !coachTexts.includes(c.text)) coachTexts.push(c.text);
      if (e.state.status === 'playing') e.step(TICK);
    }
    expect(coachTexts.join(' ')).toContain('72 °C');
    expect(e.state.status).toBe('won'); expect(e.state.shift!.stat.tripN).toBe(0);
    expect(info(e).stars.have).toBeGreaterThanOrEqual(1);
    const lesson = (e.engine.q('resultCard') as any).lesson as string;
    expect(lesson).toContain('148.7'); expect(lesson).not.toContain('0.149');
  });
  it('commissioning from a DESIGN coolant of 55 C starts from the cold jacket, not from the hot branch', () => {
    const e = mk('L24');
    run(e, [{ name: 'setParam', args: ['R-103', 'Tc', 55 + K] }, { name: 'commission' }]);
    const r = e.state.solved!.units['R-103']!.info;
    expect(r.T - K).toBeLessThan(40); expect(r.Tc - K).toBeCloseTo(25, 6);
    run(e, [{ name: 'startShift', args: ['shift'] }]);
    expect(e.state.shift!.dc['R-103']!.T - K).toBeLessThan(40);
  });
  it('the interlock set point can be set to the notebook value 125 in 5 C and 1 C steps', () => {
    const e = mk('L24');
    const k0 = card(e, 'I-106').knobs.find((k: any) => k.key === 'setpoint');
    expect(k0.disp.value).toBeCloseTo(130, 6); expect(k0.disp.coarse).toBe(5); expect(k0.disp.fine).toBe(1);
    run(e, [{ name: 'setParam', args: ['I-106', 'setpoint', 125 + K] }]);
    expect(card(e, 'I-106').knobs.find((k: any) => k.key === 'setpoint').disp.value).toBeCloseTo(125, 6);
  });
  it('resetInterlock refuses while hot, releases the latch once the reactor is cool, and the coach says how', () => {
    const e = mk('L24');
    run(e, [{ name: 'setParam', args: ['I-106', 'setpoint', 125 + K] }, { name: 'setParam', args: ['R-104', 'orifice', 'T'] }, { name: 'commission' }, { name: 'startShift', args: ['shift'] }, { name: 'setpoint', args: ['R-103', 'Tc', 72 + K] }]);
    const sh = (): any => e.state.shift;
    let n = 0;
    while (sh().trips['I-106'] === undefined && n++ < 600 && e.state.status === 'playing') e.step({ name: 'tick', args: [5] });
    expect(sh().trips['I-106']).toBeDefined();
    expect(info(e).coach.text).toContain('Reset');
    const hot = e.step({ name: 'levelAct', args: ['resetInterlock'] }).info as any;
    expect(hot.ok).toBe(false); expect(String(hot.message)).toContain('cannot reset');
    run(e, [{ name: 'setpoint', args: ['R-103', 'Tc', 280] }]);
    n = 0;
    while (sh().dc['R-103'].T >= 125 + K - 1 && n++ < 600) e.step({ name: 'tick', args: [5] });
    const cool = e.step({ name: 'levelAct', args: ['resetInterlock'] }).info as any;
    expect(cool.ok, String(cool.message)).toBe(true); expect(sh().trips['I-106']).toBeUndefined();
  });
  it('a lost vessel names the vessel (no double space)', () => {
    const e = mk('L24');
    run(e, [{ name: 'setParam', args: ['I-106', 'setpoint', 0] }, { name: 'commission' }, { name: 'startShift', args: ['shift'] }, { name: 'setpoint', args: ['R-103', 'Tc', 72 + K] }]);
    for (let i = 0; i < 700 && e.state.status === 'playing'; i++) e.step({ name: 'tick', args: [5] });
    expect(e.state.status).toBe('lost');
    const cause = (e.engine.q('resultCard') as any).cause as string;
    expect(cause).toContain('R-103'); expect(cause).not.toMatch(/ {2}/);
  });
});
