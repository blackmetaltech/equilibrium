// Chapter 8 (The Control Room), L29-L33: the solver wins with three stars, the naive player fails the way the level says, the analytic oracles of the rigs hold, Call-it grading, levelInfo /
// resultCard shape, the equation evaluates, determinism. Expected numbers are analytic or the rig's own reference runs; none is hand-typed.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, hashOf } from '@core/kit';
import type { PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { LEVELS } from '../levels';
import { NAIVE, SPEC_BY_ID } from './registry';
import { L29, L29_IAE_REF, L29_REF } from './l29';
import { L30, L30_IAE_REF, L30_REF, l30Fit } from './l30';
import { L31, L31_H2_REF } from './l31';
import { L32, L32_IAE_REF, l32OpenLoopRise } from './l32';
import { L33, L33_COST_REF, L33_REF, designOf } from './l33';
import { L29_RIG, l29Offset, runL29, runL30, runL31, runL32, L30_PROC } from '../sim/control/rigs';
import { ACTIONS, COST, CSTR, SCENARIOS, evaluate, runScenario, secondsToCritical } from '../sim/control/cstr';
import { imcPI } from '../sim/control';
import type { EqState } from '../state';

const IDS = ['L29', 'L30', 'L31', 'L32', 'L33'];
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
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
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
/** Dial value by index of the pre-placed dial units. */
const dial = (e: Env<EqState>, i: number): number => (e.state.lv.dials as number[])[i]!;

describe('registry', () => {
  it('the five levels are in the game with titles, in chapter 8', () => {
    for (const id of IDS) { const l = LEVELS.find((x) => x.id === id)!; expect(l.title.length).toBeGreaterThan(3); expect(SPEC_BY_ID[id]!.chapter).toBe(8); expect(l.solver).toBeTypeOf('function'); }
  });
});

describe('rig oracles', () => {
  it('L29: P-only offset is dq / Kc (to 0.01 %), the closed loop is stable, integral removes it', () => {
    for (const kc of [1, 2, 4, 8]) expect(runL29(kc, 0).offsetPct).toBeCloseTo(l29Offset(kc), 2);
    expect(l29Offset(2)).toBe((L29_RIG.qin1 - L29_RIG.qin0) / 2);
    expect(runL29(4, 60).offsetPct).toBeLessThan(0.05);
    expect(runL29(8, 20).overshootPct).toBeGreaterThan(20);   // integral pushed hard rings
    expect(runL29(4, 60).overshootPct).toBeLessThan(1);
  });
  it('L30: the bump test recovers K, tau, theta to 3 %, IMC gain is tau / (K (lambda + theta))', () => {
    const fit = l30Fit();
    expect(Math.abs(fit.K - L30_PROC.K) / L30_PROC.K).toBeLessThan(0.03);
    expect(Math.abs(fit.tau - L30_PROC.tau) / L30_PROC.tau).toBeLessThan(0.03);
    expect(Math.abs(fit.theta - L30_PROC.theta)).toBeLessThan(0.5);
    expect(L30_REF.kc).toBeCloseTo(45 / (1.8 * (12 + 12)), 12);
    expect(runL30(L30_REF.kc, L30_REF.tauI, 0).satShare).toBe(0);
    expect(runL30(1, 0, 0).iae).toBeGreaterThan(5 * L30_IAE_REF);   // P-only never reaches the set point
    expect(runL30(8, 5, 0).satShare).toBeGreaterThan(0.1);   // aggressive: the heater hits its stops
  });
  it('L31: a fixed H2 flow vents several per cent of the H2, the ratio station under 1.5 %, a ratio above 3 vents H2, below 3 vents N2', () => {
    expect(runL31(false, 3, 0.3, 10).ventH2Pct).toBeGreaterThan(5);
    expect(L31_H2_REF).toBeLessThan(1.5);
    expect(runL31(true, 3.1, 1.5, 6).ventH2Pct).toBeGreaterThan(runL31(true, 3, 1.5, 6).ventH2Pct * 2);
    const low = runL31(true, 2.7, 1.5, 6);
    expect(low.ventN2).toBeGreaterThan(low.ventH2);
  });
  it('L32: the cascade rejects the header sag (>10x smaller peak), open-loop rise is K x 20 = 24 K', () => {
    expect(l32OpenLoopRise()).toBeCloseTo(24, 12);
    const single = runL32(false, 1, 100, 0, 0), casc = runL32(true, 1.5, 150, 2, 6);
    expect(single.hdrPeak).toBeGreaterThan(8);
    expect(casc.hdrPeak).toBeLessThan(single.hdrPeak / 10);
    expect(casc.iae).toBeLessThan(single.iae / 3);
  });
  it('L33: no trip -> failure in about 98 s; the five cases behave; the story of the three final elements holds', () => {
    expect(secondsToCritical()).toBeGreaterThan(60); expect(secondsToCritical()).toBeLessThan(150);
    const open = runScenario(SCENARIOS[0]!, null);
    expect(open.crit).toBe(true); expect(open.critAt - CSTR.lossAt).toBe(secondsToCritical());
    const ref = evaluate(designOf([L33_REF.sensors, L33_REF.k, L33_REF.tripC, L33_REF.action]));
    expect(ref.misses).toBe(0); expect(ref.spurious).toBe(0);
    expect(L33_COST_REF).toBeCloseTo(0.7 * (COST.trip + COST.dump), 6);   // the two demands (0.5 + 0.2 per year) trip once each
    const ev = (n: number, k: number, trip: number, a: number) => evaluate(designOf([n, k, trip, a]));
    expect(ev(1, 1, 89, 3).misses).toBeGreaterThan(0); expect(ev(1, 1, 89, 3).spurious).toBeGreaterThan(0);   // 1oo1: stuck low blinds it, stuck high trips it
    expect(ev(2, 2, 89, 3).misses).toBeGreaterThan(0);   // 2oo2: a stuck-low sensor blinds it
    expect(ev(2, 1, 89, 3).spurious).toBeGreaterThan(0); // 1oo2: spikes trip it
    expect(ev(3, 2, 89, 1).misses).toBeGreaterThan(0);   // cut feed: too slow
    expect(ev(3, 2, 89, 2).misses).toBeGreaterThan(0);   // full coolant: no coolant to boost
    expect(ev(3, 2, 70, 3).spurious).toBeGreaterThan(0); // trip below the upset peak
    expect(ev(3, 2, 105, 3).misses).toBeGreaterThan(0);  // trip too late
    expect(ACTIONS.length).toBe(3);
  });
  it('L33: the working window of trip points with the dump is 82-98 degC', () => {
    const ok = (c: number) => { const e = evaluate(designOf([3, 2, c, 3])); return e.misses === 0 && e.spurious === 0; };
    expect(ok(81)).toBe(false); expect(ok(82)).toBe(true); expect(ok(89)).toBe(true); expect(ok(98)).toBe(true); expect(ok(99)).toBe(false);
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
        expect(card(n).won).toBe(false);
        expect(card(n).histogram).toBeNull();
        expect(card(n).cause, `${id}/${mode}`).toBeTypeOf('string');
        expect(info(n).goals.some((g: any) => !g.met)).toBe(true);
      }
      expect(info(solve(id, { mode: 'engineer' })).goals.map((g: any) => g.key)).toContain('budget');
    });
  }
  it('the naive verdicts name the failure of the design (L29 offset, L30 slow, L31 fixed, L32 single, L33 blind or late)', () => {
    expect(card(naive('L29', { mode: 'engineer' })).verdictKey).toBe('offset');
    expect(card(naive('L30', { mode: 'engineer' })).verdictKey).toBe('slow');
    expect(card(naive('L31', { mode: 'engineer' })).verdictKey).toBe('fixed');
    expect(card(naive('L32', { mode: 'engineer' })).verdictKey).toBe('single');
    expect(card(naive('L33', { mode: 'engineer' })).verdictKey).toBe('miss_late');
  });
  it('the learner defaults alone (commission without touching a dial) do not win any level', () => {
    for (const id of IDS) { const e = start(id); act(e, 'commission'); for (let i = 0; i < 40; i++) act(e, 'tick', 1); expect(e.state.status, id).toBe('playing'); }
  });
});

