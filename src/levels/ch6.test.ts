// Chapter 6 levels L24 Runaway, L25 The Last 0.3 Percent, L27 Blocked Outlet: solvability, the failures DESIGN names, the reference numbers, Call-it grading at the
// oracle tolerance, the levelInfo / resultCard contract, determinism, solution codes. Expected numbers come from the engine's catalogue and the research scripts'
// tables as DESIGN quotes them; none is invented here. L26 and L28 are not built (see the worker report): the engine lacks the gauze burner (K9) and the
// reformer / CO2 removal units (K5 is a stub).
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, hashOf } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { verify } from '../verify';
import { LEVELS } from '../levels';
import { ORIFICE_LETTERS, ORIFICE_MM2 } from '../data/vle';
import { REGIONS } from '../regions';
import { cstrCritical, cstrSteadyStates, k7Game, K7_GAME } from '../sim/units/rx_cstr';
import { cpFlow, makeMixture, molarMass as mixM } from '../sim/thermo';
import { R_GAS } from '../sim/thermo/shomate';
import { SPEC_BY_ID } from './registry';
import { CH6_SPECS } from './ch6';
import { L24_FEED_MOL_S, L24_MARGIN_K, L24_PG_STAR, L24_PG_TARGET_KMOL, L24_SOLVE, l24HotK, l24IgnitionC, l24RunC, l24States } from './l24';
import { L25_CONV_CALL, L25_COST_STAR, so2PerTonne } from './l25';
import { L26_N2O_MAX, L26_REF, L26_COST_MAX, L26_YIELD_MIN, nitricScript } from './l26';
import { BENCH_GJ, L28_NH3_MIN_T_D, L28_REF, L28_STAR3_GJ, worksScript } from './l28';
import { reformer } from '../sim/units/ammonia_plant';
import { L27_DESIGN_PA, L27_LOAD_T_H, L27_PSET_REF, L27_T_K, l27Required, l27SmallestLetter } from './l27';
import type { EqState } from '../state';
import { ledgerOf } from '../engine/solved';

const IDS = ['L24', 'L25', 'L26', 'L27', 'L28'];
const K = 273.15;

function start(id: string, seed = 1003, mode = 'engineer'): Env<EqState> {
  const env = new Env(GAME);
  env.reset({ seed, level: id, mode });
  return env;
}
type Hook = (e: Env<EqState>, t: number) => void;
function play(id: string, persona: PersonaFactory<EqState>, opts: { seed?: number; mode?: string; ticks?: number; each?: Hook } = {}): Env<EqState> {
  const seed = opts.seed ?? 1003, env = start(id, seed, opts.mode ?? 'engineer');
  const agent = persona(seed), rng = new Rng(seed);
  for (let t = 0; t < (opts.ticks ?? 80) && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
    opts.each?.(env, t);
  }
  return env;
}
/** Play the solver: the two design levels commission in turn 1 (L25 then rolls its 30 s first run); the L24 shift is flown by the persona. */
const solve = (id: string, o: { seed?: number; mode?: string; each?: Hook } = {}): Env<EqState> => {
  const e = play(id, SPEC_BY_ID[id]!.solver, { ...o, ticks: id === 'L24' ? 4300 : 5 });
  if (e.state.status === 'playing') e.step({ name: 'tick', args: [40] });
  return e;
};
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
const actAll = (e: Env<EqState>, list: Action[]): void => { for (const a of list) act(e, a.name, ...(a.args ?? [])); };

/** `left = right ...`: the arithmetic on the left against the number the right starts with, to the last shown digit. */
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
function allFinite(v: unknown, path = ''): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v)) { const r = allFinite(x, `${path}.${k}`); if (r) return r; }
  return null;
}
/** Queue an event on a running shift (the L24 table cannot schedule the pump trip yet: see the report). */
function inject(e: Env<EqState>, type: string, v: number, dt = 1): void {
  const st = structuredClone(e.state) as EqState;
  st.shift!.q.push({ id: 'T' + st.shift!.q.length, type: type as never, at: st.shift!.t + dt, dur: 0, v, target: '' });
  st.shift!.q.sort((a, b) => a.at - b.at);
  e.engine.setState(st);
}

describe('registry', () => {
  it('L24-L28 (L28 in chapter 7) are registered in chapter order with titles, notes and a solver', () => {
    expect(CH6_SPECS.map((s) => s.id)).toEqual(IDS);
    for (const id of IDS) { const l = LEVELS.find((x) => x.id === id)!; expect(l.title.length).toBeGreaterThan(3); expect(l.brief.length).toBeGreaterThan(10); expect(l.solver).toBeTypeOf('function'); expect(SPEC_BY_ID[id]!.chapter).toBe(id === 'L28' ? 7 : 6); }
  });
});

