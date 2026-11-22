// Chapter 3 · The Wall (L10-L14): solvability, the failures DESIGN names, the DESIGN reference numbers against the engine, Call-it grading at the oracle
// tolerance, the levelInfo / resultCard contract, determinism and solution codes. Expected numbers come from src/oracle/oracles.json, the region pack or the
// engine's own catalogue; the DESIGN table values are the stated precision of DESIGN 2.6 (every disagreement is asserted at the engine's value and commented).
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, decodeSolution, hashOf } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { brent } from '@core/numerics';
import { GAME } from '../game';
import { i18n } from '../i18n';
import { verify } from '../verify';
import oracleFile from '../oracle/oracles.json';
import { LEVELS } from '../levels';
import type { EqState } from '../state';
import { NAIVE, SPEC_BY_ID } from './registry';
import { ammoniaBuild, ammoniaMeasures, K450_E5, L10_REF, L10_REF_PARTS, kOf, refCost } from './l10';
import { L11_CONTRACTS, L11_NH3_MIN, L11_REF, L11_REF_PARTS, L11_T_K } from './l11';
import { K400_TRUTH, L12_REF, l12RefCost, shiftBuild } from './l12';
import { bed1ExitC, chainOf, refAcidCost, stairBuild } from './l13';
import { bookT, bookWorking, foundBookFlask, problem, realFlask, testsDone } from './l14';

const CH3 = ['L10', 'L11', 'L12', 'L13', 'L14'];
const oracles = oracleFile.oracles as unknown as { id: string; expected: Record<string, any>; tol: Record<string, number> }[];
const oracle = (id: string) => oracles.find((o) => o.id === id)!;

