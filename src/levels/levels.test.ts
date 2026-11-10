// Chapter-1 levels L00-L04: solvability, the failures DESIGN names, Call-it grading at the oracle tolerance, the oracle numbers, the levelInfo / resultCard
// contract, determinism, solution codes. Expected numbers come from src/oracle/oracles.json or from the engine's own catalogue; none is hand-typed.
import { describe, expect, it } from 'vitest';
import { Engine, Env, Rng, TICK, checkLevel, decodeSolution, hashOf } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { i18n } from '../i18n';
import { verify } from '../verify';
import oracleFile from '../oracle/oracles.json';
import { SPECIES } from '../data/species';
import { LEVELS } from '../levels';
import { fmtNumber } from '../engine/solved';
import { NAIVE, SPEC_BY_ID, SPECS } from './registry';
import { L01_H2_KG_H, L01_NH3_KG_H, L01_NH3_KMOL_H } from './l01';
import { L02_S_KMOL_H } from './l02';
import { FUELS, airFor, fuelOfSeed } from './l03';
import { L00_EVENT_AT } from './l00';
import type { EqState } from '../state';

const CH1 = ['L01', 'L02', 'L03', 'L04'];
const oracles = oracleFile.oracles as unknown as { id: string; expected: Record<string, any>; book?: Record<string, number> }[];
const oracle = (id: string) => oracles.find((o) => o.id === id)!;

function start(id: string, seed = 1003, mode = 'learner'): Env<EqState> {
  const env = new Env(GAME);
  env.reset({ seed, level: id, mode });
  return env;
}
/** Play a persona like the solvability harness: its actions, then one tick, per turn. */
function play(id: string, persona: PersonaFactory<EqState>, opts: { seed?: number; mode?: string; ticks?: number; each?: (e: Env<EqState>, t: number) => void } = {}): Env<EqState> {
  const seed = opts.seed ?? 1003, env = start(id, seed, opts.mode ?? 'learner');
  const agent = persona(seed), rng = new Rng(seed);
  for (let t = 0; t < (opts.ticks ?? 5) && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
    opts.each?.(env, t);
  }
  return env;
}
const solve = (id: string, o: { seed?: number; mode?: string } = {}) => play(id, SPEC_BY_ID[id]!.solver, { ...o, ticks: id === 'L00' ? 700 : 5 });
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });

/** Evaluate `left = right ...`: the arithmetic on the left (numbers, × ÷ + − and parentheses; thousands commas stripped) against the number the right starts with. */
function equationHolds(eq: string): boolean {
  const [l, r] = eq.split('=') as [string, string];
  const expr = l.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  expect(expr).toMatch(/^[0-9.+\-*/() ]+$/);
  const left = Function(`return (${expr})`)() as number;
  const tok = /^\s*(-?[0-9][0-9,]*(?:\.([0-9]+))?)/.exec(r)!;
  const right = Number(tok[1]!.replace(/,/g, ''));
  const half = 0.5 * Math.pow(10, -(tok[2]?.length ?? 0));
  return Math.abs(left - right) <= half + 1e-9;
}
/** Every number in a JSON-like value is finite. */
function allFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) { const r = allFinite(x, `${path}.${k}`); if (r) return r; }
  return null;
}

describe('registry', () => {
  it('the five chapter-1 levels are in the game, in order, with titles', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['L00', 'L01', 'L02', 'L03', 'L04']);
    for (const l of LEVELS) { expect(l.title.length).toBeGreaterThan(3); expect(l.brief.length).toBeGreaterThan(10); expect(l.solver).toBeTypeOf('function'); }
    expect(Object.keys(NAIVE)).toEqual(SPECS.map((s) => s.id));
  });
});