describe('L26 Inside the Envelope: the nitric acid line', () => {
  const L = (e: Env<EqState>) => SPEC_BY_ID.L26!.measures(e.state).v;
  it('the solver wins with all three stars in Engineer and Learner mode; calibrated gauze exit and cost; the incident-free printout is clean', () => {
    for (const mode of ['engineer', 'learner']) {
      const e = solve('L26', { mode });
      expect(e.state.status, mode).toBe('won'); expect(card(e).stars, mode).toEqual({ have: 3, earned: [true, true, true] });
      expect(info(e).goals.every((g: any) => g.met)).toBe(true); expect(GAME.invariants!(e.state, null)).toEqual([]);
    }
    const v = L(solve('L26'));
    expect(v.t_gauze_c).toBeCloseTo(L26_REF.t_c, 1); expect(v.cost_per_t).toBeCloseTo(L26_REF.cost, 0); expect(L26_COST_MAX({ region: 'global' }) / v.cost_per_t!).toBeCloseTo(1.03, 2);
    expect(v.no_yield!).toBeGreaterThanOrEqual(L26_YIELD_MIN); expect(v.n2o_kg_t!).toBeLessThanOrEqual(L26_N2O_MAX); expect(v.n2o_raw_kg_t!).toBeGreaterThan(5.6); expect(v.n2o_raw_kg_t!).toBeLessThan(9);
  });
  it('the DESIGN incident: 19 % NH3 in air preheated to 200 C is inside the ICI envelope (14.4-31 %): EXPLOSIVE_MIXTURE, the verdict names the numbers, the lamp is critical', () => {
    const e = start('L26'); actAll(e, nitricScript(300, 473.15, 0, 0, false));
    expect(e.state.solved!.ok).toBe(false); expect(e.state.solved!.failure!.code).toBe('EXPLOSIVE_MIXTURE');
    const sp = SPEC_BY_ID.L26!; expect(sp.verdict(e.state, sp.measures(e.state), []).key).toBe('explosion'); expect(sp.verdict(e.state, sp.measures(e.state), []).cause).toMatch(/1[0-9]\.?[0-9]* %/);
    expect(info(e).annunciators.find((a: any) => a.key === 'explosive').state).toBe('critical');
  });
  it('hotter preheat widens the envelope: 12 % NH3 is safe at 200 C and an explosion at 400 C (ICI 13.1 -> 11.2 %)', () => {
    expect(start('L26').state.solved).toBeNull();
    const safe = start('L26'); actAll(safe, nitricScript(480, 473.15, 0.95, 0, false)); expect(safe.state.solved!.ok).toBe(true);
    const hot = start('L26'); actAll(hot, nitricScript(480, 673.15, 0.95, 0, false)); expect(hot.state.solved!.failure!.code).toBe('EXPLOSIVE_MIXTURE');
  });
  it('a lean mixture runs cold: K9 sends the ammonia to N2 and N2O (verdict cold, no stars), more N2O than the reference', () => {
    const e = start('L26'); actAll(e, nitricScript(800, 473.15, 0.95, 0, false));
    const v = L(e), sp = SPEC_BY_ID.L26!;
    expect(v.t_gauze_c!).toBeLessThan(850); expect(v.no_yield!).toBeLessThan(L26_YIELD_MIN); expect(v.n2o_raw_kg_t!).toBeGreaterThan(L(solve('L26')).n2o_raw_kg_t!);
    expect(sp.verdict(e.state, sp.measures(e.state), sp.goals(e.state, sp.measures(e.state))).key).toBe('cold');
  });
  it('no abater: the gauze N2O (6.6 kg/t, BREF medium pressure) passes the stack and misses the 2.5 kg/t goal (verdict n2o); the abater at 95 % lands inside the BAT band', () => {
    const e = start('L26'); actAll(e, nitricScript(630, 523.15, 0, 0, false)); const v = L(e), sp = SPEC_BY_ID.L26!;
    expect(Math.abs(v.n2o_kg_t! / v.n2o_raw_kg_t! - 1)).toBeLessThan(0.02); expect(v.n2o_kg_t!).toBeGreaterThan(L26_N2O_MAX);
    expect(sp.verdict(e.state, sp.measures(e.state), sp.goals(e.state, sp.measures(e.state))).key).toBe('n2o');
    const bat = REGIONS.get('global').data.limits.n2o_bat; expect(L(solve('L26')).n2o_kg_t!).toBeLessThanOrEqual(bat[1]); expect(L(solve('L26')).n2o_kg_t!).toBeGreaterThanOrEqual(bat[0]);
  });
  it('the Call-it is the gauze exit at the player design (3 %); the equation evaluates; the atom ledger closes through gauze, abater and absorber', () => {
    const e = start('L26'); act(e, 'callIt', L26_REF.t_c); expect(e.state.prediction).not.toBeNull();
    const w = solve('L26'); expect(equationHolds(card(w).equation)).toBe(true);
    const led = ledgerOf(w.state)!; expect(led.atomRel).toBeLessThan(1e-6);
  });
});

