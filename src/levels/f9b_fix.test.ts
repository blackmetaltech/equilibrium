// F9b: L27 accumulation on the gauge scale, L28 calibrated best on the card, L25/L26 placement hint, L26 first-knob numbers, relief P1.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import type { EqState } from '../state';
import { L27_ALLOW_BARG, L27_DESIGN_BARG, l27Required } from './l27';
import { L26_REF, nitricScript } from './l26';
import { L28_STAR3_GJ } from './l28';
import { relievingKPa } from '../sim/units/relief';

const mk = (level: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
function solve(level: string): Env<EqState> {
  const e = mk(level), agent = SPEC_BY_ID[level]!.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < 400 && e.state.status === 'playing'; t++) { for (const a of agent(e.state, e.ctx(rng))) e.step(a); if (e.state.status === 'playing') e.step(TICK); }
  return e;
}

describe('L27: 110 % is on the gauge scale (API 520), everywhere', () => {
  it('relieving pressure = set + 10 % of the GAUGE set pressure', () => {
    expect((relievingKPa(30 * 1e5 + 101325) * 1000 - 101325) / 1e5).toBeCloseTo(33.0, 9); // kPa abs -> bar(g)
    expect(L27_ALLOW_BARG).toBeCloseTo(33.0, 9);
    expect(L27_DESIGN_BARG * 1.1).toBeCloseTo(33.0, 9);
  });
  it('the goal, the note and the lesson say 33.0 bar(g), and a passing valve peaks at exactly that (not 33.09)', () => {
    const e = solve('L27');
    expect(e.state.status).toBe('won');
    const li = info(e);
    const txt = JSON.stringify(li.goals) + JSON.stringify(li.note);
    expect(txt).toContain('33.0 bar(g)'); expect(txt).toContain('gauge');
    const v = SPEC_BY_ID.L27!.measures(e.state).v;
    expect(v.peak_barg!).toBeCloseTo(33.0, 6);
    expect(v.peak_barg!).toBeLessThanOrEqual(L27_ALLOW_BARG + 1e-9);
    expect(l27Required(30 * 1e5 + 101325)).toBeGreaterThan(0);
  });
});

describe('L28: the calibrated best is a number on the card', () => {
  it('star 3 and the notebook name 32.2 GJ/t, which is the engine line', () => {
    expect(Math.round(L28_STAR3_GJ * 10) / 10).toBe(32.2);
    const li = info(mk('L28'));
    expect(JSON.stringify(li.stars.rules)).toContain('32.2 GJ per tonne');
    expect((li.note as string[]).join(' ')).toContain('32.2 GJ per tonne');
  });
});

describe('L25 / L26: a blocked placement names a free spot', () => {
  it('the refusal carries the nearest free column and row, and that spot really accepts the unit', () => {
    const e = mk('L26');
    const taken = (e.state.flowsheet.units[0]!).pos;
    const r = e.step({ name: 'placeUnit', args: ['gauze_burner', taken.x, taken.y, 0] }).info as any;
    expect(r.ok).toBe(false);
    const m = /column (\d+), row (\d+)/.exec(String(r.message));
    expect(m, String(r.message)).not.toBeNull();
    const ok = e.step({ name: 'placeUnit', args: ['gauze_burner', Number(m![1]), Number(m![2]), 0] }).info as any;
    expect(ok.ok, String(ok.message)).toBe(true);
  });
  it('L26 first-knob numbers (630 kmol/h air, 200 C preheat, 95 % abater) give a lit, safe gauze', () => {
    const i26 = info(mk('L26')), notes = (i26.note as string[]).join(' ') + ' ' + (i26.buildGuide as { text: string }[]).map((r) => r.text).join(' ');
    for (const f of [`${L26_REF.air} kmol/h`, `${L26_REF.preheat - 273.15} °C`.replace('199.99999999999997', '200'), `${L26_REF.X * 100} %`]) expect(notes, f).toContain(f.replace(/(\d+\.\d{3,})/, (x) => String(Math.round(Number(x)))));
    const e = mk('L26');
    for (const a of nitricScript(L26_REF.air, L26_REF.preheat, L26_REF.X, 0, false)) e.step(a);
    expect(e.state.solved!.ok).toBe(true);
    const v = SPEC_BY_ID.L26!.measures(e.state).v;
    expect(v.t_gauze_c!).toBeGreaterThan(850); expect(v.no_yield!).toBeGreaterThanOrEqual(95); expect(v.y_nh3!).toBeLessThanOrEqual(11);
  });
});