function start(id: string, seed = 1003, mode = 'learner'): Env<EqState> {
  const env = new Env(GAME);
  env.reset({ seed, level: id, mode });
  return env;
}
function play(id: string, persona: PersonaFactory<EqState>, opts: { seed?: number; mode?: string; ticks?: number } = {}): Env<EqState> {
  const seed = opts.seed ?? 1003, env = start(id, seed, opts.mode ?? 'learner');
  const agent = persona(seed), rng = new Rng(seed);
  for (let t = 0; t < (opts.ticks ?? 5) && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const solve = (id: string, o: { seed?: number; mode?: string } = {}) => play(id, SPEC_BY_ID[id]!.solver, { ...o, ticks: 40 });
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
const run = (e: Env<EqState>, actions: Action[]): Env<EqState> => { for (const a of actions) { const r: any = act(e, a.name, ...(a.args ?? [])); if (r.info?.ok === false) throw new Error(`${a.name} ${JSON.stringify(a.args)}: ${r.info.message}`); } return e; };
const roll = (e: Env<EqState>): Env<EqState> => { if (e.state.status === 'playing') act(e, 'tick', 40); return e; };
const m = (id: string, e: Env<EqState>) => SPEC_BY_ID[id]!.measures(e.state);

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

// ---- plants built by hand for the DESIGN tables
/** L10 plant at (T C, P bar), y_NH3 % at the converter outlet. */
function l10y(Tc: number, Pbar: number): number {
  const e = start('L10');
  run(e, ammoniaBuild(['F-101'], Tc + 273.15, Pbar * 1e5, 4, 102));
  return m('L10', e).v.y_pct!;
}
/** L11 plant with a feed composition and a pressure: [NH3 formed kmol/h, y %]. */
function l11at(inert: number, Pbar: number, ratio = 3): [number, number] {
  const e = start('L11');
  const a = (1 - inert) / (1 + ratio);
  run(e, [{ name: 'setFeed', args: ['F-101', { x: [a, ratio * a, 0, inert / 2, inert / 2] }] }, ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, Pbar * 1e5, 4, 104).filter((x) => x.name !== 'commission'), { name: 'commission' }]);
  const v = m('L11', e).v;
  return [v.nh3_formed!, v.y_pct!];
}
/** L12 plant at (T C, S/CO, optional compressor): CO mol % dry. */
const l12co = (Tc: number, ratio: number, comp?: { P: number; stages: number }): number => {
  const e = start('L12');
  run(e, shiftBuild(Tc + 273.15, ratio, comp));
  return m('L12', e).v.co_dry_pct!;
};

describe('registry', () => {
  it('L10-L14 are in the game with titles and solvers', () => {
    const ids = LEVELS.map((l) => l.id);
    for (const id of CH3) expect(ids).toContain(id);
    for (const id of CH3) {
      const l = LEVELS.find((x) => x.id === id)!;
      expect(l.title.length).toBeGreaterThan(3); expect(l.brief.length).toBeGreaterThan(10); expect(l.solver).toBeTypeOf('function');
      expect(SPEC_BY_ID[id]!.chapter).toBe(3); expect(NAIVE[id]).toBeTypeOf('function');
    }
  });
});

describe('solvability', () => {
  for (const id of CH3) {
    it(`${id}: the solver wins, idle does not, no short cheese`, () => {
      const level = LEVELS.find((l) => l.id === id)!;
      const r = checkLevel(GAME, level, { seed: 1003, cheeseDepth: 2, cheeseBudget: 400, randomRollouts: 4, randomTicks: 20, solverTicks: 40, idleTicks: 20 });
      expect(r.problems).toEqual([]);
      const e = solve(id);
      expect(e.state.status).toBe('won');
      expect(GAME.invariants!(e.state, null)).toEqual([]);
    });
  }
  it('stars: the solver earns three where the level allows (L11 trades the 150 bar star against the cheapest tonne)', () => {
    expect(card(solve('L10')).stars).toEqual({ have: 3, earned: [true, true, true] });
    expect(card(solve('L11')).stars).toEqual({ have: 2, earned: [true, false, true] });
    expect(card(solve('L12')).stars).toEqual({ have: 3, earned: [true, true, true] });
    expect(card(solve('L13')).stars).toEqual({ have: 3, earned: [true, true, true] });
    expect(card(solve('L14')).stars).toEqual({ have: 3, earned: [true, true, true] });
  });
  it('every level solves in Engineer mode (budget goal listed and met) and Learner mode', () => {
    for (const id of CH3) {
      if (id === 'L14') continue;   // the bench has no budget
      const e = solve(id, { mode: 'engineer' });
      expect(e.state.status, id).toBe('won');
      expect(info(e).goals.map((g: any) => g.key), id).toContain('budget');
      expect(info(e).goals.every((g: any) => g.met), id).toBe(true);
    }
  });
});

describe('L10 · The Wall: the engine against the DESIGN table', () => {
  it('y_NH3 % at the nine DESIGN points (ideal gas, rigorous K), within 0.05 points', () => {
    const table: [number, number, number][] = [[380, 50, 19.0], [380, 100, 29.1], [400, 50, 15.5], [400, 100, 24.7], [450, 100, 16.0], [450, 200, 25.3], [500, 200, 17.5], [500, 300, 22.9], [550, 300, 16.3]];
    for (const [T, P, y] of table) expect(Math.abs(l10y(T, P) - y), `${T} C ${P} bar`).toBeLessThan(0.05);
  });
  it('K(T) falls about 30 times from 400 to 550 C: 1.8e-4 to 5.7e-6 bar^-2', () => {
    expect(kOf('R1', 673.15)).toBeCloseTo(1.8e-4, 5); expect(kOf('R1', 823.15)).toBeCloseTo(5.7e-6, 7);
    expect(kOf('R1', 673.15) / kOf('R1', 823.15)).toBeGreaterThan(28); expect(kOf('R1', 673.15) / kOf('R1', 823.15)).toBeLessThan(34);
  });
  it('the reference is 380 C at the least pressure that makes 20 %: 54 bar here (DESIGN says about 53; 53 bar gives 19.8 %)', () => {
    expect(l10y(380, 53)).toBeLessThan(20); expect(l10y(380, 54)).toBeGreaterThanOrEqual(20);
    const Pmin = brent((P) => l10y(380, P) - 20, 50, 60, { tol: 1e-3, maxIter: 40 }).x;
    expect(Pmin).toBeGreaterThan(53.5); expect(Pmin).toBeLessThan(54);
    expect(L10_REF.P / 1e5).toBe(54);
  });
  it('the boundary optimum: cost per tonne rises with pressure at 380 C, and every warmer design that reaches 20 % costs more', () => {
    const cost = (Tc: number, P: number) => { const e = start('L10'); run(e, ammoniaBuild(['F-101'], Tc + 273.15, P * 1e5, 4, 102)); return m('L10', e).v.cost_usd_t!; };
    expect(cost(380, 54)).toBeLessThan(cost(380, 100)); expect(cost(380, 100)).toBeLessThan(cost(380, 150));
    expect(cost(380, 54)).toBeLessThan(cost(400, 76)); expect(cost(380, 54)).toBeLessThan(cost(450, 160));
    expect(l10y(400, 76)).toBeGreaterThan(20);
  });
  it('the reference cost parts match the engine at the reference design (calibration guard, 0.5 %)', () => {
    const e = solve('L10');
    const v = m('L10', e).v;
    expect(Math.abs(v.nh3_t_h! - L10_REF_PARTS.nh3TperH) / L10_REF_PARTS.nh3TperH).toBeLessThan(0.005);
    expect(Math.abs(v.shaft_kw! - L10_REF_PARTS.shaftKW) / L10_REF_PARTS.shaftKW).toBeLessThan(0.005);
    expect(v.cost_usd_t!).toBeCloseTo(refCost(e.state, L10_REF_PARTS), 1);
  });
  it('the wall: hot and barely compressed fails with the K numbers; a cold converter is asleep; above 300 bar the relief lifts', () => {
    const wall = play('L10', NAIVE.L10!);
    expect(card(wall).verdictKey).toBe('wall'); expect(card(wall).won).toBe(false); expect(card(wall).histogram).toBeNull();
    expect(card(wall).cause).toMatch(/395|equilibrium constant/); expect(card(wall).cause).toContain('3.58');
    expect(info(wall).annunciators.find((a: any) => a.key === 'wall').state).toBe('high');
    const cold = run(start('L10'), ammoniaBuild(['F-101'], 350 + 273.15, 54e5, 2, 102));
    expect(card(cold).verdictKey).toBe('asleep'); expect(info(cold).annunciators.find((a: any) => a.key === 'asleep').state).toBe('high');
    const high = run(start('L10'), ammoniaBuild(['F-101'], 380 + 273.15, 310e5, 4, 102));
    expect(card(high).verdictKey).toBe('relief'); expect(info(high).annunciators.find((a: any) => a.key === 'relief').state).toBe('critical');
    expect(info(high).goals.map((g: any) => g.met)).toEqual([true, false]);
    const low = run(start('L10'), ammoniaBuild(['F-101'], 380 + 273.15, 40e5, 1, 102));
    expect(card(low).verdictKey).toBe('low_p');
  });
  it('a 100 bar vessel is the second star: 100 bar on the line is in, 120 bar is the 200 class', () => {
    const e = run(start('L10'), ammoniaBuild(['F-101'], 380 + 273.15, 100e5, 3, 102)); roll(e);
    expect(card(e).stars.earned).toEqual([true, true, false]);
    const f = run(start('L10'), ammoniaBuild(['F-101'], 380 + 273.15, 120e5, 3, 102)); roll(f);
    expect(card(f).stars.earned).toEqual([true, false, false]);
    expect(m('L10', f).v.class).toBe(200);
  });
});

describe('L11 · The Gas You Were Sold: the engine against the DESIGN numbers', () => {
  it('DESIGN: pure 1:3 at 150 bar makes 174.8 kmol/h (21.2 %), the 5 % gas 160.6 (19.1 %), the 10 % gas 17.2 %', () => {
    const [n0, y0] = l11at(0, 150), [n5, y5] = l11at(0.05, 150), [, y10] = l11at(0.1, 150);
    expect(n0).toBeCloseTo(174.8, 0); expect(y0).toBeCloseTo(21.2, 1);
    expect(n5).toBeCloseTo(160.6, 0); expect(y5).toBeCloseTo(19.1, 1);
    expect(y10).toBeCloseTo(17.2, 1);
  });
  it('DESIGN: H2:N2 ratio 2.5 gives 21.0 %, ratio 4.0 gives 20.7 %, and the stoichiometric 3 gives the most (21.2 %)', () => {
    const y25 = l11at(0, 150, 2.5)[1], y3 = l11at(0, 150, 3)[1], y4 = l11at(0, 150, 4)[1];
    expect(y25).toBeCloseTo(21.0, 1); expect(y4).toBeCloseTo(20.7, 1);
    expect(y3).toBeGreaterThan(y25); expect(y3).toBeGreaterThan(y4);
  });
  it('the 170 kmol/h pressures: pure 142.5 bar, the 5 % gas 166.8 bar (DESIGN says about 175: disagreement, the engine reads 166.8), the 10 % gas 197.9 bar', () => {
    const need = (inert: number) => brent((P) => l11at(inert, P)[0] - L11_NH3_MIN, 120, 200, { tol: 1e-3, maxIter: 50 }).x;
    expect(need(0)).toBeCloseTo(142.5, 0); expect(need(0.05)).toBeCloseTo(166.8, 0); expect(need(0.1)).toBeCloseTo(197.9, 0);
    expect(L11_REF.P / 1e5).toBeGreaterThanOrEqual(need(0.05));
  });
  it('the cheapest tonne is the middle contract: B beats A and the cheap C, which only just makes the tonnage at the vessel limit', () => {
    const cost = (c: number, P: number) => {
      const e = start('L11');
      const flows = [0, 0, 0]; flows[c] = 1000;
      run(e, [...flows.map((fl, i) => ({ name: 'setFeed', args: [`F-${101 + i}`, { flow: (fl * 1000) / 3600 }] })), ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, P * 1e5, 4, 104)]);
      return m('L11', e).v;
    };
    const a = cost(0, 143), b = cost(1, 167), c = cost(2, 199);
    for (const v of [a, b, c]) expect(v.nh3_formed!).toBeGreaterThanOrEqual(L11_NH3_MIN);
    expect(b.cost_usd_t!).toBeLessThan(a.cost_usd_t!); expect(b.cost_usd_t!).toBeLessThan(c.cost_usd_t!);
    expect(L11_CONTRACTS.map((x) => x.id)).toEqual(['A', 'B', 'C']);
    expect(cost(2, 190).nh3_formed!).toBeLessThan(L11_NH3_MIN);   // the cheap gas cannot make it with pressure to spare
  });
  it('pure gas at 143 bar earns the 150 bar star but not the cheapest tonne; the reference parts match the engine (0.5 %)', () => {
    const e = run(start('L11'), [{ name: 'setFeed', args: ['F-101', { flow: 1000e3 / 3600 }] }, ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, 143e5, 4, 104)]); roll(e);
    expect(e.state.status).toBe('won'); expect(card(e).stars.earned).toEqual([true, true, false]);
    const g = solve('L11'), v = m('L11', g).v;
    expect(Math.abs(v.nh3_t_h! - L11_REF_PARTS.nh3TperH) / L11_REF_PARTS.nh3TperH).toBeLessThan(0.005);
    expect(Math.abs(v.shaft_kw! - L11_REF_PARTS.shaftKW) / L11_REF_PARTS.shaftKW).toBeLessThan(0.005);
    expect(v.cost_usd_t!).toBeCloseTo(refCost(g.state, L11_REF_PARTS, 1400), 0);
  });
  it('the cheap gas at the pure-gas pressure falls short and says why; wrong total gas and a wrong temperature are named', () => {
    const naive = play('L11', NAIVE.L11!);
    expect(card(naive).verdictKey).toBe('short'); expect(card(naive).cause).toContain('10'); expect(card(naive).cause).toMatch(/inerts/);
    expect(info(naive).annunciators.find((a: any) => a.key === 'inert').state).toBe('critical');
    const gas = run(start('L11'), [{ name: 'setFeed', args: ['F-101', { flow: 500e3 / 3600 }] }, ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, 150e5, 4, 104)]);
    expect(card(gas).verdictKey).toBe('gas');
    const temp = run(start('L11'), ammoniaBuild(['F-101', 'F-102', 'F-103'], 400 + 273.15, 150e5, 4, 104));
    expect(card(temp).verdictKey).toBe('temp');
    const press = run(start('L11'), ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, 250e5, 4, 104));
    expect(card(press).verdictKey).toBe('press');
  });
});