describe('L28 Feed the World: the Works', () => {
  const W = (e: Env<EqState>) => SPEC_BY_ID.L28!.measures(e.state).v;
  it('the solver wins with all three stars in Engineer and Learner mode; the calibrated best and the benchmark lines', () => {
    for (const mode of ['engineer', 'learner']) {
      const e = solve('L28', { mode });
      expect(e.state.status, mode + ' ' + e.state.statusReason).toBe('won'); expect(card(e).stars, mode).toEqual({ have: 3, earned: [true, true, true] });
      expect(info(e).goals.every((g: any) => g.met)).toBe(true); expect(GAME.invariants!(e.state, null)).toEqual([]);
    }
    const v = W(solve('L28'));
    expect(v.gj_per_t).toBeCloseTo(L28_REF.gj, 1); expect(L28_STAR3_GJ / v.gj_per_t!).toBeCloseTo(1.01, 2);
    expect(v.gj_per_t!).toBeLessThan(BENCH_GJ.top); expect(v.gj_per_t!).toBeGreaterThan(BENCH_GJ.best); expect(v.nh3_t_d!).toBeGreaterThanOrEqual(L28_NH3_MIN_T_D);
    expect([BENCH_GJ.avg, BENCH_GJ.top, BENCH_GJ.best]).toEqual([36.6, 33, 28]);
  });
  it('the plant as built (reformer 800 C, S/C 3.5, 4 % purge, a 400 m2 exchanger: F14) is below the ammonia target (the verdict says short) and above 36 GJ/t', () => {
    const e = start('L28'); act(e, 'commission');
    const v = W(e); expect(e.state.solved!.ok).toBe(true); expect(v.nh3_t_d!).toBeLessThan(L28_NH3_MIN_T_D); expect(v.gj_per_t!).toBeGreaterThan(36);
    const sp = SPEC_BY_ID.L28!; expect(sp.verdict(e.state, sp.measures(e.state), sp.goals(e.state, sp.measures(e.state))).key).toBe('short');
  });
  it('nitrogen starved: hydrogen piles up in the loop (fresh 4.3 H2 : N2), the purge burns it and the energy jumps past 44 GJ/t', () => {
    const e = start('L28'); actAll(e, worksScript(L28_REF.T, L28_REF.sc, L28_REF.area, L28_REF.shift, L28_REF.co2, L28_REF.purge, 90, false));
    const v = W(e); expect(v.h2_n2!).toBeGreaterThan(4); expect(v.gj_per_t!).toBeGreaterThan(40); expect(info(e).annunciators.find((a: any) => a.key === 'stoich').state).not.toBe('normal');
  });
  it('no purge: NO_EXIT (methane and the excess have no way out of the loop), with the species named', () => {
    const e = start('L28'); actAll(e, worksScript(L28_REF.T, L28_REF.sc, L28_REF.area, L28_REF.shift, L28_REF.co2, 0, L28_REF.n2, false));
    expect(e.state.solved!.ok).toBe(false); expect(e.state.solved!.failure!.code).toBe('NO_EXIT'); expect(info(e).annunciators.find((a: any) => a.key === 'noexit').state).toBe('critical');
  });
  it('the SMR oracle: 800 C, 25 bar, S/C 3 gives 67.3 % CH4 conversion in DESIGN and within 2 % relative in the engine (68.5 %); hotter and wetter converts more', () => {
    const r = (T: number, sc: number) => { const o = reformer({ in: { n: [1, sc, 0, 0, 0, 0, 0], T: 773.15, P: 25e5 } }, { id: 'X', type: 'reformer', pos: { x: 0, y: 0 }, rot: 0, params: { T } }, { species: ['CH4', 'H2O', 'CO', 'CO2', 'H2', 'N2', 'NH3'], thermoDetail: 'rigorous' }); if (!o.ok) throw new Error(o.code); return (o.value.info as Record<string, number>).x_ch4!; };
    expect(Math.abs(r(1073.15, 3) - 0.673) / 0.673).toBeLessThan(0.02); expect(r(1153.15, 3)).toBeGreaterThan(r(1073.15, 3)); expect(r(1073.15, 4)).toBeGreaterThan(r(1073.15, 3));
  });
  it('the energy is the sum of its parts (feed + fuel + steam raising + shaft and refrigeration + CO2 solvent + nitrogen - boiler credit) and the Call-it grades the SMR conversion', () => {
    const e = solve('L28'), v = W(e);
    expect(v.feed_gj_h! + v.fuel_gj_h! + v.steam_gen_gj_h! + v.el_gj_h! + v.regen_gj_h! + v.asu_gj_h! - v.steam_credit_gj_h!).toBeCloseTo(v.e_gj_h!, 6);
    expect(v.e_gj_h! / v.nh3_t_h!).toBeCloseTo(v.gj_per_t!, 6);
    const c = start('L28'); act(c, 'callIt', 68.5); expect(c.state.prediction).not.toBeNull();
    const r = solve('L28'); expect(card(r).equation).toBeTypeOf('string'); expect(equationHolds(card(r).equation)).toBe(true); expect(card(r).card.ifa_avg).toBe(36.6);
    expect(ledgerOf(r.state)!.atomRel).toBeLessThan(1e-6);
  });
});