describe('Call-it grading at the oracle tolerance', () => {
  const grade = (id: string, v: number) => { const e = start(id); act(e, 'callIt', v); act(e, 'commission'); return card(e).callIt; };
  it('L29: 5 % +-5 %', () => { expect(grade('L29', 5).ok).toBe(true); expect(grade('L29', 5.2).ok).toBe(true); expect(grade('L29', 5.4).ok).toBe(false); expect(grade('L29', 10).ok).toBe(false); });
  it('L30: the IMC gain 1.04 +-5 %', () => { const k = imcPI(L30_PROC, 12).kc; expect(grade('L30', k).ok).toBe(true); expect(grade('L30', k * 1.04).ok).toBe(true); expect(grade('L30', k * 1.08).ok).toBe(false); });
  it('L31: ratio 3 +-1 %', () => { expect(grade('L31', 3).ok).toBe(true); expect(grade('L31', 3.02).ok).toBe(true); expect(grade('L31', 3.1).ok).toBe(false); expect(grade('L31', 0.216).ok).toBe(false); });
  it('L32: 24 K +-5 %', () => { expect(grade('L32', 24).ok).toBe(true); expect(grade('L32', 25).ok).toBe(true); expect(grade('L32', 20).ok).toBe(false); });
  it('L33: seconds to the failure temperature +-10 %', () => { const s = secondsToCritical(); expect(grade('L33', s).ok).toBe(true); expect(grade('L33', s * 1.09).ok).toBe(true); expect(grade('L33', s * 1.2).ok).toBe(false); });
});

