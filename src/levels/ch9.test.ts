// Chapter 9 (Turnaround), L34-L38: the solver wins with three stars, the naive player fails the way the level says, the mechanics' reference numbers hold, Call-it grading, levelInfo /
// levelView / resultCard shape (JSON-clean), the equation evaluates, determinism. Expected numbers come from the ops oracles or the reference runs; none is hand-typed.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, hashOf } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { LEVELS } from '../levels';
import { NAIVE, SPEC_BY_ID } from './registry';
import { L34_MIN_USD, L34_BUDGET } from './l34';
import { L35_HEAT_MIN, L35_MINS_REF } from './l35';
import { L36_LOSS_REF } from './l36';
import { BIASED } from './l37';
import { L38_CPM, L38_COST_REF, L38_JOBS, L38_LIM, L38_REF_ORDER, L38_START_ORDER, cost } from './l38';
import { schedule } from '../sim/ops/turnaround';
import { callItTout } from '../sim/ops/hazop';
import type { EqState } from '../state';

const IDS = ['L34', 'L35', 'L36', 'L37', 'L38'];
function start(id: string, seed = 1003, mode = 'learner'): Env<EqState> { const env = new Env(GAME); env.reset({ seed, level: id, mode }); return env; }
function play(id: string, persona: PersonaFactory<EqState>, o: { seed?: number; mode?: string; ticks?: number } = {}): Env<EqState> {
  const seed = o.seed ?? 1003, env = start(id, seed, o.mode ?? 'learner'), agent = persona(seed), rng = new Rng(seed);
  for (let t = 0; t < (o.ticks ?? 45) && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const solve = (id: string, o: { seed?: number; mode?: string } = {}) => play(id, SPEC_BY_ID[id]!.solver, o);
const naive = (id: string, o: { mode?: string } = {}) => play(id, NAIVE[id]!, { ...o, ticks: 45 });
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
const lact = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name: 'levelAct', args: [name, ...args] });
function equationHolds(eq: string): boolean {
  const [l, r] = eq.split('=') as [string, string];
  const expr = l.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  expect(expr).toMatch(/^[0-9.+\-*/() ]+$/);
  const left = Function(`return (${expr})`)() as number;
  const tok = /^\s*(-?[0-9][0-9,]*(?:\.([0-9]+))?)/.exec(r)!;
  const right = Number(tok[1]!.replace(/,/g, ''));
  return Math.abs(left - right) <= 0.5 * Math.pow(10, -(tok[2]?.length ?? 0)) + 1e-9;
}
function allFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) { const r = allFinite(x, `${path}.${k}`); if (r) return r; }
  return null;
}
const KIND: Record<string, string> = { L34: 'hazop', L35: 'sop', L36: 'permit', L37: 'reconcile', L38: 'gantt' };

describe('registry', () => {
  it('the five levels are in the game with titles, in chapter 9', () => {
    for (const id of IDS) { const l = LEVELS.find((x) => x.id === id)!; expect(l.title.length).toBeGreaterThan(3); expect(SPEC_BY_ID[id]!.chapter).toBe(9); expect(l.solver).toBeTypeOf('function'); }
  });
});