describe('L24 Runaway: the reactor the player flies', () => {
  it('reference numbers: three steady states 27.6 / 63.1 / 117.0 C (0.3 K), stable / unstable / stable, ignition coolant 47.4 C, adiabatic rise 148.7 K', () => {
    const st = l24States();
    [27.6, 63.1, 117.0].forEach((c, i) => expect(Math.abs(st[i]!.T - K - c), `state ${i}`).toBeLessThanOrEqual(0.3));
    expect(st.map((x) => x.stable)).toEqual([true, false, true]);
    expect(Math.abs(l24IgnitionC() - 47.4)).toBeLessThanOrEqual(0.3);
    const g = k7Game();
    expect(cstrCritical(g.model, g.inputs, 'Tc').map((x) => x.kind).sort()).toEqual(['extinction', 'ignition']);
    expect(cstrSteadyStates(g.model, g.inputs).states).toHaveLength(3);
    expect(l24HotK()).toBeCloseTo(st[2]!.T, 9);
    expect(Math.abs((-K7_GAME.dH * K7_GAME.CA0) / K7_GAME.rhoCp - 148.7)).toBeLessThan(0.1);
  });
  it('the solver wins with all three stars in Engineer and Learner mode; the printout is clean', () => {
    for (const mode of ['engineer', 'learner']) {
      const e = solve('L24', { mode });
      expect(e.state.status, mode).toBe('won');
      const c = card(e);
      expect(c.stars, mode).toEqual({ have: 3, earned: [true, true, true] });
      const sh = e.state.shift!;
      expect(sh.stat.reliefN, mode).toBe(0); expect(sh.stat.tripN, mode).toBe(0); expect(sh.stat.critS, mode).toBe(0); expect(sh.stat.highS, mode).toBe(0);
      expect(info(e).goals.every((g: any) => g.met)).toBe(true);
      if (mode === 'engineer') expect(info(e).goals.map((g: any) => g.key)).toContain('budget');
      expect(GAME.invariants!(e.state, null)).toEqual([]);
      expect(c.histogram).not.toBeNull();
    }
  });
  it('the calibrated lines: the star line is the solver glycol / 1.03 (UNVERIFIED, GAME), and the target sits well below it', () => {
    const pg = SPEC_BY_ID.L24!.measures(solve('L24').state).v.pg_kmol!;
    expect(pg).toBeGreaterThan(L24_PG_STAR);
    expect(pg / 1.03).toBeLessThan(L24_PG_STAR * 1.2);
    expect(L24_PG_TARGET_KMOL).toBeLessThan(L24_PG_STAR);
    // the feed of the reactor is the K7 design: 5 m3/h at 52 114 mol/m3
    expect(L24_FEED_MOL_S).toBeCloseTo((5 / 3600) * 52114, 9);
  });
  it('the solver also holds through a seeded feed surge on three seeds', () => {
    for (const seed of [1, 2, 3]) { const e = solve('L24', { seed }); expect(e.state.status, String(seed)).toBe('won'); expect(card(e).stars.have, String(seed)).toBe(3); }
  });
  it('the solver survives a cooling-water pump trip (U A x 0.3) injected mid-shift: no relief, peak under 125 C (15 K margin), still a win', () => {
    for (const mode of ['engineer', 'learner']) {
      let injected = false, peak = 0;
      const e = play('L24', SPEC_BY_ID.L24!.solver, { mode, ticks: 4300, each: (en) => {
        const sh = en.state.shift;
        if (sh) peak = Math.max(peak, sh.dc['R-103']!.T - K);
        if (sh && !injected && sh.t >= 1500) { injected = true; inject(en, 'cw_pump_trip', mode === 'learner' ? 1 - 0.7 * 0.6 : 0.3); }
      } });
      expect(e.state.status, mode + ' ' + e.state.statusReason).toBe('won');
      expect(e.state.shift!.stat.reliefN, mode).toBe(0);
      expect(peak, mode).toBeLessThan(140 - L24_MARGIN_K);
      expect(card(e).stars.earned.slice(0, 2), mode).toEqual([true, true]);
      expect(e.state.shift!.stat.tripN, mode).toBe(0);
    }
  });
  it('without an answer and without the interlock the pump trip carries the reactor past 140 C in the engine: the relief lifts (the DESIGN runaway, 117 -> about 152 C)', () => {
    // the solver's start-up, no reaction to the trip, and the interlock left disarmed
    const dumb: PersonaFactory<EqState> = (seed) => {
      const base = SPEC_BY_ID.L24!.solver(seed);
      return (s, c) => base(s, c).map((a) => (a.name === 'setParam' && a.args![0] === 'I-106' ? { name: 'setParam', args: ['I-106', 'setpoint', 0] } : a)).filter((a) => !(a.name === 'setpoint' && a.args![1] === 'Tc' && (a.args![2] as number) === L24_SOLVE.coldK) && !(a.name === 'setpoint' && a.args![1] === 'flow' && s.shift!.mods.cwUa < 1));
    };
    let injected = false, peak = 0;
    const e = play('L24', dumb, { ticks: 1700, each: (en) => {
      const sh = en.state.shift;
      if (sh) peak = Math.max(peak, sh.dc['R-103']!.T - K);
      if (sh && !injected && sh.t >= 1200) { injected = true; inject(en, 'cw_pump_trip', 0.3); }
    } });
    expect(peak).toBeGreaterThan(140);
    expect(e.state.shift!.stat.reliefN).toBeGreaterThan(0);
    expect(card(e).stars.earned[1] ?? false).toBe(false);
  });
  it('with the interlock armed at 125 C and no other answer the same trip is caught: the feed is cut, the relief stays shut, the glycol is lost (DESIGN: "a trip at 125 C would have held it")', () => {
    const noAnswer: PersonaFactory<EqState> = (seed) => {
      const base = SPEC_BY_ID.L24!.solver(seed);
      return (s, c) => base(s, c).filter((a) => !(a.name === 'setpoint' && a.args![1] === 'Tc' && (a.args![2] as number) === L24_SOLVE.coldK) && !(a.name === 'setpoint' && a.args![1] === 'flow' && s.shift!.mods.cwUa < 1));
    };
    let injected = false;
    const e = play('L24', noAnswer, { ticks: 1700, each: (en) => { const sh = en.state.shift; if (sh && !injected && sh.t >= 1200) { injected = true; inject(en, 'cw_pump_trip', 0.3); } } });
    expect(e.state.shift!.stat.tripN).toBeGreaterThan(0);
    expect(e.state.shift!.stat.reliefN).toBe(0);
    expect(e.state.shift!.ended, 'the vessel was not lost').toBe('time');
    expect(card(e).stars.earned[2]).toBe(false);
  });
  it('naive: starting the shift and doing nothing never lights the reactor ("the reactor is on its lazy branch")', () => {
    const e = play('L24', () => { let n = 0; return () => (n++ === 0 ? [{ name: 'commission' }, { name: 'startShift', args: ['shift'] }] : [{ name: 'tick', args: [199] }]); }, { ticks: 19 });
    expect(e.state.shift!.ended).toBe('time');
    expect(e.state.status).toBe('lost');   // the shift is over with its goals unmet: lost at once, with the reason (not silent until maxTicks)
    const c = card(e);
    expect(c.won).toBe(false); expect(c.verdictKey).toBe('lazy'); expect(c.histogram).toBeNull(); expect(c.stars.have).toBe(0);
    expect(c.cause).toMatch(/at 2[78]\./); expect(c.cause).toContain('47.4');
    expect(info(e).annunciators.find((a: any) => a.key === 'lazy').state).toBe('high');
  });
  it('lighting the reactor with a full charge overshoots to about 160 C however the jacket is handled: relief lift or loss of containment (no ★★)', () => {
    // warm jacket, full feed: the naive ignition. The relief is left at D and the interlock is disarmed.
    const hasty: PersonaFactory<EqState> = () => {
      let phase = 0;
      return (s) => {
        if (phase === 0) { phase = 1; return [{ name: 'setParam', args: ['I-106', 'setpoint', 0] }, { name: 'commission' }, { name: 'startShift', args: ['shift'] }]; }
        const sh = s.shift!;
        if (phase === 1) { phase = 2; return [{ name: 'setpoint', args: ['R-103', 'Tc', 55 + K] }]; }
        if (phase === 2 && sh.dc['R-103']!.T - K > 75) { phase = 3; return [{ name: 'setpoint', args: ['R-103', 'Tc', 25 + K] }]; }
        return sh.t < 30 || phase < 3 ? [] : [{ name: 'tick', args: [20] }];
      };
    };
    const e = play('L24', hasty, { ticks: 4300 });
    const sh = e.state.shift!;
    const peak = SPEC_BY_ID.L24!.measures(e.state).v.peak_K! - K;
    expect(peak).toBeGreaterThan(150);
    expect(sh.stat.reliefN > 0 || e.state.status === 'lost').toBe(true);
    expect(card(e).stars.earned[1]).toBe(false);
    expect(['relief', 'lost']).toContain(card(e).verdictKey);
  });
  it('Call it: the ignition coolant temperature is graded at the oracle tolerance (0.3 % of the Kelvin value, about 2 % of the Celsius answer)', () => {
    const truth = l24IgnitionC(), spec = SPEC_BY_ID.L24!;
    expect(Math.abs(spec.callIt!.tol - (0.003 * (truth + K)) / truth)).toBeLessThan(0.002);
    const call = (v: number) => { const e = start('L24'); expect(act(e, 'callIt', v).info.ok).toBe(true); act(e, 'commission'); return card(e).callIt; };
    for (const [v, ok] of [[truth, true], [truth * 1.015, true], [truth * 0.985, true], [50, false], [45, false], [117, false]] as [number, boolean][]) expect(call(v), String(v)).toMatchObject({ answered: true, ok });
    expect(card(solve('L24')).callIt).toMatchObject({ answered: true, ok: true });
  });
  it('levelInfo and resultCard: every number finite, 4-8 annunciators with caps legends, the lesson and the equation carry the player numbers', () => {
    const e = start('L24');
    const i0 = info(e);
    expect(allFinite(i0)).toBeNull();
    expect(i0.shiftLen).toBe(2700);
    expect(i0.callIt.key).toBe('ignition_c');
    expect(i0.allowedUnits.map((u: any) => u.type).sort()).toEqual(['cstr', 'feed', 'interlock', 'product', 'relief', 'splitter']);
    const done = solve('L24');
    const i1 = info(done), c = card(done);
    expect(allFinite(i1)).toBeNull(); expect(allFinite(c)).toBeNull();
    expect(i1.annunciators.length).toBeGreaterThanOrEqual(4); expect(i1.annunciators.length).toBeLessThanOrEqual(8);
    for (const a of i1.annunciators) { expect(a.legend).toMatch(/^[A-Z0-9 ]{3,14}$/); expect(['off', 'normal', 'high', 'critical']).toContain(a.state); }
    expect(i1.annunciators.some((a: any) => a.key === 'goal' && a.state === 'normal')).toBe(true);
    expect(i1.hero.label.length).toBeGreaterThan(3);
    expect(c.lesson).toContain(String(Math.round(l24IgnitionC() * 10) / 10)); expect(c.lesson).toContain(String(Math.round(l24RunC())));
    expect(c.equation).toContain('148.8'.slice(0, 3)); expect(equationHolds(c.equation)).toBe(true);
    expect(c.metrics).toHaveLength(3);
  });
  it('determinism: the same actions give the same state hash, and the solution code verifies with the same win', () => {
    const a = solve('L24'), b = solve('L24');
    expect(hashOf(a.state)).toBe(hashOf(b.state));
    const v = verify('L24', card(a).designCode);
    expect(v.ok, v.reason).toBe(true);
  });
  it('idle (ticking only) never wins and the solvability harness passes', () => {
    const r = checkLevel(GAME, LEVELS.find((l) => l.id === 'L24')!, { seed: 1, cheeseDepth: 2, cheeseBudget: 200, randomRollouts: 2, randomTicks: 60, solverTicks: 4300, idleTicks: 400 });
    expect(r.problems).toEqual([]);
  });
});