describe('levelInfo, resultCard, equation, determinism', () => {
  for (const id of IDS) {
    it(`${id}: levelInfo shape, finite numbers, lesson with the player's numbers, equation evaluates`, () => {
      const e0 = start(id);
      const i0 = info(e0);
      expect(allFinite(i0)).toBeNull();
      expect(i0.annunciators.length).toBeGreaterThanOrEqual(4); expect(i0.annunciators.length).toBeLessThanOrEqual(8);
      for (const a of i0.annunciators) { expect(a.legend.length).toBeLessThanOrEqual(14); expect(a.legend).toBe(a.legend.toUpperCase()); }
      expect(i0.annunciators.some((a: any) => a.key === 'goal')).toBe(true);
      expect(i0.coach).not.toBeNull();
      expect(i0.note.length).toBe(2); expect(i0.stars.rules.length).toBe(3); expect(i0.callIt.prompt.length).toBeGreaterThan(10);
      const e = solve(id, { mode: 'engineer' });
      expect(allFinite(info(e))).toBeNull();
      const c = card(e);
      expect(allFinite(c)).toBeNull();
      expect(c.won).toBe(true); expect(c.histogram).not.toBeNull();
      expect(c.lesson).toMatch(/[0-9]/);
      expect(c.lesson).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(c.equation).toBeTypeOf('string');
      expect(equationHolds(c.equation), c.equation).toBe(true);
      expect(c.metrics.length).toBe(3);
      expect(info(e).goals.every((g: any) => g.met)).toBe(true);
      expect(info(e).annunciators.find((a: any) => a.key === 'goal').state).toBe('normal');
    });
    it(`${id}: deterministic (same actions give the same hash) and the solution code replays`, () => {
      const a = solve(id, { mode: 'engineer' }), b = solve(id, { mode: 'engineer' });
      expect(hashOf(a.state)).toBe(hashOf(b.state));
      expect(card(a).designCode).toBe(card(b).designCode);
    });
  }
  it('the dials are level-local state edited by levelAct setDial (a changed dial invalidates the run and changes the numbers)', () => {
    const e = start('L29', 1003, 'engineer');
    expect(dial(e, 0)).toBe(1); expect(dial(e, 1)).toBe(0);
    
    act(e, 'commission');
    expect(info(e).hero.value).toBeCloseTo(l29Offset(1), 1);
    act(e, 'levelAct', 'setDial', 'kc', 4);
    expect(e.state.solved).toBeNull();
    act(e, 'commission');
    expect(info(e).hero.value).toBeCloseTo(l29Offset(4), 1);
  });
  it('solver metrics: reference IAE / vent / cost numbers are what the printout shows', () => {
    expect(card(solve('L29')).metrics[0].value).toBeCloseTo(L29_IAE_REF, 6);
    expect(card(solve('L30')).metrics[0].value).toBeCloseTo(L30_IAE_REF, 6);
    expect(card(solve('L31')).metrics[0].value).toBeCloseTo(L31_H2_REF, 6);
    expect(card(solve('L32')).metrics[0].value).toBeCloseTo(L32_IAE_REF, 6);
    expect(card(solve('L33')).metrics[0].value).toBeCloseTo(L33_COST_REF, 6);
    expect(L29_REF.kc).toBe(4);
  });
});