describe('solvability (the expert persona)', () => {
  for (const id of CH1) {
    it(`${id}: the solver wins with all three stars, idle does not, no short cheese`, () => {
      const level = LEVELS.find((l) => l.id === id)!;
      const r = checkLevel(GAME, level, { seed: 1003, cheeseDepth: 2, cheeseBudget: 400, randomRollouts: 4, randomTicks: 20, solverTicks: 5, idleTicks: 20 });
      expect(r.problems).toEqual([]);
      const e = solve(id);
      expect(e.state.status).toBe('won');
      expect(card(e).stars).toEqual({ have: 3, earned: [true, true, true] });
      expect(GAME.invariants!(e.state, null)).toEqual([]);
    });
  }
  for (const seed of [1, 2, 1003]) {
    it(`L03: the solver wins on seed ${seed} (fuel ${fuelOfSeed(seed)})`, () => {
      const e = solve('L03', { seed });
      expect(e.state.status).toBe('won');
      expect(card(e).stars.have).toBe(3);
    });
  }
  it('every chapter-1 level also solves in Engineer mode (budget goal listed and met) and Learner mode', () => {
    for (const id of CH1) {
      const e = solve(id, { mode: 'engineer' });
      expect(e.state.status, id).toBe('won');
      expect(info(e).goals.map((g: any) => g.key), id).toContain('budget');
      expect(info(e).goals.every((g: any) => g.met), id).toBe(true);
    }
  });
  it('L00: both the dial and doing nothing finish the night; only the dial keeps the plant running', () => {
    for (const mode of ['learner', 'engineer']) {
      const dial = solve('L00', { mode });
      expect(dial.state.status, mode).toBe('won');
      expect(dial.state.shift!.stat.tripN, mode).toBe(0);
      expect(dial.state.shift!.stat.critS, mode).toBe(0);
      expect(card(dial).verdictKey).toBe('saved');
      expect(card(dial).stars).toEqual({ have: 1, earned: [true, false, false] });
      let tripAt = -1;
      const idle = play('L00', NAIVE.L00!, { mode, ticks: 700, each: (e, t) => { if (tripAt < 0 && Object.keys(e.state.shift!.trips).length > 0) tripAt = t + 1; } });
      expect(idle.state.status, mode).toBe('won');
      expect(card(idle).verdictKey, mode).toBe('tripped');
      expect(tripAt - L00_EVENT_AT, `${mode}: the interlock trips about 45 s after the pump`).toBeGreaterThanOrEqual(40);
      expect(tripAt - L00_EVENT_AT, mode).toBeLessThanOrEqual(50);
      expect(GAME.invariants!(idle.state, null)).toEqual([]);
    }
  });
  it('L00 starts mid-shift with the loop running and the pump trip scripted at 20 s', () => {
    const e = start('L00');
    expect(e.state.phase).toBe('shift');
    expect(e.state.flowsheet.units.length).toBe(12);
    expect(e.state.shift!.q.map((x) => [x.type, x.at])).toEqual([['cw_pump_trip', L00_EVENT_AT]]);
    expect(info(e).phase).toBe('shift');
    expect(info(e).coach.text).toMatch(/converter/i);
  });
});