describe('L25 The Last 0.3 Percent: the contact plant', () => {
  it('reference numbers: the emission / conversion identity of DESIGN (97 % -> 20.2, 99.7 % -> 1.97 kg SO2 per tonne of acid) and the region limits', () => {
    expect(so2PerTonne(0.97)).toBeCloseTo(20.2, 1);
    expect(so2PerTonne(0.997)).toBeCloseTo(1.97, 2);
    expect(so2PerTonne(L25_CONV_CALL)).toBeCloseTo(1.9653, 3);
    const l = REGIONS.get('global').data.limits;
    expect([l.so2_standard, l.so2_strict, l.so2_expert]).toEqual([2.0, 1.3, 0.65]);
  });
  it('the solver wins with all three stars (double contact: three beds, absorb, reheat, a fourth bed, absorb), in both modes', () => {
    for (const mode of ['engineer', 'learner']) {
      const e = solve('L25', { mode });
      expect(e.state.status, mode).toBe('won');
      expect(card(e).stars, mode).toEqual({ have: 3, earned: [true, true, true] });
      const m = SPEC_BY_ID.L25!.measures(e.state).v;
      expect(m.kg_t!).toBeLessThanOrEqual(0.65);
      expect(m.conv!).toBeGreaterThan(0.997);
      expect(m.overtemp).toBe(0);
      expect(GAME.invariants!(e.state, null)).toEqual([]);
    }
  });
  it('the printout identity holds on the engine numbers: kg per tonne = SO2 kg/h / acid t/h = the conversion identity exactly', () => {
    const e = solve('L25'), m = SPEC_BY_ID.L25!.measures(e.state).v;
    expect(m.kg_t!).toBeCloseTo(m.so2_kg_h! / m.acid_t_h!, 9);
    expect(Math.abs(m.kg_t! - so2PerTonne(m.conv!)) / m.kg_t!).toBeLessThan(1e-6);   // the sulfur counted as SO2 whichever oxide leaves: the identity is exact
    expect(equationHolds(card(e).equation)).toBe(true);
  });
  it('the ★★★ cost line is the solver cost x 1.03 (UNVERIFIED, GAME): the solver meets it, the star line is within 1 % of the calibration', () => {
    const m = SPEC_BY_ID.L25!.measures(solve('L25').state).v;
    expect(m.cost!).toBeLessThanOrEqual(L25_COST_STAR({ region: 'global' }));
    expect(Math.abs(m.cost! * 1.03 - L25_COST_STAR({ region: 'global' })) / L25_COST_STAR({ region: 'global' })).toBeLessThan(0.01);
  });
  it('single contact with water cannot pass: acid mist, and the catalyst-starved beds leave most of the SO2 (the emission alarm)', () => {
    const e = play('L25', SPEC_BY_ID.L25!.naive, { ticks: 3 });
    const c = card(e);
    expect(e.state.status).toBe('playing');
    expect(c.won).toBe(false); expect(c.verdictKey).toBe('mist'); expect(c.histogram).toBeNull(); expect(c.stars.have).toBe(0);
    const ann = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(ann.mist).toBe('critical'); expect(ann.so2).toBe('critical'); expect(ann.one).toBe('high');
  });
  it('one contact with acid still fails the limit: three well-loaded beds and one absorber stop near equilibrium (about 98.6 % in DESIGN), with the single-contact cause', () => {
    const e = start('L25');
    const W = 8000;
    const list: Action[] = [
      ...[['packed_bed', 2, 0], ['cooler', 6, 0], ['packed_bed', 8, 0], ['cooler', 12, 0], ['packed_bed', 14, 0], ['absorber', 18, 0], ['stack', 11, 5], ['product', 14, 5]].map(([t, x, y]) => ({ name: 'placeUnit', args: [t, x, y, 0] })),
      ...['R-102', 'R-104', 'R-106'].flatMap((b) => [{ name: 'setCatalyst', args: [b, 'v2o5'] }, { name: 'setParam', args: [b, 'W', W] }]),
      { name: 'setParam', args: ['C-103', 'T', 693.15] }, { name: 'setParam', args: ['C-105', 'T', 693.15] },
      ...[['F-101', 'out', 'R-102', 'in'], ['R-102', 'out', 'C-103', 'in'], ['C-103', 'out', 'R-104', 'in'], ['R-104', 'out', 'C-105', 'in'], ['C-105', 'out', 'R-106', 'in'], ['R-106', 'out', 'A-107', 'in'], ['A-107', 'out', 'Z-108', 'in'], ['A-107', 'acid', 'T-109', 'in']].map((a) => ({ name: 'connect', args: a })),
      { name: 'commission' },
    ];
    actAll(e, list);
    const m = SPEC_BY_ID.L25!.measures(e.state).v, c = card(e);
    expect(m.conv!).toBeGreaterThan(0.9); expect(m.conv!).toBeLessThanOrEqual(0.986 + 1e-3);   // DESIGN: three ideal beds reach 98.60 % at most
    expect(m.kg_t!).toBeGreaterThan(2);
    expect(c.verdictKey).toBe('single');
    expect(c.cause).toContain('1 absorber');
  });
  it('Call it: 99.7 % conversion leaves 1.97 kg per tonne, graded at 1 %', () => {
    for (const [v, ok] of [[1.9653, true], [1.95, true], [1.98, true], [2.5, false], [1.99, false], [1.9, false]] as [number, boolean][]) {
      const e = start('L25'); act(e, 'callIt', v);
      actAll(e, SPEC_BY_ID.L25!.naive(1)(e.state, null as never) as Action[]);
      expect(card(e).callIt, String(v)).toMatchObject({ answered: true, ok });
    }
  });
  it('levelInfo shape and the lesson carry the player numbers; determinism and solution code', () => {
    const e = solve('L25'), i = info(e), c = card(e);
    expect(allFinite(i)).toBeNull(); expect(allFinite(c)).toBeNull();
    expect(i.annunciators.length).toBeGreaterThanOrEqual(4); expect(i.annunciators.length).toBeLessThanOrEqual(8);
    for (const a of i.annunciators) expect(a.legend).toMatch(/^[A-Z0-9 ]{3,14}$/);
    expect(i.goals.find((g: any) => g.key === 'so2').text).toContain('2');
    expect(c.lesson).toContain('20.2'); expect(c.lesson).toContain('1.97');
    expect(i.firstRun === null || i.phase === 'won').toBe(true);
    expect(hashOf(e.state)).toBe(hashOf(solve('L25').state));
    const v = verify('L25', c.designCode);
    expect(v.ok, v.reason).toBe(true);
  });
  it('idle never wins and the solvability harness passes', () => {
    const r = checkLevel(GAME, LEVELS.find((l) => l.id === 'L25')!, { seed: 1, cheeseDepth: 2, cheeseBudget: 300, randomRollouts: 4, randomTicks: 20, solverTicks: 40, idleTicks: 20 });
    expect(r.problems).toEqual([]);
  });
});

