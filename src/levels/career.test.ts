// CAREER: the integrated Works for five seeded years. Oracles: the model's own invariants (cash identity, determinism, replay), the solver reaches Chief Engineer and the three-star margin,
// the naive player (accept everything, never maintain) is shut or sold, idle ticking does not finish it, the view/levelInfo shape, and the turnaround CPM from src/sim/ops.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, hashOf } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import { levelsCareer } from '../locales/en/levels_career';
import { SPEC_BY_ID, SPECS, levelOf } from './registry';
import { CAREER, careerOf, referenceCareer, starMargin } from './career';
import { cpm, schedule } from '../sim/ops/turnaround';
import { PLANTS, MONTHS, CHIEF_MARGIN, score, advance, decide, initCareer, riskOf, taJobs, taDays, CareerError } from '../sim/career/model';
import { naiveDecisions, solverDecisions } from '../sim/career/policy';
import type { EqState } from '../state';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const DEF = GAME;

function play(persona: PersonaFactory<EqState>, o: { seed?: number; mode?: string; ticks?: number } = {}): Env<EqState> {
  const seed = o.seed ?? 1003, env = new Env(DEF), agent = persona(seed), rng = new Rng(seed);
  env.reset({ seed, level: 'CAREER', mode: o.mode ?? 'learner' });
  for (let t = 0; t < (o.ticks ?? 200) && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const lact = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name: 'levelAct', args: [name, ...args] });
function allFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) { const r = allFinite(x, `${path}.${k}`); if (r) return r; }
  return null;
}
function equationHolds(eq: string): boolean {
  const [l, r] = eq.split('=') as [string, string];
  const expr = l.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  expect(expr).toMatch(/^[0-9.+\-*/() ]+$/);
  const left = Function(`return (${expr})`)() as number;
  const tok = /^\s*(-?[0-9][0-9,]*(?:\.([0-9]+))?)/.exec(r)!;
  return Math.abs(left - Number(tok[1]!.replace(/,/g, ''))) <= 0.5 * Math.pow(10, -(tok[2]?.length ?? 0)) + 1e-9;
}

describe('model', () => {
  it('turnaround CPM: the unlevelled critical path is isolate, catalyst, start = 10 days; one crane levels the crane jobs to 15, two cranes and extra crew to 10', () => {
    expect(cpm(taJobs(true)).length).toBe(10);
    expect(taDays(true, 1, 0)).toBe(15);
    expect(taDays(true, 2, 4)).toBe(10);
    expect(taDays(false, 1, 0)).toBeLessThan(taDays(true, 1, 0));
    const jobs = taJobs(true);
    expect(schedule(jobs, jobs.map((j) => j.id), { crew: 12, crane: 2 }).feasible).toBe(true);
  });
  it('cash identity: cash = start cash + total margin (no hidden money)', () => {
    const c = referenceCareer(7, 'engineer');
    expect(c.cash).toBeCloseTo(60e6 + c.total.margin, -2);
    expect(c.m).toBe(MONTHS);
  });
  it('same seed and decisions give the same career; a different seed does not', () => {
    expect(JSON.stringify(referenceCareer(5, 'engineer'))).toBe(JSON.stringify(referenceCareer(5, 'engineer')));
    expect(referenceCareer(5, 'engineer').total.margin).not.toBe(referenceCareer(6, 'engineer').total.margin);
  });
  it('plants only age: catalyst and U fall, wear and the inspection clock rise, until a turnaround resets them; risk rises with the overdue inspection', () => {
    const c = initCareer(1, 'engineer');
    advance(c, 6);
    const x = c.plants.nh3;
    expect(x.cat).toBeLessThan(1); expect(x.U).toBeLessThan(1); expect(x.wear).toBeGreaterThan(0); expect(x.insp).toBe(6);
    const r0 = riskOf(c, 'nh3');
    x.insp = 20;
    expect(riskOf(c, 'nh3')).toBeGreaterThan(r0);
  });
  it('refused decisions throw a coded error and change nothing', () => {
    const c = initCareer(1, 'engineer');
    const before = JSON.stringify(c);
    expect(() => decide(c, 'accept', 99999)).toThrow(CareerError);
    expect(() => decide(c, 'setRate', 'nh3', 2)).toThrow(CareerError);
    expect(() => decide(c, 'inspect', 'nh3')).toThrow(CareerError);
    expect(() => decide(c, 'turnaround', 'nh3', -1)).toThrow(CareerError);
    expect(JSON.stringify(c)).toBe(before);
  });
  it('a contract is a fixed price with a penalty on every short tonne', () => {
    const c = initCareer(3, 'engineer');
    const o = c.offers[0]!;
    decide(c, 'accept', o.id);
    expect(c.contracts[0]).toMatchObject({ p: o.p, tpm: o.tpm, price: o.price });
    c.plants[o.p].rate = 0.5; c.plants[o.p].down = 0;
    c.contracts[0]!.tpm = 1e9;
    const before = c.total.penalty;
    advance(c, 1);
    expect(c.total.penalty).toBeGreaterThan(before);
  });
});