describe('reference numbers', () => {
  it('L38: the best of all 8! priority orders is the reference; one crane 18 days, two cranes 16; the start order is 22; the critical path is 13', () => {
    const perms = (a: string[]): string[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
    const ids = L38_JOBS.map((j) => j.id);
    const best = (crane: number) => Math.min(...perms(ids).map((p) => schedule(L38_JOBS, p, { crew: L38_LIM.crew, crane }).makespan));
    expect(best(1)).toBe(18); expect(best(2)).toBe(16);
    expect(schedule(L38_JOBS, L38_REF_ORDER, { crew: 8, crane: 2 }).makespan).toBe(16);
    expect(schedule(L38_JOBS, L38_START_ORDER, { crew: 8, crane: 1 }).makespan).toBe(22);
    expect(L38_CPM.length).toBe(13); expect(L38_CPM.critical).toEqual(['J1', 'J2', 'J7', 'J8']);
    expect(L38_COST_REF).toBe(cost(16, 2));
    expect(cost(16, 2)).toBeLessThan(cost(18, 1));   // the second crane pays for itself
  });
  it('L34: the cheapest covering set costs 75000 and fits the engineer budget; the call-it oracle is the closed form', () => {
    expect(L34_MIN_USD).toBe(75000); expect(L34_BUDGET).toBeGreaterThan(L34_MIN_USD); expect(callItTout()).toBeGreaterThan(480); expect(callItTout()).toBeLessThan(500);
  });
  it('L35 / L36 references', () => { expect(L35_HEAT_MIN).toBe(420); expect(L35_MINS_REF).toBe(1015); expect(L36_LOSS_REF).toBeGreaterThan(20000); });
  it('L37: the drifting meter is FI-102 on 60 seeds in both modes', () => {
    for (const mode of ['learner', 'engineer']) for (let seed = 1; seed <= 60; seed++) { const e = start('L37', seed, mode); expect(SPEC_BY_ID.L37!.callIt!.truth(e.state, SPEC_BY_ID.L37!.measures(e.state)), `${mode}/${seed}`).toBe(BIASED + 1); }
  });
});

describe('solvability and failure', () => {
  for (const id of IDS) {
    it(`${id}: solver wins with three stars in learner and engineer, naive fails, checkLevel clean`, () => {
      const level = LEVELS.find((l) => l.id === id)!;
      const r = checkLevel(GAME, level, { seed: 1003, cheeseDepth: 2, cheeseBudget: 400, randomRollouts: 4, randomTicks: 20, solverTicks: 45, idleTicks: 20 });
      expect(r.problems).toEqual([]);
      for (const mode of ['learner', 'engineer']) {
        const e = solve(id, { mode });
        expect(e.state.status, `${id}/${mode}`).toBe('won');
        expect(card(e).stars, `${id}/${mode}`).toEqual({ have: 3, earned: [true, true, true] });
        expect(GAME.invariants!(e.state, null)).toEqual([]);
        const n = naive(id, { mode });
        expect(n.state.status, `${id}/${mode} naive`).toBe('playing');
        expect(card(n).won).toBe(false); expect(card(n).histogram).toBeNull(); expect(card(n).cause, `${id}/${mode}`).toBeTypeOf('string');
        expect(info(n).goals.some((g: any) => !g.met)).toBe(true);
      }
      expect(info(solve(id, { mode: 'engineer' })).goals.map((g: any) => g.key)).toContain('budget');
    });
  }
  it('L37 is solved on several seeds in both modes', () => {
    for (const mode of ['learner', 'engineer']) for (const seed of [7, 11, 5, 99]) { const e = solve('L37', { seed, mode }); expect(e.state.status, `${mode}/${seed}`).toBe('won'); expect(card(e).stars.have).toBe(3); }
  });
  it('the naive verdicts name the failure (L34 gaps, L35 explosion, L36 gas, L37 wrong meter, L38 late)', () => {
    expect(card(naive('L34', { mode: 'engineer' })).verdictKey).toBe('gaps');
    expect(card(naive('L35', { mode: 'engineer' })).verdictKey).toBe('explosion');
    expect(card(naive('L36', { mode: 'engineer' })).verdictKey).toBe('gas');
    expect(card(naive('L37', { mode: 'engineer' })).verdictKey).toBe('wrong');
    expect(card(naive('L38', { mode: 'engineer' })).verdictKey).toBe('late');
  });
  it('the learner defaults alone (commission without touching anything) do not win any level', () => {
    for (const id of IDS) { const e = start(id); act(e, 'commission'); for (let i = 0; i < 40; i++) act(e, 'tick', 1); expect(e.state.status, id).toBe('playing'); }
  });
  it('L34: the safeguard that does not act on its deviation is the failure of a wrong-but-complete sheet', () => {
    const e = solve('L34', { mode: 'learner' }); expect(e.state.status).toBe('won');
    const bad = start('L34');
    for (const r of view(e).rows) lact(bad, 'addRow', r.param, r.guide, r.cause, r.cons, r.param === 'flow_bfw' && r.guide === 'no' ? 'tahh' : r.safe);
    act(bad, 'commission');
    expect(card(bad).verdictKey).toBe('guard');
  });
  it('F3a L34: a row with the wrong consequence class is not coverage; rows carry readable labels, not ids', () => {
    const e = solve('L34', { mode: 'learner' });
    const rows = view(e).rows as any[];
    const bad = start('L34');
    for (const r of rows) lact(bad, 'addRow', r.param, r.guide, r.cause, r.cons === 'operability' ? 'release' : 'operability', r.safe);
    const v = view(bad);
    expect(v.coverage.covered).toBeLessThan(v.coverage.needed);
    const a = view(e).rows[0];
    for (const k of ['paramLabel', 'guideLabel', 'causeLabel', 'consLabel', 'safeLabel']) expect(a[k], k).not.toMatch(/_|\//);
    expect(a.paramLabel).not.toBe(a.param);
  });
  it('F3a L38: the opening note says the plan starts late and over budget', () => { expect(info(start('L38')).note[0]).toMatch(/over budget/); });
  it('L35: a refused or hazardous card shows in the simulated trace of the view', () => {
    const e = start('L35'); for (const c of ['circ_on', 'heat_fast']) lact(e, 'add', c);
    const tr = view(e).trace; expect(tr.some((x: any) => x.kind === 'blocked')).toBe(true); expect(tr.some((x: any) => x.code === 'shock')).toBe(true);
  });
});

describe('Call-it grading at the oracle tolerance', () => {
  const grade = (id: string, v: number) => { const e = start(id); act(e, 'callIt', v); act(e, 'commission'); return card(e).callIt; };
  it('L34: 3 %', () => { const x = callItTout(); expect(grade('L34', x).ok).toBe(true); expect(grade('L34', x * 1.029).ok).toBe(true); expect(grade('L34', x * 1.05).ok).toBe(false); expect(grade('L34', 700).ok).toBe(false); });
  it('L35: 420 min +-5 %', () => { expect(grade('L35', 420).ok).toBe(true); expect(grade('L35', 440).ok).toBe(true); expect(grade('L35', 460).ok).toBe(false); });
  it('L36: the shortest safe job +-5 %', () => { expect(grade('L36', L36_LOSS_REF).ok).toBe(true); expect(grade('L36', L36_LOSS_REF * 1.04).ok).toBe(true); expect(grade('L36', L36_LOSS_REF * 1.2).ok).toBe(false); });
  it('L37: the meter number, exactly', () => { expect(grade('L37', 2).ok).toBe(true); expect(grade('L37', 3).ok).toBe(false); expect(grade('L37', 1).ok).toBe(false); });
  it('L38: the critical path 13 d +-5 %', () => { expect(grade('L38', 13).ok).toBe(true); expect(grade('L38', 13.5).ok).toBe(true); expect(grade('L38', 16).ok).toBe(false); });
});

describe('levelInfo, levelView, resultCard, equation, determinism', () => {
  for (const id of IDS) {
    it(`${id}: levelInfo shape, finite numbers, lesson with the player's numbers, equation evaluates`, () => {
      const e0 = start(id), i0 = info(e0);
      expect(allFinite(i0)).toBeNull();
      expect(i0.annunciators.length).toBeGreaterThanOrEqual(4); expect(i0.annunciators.length).toBeLessThanOrEqual(8);
      for (const a of i0.annunciators) { expect(a.legend.length).toBeLessThanOrEqual(14); expect(a.legend).toBe(a.legend.toUpperCase()); }
      expect(i0.annunciators.some((a: any) => a.key === 'goal')).toBe(true);
      expect(i0.coach).not.toBeNull(); expect(i0.note.length).toBeGreaterThanOrEqual(2); expect(i0.stars.rules.length).toBe(3); expect(i0.callIt.prompt.length).toBeGreaterThan(10);
      const e = solve(id, { mode: 'engineer' }), c = card(e);
      expect(allFinite(info(e))).toBeNull(); expect(allFinite(c)).toBeNull();
      expect(c.won).toBe(true); expect(c.histogram).not.toBeNull();
      expect(c.lesson).toMatch(/[0-9]/); expect(c.lesson).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(c.equation).toBeTypeOf('string'); expect(equationHolds(c.equation), c.equation).toBe(true);
      expect(c.metrics.length).toBe(3);
      expect(info(e).goals.every((g: any) => g.met)).toBe(true); expect(info(e).annunciators.find((a: any) => a.key === 'goal').state).toBe('normal');
    });
    it(`${id}: levelView is JSON-clean at the start and after the solver, with labels and finite numbers`, () => {
      for (const e of [start(id), solve(id, { mode: 'engineer' })]) {
        const v = view(e);
        expect(v.kind).toBe(KIND[id]);
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
        expect(allFinite(v)).toBeNull();
        expect(JSON.stringify(v)).not.toMatch(/lv\.L3[4-8]\./);   // every label is translated
      }
    });
    it(`${id}: deterministic (same actions give the same hash) and the solution code replays`, () => {
      const a = solve(id, { mode: 'engineer' }), b = solve(id, { mode: 'engineer' });
      expect(hashOf(a.state)).toBe(hashOf(b.state)); expect(card(a).designCode).toBe(card(b).designCode);
    });
  }
  it('worksheet edits are level-local state: they make the last run stale and change the numbers', () => {
    const e = start('L36', 1003, 'engineer');
    for (const c of ['close_in_1', 'close_in_2', 'close_out_1', 'bleed_in', 'depress', 'blind', 'drain', 'purge', 'gas_test', 'lock', 'open_up', 'clean']) lact(e, 'add', c);
    act(e, 'commission'); expect(e.state.solved).not.toBeNull(); const h1 = info(e).hero.value;
    lact(e, 'remove', 11); expect(e.state.solved).toBeNull();
    lact(e, 'add', 'clean'); act(e, 'commission'); expect(info(e).hero.value).toBeCloseTo(h1, 6);
    lact(e, 'move', 0, 1); expect(view(e).order[0].id).toBe('close_in_2');
    expect(view(e).order.length).toBe(12);
    expect(() => SPEC_BY_ID.L36!.actions!.add!(e.state, 'no_such_card')).toThrow();
  });
  it('L37: the z table stays hidden until the reconciliation is run; L34: a deviation reveals its numbers once simulated', () => {
    const e = start('L37'); expect(view(e).meters[0].z).toBeNull(); lact(e, 'reconcile'); expect(view(e).meters[BIASED].z).toBeGreaterThan(3.29);
    const h = start('L34'); expect(view(h).cells.find((c: any) => c.param === 'flow_bfw' && c.guide === 'no').sim).toBeNull();
    lact(h, 'simulate', 'flow_bfw', 'no'); expect(view(h).cells.find((c: any) => c.param === 'flow_bfw' && c.guide === 'no').sim.cls).toBe('release');
  });
});