describe('L27 Blocked Outlet: relief sizing', () => {
  /** Independent API 520 critical-flow check with k = cp / (cp - R) from the engine's own methane cp: A = W / (C Kd P1) sqrt(T Z / M). */
  it('reference numbers: the required area of the case (20 t/h of methane, 30 bar(g) set, 10 % overpressure) is the API 520 equation to 0.5 %, and the smallest letter is K', () => {
    const mx = makeMixture(['CH4']);
    const n = [(20000 / (mixM(mx, [1]) * 1000)) * 1000 / 3600], cp = cpFlow(mx, n, L27_T_K) / n[0]!, k = cp / (cp - R_GAS);
    const C0 = 0.03948 * Math.sqrt(k * Math.pow(2 / (k + 1), (k + 1) / (k - 1)));
    const A = (20000 / (C0 * 0.975 * ((L27_PSET_REF * 1.1) / 1000))) * Math.sqrt((L27_T_K * 1) / (mixM(mx, [1]) * 1000));
    expect(Math.abs(l27Required(L27_PSET_REF) - A) / A).toBeLessThan(0.005);
    expect(l27SmallestLetter(L27_PSET_REF)).toBe('K');
    expect(ORIFICE_MM2.J).toBeLessThan(l27Required(L27_PSET_REF)); expect(ORIFICE_MM2.K).toBeGreaterThan(l27Required(L27_PSET_REF));
    expect(L27_PSET_REF).toBeCloseTo(30 * 1e5 + 101325, 6); expect(L27_DESIGN_PA).toBe(L27_PSET_REF); expect(L27_LOAD_T_H).toBe(20);
  });
  it('the solver wins with all three stars (letter K at the design pressure, area called) in both modes', () => {
    for (const mode of ['engineer', 'learner']) {
      const e = solve('L27', { mode });
      expect(e.state.status, mode).toBe('won');
      expect(card(e).stars, mode).toEqual({ have: 3, earned: [true, true, true] });
      const m = SPEC_BY_ID.L27!.measures(e.state).v;
      expect(m.cap_kg_h!).toBeGreaterThanOrEqual(20000); expect(m.letter_idx).toBe(ORIFICE_LETTERS.indexOf('K'));
      expect(m.peak_barg!).toBeLessThanOrEqual(33.1013 + 1e-3);
      expect(GAME.invariants!(e.state, null)).toEqual([]);
    }
  });
  it('the sweep of letters: D..J cannot pass 20 t/h, K..T can; a larger letter wins ★ but not ★★', () => {
    const run = (letter: string, pset = L27_PSET_REF) => {
      const e = start('L27');
      actAll(e, [{ name: 'placeUnit', args: ['relief', 12, 4, 0] }, { name: 'connect', args: ['X-103', 'purge', 'R-110', 'in'] }, { name: 'setParam', args: ['R-110', 'Pset', pset] }, { name: 'setParam', args: ['R-110', 'orifice', letter] }, { name: 'commission' }]);
      return e;
    };
    for (const l of ORIFICE_LETTERS) {
      const e = run(l), m = SPEC_BY_ID.L27!.measures(e.state).v;
      const passes = ORIFICE_MM2[l]! >= l27Required(L27_PSET_REF);
      expect(m.letter_ok === 1, l).toBe(passes);
      expect(info(e).goals.find((g: any) => g.key === 'capacity').met, l).toBe(passes);
      expect(card(e).stars.earned[1], l).toBe(l === 'K');
    }
    expect(run('L').state.status).toBe('won');
    expect(card(run('L')).stars.earned).toEqual([true, false, false]);
    expect(card(run('J')).verdictKey).toBe('under');
  });
  it('the set pressure must be at most the design pressure and 10 % over the operating pressure: 31 bar(g) and 25 bar(g) both fail the goal', () => {
    for (const bar of [31, 27]) {
      const e = start('L27');
      actAll(e, [{ name: 'placeUnit', args: ['relief', 12, 4, 0] }, { name: 'connect', args: ['X-103', 'purge', 'R-110', 'in'] }, { name: 'setParam', args: ['R-110', 'Pset', bar * 1e5 + 101325] }, { name: 'setParam', args: ['R-110', 'orifice', 'T'] }, { name: 'commission' }]);
      expect(e.state.status, String(bar)).toBe('playing');
      expect(info(e).goals.find((g: any) => g.key === 'pset').met, String(bar)).toBe(false);
      expect(card(e).verdictKey, String(bar)).toBe('pset');
    }
    // a higher set pressure needs a smaller area (capacity grows with the absolute pressure in front of the valve)
    expect(l27Required(31 * 1e5 + 101325)).toBeLessThan(l27Required(L27_PSET_REF));
  });
  it('naive: the defaults (orifice D, 20 bar abs) pass 0.9 t/h of the 20 t/h and the drum climbs: the DESIGN failure, with numbers', () => {
    const e = play('L27', SPEC_BY_ID.L27!.naive, { ticks: 3 });
    const c = card(e);
    expect(e.state.status).toBe('playing');
    expect(c.won).toBe(false); expect(c.verdictKey).toBe('under'); expect(c.histogram).toBeNull(); expect(c.stars.have).toBe(0);
    expect(c.cause).toContain('71'); expect(c.cause).toContain('20');
    const ann = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(ann.under).toBe('critical'); expect(ann.hi).toBe('critical'); expect(ann.pset).toBe('high');
  });
  it('Call it: the required area of this level case (not the 1882 mm2 unit-test case), graded at 3 %', () => {
    const need = l27Required(L27_PSET_REF);
    expect(Math.abs(need - 1882)).toBeGreaterThan(100);
    for (const [v, ok] of [[need, true], [need * 1.029, true], [need * 0.971, true], [need * 1.05, false], [1882, false]] as [number, boolean][]) {
      const e = start('L27'); act(e, 'callIt', v);
      actAll(e, SPEC_BY_ID.L27!.naive(1)(e.state, null as never) as Action[]);
      expect(card(e).callIt, String(v)).toMatchObject({ answered: true, ok });
    }
  });
  it('levelInfo shape; the equation is the ideal-gas rise R T n / V and evaluates to its shown result; the lesson names the case', () => {
    const e = solve('L27'), i = info(e), c = card(e);
    expect(allFinite(i)).toBeNull(); expect(allFinite(c)).toBeNull();
    expect(i.annunciators.length).toBeGreaterThanOrEqual(4); expect(i.annunciators.length).toBeLessThanOrEqual(8);
    for (const a of i.annunciators) expect(a.legend).toMatch(/^[A-Z0-9 ]{3,14}$/);
    expect(equationHolds(c.equation)).toBe(true);
    expect(c.lesson).toContain('K'); expect(c.lesson.replace(/,/g, '')).toContain(String(Math.round(l27Required(L27_PSET_REF))).slice(0, 3));
    expect(c.card.smallest_letter).toBe('K');
    expect(c.metrics).toHaveLength(3);
  });
  it('determinism, solution code and the solvability harness', () => {
    const a = solve('L27'), b = solve('L27');
    expect(hashOf(a.state)).toBe(hashOf(b.state));
    const v = verify('L27', card(a).designCode);
    expect(v.ok, v.reason).toBe(true);
    const r = checkLevel(GAME, LEVELS.find((l) => l.id === 'L27')!, { seed: 1, cheeseDepth: 2, cheeseBudget: 300, randomRollouts: 4, randomTicks: 20, solverTicks: 40, idleTicks: 20 });
    expect(r.problems).toEqual([]);
  });
});