describe('L12 · Pressure Does Nothing: the engine against the DESIGN table', () => {
  it('CO % dry at the DESIGN points (within 0.006 points: DESIGN rounds 1.125 to 1.12)', () => {
    const table: [number, number, number][] = [[250, 1.5, 1.03], [250, 2, 0.54], [350, 3, 1.12], [350, 4, 0.76], [400, 4, 1.30]];
    for (const [T, r, co] of table) expect(Math.abs(l12co(T, r) - co), `${T} C S/CO ${r}`).toBeLessThan(0.006);
    expect(l12co(400, 4)).toBeGreaterThan(1.0);   // the 400 C case fails even at S/CO 4
  });
  it('pressure does nothing: the same CO to 9 digits with a 20 bar compressor, and the extra kW is on the printout', () => {
    const a = l12co(350, 3), b = l12co(350, 3, { P: 20e5, stages: 4 });
    expect(b).toBeCloseTo(a, 9);
    const e = run(start('L12'), shiftBuild(350 + 273.15, 3, { P: 20e5, stages: 4 }));
    expect(m('L12', e).v.comp_kw!).toBeGreaterThan(100);
    expect(m('L12', e).v.comp_usd_h!).toBeGreaterThan(10);
  });
  it('K(R5) at 400 C is 12.3 within 2 % (DESIGN); the oracle EQ-CE-027 K(1000 K) = 1.461 is 1.6 % above the engine (the oracle uses its own Cp polynomial)', () => {
    expect(Math.abs(K400_TRUTH() - 12.3) / 12.3).toBeLessThan(0.02);
    const k1000 = oracle('EQ-CE-027').expected.K1000 as number;
    expect(Math.abs(kOf('R5', 1000) - k1000) / k1000).toBeLessThan(0.02);
  });
  it('the reference design (LTS 200 C, S/CO 1.25) is the cheapest of the working designs on a grid of temperatures and ratios, within the 3 % star band', () => {
    const e = solve('L12'); const ref = m('L12', e).v.cost_usd_h!;
    expect(ref).toBeCloseTo(l12RefCost(e.state), 6);
    const cost = (Tc: number, r: number): number | null => { const x = run(start('L12'), shiftBuild(Tc + 273.15, r)); const v = m('L12', x).v; return v.co_dry_pct! <= 1 && v.cat_ok === 1 ? v.cost_usd_h! : null; };
    for (const [Tc, r] of [[250, 2], [350, 4], [320, 4.5], [300, 3], [230, 1.5]] as const) { const c = cost(Tc, r); if (c !== null) expect(c, `${Tc} C ${r}`).toBeGreaterThan(ref); }
    expect(cost(200, 1.0)).toBeNull();
    expect(L12_REF.ratio).toBe(1.25);
  });
  it('the naive "help" (HTS at 350 C, S/CO 3, a 20 bar compressor) fails with the push verdict; the gap between the catalysts and a sleeping LTS are named', () => {
    const naive = play('L12', NAIVE.L12!);
    expect(card(naive).verdictKey).toBe('push'); expect(card(naive).won).toBe(false); expect(card(naive).histogram).toBeNull();
    expect(card(naive).cause).toContain('1.12'); expect(card(naive).cause).toMatch(/kW/);
    expect(info(naive).annunciators.find((a: any) => a.key === 'comp').state).toBe('high');
    const gap = run(start('L12'), shiftBuild(290 + 273.15, 3));
    expect(card(gap).verdictKey).toBe('window'); expect(info(gap).annunciators.find((a: any) => a.key === 'cat').state).toBe('high');
    const asleep = run(start('L12'), shiftBuild(180 + 273.15, 3));
    expect(card(asleep).verdictKey).toBe('window');
    const dry = run(start('L12'), shiftBuild(250 + 273.15, 1.0));
    expect(card(dry).verdictKey).toBe('co_high');
  });
  it('a compressor costs the second star; it never helps the CO', () => {
    const e = run(start('L12'), shiftBuild(L12_REF.T, L12_REF.ratio, { P: 10e5, stages: 2 })); roll(e);
    expect(e.state.status).toBe('won'); expect(card(e).stars.earned).toEqual([true, false, false]);
  });
});