describe('F3a playtest fixes', () => {
  it('L29 Learner default integral time is zero (Mara: leave tauI at zero first)', () => {
    const v = start('L29').engine.q('levelView') as any;
    expect(v.dials.find((d: any) => d.key === 'tauI').value).toBe(0);
  });
  it('L33 cost: the Nixie metric, the printout and the star line are one number in one unit', () => {
    const e = start('L33'); act(e, 'commission');
    const view = e.engine.q('levelView') as any, rc = e.engine.q('resultCard') as any;
    expect(view.metric.unit).toBe('USD/yr');
    expect(rc.metrics.find((m: any) => m.key === 'cost').value).toBe(view.metric.value);
    expect(view.metric.star3).toBeGreaterThan(0);
  });
});

describe('levelView', () => {
  const clean = (v: unknown, path = ''): string | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? null : path;
    if (v === undefined || typeof v === 'function') return path;
    if (v === null || typeof v !== 'object') return null;
    for (const [k, x] of Object.entries(v)) { const r = clean(x, `${path}.${k}`); if (r) return r; }
    return null;
  };
  for (const id of IDS) {
    it(`${id}: view is JSON-clean, finite, decimated, at start and after the solver`, () => {
      for (const e of [start(id), solve(id)]) {
        const v = e.engine.q('levelView') as any;
        expect(v.kind).toBe('control');
        expect(clean(v)).toBeNull();
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
        expect(v.dials.length).toBeGreaterThanOrEqual(2);
        for (const d of v.dials) { expect(d.label.length).toBeGreaterThan(1); expect(d.max).toBeGreaterThan(d.min); expect(d.value).toBeGreaterThanOrEqual(d.min); expect(d.value).toBeLessThanOrEqual(d.max); }
        for (const k of Object.keys(v.series)) expect(v.series[k].length).toBe(v.series.t.length);
        expect(v.series.t.length).toBeLessThanOrEqual(242);
        for (const k of Object.keys(v.seriesLabels)) expect(v.seriesLabels[k].length).toBeGreaterThan(1);
        expect(v.metric.label.length).toBeGreaterThan(1); expect(v.metric.star3).toBeGreaterThan(0);
      }
      const after = solve(id).engine.q('levelView') as any;
      expect(after.series.t.length).toBeGreaterThan(50);
      if (id === 'L30') { expect(after.bump.fit.tau).toBeGreaterThan(40); expect(after.bump.t.length).toBeLessThanOrEqual(242); }
    });
  }
});