describe('coach and modes', () => {
  it('Learner mode coaches each level from its first step, focused on the unit the step is about; Engineer mode does not coach', () => {
    expect(info(start('L24', 1003, 'learner')).coach).toMatchObject({ step: 1, focus: { unit: 'I-106' } });
    expect(info(start('L25', 1003, 'learner')).coach).toMatchObject({ step: 1, focus: { rack: 'packed_bed' } });
    expect(info(start('L27', 1003, 'learner')).coach).toMatchObject({ step: 1, focus: { rack: 'relief' } });
    for (const id of IDS) expect(info(start(id, 1003, 'engineer')).coach).toBeNull();
  });
  it('every level lists its goals in Learner mode without the budget, with Engineer adding it', () => {
    for (const id of IDS) {
      expect(info(start(id, 1003, 'learner')).goals.map((g: any) => g.key)).not.toContain('budget');
      expect(info(start(id, 1003, 'engineer')).goals.map((g: any) => g.key)).toContain('budget');
    }
  });
});

describe('L24 and the Semenov instrument', () => {
  it('semenov(R-103) gives G and R curves, the three states 27.6 / 63.1 / 117.0 C and the operating point, before and during the shift', () => {
    const e = start('L24');
    const q = (): any => e.engine.q('semenov', ['R-103']);
    let s = q();
    expect(s.reason ?? '').toBe('');
    expect(s.T.length).toBeGreaterThan(20); expect(s.G).toHaveLength(s.T.length); expect(s.R).toHaveLength(s.T.length);
    expect(allFinite(s)).toBeNull();
    [27.6, 63.1, 117.0].forEach((c, i) => expect(Math.abs(s.states[i].T - K - c)).toBeLessThanOrEqual(0.3));
    expect(s.states.map((x: any) => x.stable)).toEqual([true, false, true]);
    act(e, 'commission'); act(e, 'startShift', 'shift');
    act(e, 'tick', 120);
    s = q();
    expect(s.op.T).toBeGreaterThan(K);                       // the live reactor temperature
    // a colder jacket moves the R line: the ignition vanishes, the states change
    act(e, 'setpoint', 'R-103', 'Tc', 325.15); act(e, 'tick', 60);
    expect(q().states.length).toBe(1);
  });
});