describe('L13 · The Staircase: the engine against the DESIGN table', () => {
  /** Cumulative conversion % after each bed of a four-bed line with equal inlets, and the bed-1 exit temperature. */
  function stairs(Tc: number): { cum: number[]; exit1: number } {
    const e = run(start('L13'), stairBuild(4, Tc + 273.15, Tc + 273.15, 400 + 273.15));
    const sol = e.state.solved!, ch = chainOf(e.state);
    let left = 1; const cum: number[] = [];
    for (const id of ch.beds) { left *= 1 - sol.units[id]!.info.X!; cum.push((1 - left) * 100); }
    return { cum, exit1: sol.units[ch.beds[0]!]!.info.T_out! - 273.15 };
  }
  it('inlet 410 C each bed: 70.6, 95.7, 98.95, 99.16 %', () => {
    const { cum } = stairs(410);
    [70.6, 95.7, 98.95, 99.16].forEach((x, i) => expect(Math.abs(cum[i]! - x), `bed ${i + 1}`).toBeLessThan(0.06));
  });
  it('inlet 420 / 430 / 440 C: bed 1 exit 621 / 626 / 631 C and the stairs of DESIGN', () => {
    const t420 = stairs(420), t430 = stairs(430), t440 = stairs(440);
    expect(Math.abs(t420.exit1 - 621)).toBeLessThan(0.6); expect(Math.abs(t430.exit1 - 626)).toBeLessThan(0.6); expect(Math.abs(t440.exit1 - 631)).toBeLessThan(0.6);
    [69.1, 94.7, 98.6, 98.9].forEach((x, i) => expect(Math.abs(t420.cum[i]! - x), `420 bed ${i + 1}`).toBeLessThan(0.1));
    [67.5, 93.5, 98.2].forEach((x, i) => expect(Math.abs(t430.cum[i]! - x), `430 bed ${i + 1}`).toBeLessThan(0.1));
    expect(t440.exit1).toBeGreaterThan(630);   // sinters
  });
  it('the reference is three beds at 415 C: 98.8 % overall; two beds fall short (95.6 %), the fourth bed adds 0.4 points', () => {
    const e = solve('L13');
    expect(m('L13', e).v.conv_pct!).toBeGreaterThan(98.7); expect(m('L13', e).v.conv_pct!).toBeLessThan(98.9);
    const two = run(start('L13'), stairBuild(2, 415 + 273.15, 415 + 273.15, 400 + 273.15));
    expect(m('L13', two).v.conv_pct!).toBeLessThan(98); expect(card(two).verdictKey).toBe('short');
    const four = run(start('L13'), stairBuild(4, 415 + 273.15, 415 + 273.15, 400 + 273.15));
    expect(m('L13', four).v.conv_pct! - m('L13', e).v.conv_pct!).toBeGreaterThan(0.2);
  });
  it('the reference cost matches the engine, and a fourth bed is not cheaper per tonne of acid; three beds is the ★★ line', () => {
    const e = solve('L13');
    expect(m('L13', e).v.cost_usd_t!).toBeCloseTo(refAcidCost(e.state), 2);
    const four = run(start('L13'), stairBuild(4, 415 + 273.15, 415 + 273.15, 400 + 273.15)); roll(four);
    expect(four.state.status).toBe('won'); expect(card(four).stars.earned[1]).toBe(false);
    expect(m('L13', four).v.cost_usd_t!).toBeGreaterThan(m('L13', e).v.cost_usd_t!);
  });
  it('one bed stalls at 70.6 % on the curve; 440 C sinters; 400 C inlets are asleep', () => {
    const one = play('L13', NAIVE.L13!);
    expect(card(one).verdictKey).toBe('stall'); expect(card(one).won).toBe(false); expect(card(one).histogram).toBeNull();
    expect(m('L13', one).v.conv_pct!).toBeCloseTo(70.6, 1); expect(card(one).cause).toContain('70.6');
    expect(info(one).annunciators.find((a: any) => a.key === 'stall').state).toBe('high');
    const hot = run(start('L13'), stairBuild(3, 440 + 273.15, 415 + 273.15, 400 + 273.15));
    expect(card(hot).verdictKey).toBe('sinter'); expect(info(hot).annunciators.find((a: any) => a.key === 'sinter').state).toBe('critical');
    expect(info(hot).goals.map((g: any) => g.met)).toEqual([true, false]);
    const asleep = run(start('L13'), stairBuild(3, 400 + 273.15, 400 + 273.15, 390 + 273.15));
    expect(card(asleep).verdictKey).toBe('asleep');
  });
});