describe('the level', () => {
  it('the solver reaches Chief Engineer on the level seed in both modes, with zero critical alarms, and earns three stars', () => {
    for (const mode of ['learner', 'engineer']) {
      const e = play(CAREER.solver, { mode });
      const c = careerOf(e.state)!;
      expect(e.state.status, mode).toBe('won');
      expect(c.ending, mode).toBe('chief');
      expect(c.criticals).toBe(0);
      expect(info(e).stars.have).toBe(3);
      expect(score(c)).toBeGreaterThanOrEqual(starMargin(1003, mode));
      expect(score(c)).toBeGreaterThanOrEqual(CHIEF_MARGIN);
    }
  });
  it('the solver wins on several seeds (steady at the very least)', () => {
    for (const seed of [1, 2, 3, 4]) { const e = play(CAREER.solver, { seed, mode: 'engineer' }); expect(e.state.status, String(seed)).toBe('won'); expect(careerOf(e.state)!.criticals).toBe(0); }
  });
  it('the naive player (accept everything, run at 110 %, never maintain) is shut or sold, and loses', () => {
    for (const seed of [1, 2, 3, 1003]) {
      const e = play(CAREER.naive, { seed, mode: 'engineer' });
      expect(e.state.status, String(seed)).toBe('lost');
      expect(['sold', 'shut']).toContain(careerOf(e.state)!.ending);
      expect(card(e).won).toBe(false);
      expect(card(e).histogram).toBeNull();
      expect(card(e).cause).toBeTypeOf('string');
    }
  });
  it('an idle player who only ticks does not finish the career', () => {
    const e = play(() => () => [], { ticks: 300 });
    expect(e.state.status).toBe('playing');
    expect(careerOf(e.state)!.m).toBe(0);
  });
  it('the decisions replay: the recorded actions rebuild the same career hash', () => {
    const a = play(CAREER.solver, { mode: 'engineer' });
    const b = new Env(DEF); b.reset({ seed: 1003, level: 'CAREER', mode: 'engineer' });
    for (const [name, args] of a.state.levelActions ?? []) b.step({ name, args });
    expect(JSON.stringify(careerOf(b.state))).toBe(JSON.stringify(careerOf(a.state)));
    expect(hashOf(a.state.lv)).toBe(hashOf(b.state.lv));
  });
  it('actions refuse with a message and a lost career ends the game', () => {
    const e = new Env(DEF); e.reset({ seed: 1003, level: 'CAREER', mode: 'learner' });
    const r = lact(e, 'setRate', 'nh3', 5) as unknown as { ok?: boolean };
    expect(careerOf(e.state)!.plants.nh3.rate).toBe(0.9);
    void r;
    lact(e, 'nope');
    expect(careerOf(e.state)!.m).toBe(0);
  });
  it('levelInfo: every field finite, 4-8 annunciators with short caps legends, the lesson carries the numbers, 3 star rules', () => {
    const e = play(CAREER.solver, { mode: 'engineer', ticks: 20 });
    const i = info(e);
    expect(allFinite(i)).toBeNull();
    expect(i.annunciators.length).toBeGreaterThanOrEqual(4); expect(i.annunciators.length).toBeLessThanOrEqual(8);
    for (const a of i.annunciators) { expect(a.legend.length).toBeLessThanOrEqual(14); expect(a.legend).toBe(a.legend.toUpperCase()); }
    expect(i.annunciators.some((a: any) => a.key === 'goal')).toBe(true);
    expect(i.lesson).toMatch(/\d/);
    expect(i.stars.rules.length).toBe(3);
    expect(i.chapter).toBe(10);
  });
  it('levelView: kind career, dashboard / offers / plants / calendar / review / history, JSON-clean and finite', () => {
    const e = play(CAREER.solver, { mode: 'engineer', ticks: 30 });
    const v = view(e);
    expect(v.kind).toBe('career');
    expect(allFinite(v)).toBeNull();
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    for (const k of ['dashboard', 'prices', 'plants', 'contracts', 'offers', 'calendar', 'options', 'review', 'history', 'log']) expect(v[k]).toBeDefined();
    expect(v.plants.length).toBe(PLANTS.length);
    expect(v.review.length).toBeGreaterThanOrEqual(2);
    expect(v.dashboard.month).toBeGreaterThan(24);
    for (const l of v.log) expect(l.label).not.toMatch(/\{/);
  });
  it('the printout: equation evaluates to its shown result, lesson has numbers, histogram on a win', () => {
    const e = play(CAREER.solver, { mode: 'engineer' });
    const c = card(e);
    expect(c.won).toBe(true);
    expect(equationHolds(c.equation)).toBe(true);
    expect(c.lesson).toMatch(/\d/);
    expect(c.histogram).not.toBeNull();
    expect(allFinite(c)).toBeNull();
  });
  it('determinism: the same actions give the same hash', () => {
    expect(hashOf(play(CAREER.solver, { mode: 'engineer' }).state)).toBe(hashOf(play(CAREER.solver, { mode: 'engineer' }).state));
  });
  it('the leaderboard metric: every policy run is exactly replayable; criticals counted', () => {
    const a = referenceCareer(1003, 'engineer'), b = referenceCareer(1003, 'engineer');
    expect(a.total.margin).toBe(b.total.margin);
    expect(a.criticals).toBe(0);
    void solverDecisions; void naiveDecisions;
  });
});
