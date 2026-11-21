// F30 L39 Size the Line: the reference solver wins with three stars and is the economic optimum in every region; a too-small pipe fails on velocity / flow and power; a long
// suction line fails NPSH; the "What you have" line carries the data and not the head; a Swamee-Jain hand calculation from the given numbers lands inside the Call-it tolerance;
// money is in the pack's currency; the view is JSON-clean.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, hashOf } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { LEVELS } from '../levels';
import { REGIONS } from '../regions';
import type { EqState } from '../state';
import { NAIVE, SPEC_BY_ID } from './registry';
import { L39_CALL_TOL, L39_CALL_TRUTH, L39_Q, L39_REF, annualOf, evaluate, feasibleChoices, optimumOf } from './l39';

function start(seed = 1003, mode = 'learner', region?: string): Env<EqState> { const env = new Env(GAME); env.reset({ seed, level: 'L39', mode, ...(region ? { region } : {}) } as never); return env; }
function play(persona: PersonaFactory<EqState>, o: { mode?: string; region?: string } = {}): Env<EqState> {
  const env = start(1003, o.mode ?? 'learner', o.region), agent = persona(1003), rng = new Rng(1003);
  for (let t = 0; t < 45 && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
const lact = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name: 'levelAct', args: [name, ...args] });
function allFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) { const r = allFinite(x, `${path}.${k}`); if (r) return r; }
  return null;
}
/** Set a whole design through the level actions and commission it. */
function design(c: { suction?: string; discharge?: string; pump?: string; trim?: number; place?: string }, mode = 'learner'): Env<EqState> {
  const e = start(1003, mode);
  if (c.suction) lact(e, 'setPipe', 'suction', c.suction);
  if (c.discharge) lact(e, 'setPipe', 'discharge', c.discharge);
  if (c.pump) lact(e, 'setPump', c.pump);
  if (c.trim) lact(e, 'setTrim', c.trim);
  if (c.place) lact(e, 'setPlace', c.place);
  act(e, 'commission');
  return e;
}