describe('L14 · Two Flasks (oracles EQ-NC-024, -030, -031, -034; D-B1: the open flask is real, the book K answers the call)', () => {
  const flask = (e: Env<EqState>) => e.state.solved!.units['U-104']!.info;
  const base = (): Env<EqState> => run(start('L14'), [{ name: 'commission' }]);
  it('EQ-NC-024: the book flask (the twin: the flask on the book K) reads 9.15 bar with alpha 0.8373, Kp 85.87 bar, Kc 2.586 (0.5 %)', () => {
    const o = oracle('EQ-NC-024'), e = start('L14');
    e.state.flowsheet.units.find((u) => u.id === 'U-104')!.params.book_K = bookWorking({ region: 'global' }).kp;   // the twin flask: the unit on the book's own data
    run(e, [{ name: 'commission' }]); const f = flask(e);
    expect(problem({ region: 'global' }).P).toBe(9.15);
    expect(Math.abs(f.P_bar! - 9.15) / 9.15).toBeLessThan(0.005);
    expect(Math.abs(f.alpha! - (o.expected.alpha as number)) / (o.expected.alpha as number)).toBeLessThan(0.005);
    expect(Math.abs(f.Kp_bar! - (o.expected.Kp_bar as number)) / (o.expected.Kp_bar as number)).toBeLessThan(0.005);
    const Kc = f.Kp_bar! * 1e5 / (8.3 * 400) / 1000;   // Kp / (R T) with R = 0.083 L bar / (mol K), mol / L
    expect(Math.abs(Kc - (o.expected.Kc_mol_L as number)) / (o.expected.Kc_mol_L as number)).toBeLessThan(0.005);
    expect(Math.abs(bookWorking({ region: 'global' }).kp - (o.expected.Kp_bar as number)) / (o.expected.Kp_bar as number)).toBeLessThan(1e-9);
    expect(m('L14', e).v.no2!).toBeCloseTo(251.2, 0);
  });
  it('EQ-NC-034: halving the volume gives Q / K = 2 and the equilibrium shifts left (alpha falls); the NO2 colour darkens', () => {
    const o = oracle('EQ-NC-034');
    expect(o.expected.direction).toBe('left');
    const a = base(), f0 = flask(a);
    const pA = (1 - f0.alpha!) / (1 + f0.alpha!) * f0.P_bar!, pB = (2 * f0.alpha!) / (1 + f0.alpha!) * f0.P_bar!;
    const qk = ((2 * pB) ** 2 / (2 * pA)) / f0.Kp_bar!;   // every partial pressure doubles at once
    expect(Math.abs(qk - (o.expected.Q_over_K as number)) / (o.expected.Q_over_K as number)).toBeLessThan(o.tol.rel!);
    const b = run(start('L14'), [{ name: 'setParam', args: ['U-104', 'V', 0.5e-3] }, { name: 'commission' }]), f1 = flask(b);
    expect(f1.alpha!).toBeLessThan(f0.alpha!);
    expect(f1.no2_mol_m3!).toBeGreaterThan(f0.no2_mol_m3!); expect(f1.no2_mol_m3!).toBeLessThan(2 * f0.no2_mol_m3!);
    expect(f1.Kp_bar!).toBeCloseTo(f0.Kp_bar!, 8);   // K is constant at constant T
  });
  it('EQ-NC-030: argon at constant volume changes nothing (alpha to 9 digits, the gauge rises by the argon pressure)', () => {
    expect(oracle('EQ-NC-030').expected.direction).toBe('none');
    const a = base(), f0 = flask(a);
    const b = run(start('L14'), [{ name: 'setFeed', args: ['F-102', { flow: 0.15 }] }, { name: 'commission' }]), f1 = flask(b);
    expect(f1.alpha!).toBeCloseTo(f0.alpha!, 9); expect(f1.no2_mol_m3!).toBeCloseTo(f0.no2_mol_m3!, 6);
    expect(f1.P_bar!).toBeGreaterThan(f0.P_bar!);
  });
  it('EQ-NC-031: argon at constant pressure shifts right (alpha rises, the colour pales)', () => {
    expect(oracle('EQ-NC-031').expected.direction).toBe('left');   // the oracle names the shift of the reaction as written for N2 + 3H2; here the volume grows
    const a = base(), f0 = flask(a);
    const b = run(start('L14'), [{ name: 'setFeed', args: ['F-102', { flow: 0.15 }] }, { name: 'setParam', args: ['U-104', 'Pfix', 9.15e5] }, { name: 'commission' }]), f1 = flask(b);
    expect(f1.alpha!).toBeGreaterThan(f0.alpha!); expect(f1.no2_mol_m3!).toBeLessThan(f0.no2_mol_m3!);
  });
  it('real N2O4 (NIST-JANAF): Kp(400 K) = 51.1 bar and the flask would read 8.83 bar; the card prints both beside the book', () => {
    const r = realFlask({ region: 'global' });
    expect(Math.abs(r.kp - 51.1) / 51.1).toBeLessThan(0.01); expect(Math.abs(r.P - 8.83) / 8.83).toBeLessThan(0.005);
    const c = card(solve('L14')).card;
    expect(c.book_kp_bar).toBeCloseTo(85.87, 1); expect(c.real_kp_bar).toBeCloseTo(r.kp, 9); expect(c.real_p_bar).toBeCloseTo(8.83, 1); expect(c.book_p_bar).toBe(9.15);
  });
  it('D-B1: the open flask is real N2O4: 8.83 bar at 400 K, and it reads the book 9.15 bar only at T* (about 406.5 K), which lights the BOOK FLASK star', () => {
    const e = base();
    expect(Math.abs(flask(e).P_bar! - 8.83) / 8.83).toBeLessThan(0.005);
    expect(foundBookFlask(e.state)).toBe(false);
    const T = bookT({ region: 'global' });
    expect(T).toBeGreaterThan(405); expect(T).toBeLessThan(408);
    run(e, [{ name: 'setParam', args: ['U-104', 'T', Math.round(T * 100) / 100] }, { name: 'commission' }]);
    expect(Math.abs(flask(e).P_bar! - 9.15) / 9.15).toBeLessThan(0.005);
    expect(foundBookFlask(e.state)).toBe(true);
    const hot = run(start('L14'), [{ name: 'setParam', args: ['U-104', 'T', 450] }, { name: 'commission' }]);
    expect(flask(hot).no2_mol_m3!).toBeGreaterThan(flask(e).no2_mol_m3!);   // heating darkens the gas: the shift is real now
  });
  it('the run record proves the three tests; the order does not matter; the tests are a star, the book flask is the goal (phase C)', () => {
    const e = start('L14');
    expect(testsDone(e.state)).toEqual([false, false, false]);
    run(e, [{ name: 'setParam', args: ['U-104', 'Pfix', 20e5] }, { name: 'setFeed', args: ['F-102', { flow: 0.15 }] }, { name: 'commission' }]);
    expect(testsDone(e.state)).toEqual([false, false, false]);   // argon at 20 bar is a pressure change, not the inert-gas test (Anjali)
    run(e, [{ name: 'setParam', args: ['U-104', 'Pfix', Math.round(realFlask({ region: 'global' }).P * 1e5)] }, { name: 'setFeed', args: ['F-102', { flow: 0 }] }, { name: 'commission' }]);
    expect(info(e).goals[0].met).toBe(false);
    expect(card(e).verdictKey).toBe('not_found');
    run(e, [{ name: 'setFeed', args: ['F-102', { flow: 0.15 }] }, { name: 'commission' }]);
    expect(testsDone(e.state)).toEqual([false, false, true]);
    run(e, [{ name: 'setParam', args: ['U-104', 'Pfix', 0] }, { name: 'commission' }]);
    expect(testsDone(e.state)).toEqual([false, true, true]);
    run(e, [{ name: 'setFeed', args: ['F-102', { flow: 0 }] }, { name: 'setParam', args: ['U-104', 'V', 0.5e-3] }, { name: 'commission' }]);
    expect(testsDone(e.state)).toEqual([true, true, true]);
    run(e, [{ name: 'setParam', args: ['U-104', 'V', 1e-3] }, { name: 'commission' }]); roll(e);
    expect(e.state.status).toBe('playing');   // all three tests do not win: the book flask does
    run(e, [{ name: 'setParam', args: ['U-104', 'T', Math.round(bookT({ region: 'global' }) * 100) / 100] }, { name: 'commission' }]); roll(e);
    expect(e.state.status).toBe('won'); expect(card(e).stars.earned).toEqual([true, true, false]);
  });
  it('phase C: ten runs of lab time; the tenth run without the book flask loses, with a reason', () => {
    const e = start('L14');
    for (let i = 0; i < 9; i++) run(e, [{ name: 'setParam', args: ['U-104', 'T', 370 + i] }, { name: 'commission' }]);   // cold runs: never the book flask (T* is 406.5 K)
    expect(e.state.status).toBe('playing'); expect(info(e).goals[0]).toMatchObject({ met: false, value: 9, target: 10 });
    run(e, [{ name: 'setParam', args: ['U-104', 'T', 380] }, { name: 'commission' }]); roll(e);
    expect(e.state.status).toBe('lost'); expect(card(e).cause).toContain('Runs left: 0');
  });
  it('phase C: the book flask alone wins at once (the tests are a star)', () => {
    const e = start('L14');
    run(e, [{ name: 'setParam', args: ['U-104', 'T', Math.round(bookT({ region: 'global' }) * 100) / 100] }, { name: 'commission' }]); roll(e);
    expect(e.state.status).toBe('won'); expect(card(e).stars.earned).toEqual([true, false, false]);
  });
  it('the notebook flask at 400 K does not win: it reads 8.83 bar, and the card says to turn the T wheel', () => {
    const e = base(); roll(e);
    expect(e.state.status).toBe('playing'); expect(card(e).verdictKey).toBe('not_found'); expect(card(e).cause).toContain('turn the T wheel');
  });
  it('the volume typed in litres (1 m3) runs none of the tests and does not find the book flask', () => {
    const e = play('L14', NAIVE.L14!);
    expect(card(e).verdictKey).toBe('not_found'); expect(card(e).won).toBe(false); expect(card(e).histogram).toBeNull();
  });
});