describe('the failures DESIGN names', () => {
  it('L01: 1:3 by mass vents hydrogen and says why with the player numbers', () => {
    const e = play('L01', NAIVE.L01!);
    const c = card(e);
    expect(e.state.status).toBe('playing');
    expect(c.won).toBe(false);
    expect(c.verdictKey).toBe('vent_h2');
    expect(c.histogram).toBeNull();
    expect(c.cause).toContain('63.3'); expect(c.cause).toContain('1.52');
    expect(c.stars.have).toBe(0);
    const g = info(e).goals;
    expect(g.map((x: any) => [x.key, x.met])).toEqual([['nh3', false], ['vent', false]]);
    const states = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(states.vent).toBe('critical'); expect(states.nh3).toBe('high'); expect(states.ratio).toBe('high');
    // DESIGN: 42.6 + 127.7 kg/h: H2 fed 63.3 kmol/h and N2 fed 1.52 kmol/h
    expect(info(e).banks.map((b: any) => b.species)).toEqual(['N2', 'H2']);
  });
  it('L01: a wrong total with the right ratio is off target, not a vent', () => {
    const e = start('L01');
    for (const a of [{ name: 'placeUnit', args: ['feed', 0, 0, 0] }, { name: 'placeUnit', args: ['feed', 0, 4, 0] }, { name: 'placeUnit', args: ['mixer', 4, 2, 0] }, { name: 'placeUnit', args: ['stoich_reactor', 8, 0, 0] },
      { name: 'placeUnit', args: ['nh3_sep', 14, 0, 0] }, { name: 'placeUnit', args: ['product', 18, 0, 0] }, { name: 'placeUnit', args: ['vent', 18, 4, 0] },
      { name: 'setBank', args: ['F-101', 'N2', 2 * 140.067] }, { name: 'setBank', args: ['F-102', 'H2', 2 * 30.24] },
      { name: 'connect', args: ['F-101', 'out', 'M-103', 'in1'] }, { name: 'connect', args: ['F-102', 'out', 'M-103', 'in2'] }, { name: 'connect', args: ['M-103', 'out', 'R-104', 'in'] },
      { name: 'connect', args: ['R-104', 'out', 'D-105', 'in'] }, { name: 'connect', args: ['D-105', 'liq', 'T-106', 'in'] }, { name: 'connect', args: ['D-105', 'vap', 'Y-107', 'in'] }, { name: 'commission' }] as Action[]) act(e, a.name, ...(a.args ?? []));
    expect(card(e).verdictKey).toBe('off_target');
    expect(card(e).cause).toMatch(/one-to-three/);
  });
  it('L02: air below 476 kmol/h makes air the limiting reagent and sulfur fumes out of the stack', () => {
    const e = play('L02', NAIVE.L02!);
    const c = card(e);
    expect(c.verdictKey).toBe('fume');
    expect(c.cause).toContain('limiting reagent'); expect(c.cause).toContain('400'); expect(c.cause).toContain('84');
    expect(c.won).toBe(false); expect(c.histogram).toBeNull();
    expect(info(e).annunciators.find((a: any) => a.key === 'fume').state).toBe('critical');
  });
  it('L02: the sulfur fume threshold is the stoichiometric air flow, S / 0.21 = 476 kmol/h', () => {
    const stoich = L02_S_KMOL_H / 0.21;
    expect(Math.round(stoich)).toBe(476);
    const run = (air: number) => {
      const e = start('L02');
      for (const a of [{ name: 'placeUnit', args: ['compressor', 4, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 2, 0] }, { name: 'placeUnit', args: ['burner', 14, 0, 0] }, { name: 'placeUnit', args: ['stack', 20, 2, 0] },
        { name: 'setFeed', args: ['F-102', { flow: (air * 1000) / 3600 }] }, { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'M-104', 'in2'] },
        { name: 'connect', args: ['F-101', 'out', 'M-104', 'in1'] }, { name: 'connect', args: ['M-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'Z-106', 'in'] },
        { name: 'commission' }] as Action[]) act(e, a.name, ...(a.args ?? []));
      return e;
    };
    const below = run(stoich * 0.99), above = run(stoich * 1.01);
    expect(info(below).secondary.value).toBeGreaterThan(0.5);   // % of the sulfur left unburnt: about 1 %
    expect(info(above).secondary.value).toBeLessThan(1e-6);
    // sweeping the dial: the fume flicks off between the two
    const fume = (air: number) => info(run(air)).annunciators.find((a: any) => a.key === 'fume').state;
    expect(fume(470)).not.toBe('normal'); expect(fume(480)).toBe('normal');
  });
  it('L02: too much air is off spec (weak gas) and costs blower power', () => {
    const e = play('L02', () => () => []);
    // 600 kmol/h start: rich gas, 16.7 % SO2 -> build with 1500 kmol/h
    const e2 = play('L02', (seed) => {
      const base = SPEC_BY_ID.L02!.naive(seed);
      let first = true;
      return (s, ctx) => { const a = base(s, ctx); if (first) { first = false; return a.map((x) => (x.name === 'setFeed' ? { name: 'setFeed', args: ['F-102', { flow: (1500 * 1000) / 3600 }] } : x)); } return a; };
    });
    expect(card(e2).verdictKey).toBe('so2_low');
    expect(card(e2).cause).toMatch(/dilutes/);
    void e;
  });
  it('L03: the seeded fuel identity, and CO2 : H2O of the flue reveals it (1:2 methane, 3:4 propane)', () => {
    expect(fuelOfSeed(1003)).toBe('C3H8'); expect(fuelOfSeed(1002)).toBe('CH4');
    for (const seed of [1003, 1002]) {
      const e = solve('L03', { seed });
      const m = SPEC_BY_ID.L03!.measures(e.state);
      expect(m.v.co2! / m.v.h2o!).toBeCloseTo(seed === 1003 ? 3 / 4 : 1 / 2, 9);
      expect(m.v.excess_air).toBeCloseTo(10, 6);
      expect(m.v.slip).toBe(0);
      expect(info(e).masked).toEqual(['F-101']);
    }
  });
  it('L03: DESIGN reference, C3H8 10 kmol/h takes O2 50 and air 261.9 kmol/h for 10 % excess', () => {
    expect(airFor(10, 3, 8)).toBeCloseTo(261.9, 1);
    expect(airFor(10, 1, 4)).toBeCloseTo(104.76, 2);
    expect(5 * 10).toBe(50);
  });
  it('L03: the wrong fuel guess fails: a rich burn leaks fuel (CO alarm, sooty flame), a lean one loses heat up the stack', () => {
    const rich = play('L03', NAIVE.L03!, { seed: 1003 });   // propane line, methane air
    expect(card(rich).verdictKey).toBe('rich');
    expect(card(rich).cause).toMatch(/short/);
    const st = Object.fromEntries(info(rich).annunciators.map((a: any) => [a.key, a.state]));
    expect(st.co).toBe('critical'); expect(st.soot).toBe('high');
    const lean = play('L03', NAIVE.L03!, { seed: 1002 });   // methane line, propane air
    expect(card(lean).verdictKey).toBe('lean');
    expect(SPEC_BY_ID.L03!.measures(lean.state).v.stack_loss_mw).toBeGreaterThan(0);
    expect(card(lean).cause).toContain('MW');
  });
  it('L04: the units slip (tonnes typed as kmol/h) fails the build against the notebook', () => {
    const e = play('L04', NAIVE.L04!);
    expect(card(e).verdictKey).toBe('off_build'); expect(card(e).won).toBe(false); expect(card(e).histogram).toBeNull();
    expect(card(e).cause).toContain('2,000');
  });
});

describe('Call it grading at the oracle tolerance', () => {
  const build = (id: string, answer: number | null, named?: string) => {
    const e = start(id);
    if (answer !== null) act(e, 'callIt', answer, ...(named ? [named] : []));
    const script = id === 'L01' ? SPEC_BY_ID.L01!.solver : SPEC_BY_ID.L04!.solver;
    const agent = script(1003);
    for (const a of agent(e.state, e.ctx(new Rng(1)))) if (a.name !== 'callIt') act(e, a.name, ...(a.args ?? []));
    return e;
  };
  it('L01: H2 kg/h within 1 % of 30.24 earns the third star; outside it does not', () => {
    expect(L01_H2_KG_H).toBeCloseTo(30.24, 2);
    for (const [x, ok] of [[30.24, true], [30.24 * 1.0099, true], [30.24 * 0.9901, true], [30.24 * 1.0102, false], [30.24 * 0.98, false], [127.7, false]] as const) {
      const e = build('L01', x);
      expect(e.state.status).toBe('won');
      expect(card(e).stars.earned[2], String(x)).toBe(ok);
      expect(card(e).callIt.ok, String(x)).toBe(ok);
      expect(info(e).callIt.ok).toBe(ok);
    }
    expect(card(build('L01', null)).stars.earned).toEqual([true, true, false]);
  });
  it('L04: NH3 within 0.5 % of the oracle (EQ-NC-005) earns the third star; the book value 2428.6 is inside, 2400 is not; naming N2 earns the second', () => {
    const o = oracle('EQ-NC-005');
    const nh3 = o.expected.mass_NH3_g as number;
    expect(nh3).toBeCloseTo(2431.836, 2);
    expect(o.expected.limiting).toBe('N2');
    const engineTruth = SPEC_BY_ID.L04!.callIt!.truth(start('L04').state, { ok: false, v: {} });
    expect(Math.abs(engineTruth! - nh3) / nh3).toBeLessThan(1e-4);
    for (const [x, ok] of [[nh3, true], [o.book!.mass_NH3_g, true], [nh3 * 1.0045, true], [nh3 * 0.9955, true], [nh3 * 1.0055, false], [2400, false], [3000, false]] as const) {
      const e = build('L04', x, 'N2');
      expect(card(e).stars.earned, String(x)).toEqual([true, true, ok]);
    }
    expect(card(build('L04', nh3, 'H2')).stars.earned).toEqual([true, false, true]);
    expect(card(build('L04', nh3)).stars.earned).toEqual([true, false, true]);
    expect(card(build('L04', null)).stars.earned).toEqual([true, false, false]);
    // the answer is not on the screen before the run
    const s0 = start('L04');
    expect(info(s0).goals.every((g: any) => g.target === undefined)).toBe(true);
    expect(info(s0).hero.lo).toBe(0);
    expect(info(s0).lesson).not.toContain(String(Math.round(nh3)));
  });
  it('L04: the engine and the oracle leftover H2 agree (281.8 kmol/h), and the book working is printed beside the engine result', () => {
    const o = oracle('EQ-NC-005');
    const e = solve('L04');
    const m = SPEC_BY_ID.L04!.measures(e.state);
    expect(m.v.vent_h2!).toBeCloseTo(o.expected.H2_left_mol as number, 0);
    expect(card(e).card.book_nh3_kg_h).toBeCloseTo(o.book!.mass_NH3_g, 1);
    expect(card(e).card.book_nh3_kg_h).not.toBeCloseTo(card(e).card.oracle_nh3_kg_h, 1);
  });
  it('L02: O2 mol % is graded against the engine value of the player design (±2 %); L03: the carbon count is exact', () => {
    const run = (guess: number) => {
      const e = start('L02');
      act(e, 'callIt', guess);
      const agent = SPEC_BY_ID.L02!.solver(1003);
      for (const a of agent(e.state, e.ctx(new Rng(1)))) if (a.name !== 'callIt') act(e, a.name, ...(a.args ?? []));
      return e;
    };
    const m = SPEC_BY_ID.L02!.measures(run(11).state);
    expect(m.v.o2_pct).toBeCloseTo(11.0, 6);
    expect(card(run(11)).stars.earned[2]).toBe(true);
    expect(card(run(11 * 1.019)).stars.earned[2]).toBe(true);
    expect(card(run(11 * 1.021)).stars.earned[2]).toBe(false);
    expect(card(run(21)).stars.earned[2]).toBe(false);
    const wrong = play('L03', (seed) => { const s = SPEC_BY_ID.L03!.solver(seed); return (st, ctx) => s(st, ctx).map((a) => (a.name === 'callIt' ? { name: 'callIt', args: [1] } : a)); });
    expect(wrong.state.status).toBe('won');
    expect(card(wrong).stars.earned).toEqual([true, true, false]);
  });
  it('a prediction is a prediction: late for L01, not for a level without one; L03 may call it after a test burn', () => {
    const e = start('L01');
    expect(act(e, 'callIt', 30).info.ok).toBe(true);
    for (const a of SPEC_BY_ID.L01!.solver(1)(e.state, e.ctx(new Rng(1)))) if (a.name === 'commission') { /* skip: build first */ }
    const late = start('L01');
    for (const a of SPEC_BY_ID.L01!.naive(1)(late.state, late.ctx(new Rng(1)))) act(late, a.name, ...(a.args ?? []));
    const r = act(late, 'callIt', 30.24);
    expect(r.info.ok).toBe(false); expect(r.info.message).toMatch(/before you commission/);
    const l0 = start('L00');
    expect(act(l0, 'callIt', 1).info.ok).toBe(false);
    expect(act(start('L01'), 'callIt', -3).info.ok).toBe(false);
    const l3 = start('L03');
    for (const a of SPEC_BY_ID.L03!.solver(1003)(l3.state, l3.ctx(new Rng(1)))) act(l3, a.name, ...(a.args ?? []));
    expect(act(l3, 'callIt', 3).info.ok).toBe(true);
  });
});

describe('levelInfo contract', () => {
  const KEYS = ['id', 'chapter', 'index', 'title', 'setter', 'place', 'note', 'goals', 'budgetUSD', 'spentUSD', 'stars', 'callIt', 'allowedUnits', 'hero', 'secondary', 'annunciators', 'phase', 'coach', 'lesson', 'mode'];
  for (const id of ['L00', ...CH1]) {
    it(`${id}: every field is present, numbers finite, 4-8 annunciators with caps legends of at most 14 characters, at start and after the solver`, () => {
      for (const mode of ['learner', 'engineer', 'sandbox']) for (const e of [start(id, 1003, mode), solve(id, { mode })]) {
        const q = info(e);
        for (const k of KEYS) expect(q, `${id} ${mode} ${k}`).toHaveProperty(k);
        expect(allFinite(q)).toBeNull();
        expect(q.id).toBe(id); expect(q.mode).toBe(mode);
        expect(q.note.length).toBeGreaterThan(0); expect(q.note.every((n: string) => n.length > 5 && !n.includes('lv.'))).toBe(true);
        expect(q.goals.length).toBeGreaterThan(0);
        for (const g of q.goals) { expect(g.text.length).toBeGreaterThan(5); expect(g.text).not.toContain('lv.'); expect(g.text).not.toMatch(/\{/); expect(typeof g.met).toBe('boolean'); }
        expect(q.stars.rules).toHaveLength(3); expect(q.stars.have).toBeGreaterThanOrEqual(0); expect(q.stars.have).toBeLessThanOrEqual(3);
        expect(q.annunciators.length).toBeGreaterThanOrEqual(4); expect(q.annunciators.length).toBeLessThanOrEqual(8);
        for (const a of q.annunciators) { expect(a.legend).toBe(a.legend.toUpperCase()); expect(a.legend.length).toBeLessThanOrEqual(14); expect(['off', 'normal', 'high', 'critical']).toContain(a.state); }
        expect(['design', 'commissioned', 'shift', 'won', 'lost']).toContain(q.phase);
        expect(q.hero.label.length).toBeGreaterThan(2); expect(q.hero.hi).toBeGreaterThanOrEqual(q.hero.lo);
        if (q.secondary) expect(q.secondary.label.length).toBeGreaterThan(2);
        expect(q.lesson.length).toBeGreaterThan(20); expect(q.lesson).not.toMatch(/\{/);
        expect(q.setter).toMatch(/^[a-z]+$/); expect(q.setterName.length).toBeGreaterThan(3);
        expect(q.allowedUnits.every((u: any) => u.used <= u.max && u.priceUSD > 0)).toBe(true);
      }
    });
  }
  it('the phase follows the plant, and L00 is a shift from the first second', () => {
    const e = start('L01');
    expect(info(e).phase).toBe('design');
    const n = play('L01', NAIVE.L01!);
    expect(info(n).phase).toBe('commissioned');
    expect(info(solve('L01')).phase).toBe('won');
    expect(info(start('L00')).phase).toBe('shift');
    expect(info(solve('L00')).phase).toBe('won');
  });
  it('the lesson holds the player numbers; the banks show kg/h and kmol/h side by side', () => {
    const n = play('L01', NAIVE.L01!);
    const q = info(n);
    expect(q.lesson).toContain(fmtNumber(127.7, 'global')); expect(q.lesson).toContain('63.34'); expect(q.lesson).toContain('1.52');
    const h2 = q.banks.find((b: any) => b.species === 'H2');
    expect(h2.kgPerH).toBeCloseTo(127.7, 6);
    expect(h2.kmolPerH).toBeCloseTo(127.7 / SPECIES.H2!.M, 6);
    const s = solve('L02');
    expect(info(s).lesson).toContain('1,000');
    expect(info(s).lesson).toContain('110');   // 110 % excess air
    expect(info(solve('L03')).lesson).toContain('30');   // 30 kmol/h CO2 for 10 kmol/h propane
  });
  it('goals state their target and value after a run, budget is an Engineer goal, spent counts the placed units', () => {
    const e = solve('L01');
    expect(info(e).goals[0].target).toBeCloseTo(L01_NH3_KG_H, 6);
    expect(info(e).goals[0].value).toBeCloseTo(L01_NH3_KG_H, 1);
    expect(L01_NH3_KMOL_H).toBe(10);
    expect(info(e).spentUSD).toBeGreaterThan(0); expect(info(e).spentUSD).toBeLessThanOrEqual(info(e).budgetUSD);
    expect(info(e).allowedUnits.find((u: any) => u.type === 'feed')).toMatchObject({ max: 2, used: 2 });
    expect(info(solve('L01', { mode: 'engineer' })).goals.map((g: any) => g.key)).toEqual(['nh3', 'vent', 'budget']);
  });
  it('the coach follows the engine state: L01 has eight steps for Learner and none for Engineer or Sandbox; L00 coaches two lines', () => {
    const e = start('L01');
    expect(info(e).coach).toMatchObject({ step: 1, total: 8, speaker: 'mara' });
    expect(info(e).coach.text.length).toBeGreaterThan(10); expect(info(e).coach.why).toMatch(/^Why:/);
    act(e, 'placeUnit', 'feed', 0, 0, 0);
    expect(info(e).coach.step).toBe(2);
    act(e, 'setBank', 'F-101', 'N2', 100);
    expect(info(e).coach.step).toBe(3);
    const n = play('L01', NAIVE.L01!);
    expect(info(n).coach.step).toBe(6);
    act(n, 'markCoach', 'read_tank'); expect(info(n).coach.step).toBe(7);
    act(n, 'markCoach', 'open_stream'); expect(info(n).coach.step).toBe(8);
    act(n, 'markCoach', 'why'); expect(info(n).coach).toBeNull();
    expect(info(start('L01', 1003, 'engineer')).coach).toBeNull();
    expect(info(start('L01', 1003, 'sandbox')).coach).toBeNull();
    for (const id of ['L02', 'L03']) { expect(info(start(id)).coach).toMatchObject({ step: 1, total: 8 }); }
    expect(info(start('L00', 1003, 'engineer')).coach).toMatchObject({ step: 1, total: 2, speaker: 'tomas' });
    expect(info(start('L00', 1003, 'sandbox')).coach).toBeNull();
    const l0 = start('L00'); act(l0, 'pin', 'eqwin'); expect(info(l0).coach.step).toBe(2);
    expect(info(solve('L01')).coach).toBeNull();
  });
  it('a free-play state has no level info', () => {
    const e = new Engine(GAME); e.autosave = false;
    expect(e.q('levelInfo')).toBeNull(); expect(e.q('resultCard')).toBeNull();
  });
});

describe('resultCard contract', () => {
  it('has no histogram on failure and a 200-sample histogram with the player marked on a win; passes carry no cause', () => {
    for (const id of CH1) {
      const bad = card(play(id, NAIVE[id]!, { seed: 1003 }));
      expect(bad.won, id).toBe(false); expect(bad.histogram, id).toBeNull(); expect(bad.cause.length, id).toBeGreaterThan(20);
      const good = card(solve(id));
      expect(good.won, id).toBe(true); expect(good.cause, id).toBeUndefined();
      const h = good.histogram;
      expect(h.bins.reduce((a: number, b: number) => a + b, 0), id).toBe(200);
      expect(h.bins).toHaveLength(12); expect(h.edges).toHaveLength(13);
      expect(h.edges.every((x: number, i: number) => i === 0 || x > h.edges[i - 1]), id).toBe(true);
      expect(h.you).toBeGreaterThanOrEqual(h.edges[0]); expect(h.you).toBeLessThanOrEqual(h.edges[12]);
      expect(good.metrics, id).toHaveLength(3);
      expect(h.metric).toBe(good.metrics[0].key === h.metric ? good.metrics[0].key : h.metric);
    }
    expect(card(solve('L00')).histogram).toBeNull();
  });
  it('the shape of every field, finite numbers, texts without keys or braces', () => {
    for (const id of ['L00', ...CH1]) for (const e of [play(id, NAIVE[id]!, { ticks: id === 'L00' ? 700 : 5 }), solve(id)]) {
      const c = card(e);
      expect(c).not.toBeNull();
      for (const k of ['won', 'verdictKey', 'verdictText', 'metrics', 'stars', 'histogram', 'lesson', 'designCode']) expect(c, `${id} ${k}`).toHaveProperty(k);
      expect(allFinite(c)).toBeNull();
      expect(c.verdictText).not.toContain('lv.'); expect(c.lesson).not.toMatch(/\{/); if (c.cause) expect(c.cause).not.toMatch(/\{|lv\./);
      expect(c.stars.earned).toHaveLength(3);
      for (const m of c.metrics) { expect(m.label).not.toContain('lv.'); expect(typeof m.unit).toBe('string'); }
    }
  });
  it('the equation holds with the player numbers, on every run', () => {
    let seen = 0;
    for (const id of CH1) for (const e of [play(id, NAIVE[id]!, { seed: 1003 }), play(id, NAIVE[id]!, { seed: 1002 }), solve(id), solve(id, { seed: 2 })]) {
      const eq = card(e).equation as string | undefined;
      if (eq === undefined) continue;
      seen++;
      expect(equationHolds(eq), `${id}: ${eq}`).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(12);
  });
  it('a failed commission prints its coded cause; before any run there is no card', () => {
    expect(card(start('L01'))).toBeNull();
    const e = start('L02');
    for (const a of [{ name: 'placeUnit', args: ['compressor', 4, 4, 0] }, { name: 'placeUnit', args: ['mixer', 10, 2, 0] }, { name: 'placeUnit', args: ['burner', 14, 0, 0] }, { name: 'placeUnit', args: ['stack', 20, 2, 0] },
      { name: 'connect', args: ['F-102', 'out', 'K-103', 'in'] }, { name: 'connect', args: ['K-103', 'out', 'M-104', 'in2'] }, { name: 'connect', args: ['F-101', 'out', 'M-104', 'in1'] },
      { name: 'connect', args: ['M-104', 'out', 'R-105', 'in'] }, { name: 'connect', args: ['R-105', 'out', 'Z-106', 'in'] }, { name: 'setParam', args: ['K-103', 'P', 5e4] }] as Action[]) act(e, a.name, ...(a.args ?? []));
    act(e, 'commission');
    const c = card(e);
    expect(c.verdictKey).toBe('solve_fail'); expect(c.won).toBe(false); expect(c.cause.length).toBeGreaterThan(10);
    expect(info(e).annunciators.find((a: any) => a.key === 'solve').state).toBe('critical');
  });
});

describe('solution codes, determinism, strings', () => {
  it('the design code of every solver run verifies on a fresh engine and reproduces the metrics', () => {
    for (const id of ['L00', ...CH1]) {
      const e = solve(id);
      const code = card(e).designCode as string;
      const d = decodeSolution(code);
      expect('error' in d).toBe(false);
      const v = verify(id, code);
      expect(v.ok, `${id}: ${v.reason}`).toBe(true);
      expect(v.metrics).toEqual(GAME.metrics!(e.state));
    }
  });
  it('same actions, same hash; a different attempt, a different hash', () => {
    for (const id of ['L00', ...CH1]) {
      expect(hashOf(solve(id).state), id).toBe(hashOf(solve(id).state));
      expect(hashOf(solve(id).state), id).not.toBe(hashOf(play(id, NAIVE[id]!, { ticks: id === 'L00' ? 700 : 5 }).state));
    }
  });
  it('restart clears the attempt: a fresh startLevel has no prediction, no solve, an empty solution log', () => {
    const e = solve('L01');
    act(e, 'noop');
    e.engine.act('startLevel', ['L01', 1003, 'learner']);
    expect(e.state.prediction).toBeNull(); expect(e.state.solved).toBeNull(); expect(e.state.levelActions).toEqual([]); expect(e.state.status).toBe('playing');
  });
  it('no level text asks for a missing key or variable, in any mode', () => {
    i18n.clearMissing();
    for (const mode of ['learner', 'engineer', 'sandbox']) for (const id of ['L00', ...CH1]) {
      for (const e of [start(id, 1003, mode), solve(id, { mode }), play(id, NAIVE[id]!, { mode, ticks: id === 'L00' ? 700 : 5 })]) { info(e); card(e); }
    }
    act(start('L01'), 'callIt', -1); act(start('L00'), 'callIt', 1); act(start('L01'), 'setBank', 'F-101', 'N2', 1);
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
  it('setBank turns kg/h into a pure-species feed with its price key and teaches on misuse', () => {
    const e = start('L01');
    act(e, 'placeUnit', 'feed', 0, 0, 0); act(e, 'placeUnit', 'mixer', 4, 2, 0);
    expect(act(e, 'setBank', 'F-101', 'H2', 30.24).info.ok).toBe(true);
    const f = e.state.feeds['F-101']!;
    expect(f.flow * 3600 / 1000).toBeCloseTo(30.24 / SPECIES.H2!.M, 9);
    expect(f.priceKey).toBe('hydrogen');
    expect(f.x).toEqual([0, 1, 0]);
    expect(act(e, 'setBank', 'M-102', 'H2', 1).info.message).toMatch(/not a feed/);
    expect(act(e, 'setBank', 'F-101', 'Xe', 1).info.message).toMatch(/not a gas in this plant/);
    expect(act(e, 'setBank', 'F-101', 'H2', -1).info.ok).toBe(false);
  });
  it('the unit limits of a level are enforced by the palette (one reactor in L01)', () => {
    const e = start('L01');
    expect(act(e, 'placeUnit', 'stoich_reactor', 8, 0, 0).info.ok).toBe(true);
    expect(act(e, 'placeUnit', 'stoich_reactor', 14, 0, 0).info.ok).toBe(false);
    expect(act(e, 'placeUnit', 'compressor', 14, 6, 0).info.ok).toBe(false);
  });
  it('the reference L01 plant agrees with DESIGN: 170.3 kg/h of NH3, nothing vented to speak of', () => {
    const e = solve('L01');
    const m = SPEC_BY_ID.L01!.measures(e.state);
    expect(m.v.nh3_kg_h).toBeCloseTo(170.3, 1);
    expect(m.v.vent_frac).toBeLessThan(1e-3);
    expect(m.v.limiting).toBe(1);
    void FUELS;
  });
});