describe('L39 Size the Line', () => {
  it('is registered in chapter 10 with a title, after chapter 9 and before the Career', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.indexOf('L39')).toBe(ids.indexOf('L38') + 1); expect(ids.indexOf('CAREER')).toBeGreaterThan(ids.indexOf('L39'));
    expect(SPEC_BY_ID.L39!.chapter).toBe(10); expect(LEVELS.find((l) => l.id === 'L39')!.title).toBe('Size the Line');
  });

  it('the reference solver wins with three stars in learner and engineer; naive fails; checkLevel is clean', () => {
    const r = checkLevel(GAME, LEVELS.find((l) => l.id === 'L39')!, { seed: 1003, cheeseDepth: 2, cheeseBudget: 300, randomRollouts: 3, randomTicks: 20, solverTicks: 45, idleTicks: 20 });
    expect(r.problems).toEqual([]);
    for (const mode of ['learner', 'engineer']) {
      const e = play(SPEC_BY_ID.L39!.solver, { mode });
      expect(e.state.status, mode).toBe('won');
      expect(card(e).stars, mode).toEqual({ have: 3, earned: [true, true, true] });
      expect(card(e).callIt.ok).toBe(true);
      expect(GAME.invariants!(e.state, null)).toEqual([]);
      const n = play(NAIVE.L39!, { mode });
      expect(n.state.status).toBe('playing'); expect(card(n).won).toBe(false); expect(card(n).cause).toBeTypeOf('string');
    }
    expect(info(play(SPEC_BY_ID.L39!.solver, { mode: 'engineer' })).goals.map((g: any) => g.key)).toContain('capex');
  });

  it('the reference is the economic optimum of every feasible choice, and lands in the BEP window, in every region', () => {
    const ref = evaluate(L39_REF);
    expect(ref.feasible).toBe(true); expect(ref.bep).toBeGreaterThanOrEqual(0.7); expect(ref.bep).toBeLessThanOrEqual(1.1);
    expect(feasibleChoices().length).toBeGreaterThan(50);
    for (const p of REGIONS.list()) {
      const s = { region: p.id }, opt = optimumOf(s);
      expect(annualOf(s, ref).total, p.id).toBeLessThanOrEqual(opt.total * 1.0000001);
      expect(opt.e.c, p.id).toEqual(L39_REF);
      // full impeller costs real money: the trim is worth more than 5 %
      expect(annualOf(s, evaluate({ ...L39_REF, trim: 100 })).total).toBeGreaterThan(opt.total * 1.05);
    }
  });

  it('a too-small pipe fails: 3-inch discharge starves the right-sized pump, and a bigger pump through it breaks the velocity guide and doubles the power', () => {
    const a = design({ suction: '5', discharge: '3', pump: 'P2', trim: 100 });
    expect(card(a).won).toBe(false); expect(card(a).verdictKey).toBe('lowflow');
    expect(card(a).cause).toMatch(/the pump runs out at \d+ % of the flow you need/);
    expect(card(a).cause).toMatch(/^At [0-9.]+ m\/s the friction loss is [0-9.]+ m/);
    const b = design({ suction: '5', discharge: '3', pump: 'P4', trim: 100 });
    expect(card(b).verdictKey).toBe('fast');
    expect(SPEC_BY_ID.L39!.measures(b.state).v.kw!).toBeGreaterThan(1.8 * evaluate(L39_REF).op.kW);
  });

  it('a long suction line fails NPSH: the same pipes and pump with the pump at the boiler house cavitate', () => {
    const e = design({ suction: '5', discharge: '4', pump: 'P2', trim: 93, place: 'far' });
    expect(card(e).won).toBe(false); expect(card(e).verdictKey).toBe('cavitation');
    expect(card(e).cause).toMatch(/115 m suction line/);
    expect(info(e).annunciators.find((x: any) => x.key === 'cav').state).toBe('critical');
    const m = SPEC_BY_ID.L39!.measures(e.state).v;
    expect(m.margin!).toBeLessThan(1);
  });

  it('a pump that cannot lift the static head gives no flow; an over-sized untrimmed pump runs off its curve or cavitates', () => {
    const big = design({ suction: '5', discharge: '4', pump: 'P5', trim: 100 });
    expect(['cavitation', 'runout']).toContain(card(big).verdictKey);
    const small = design({ suction: '5', discharge: '4', pump: 'P3', trim: 75 });
    expect(['shutoff', 'lowflow']).toContain(card(small).verdictKey);
  });

  it('"What you have" carries the data, not the head; the Call-it is graded at 5 %', () => {
    const e = start(), c = info(e).callIt;
    expect(c.given.startsWith('What you have')).toBe(true);
    for (const x of ['62.7', '131', '12.34', '965.3', '0.3145', '14', '0.35']) expect(c.given, x).toContain(x);
    for (const sig of [2, 3, 4]) expect(c.given).not.toContain(String(Number(L39_CALL_TRUTH.toPrecision(sig))));
    const grade = (v: number) => { const g = start(); act(g, 'callIt', v); act(g, 'commission'); return card(g).callIt; };
    expect(grade(L39_CALL_TRUTH).ok).toBe(true); expect(grade(L39_CALL_TRUTH * 1.04).ok).toBe(true); expect(grade(L39_CALL_TRUTH * 1.08).ok).toBe(false);
  });

  it('a hand calculation from the given numbers (Swamee-Jain, g = 9.81, rounded data) lands inside the Call-it tolerance', () => {
    const Q = 60 / 3600, D = 0.0627, A = 3.1416 / 4 * D * D, v = Q / A, rho = 965.3, mu = 0.3145e-3, eps = 0.046e-3;
    const Re = rho * v * D / mu;
    const lg = Math.log10(eps / (3.7 * D) + 5.74 / Math.pow(Re, 0.9));   // test-side arithmetic, as a student would do it
    const f = 0.25 / (lg * lg), hv = v * v / (2 * 9.81);
    const H = 14 + 0.35e5 / (rho * 9.81) + (f * 131 / D + 12.34) * hv;
    expect(Math.abs(H / L39_CALL_TRUTH - 1)).toBeLessThan(L39_CALL_TOL);
    expect(L39_CALL_TRUTH).toBeGreaterThan(3 * evaluate(L39_REF).op.H);   // the old line would need several times the head: the point of the call
  });

  it('money is in the pack currency: the Indian pack prices the board and the printout in INR, and its electricity moves the annual cost', () => {
    const g = play(SPEC_BY_ID.L39!.solver, { mode: 'learner' });
    expect(view(g).money.annual).toMatch(/USD$/);
    const i = play(SPEC_BY_ID.L39!.solver, { mode: 'learner', region: 'in' });
    expect(i.state.status).toBe('won');
    expect(view(i).money.annual).toMatch(/INR$/); expect(view(i).pipes[0].perM).toMatch(/INR$/);
    expect(card(i).metrics.find((m: any) => m.key === 'annual').unit).toMatch(/^INR/);
    const ann = (s: { region: string }) => annualOf(s, evaluate(L39_REF));
    expect(ann({ region: 'in' }).capexAnn / ann({ region: 'global' }).capexAnn).toBeCloseTo(REGIONS.get('in').data.capexFx.value, 6);
  });

  it('the board view is JSON-clean with finite numbers and translated labels, live before the run; edits make the run stale; bad picks are refused', () => {
    for (const e of [start(), play(SPEC_BY_ID.L39!.solver, { mode: 'engineer' })]) {
      const v = view(e);
      expect(v.kind).toBe('pumps'); expect(JSON.parse(JSON.stringify(v))).toEqual(v); expect(allFinite(v)).toBeNull();
      expect(JSON.stringify(v)).not.toMatch(/lv\.L39\./);
      expect(v.curves.pump.length).toBeGreaterThan(5); expect(v.curves.system.length).toBeGreaterThan(5);
    }
    const e = start();
    expect(view(e).op.q).toBeLessThan(L39_Q);   // the fitter's start: 3-inch and the small pump
    lact(e, 'setPipe', 'discharge', '4'); act(e, 'commission'); expect(e.state.solved).not.toBeNull();
    lact(e, 'setPump', 'P2'); expect(e.state.solved).toBeNull();
    expect(() => SPEC_BY_ID.L39!.actions!.setPipe!(e.state, 'discharge', '7')).toThrow();
    expect(() => SPEC_BY_ID.L39!.actions!.setTrim!(e.state, 50)).toThrow();
    expect(() => SPEC_BY_ID.L39!.actions!.setPump!(e.state, 'P9')).toThrow();
  });

  it('the lesson and equation carry the player\'s numbers and the equation evaluates; deterministic', () => {
    const e = play(SPEC_BY_ID.L39!.solver, { mode: 'engineer' }), c = card(e);
    expect(c.lesson).toMatch(/[0-9]/); expect(c.lesson).not.toMatch(/\{[a-zA-Z]+\}/);
    const [l, r] = (c.equation as string).split('=') as [string, string];
    const left = Function(`return (${l.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/')})`)() as number;
    const tok = /^\s*([0-9.]+)/.exec(r)!;
    expect(Math.abs(left - Number(tok[1]))).toBeLessThan(0.006);
    const b = play(SPEC_BY_ID.L39!.solver, { mode: 'engineer' });
    expect(hashOf(e.state)).toBe(hashOf(b.state));
  });
});