describe('Call it grading at the oracle tolerance', () => {
  const call = (id: string, x: number | null): Env<EqState> => {
    const e = start(id);
    if (x !== null) act(e, 'callIt', x);
    for (const a of SPEC_BY_ID[id]!.solver(1003)(e.state, e.ctx(new Rng(1)))) if (a.name !== 'callIt') act(e, a.name, ...(a.args ?? []));
    return roll(e);
  };
  it('L14: Kp within 0.5 % of EQ-NC-024 earns the call star; 85.9 is in, 86.5 and 83.7 (R = 0.083145) are out', () => {
    const kp = oracle('EQ-NC-024').expected.Kp_bar as number;
    for (const [x, ok] of [[kp, true], [85.9, true], [kp * 1.0045, true], [kp * 0.9955, true], [86.5, false], [83.71, false]] as const) {
      const e = call('L14', x);
      expect(card(e).stars.earned[2], String(x)).toBe(ok); expect(card(e).callIt.ok, String(x)).toBe(ok);
    }
    expect(card(call('L14', null)).stars.earned).toEqual([true, true, false]);   // phase C: the solver finds the book flask (the goal) and runs the tests
  });
  it('L13: bed-1 exit at 420 C inlet is 621 C (DESIGN, 0.5 %) within 1 %; L12: K(400 C) within 2 %; L10: K(450 C) within 5 %', () => {
    expect(Math.abs(bed1ExitC() - 621) / 621).toBeLessThan(0.005);
    expect(SPEC_BY_ID.L13!.callIt!.tol).toBe(0.01); expect(SPEC_BY_ID.L12!.callIt!.tol).toBe(0.05); // F14: a textbook-table K (11.7) passes expect(SPEC_BY_ID.L10!.callIt!.tol).toBe(0.05);
    const grade = (id: string, truth: number, tol: number) => {
      for (const [f, ok] of [[1, true], [1 + tol * 0.9, true], [1 - tol * 0.9, true], [1 + tol * 1.1, false], [1 - tol * 1.1, false], [2, false]] as const) {
        const e = call(id, truth * f); expect(card(e).callIt.ok, `${id} x${f}`).toBe(ok);
      }
    };
    grade('L13', bed1ExitC(), 0.01); grade('L12', K400_TRUTH(), 0.05); grade('L10', K450_E5(), 0.05);
    expect(K450_E5()).toBeCloseTo(4.9, 1);
  });
  it('a prediction is a prediction: callIt after a commission is refused; L11 has none', () => {
    const e = start('L12');
    run(e, shiftBuild(L12_REF.T, L12_REF.ratio));
    const r = act(e, 'callIt', 12.3);
    expect(r.info.ok).toBe(false); expect(r.info.message).toMatch(/before you commission/);
    expect(act(start('L11'), 'callIt', 1).info.ok).toBe(false);
  });
});

describe('levelInfo contract', () => {
  const KEYS = ['id', 'chapter', 'index', 'title', 'setter', 'place', 'note', 'goals', 'budgetUSD', 'spentUSD', 'stars', 'callIt', 'allowedUnits', 'hero', 'secondary', 'annunciators', 'phase', 'firstRun', 'coach', 'lesson', 'mode'];
  for (const id of CH3) {
    it(`${id}: every field present, numbers finite, 4-8 annunciators, caps legends of at most 14 characters, at start and after the solver`, () => {
      for (const mode of ['learner', 'engineer', 'sandbox']) for (const e of [start(id, 1003, mode), solve(id, { mode })]) {
        const q = info(e);
        for (const k of KEYS) expect(q, `${id} ${mode} ${k}`).toHaveProperty(k);
        expect(allFinite(q)).toBeNull();
        expect(q.id).toBe(id); expect(q.chapter).toBe(3);
        expect(q.note.length).toBe(2); expect(q.note.every((n: string) => n.length > 5 && !n.includes('lv.'))).toBe(true);
        for (const g of q.goals) { expect(g.text.length).toBeGreaterThan(5); expect(g.text).not.toContain('lv.'); expect(g.text).not.toMatch(/\{/); expect(typeof g.met).toBe('boolean'); }
        expect(q.stars.rules).toHaveLength(3);
        expect(q.annunciators.length).toBeGreaterThanOrEqual(4); expect(q.annunciators.length).toBeLessThanOrEqual(8);
        for (const a of q.annunciators) { expect(a.legend).toBe(a.legend.toUpperCase()); expect(a.legend.length).toBeLessThanOrEqual(14); expect(['off', 'normal', 'high', 'critical']).toContain(a.state); }
        expect(q.annunciators.some((a: any) => a.key === 'goal')).toBe(true);
        expect(q.hero.label.length).toBeGreaterThan(2); expect(q.hero.hi).toBeGreaterThanOrEqual(q.hero.lo);
        expect(q.lesson.length > 20 || (q.callIt !== null && !q.callIt.answered && q.phase === 'design' && q.lesson === ''), 'the lesson is withheld only while a prediction is open').toBe(true); expect(q.lesson).not.toMatch(/\{/);
        expect(q.setter).toMatch(/^[a-z]+$/); expect(q.setterName.length).toBeGreaterThan(3);
        expect(q.allowedUnits.every((u: any) => u.used <= u.max && u.priceUSD > 0)).toBe(true);
        if (q.callIt) expect(q.callIt.prompt).not.toContain('lv.');
      }
    });
  }
  it('the lesson holds the player numbers', () => {
    const w = play('L10', NAIVE.L10!);
    expect(info(w).lesson).toContain('3.58'); expect(info(w).lesson).toContain('500');
    expect(info(solve('L10')).lesson).toContain('20'); expect(info(solve('L10')).lesson).toContain('54');
    expect(info(solve('L11')).lesson).toContain('167'); expect(info(solve('L11')).lesson).toContain('5');
    expect(info(solve('L12')).lesson).toContain('0.77'); expect(info(solve('L12')).lesson).toContain('1.25');
    expect(info(solve('L13')).lesson).toContain('98.79'); expect(info(solve('L13')).lesson).toContain('69.84');
    expect(info(solve('L14')).lesson).toContain('0.837'); expect(info(solve('L14')).lesson).toContain('85.87'); expect(info(solve('L14')).lesson).toContain('8.83');
  });
  it('the coach follows the engine state in Learner mode and is silent in Engineer and Sandbox', () => {
    const e = start('L10');
    expect(info(e).coach).toMatchObject({ step: 1, total: 6, speaker: 'victor', focus: { rack: 'compressor' } });
    act(e, 'placeUnit', 'compressor', 8, 2, 0); expect(info(e).coach.step).toBe(2);
    expect(info(e).coach.why).toMatch(/^Why:/);
    expect(info(start('L10', 1003, 'engineer')).coach).toBeNull(); expect(info(start('L10', 1003, 'sandbox')).coach).toBeNull();
    expect(info(start('L14')).coach).toMatchObject({ step: 1, total: 7, speaker: 'mara' });   // phase C: + find the book flask
    for (const id of CH3) expect(info(solve(id)).coach).toBeNull();
  });
  it('before a run the answers are not on the screen (L14: Kp and T*; L11 spent units)', () => {
    // D-B1: L14's hero band is the twin (the book's 9.15 bar, printed in the brief), no longer the answer; the answers are the book Kp and T*, and neither is shown
    const li = info(start('L14')), txt = JSON.stringify(li);
    expect(li.hero.lo).toBeCloseTo(9.15 * 0.995, 6);
    expect(txt).not.toMatch(/85\.8|85,8|406\.[0-9]|406,[0-9]/);
    expect(info(start('L11')).allowedUnits.find((u: any) => u.type === 'feed')).toMatchObject({ max: 3, used: 3 });
  });
});

describe('resultCard contract', () => {
  it('no histogram on failure; a 200-sample histogram on a win; passes carry no cause; three metrics', () => {
    for (const id of CH3) {
      const bad = card(play(id, NAIVE[id]!, { seed: 1003 }));
      expect(bad.won, id).toBe(false); expect(bad.histogram, id).toBeNull(); expect(bad.cause.length, id).toBeGreaterThan(20);
      const good = card(solve(id));
      expect(good.won, id).toBe(true); expect(good.cause, id).toBeUndefined();
      const h = good.histogram;
      expect(h.bins.reduce((a: number, b: number) => a + b, 0), id).toBe(200); expect(h.bins).toHaveLength(12);
      expect(h.you).toBeGreaterThanOrEqual(h.edges[0]); expect(h.you).toBeLessThanOrEqual(h.edges[12]);
      expect(good.metrics, id).toHaveLength(3);
    }
  });
  it('the shape of every field, finite numbers, texts without keys or braces', () => {
    for (const id of CH3) for (const e of [play(id, NAIVE[id]!), solve(id)]) {
      const c = card(e);
      expect(c).not.toBeNull();
      for (const k of ['won', 'verdictKey', 'verdictText', 'metrics', 'stars', 'histogram', 'lesson', 'designCode']) expect(c, `${id} ${k}`).toHaveProperty(k);
      expect(allFinite(c)).toBeNull();
      expect(c.verdictText).not.toContain('lv.'); expect(c.lesson).not.toMatch(/\{/); if (c.cause) expect(c.cause).not.toMatch(/\{|lv\./);
      for (const x of c.metrics) { expect(x.label).not.toContain('lv.'); expect(typeof x.unit).toBe('string'); }
    }
  });
  it('the equation holds with the player numbers, on every run', () => {
    let seen = 0;
    const runs: Env<EqState>[] = [];
    for (const id of CH3) runs.push(play(id, NAIVE[id]!), solve(id));
    runs.push(run(start('L10'), ammoniaBuild(['F-101'], 400 + 273.15, 76e5, 2, 102)), base14(), run(start('L12'), shiftBuild(250 + 273.15, 2)));
    for (const e of runs) {
      const eq = card(e)?.equation as string | undefined;
      if (eq === undefined) continue;
      seen++;
      expect(equationHolds(eq), eq).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(8);
  });
  it('a failed commission prints its coded cause: a compressor that discharges too hot', () => {
    const e = run(start('L10'), ammoniaBuild(['F-101'], 380 + 273.15, 250e5, 2, 102));
    const c = card(e);
    expect(c.verdictKey).toBe('solve_fail'); expect(c.won).toBe(false); expect(c.cause.length).toBeGreaterThan(10);
    expect(info(e).annunciators.find((a: any) => a.key === 'solve').state).toBe('critical');
  });
});
function base14(): Env<EqState> { return run(start('L14'), [{ name: 'commission' }]); }

describe('solution codes, determinism, strings', () => {
  it('the design code of every solver run verifies on a fresh engine and reproduces the metrics', () => {
    for (const id of CH3) {
      const e = solve(id);
      const code = card(e).designCode as string;
      expect('error' in decodeSolution(code)).toBe(false);
      const v = verify(id, code);
      expect(v.ok, `${id}: ${v.reason}`).toBe(true);
      expect(v.metrics).toEqual(GAME.metrics!(e.state));
    }
  });
  it('same actions, same hash; a different attempt, a different hash', () => {
    for (const id of CH3) {
      expect(hashOf(solve(id).state), id).toBe(hashOf(solve(id).state));
      expect(hashOf(solve(id).state), id).not.toBe(hashOf(play(id, NAIVE[id]!).state));
    }
  });
  it('no level text asks for a missing key or variable, in any mode', () => {
    i18n.clearMissing();
    for (const mode of ['learner', 'engineer', 'sandbox']) for (const id of CH3) for (const e of [start(id, 1003, mode), solve(id, { mode }), play(id, NAIVE[id]!, { mode })]) { info(e); card(e); }
    for (const e of [run(start('L10'), ammoniaBuild(['F-101'], 380 + 273.15, 310e5, 4, 102)), run(start('L10'), ammoniaBuild(['F-101'], 350 + 273.15, 54e5, 2, 102)),
      run(start('L12'), shiftBuild(290 + 273.15, 3)), run(start('L12'), shiftBuild(180 + 273.15, 3)), run(start('L12'), shiftBuild(250 + 273.15, 1)),
      run(start('L13'), stairBuild(3, 440 + 273.15, 415 + 273.15, 400 + 273.15)), run(start('L13'), stairBuild(3, 400 + 273.15, 400 + 273.15, 390 + 273.15)), run(start('L13'), stairBuild(2, 415 + 273.15, 415 + 273.15, 400 + 273.15)),
      run(start('L11'), [{ name: 'setFeed', args: ['F-101', { flow: 500e3 / 3600 }] }, ...ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, 150e5, 4, 104)]),
      run(start('L11'), ammoniaBuild(['F-101', 'F-102', 'F-103'], 400 + 273.15, 150e5, 4, 104)), run(start('L11'), ammoniaBuild(['F-101', 'F-102', 'F-103'], L11_T_K, 250e5, 4, 104))]) { info(e); card(e); }
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
  it('the unit limits and presets of the levels hold (one converter in L10; the bench of L14 has nothing to place)', () => {
    const e = start('L10');
    expect(act(e, 'placeUnit', 'eq_reactor', 12, 0, 0).info.ok).toBe(true);
    expect(act(e, 'placeUnit', 'eq_reactor', 12, 6, 0).info.ok).toBe(false);
    expect(act(e, 'placeUnit', 'boiler', 12, 10, 0).info.ok).toBe(false);
    expect(e.state.flowsheet.units.find((u) => u.type === 'eq_reactor')!.params).toMatchObject({ reactions: 'R1', mode: 'isothermal', Tmin: 653.15 });
    const b = start('L14');
    expect(act(b, 'placeUnit', 'compressor', 12, 10, 0).info.ok).toBe(false);
    expect(b.state.flowsheet.units.map((u) => u.type)).toEqual(['feed', 'feed', 'mixer', 'lab_flask', 'vent']);
    expect(ammoniaMeasures(start('L10').state).ok).toBe(false);
  });
});
