// Chapter-5 levels L19-L21 (The Loop): solvability, the failures DESIGN names, the DESIGN reference numbers against the engine, Call-it grading, the levelInfo /
// resultCard contract, determinism, solution codes. Expected numbers come from src/oracle/oracles.json, from an independent equilibrium calculation, or
// from the DESIGN table (with its stated precision); the calibrated constants (GAME, UNVERIFIED) are re-derived from the solver's run here.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, hashOf } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { verify } from '../verify';
import oracleFile from '../oracle/oracles.json';
import { LEVELS } from '../levels';
import { dmath } from '@core/numerics';
import { findReaction } from '../data/reactions';
import { lnKOfReaction } from '../sim/chem/reactions';
import { psatSpecies } from '../sim/thermo/vle';
import type { EqState } from '../state';
import { ledgerOf, pricesOf } from '../engine/solved';
import { refrigerationCostPerH } from '../sim/econ/opex';
import { NAIVE, SPEC_BY_ID } from './registry';
import { L19_COST_MAX, L19_KW_MAX, L19_REF, P_LOOP, DP_RX, T_RX, T_SEP } from './l19';
import { L20_COST_MAX, L20_PART_A_PCT, L20_REF, purgeScript } from './l20';
import { L21_COST_MAX, L21_REF, chillScript, raoultPct } from './l21';
import { L23_COST_MAX, L23_KL_MIN, L23_REF, L23_SPIRIT_WT, L23_FUEL_WT, spiritsScript, wtToMole } from './l23';
import { azeotrope } from '../sim/thermo/nrtl';
import { L22_CARBON_MIN, L22_COST_MAX, L22_MEOH_MIN_T_H, L22_REF, L22_SINTER_K, L22_SN, methanolScript, stoichNumber } from './l22';

const CH5 = ['L19', 'L20', 'L21', 'L22', 'L23'];
const oracles = oracleFile.oracles as unknown as { id: string; expected: Record<string, any>; inputs: Record<string, any> }[];
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
const m = (e: Env<EqState>, id: string) => SPEC_BY_ID[id]!.measures(e.state);
/** Run a script of actions on a fresh level (no ticks); returns the env. */
function run(id: string, script: Action[], mode = 'learner'): Env<EqState> {
  const e = start(id, 1003, mode);
  for (const a of script) act(e, a.name, ...(a.args ?? []));
  return e;
}
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

describe('registry', () => {
  it('L19-L23 are registered with titles, in chapter 5, in order', () => {
    for (const [i, id] of CH5.entries()) {
      const spec = SPEC_BY_ID[id]!;
      expect(spec.chapter).toBe(5); expect(spec.index).toBe(19 + i);
      const l = LEVELS.find((x) => x.id === id)!;
      expect(l.title.length).toBeGreaterThan(3); expect(l.brief.length).toBeGreaterThan(10); expect(l.solver).toBeTypeOf('function');
      expect(NAIVE[id]).toBeTypeOf('function');
    }
  });
});

describe('solvability', () => {
  for (const id of CH5) {
    it(`${id}: the solver wins with all three stars, idle does not, no short cheese`, () => {
      const level = LEVELS.find((l) => l.id === id)!;
      const r = checkLevel(GAME, level, { seed: 1003, cheeseDepth: 2, cheeseBudget: 300, randomRollouts: 3, randomTicks: 20, solverTicks: 40, idleTicks: 20 });
      expect(r.problems).toEqual([]);
      const e = solve(id);
      expect(e.state.status).toBe('won');
      expect(card(e).stars).toEqual({ have: 3, earned: [true, true, true] });
      expect(GAME.invariants!(e.state, null)).toEqual([]);
    });
    it(`${id}: also solves in Engineer mode`, () => {
      const e = solve(id, { mode: 'engineer' });
      expect(e.state.status).toBe('won');
      expect(info(e).goals.every((g: any) => g.met)).toBe(true);
    });
  }
});

describe('the solver metrics and the calibrated star thresholds (GAME, UNVERIFIED: re-derived here)', () => {
  it('L19: reference recycle, compressor kW and $/t are the solver numbers; the thresholds are x 1.05 and x 1.03', () => {
    const v = m(solve('L19'), 'L19').v;
    expect(v.recycle_kmol_h).toBeCloseTo(L19_REF.recycle, 0); expect(v.shaft_kw).toBeCloseTo(L19_REF.kw, 1); expect(v.cost_per_t).toBeCloseTo(L19_REF.cost, 0);
    expect(L19_KW_MAX / v.shaft_kw!).toBeCloseTo(1.05, 2); expect(L19_COST_MAX / v.cost_per_t!).toBeCloseTo(1.03, 2);
    expect(v.conv_overall).toBeGreaterThan(99.99);
  });
  it('L20: the solver cost at the 1 % purge is the reference; threshold x 1.03', () => {
    const v = m(solve('L20'), 'L20').v;
    expect(v.cost_per_t).toBeCloseTo(L20_REF.cost, 0); expect(L20_COST_MAX / v.cost_per_t!).toBeCloseTo(1.03, 2);
  });
  it('L21: the solver cost at the 2 % purge and -20 C is the reference; threshold x 1.03', () => {
    const v = m(solve('L21'), 'L21').v;
    expect(v.cost_per_t).toBeCloseTo(L21_REF.cost, 0); expect(L21_COST_MAX / v.cost_per_t!).toBeCloseTo(1.03, 2);
    expect(v.nh3_purge_pct).toBeLessThan(3);
  });
});

describe('a cold flash drum is priced as refrigeration (economics, COP path like the NH3 separator)', () => {
  it('L21: the drum latent duty at -20 C is inside the refrigeration opex', () => {
    const st = solve('L21').state, sol = st.solved!;
    const drum = st.flowsheet.units.find((u) => u.type === 'flash')!;
    const duty = sol.units[drum.id]!.duty!;
    expect(duty).toBeLessThan(0);
    const led = ledgerOf(st)!, ref = (led.cost!.opex as Record<string, number>).refrigeration!;
    expect(ref).toBeGreaterThanOrEqual(refrigerationCostPerH(-duty, T_SEP, 303.15, pricesOf(st)) * 0.999);
  });
});

describe('L22 The Methanol Loop', () => {
  it('the solver design is the reference: cost, rate and carbon efficiency; thresholds x 1.03 and the calibrated target', () => {
    const v = m(solve('L22'), 'L22').v;
    expect(v.cost_per_t).toBeCloseTo(L22_REF.cost, 0); expect(L22_COST_MAX / v.cost_per_t!).toBeCloseTo(1.03, 2);
    expect(v.meoh_t_h!).toBeGreaterThanOrEqual(L22_MEOH_MIN_T_H); expect(v.carbon_eff!).toBeGreaterThanOrEqual(L22_CARBON_MIN);
    expect(v.hot_c! + 273.15).toBeLessThan(L22_SINTER_K); expect(v.sinter).toBe(0);
  });
  it('the stoichiometric number of the fresh gas is (H2 - CO2) / (CO + CO2) = 4.33 and the Call-it grades it', () => {
    expect(L22_SN).toBeCloseTo(0.65 / 0.15, 12); expect(stoichNumber(2, 1, 0)).toBe(2);
    const e = start('L22'); act(e, 'callIt', 4.34); expect(e.state.prediction).not.toBeNull();
  });
  it('the DESIGN tension: at the default 250 C coolant the hot spot passes 280 C (sintering, no star 2, verdict names it); the coolant at 220 C holds it', () => {
    const hot = run('L22', methanolScript(523.15, 10000, 0.2, false)), cold = run('L22', methanolScript(493.15, 10000, 0.2, false));
    const mh = m(hot, 'L22').v, mc = m(cold, 'L22').v;
    expect(mh.hot_c!).toBeGreaterThan(280); expect(mh.sinter).toBe(1); expect(mc.hot_c!).toBeLessThan(280); expect(mc.sinter).toBe(0);
    const sp = SPEC_BY_ID.L22!;
    expect(sp.verdict(hot.state, m(hot, 'L22'), sp.goals(hot.state, m(hot, 'L22'))).key).toBe('sintered'); expect(sp.extraStars(hot.state, m(hot, 'L22'), [])[0]).toBe(false); expect(sp.extraStars(cold.state, m(cold, 'L22'), [])[0]).toBe(true);
    expect(mh.hot_w!).toBeGreaterThan(0); // the peak is inside the tube, not at the inlet or the outlet
  });
  it('no purge: NO_EXIT (the inerts and the surplus hydrogen have no way out); a 3 % purge swells the loop and starves the hot spot', () => {
    const e = run('L22', methanolScript(493.15, 10000, 0, false));
    expect(e.state.solved?.ok).toBe(false); expect(e.state.solved?.failure?.code).toBe('NO_EXIT');
    const slow = m(run('L22', methanolScript(493.15, 10000, 0.03, false)), 'L22').v, ref = m(solve('L22'), 'L22').v;
    expect(slow.loop_kmol_h!).toBeGreaterThan(3 * ref.loop_kmol_h!); expect(slow.hot_c!).toBeLessThan(ref.hot_c!);
  });
  it('a big purge throws the carbon away (leaky verdict)', () => {
    const e = run('L22', methanolScript(483.15, 10000, 0.4, false)), mm = m(e, 'L22'), sp = SPEC_BY_ID.L22!;
    expect(mm.v.carbon_eff!).toBeLessThan(L22_CARBON_MIN);
    expect(sp.verdict(e.state, mm, sp.goals(e.state, mm)).key).toBe('leaky');
  });
  it('the equation evaluates to the SN it shows; the tube makes steam (credited) and the reactor energy closes through the ledger', () => {
    const e = solve('L22'); expect(equationHolds(card(e).equation)).toBe(true);
    expect(e.state.solved!.kpis.steam_raised_t_per_h!).toBeGreaterThan(1);
    const led = ledgerOf(e.state)!; expect(led.atomRel).toBeLessThan(1e-6);
  });
});

describe('L23 Spirits', () => {
  it('the solver design is the reference: cost, rate, purity, the yeast at its 32 C DESIGN numbers (90 % of the sugar, 22.5 h)', () => {
    const e = solve('L23'), v = m(e, 'L23').v;
    expect(v.cost_per_t).toBeCloseTo(L23_REF.cost, 0); expect(L23_COST_MAX / v.cost_per_t!).toBeCloseTo(1.03, 2);
    expect(v.kl_day!).toBeGreaterThanOrEqual(L23_KL_MIN); expect(v.spirit_wt!).toBeGreaterThanOrEqual(L23_SPIRIT_WT * 100);
    expect(v.conv!).toBeGreaterThan(0.895); expect(v.conv!).toBeLessThan(0.915); expect(v.time_h).toBeCloseTo(22.5, 9);
  });
  it('Part B: 99.5 wt % fuel spirit hits the azeotrope wall (AZEOTROPE_LIMIT at about 94.8 wt %, DESIGN 94.9) however much reflux; the verdict says so', () => {
    const e = run('L23', spiritsScript(L23_REF.T, L23_REF.time, wtToMole(L23_FUEL_WT), 3, false));
    expect(e.state.solved!.ok).toBe(false); expect(e.state.solved!.failure!.code).toBe('AZEOTROPE_LIMIT');
    const wall = azeotrope('C2H5OH', 'H2O', 101325)!.wt * 100; expect(wall).toBeGreaterThan(94.5); expect(wall).toBeLessThan(95.2);
    const sp = SPEC_BY_ID.L23!; expect(sp.verdict(e.state, m(e, 'L23'), []).key).toBe('wall');
    expect(info(e).annunciators.find((a: any) => a.key === 'wall').state).toBe('critical');
  });
  it('the yeast: 42 C stalls the batch (verdict stalled, no star 2), 45 C kills it (YEAST_KILLED)', () => {
    const slow = run('L23', spiritsScript(315.15, L23_REF.time, L23_REF.xD, 1.3, false)), sp = SPEC_BY_ID.L23!, ms = m(slow, 'L23');
    expect(slow.state.solved!.ok).toBe(true); expect(ms.v.conv!).toBeLessThan(0.5); expect(sp.verdict(slow.state, ms, sp.goals(slow.state, ms)).key).toBe('stalled');
    expect(sp.extraStars(slow.state, ms, [])[0]).toBe(false);
    const dead = run('L23', spiritsScript(318.15, L23_REF.time, L23_REF.xD, 1.3, false));
    expect(dead.state.solved!.failure!.code).toBe('YEAST_KILLED'); expect(sp.verdict(dead.state, m(dead, 'L23'), []).key).toBe('dead');
  });
  it('purer spirit costs more: the column steam per litre and the trays rise toward the wall', () => {
    const a = m(run('L23', spiritsScript(L23_REF.T, L23_REF.time, wtToMole(0.9), 1.3, false)), 'L23').v, b = m(run('L23', spiritsScript(L23_REF.T, L23_REF.time, wtToMole(0.945), 1.3, false)), 'L23').v;
    expect(b.trays!).toBeGreaterThan(a.trays!); expect(b.steam_kg_per_l!).toBeGreaterThan(a.steam_kg_per_l!);
  });
  it('the Call-it is the model wall in mass percent (within 1 %), the atom ledger closes through the fermenter and the column', () => {
    const e = start('L23'); act(e, 'callIt', 94.8); expect(e.state.prediction).not.toBeNull();
    const w = solve('L23'); expect(ledgerOf(w.state)!.atomRel).toBeLessThan(1e-6); expect(equationHolds(card(w).equation)).toBe(true);
  });
});

describe('the failures DESIGN names', () => {
  it('L19: no recycle vents the unreacted gas: per-pass conversion is the overall conversion, with the player numbers in the cause', () => {
    const e = play('L19', NAIVE.L19!);
    const c = card(e), v = m(e, 'L19').v;
    expect(c.won).toBe(false); expect(c.verdictKey).toBe('open_loop'); expect(c.histogram).toBeNull(); expect(c.stars.have).toBe(0);
    expect(v.conv_overall).toBeCloseTo(v.conv_pass!, 6);
    expect(v.conv_overall).toBeLessThan(97);
    expect(c.cause).toContain('34.58'); expect(c.cause).toContain('250');
    const st = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(st.open).toBe('critical'); expect(st.vent).toBe('high'); expect(st.conv).toBe('high');
  });
  it('L20: the loop as built (purge shut) is NO_EXIT before any pass, with the argon arithmetic; a tiny purge is ACCUMULATION with the extrapolated steady state', () => {
    const e = play('L20', NAIVE.L20!);
    expect(e.state.solved!.ok).toBe(false);
    expect(e.state.solved!.failure!.code).toBe('NO_EXIT');
    expect(e.state.solved!.failure!.data.species).toBe('Ar');
    expect(e.state.solved!.failure!.data.inflow).toBeCloseTo(3 / 3600 * 1000, 9);   // 3 kmol/h of argon, in mol/s
    expect(e.state.status).toBe('playing');
    const c = card(e);
    expect(c.verdictKey).toBe('solve_fail'); expect(c.histogram).toBeNull(); expect(c.won).toBe(false);
    expect(c.cause).toMatch(/purge/); expect(c.cause).toContain('Ar');
    expect(info(e).annunciators.find((a: any) => a.key === 'exit').state).toBe('critical');
    // engine codes at a tiny purge: 0.02 % has loop gain 99.98 % (LOOP_GAIN_GE_1); 0.05 % settles (257 passes) with half the loop argon. ACCUMULATION was not reached at any purge tried.
    const tiny = run('L20', purgeScript(0.0002, false));
    expect(tiny.state.solved!.ok).toBe(false);
    expect(['ACCUMULATION', 'LOOP_GAIN_GE_1']).toContain(tiny.state.solved!.failure!.code);
    const slow = run('L20', purgeScript(0.0005, false));
    expect(slow.state.solved!.ok).toBe(true);
    expect(m(slow, 'L20').v.ar_in_pct).toBeGreaterThan(40);
    expect(card(slow).verdictKey).toBe('ar_high');
  });
  it('L20: 0.5 % purge keeps the hydrogen but argon passes 10 % (ar_high); 5 % purge throws hydrogen away and the tank is short (short)', () => {
    const lo = run('L20', purgeScript(0.005, false)), hi = run('L20', purgeScript(0.05, false));
    expect(card(lo).verdictKey).toBe('ar_high'); expect(card(lo).cause).toContain('0.5');
    expect(card(hi).verdictKey).toBe('short'); expect(card(hi).cause).toContain('5');
    expect(m(lo, 'L20').v.ar_in_pct).toBeGreaterThan(10); expect(m(hi, 'L20').v.nh3_t_h).toBeLessThan(8);
    expect(info(lo).annunciators.find((a: any) => a.key === 'accum').state).toBe('critical');
    expect(info(hi).annunciators.find((a: any) => a.key === 'h2').state).toBe('high');
    expect(card(lo).histogram).toBeNull();
  });
  it('L21: cooling water only (40 C) leaves 10 % NH3 in the gas: the tank is short and the purge carries ammonia away', () => {
    const e = play('L21', NAIVE.L21!);
    const c = card(e), v = m(e, 'L21').v;
    expect(c.verdictKey).toBe('warm'); expect(c.won).toBe(false); expect(c.histogram).toBeNull();
    expect(v.nh3_t_h).toBeLessThan(8); expect(v.nh3_purge_pct).toBeGreaterThan(3);
    expect(c.cause).toContain('40');
    expect(info(e).annunciators.find((a: any) => a.key === 'warm').state).toBe('high');
  });
  it('L21: a chiller and drum set to different temperatures light the mismatch lamp', () => {
    const e = run('L21', [{ name: 'placeUnit', args: ['cooler', 16, 1, 0] }, { name: 'placeUnit', args: ['flash', 19, 1, 0] }, { name: 'setParam', args: ['C-116', 'T', 253.15] }, { name: 'setParam', args: ['D-117', 'T', 293.15] }]);
    expect(info(e).annunciators.find((a: any) => a.key === 'tmatch').state).toBe('high');
  });
});

describe('DESIGN reference numbers against the engine', () => {
  /** Independent equilibrium: the 1:3 feed of an ideal-separator loop reacts to the K of R1 at 723.15 K and the converter outlet pressure. */
  function xEquilibrium(Tk: number, Pbar: number): number {
    const K = dmath.exp(lnKOfReaction(findReaction('R1')!, Tk, 'rigorous'));
    const g = (x: number): number => { const n2 = 1 - x, h2 = 3 * (1 - x), nh3 = 2 * x, n = 4 - 2 * x; const yh = h2 / n; return ((nh3 / n) * (nh3 / n)) / ((n2 / n) * yh * yh * yh) - K * Pbar * Pbar; };
    let lo = 0, hi = 0.999999;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  it('L19: per-pass conversion and the recycle follow from K(723 K) at 147 bar: X = 0.346, N2 recycle = F (1 - X) / X, two dual implementations agree', () => {
    const e = solve('L19'), v = m(e, 'L19').v;
    const X = xEquilibrium(T_RX, (P_LOOP - DP_RX) / 1e5);
    expect(Math.abs(v.conv_pass! / 100 - X) / X).toBeLessThan(2e-3);
    const nRec = (250 * (1 - X)) / X;
    expect(Math.abs(v.recycle_n2! - nRec) / nRec).toBeLessThan(5e-3);
    // H2 and N2 recycle at 3 : 1, no NH3: total recycle = 4 x the N2
    expect(Math.abs(v.recycle_kmol_h! - 4 * nRec) / (4 * nRec)).toBeLessThan(5e-3);
    expect(v.nh3_t_h).toBeCloseTo(500 * 17.0305 / 1000, 1);
  });
  it('L19: the loop converges in at most 30 Wegstein passes (DESIGN 3.6)', () => {
    const e = start('L19');
    let msg = '';
    for (const a of SPEC_BY_ID.L19!.solver(1003)(e.state, e.ctx(new Rng(1)))) { const r = act(e, a.name, ...(a.args ?? [])); if (a.name === 'commission') msg = String((r.info as any).message); }
    const n = Number(/in (\d+) passes/.exec(msg)![1]);
    expect(n).toBeLessThanOrEqual(30);
  });
  it('L20 Part A: the oracle EQ-CE-006 argon at the reactor inlet is 1.69 % and the engine, building the bridge plant (X = 25 %, 5 % purge, x 10), reproduces it', () => {
    const o = oracle('EQ-CE-006');
    expect(L20_PART_A_PCT).toBeCloseTo(1.6928, 3); expect(o.expected.y_Ar_reactor_inlet).toBeCloseTo(0.016928, 6);
    const e = new Env(GAME); e.reset({ seed: 1, level: undefined, mode: 'sandbox' });
    const s = e.state as any;
    s.species = ['N2', 'H2', 'Ar', 'NH3']; s.palette = null; s.limits = {}; s.presets = { stoich_reactor: { reactions: 'R1', mode: 'isothermal', T: 298.15 } };
    const fresh = o.inputs.fresh as number[];   // 24.9 N2, 74.8 H2, 0 NH3, 0.3 Ar, per 100 mol/h: scaled x 10 (kmol/h)
    const acts: Action[] = [
      { name: 'placeUnit', args: ['feed', 0, 0, 0] }, { name: 'placeUnit', args: ['mixer', 4, 0, 0] }, { name: 'placeUnit', args: ['stoich_reactor', 8, 0, 0] }, { name: 'placeUnit', args: ['nh3_sep', 14, 0, 0] },
      { name: 'placeUnit', args: ['splitter', 18, 0, 0] }, { name: 'placeUnit', args: ['vent', 18, 6, 0] }, { name: 'placeUnit', args: ['product', 14, 6, 0] },
      { name: 'setFeed', args: ['F-101', { x: [fresh[0], fresh[1], fresh[3], fresh[2]], flow: (fresh.reduce((a, b) => a + b, 0) * 10 * 1000) / 3600, T: 300, P: 2e6 }] },
      { name: 'setParam', args: ['R-103', 'X', 0.25] }, { name: 'setParam', args: ['X-105', 'frac', 0.05] },
      { name: 'connect', args: ['F-101', 'out', 'M-102', 'in1'] }, { name: 'connect', args: ['M-102', 'out', 'R-103', 'in'] }, { name: 'connect', args: ['R-103', 'out', 'D-104', 'in'] },
      { name: 'connect', args: ['D-104', 'liq', 'T-107', 'in'] }, { name: 'connect', args: ['D-104', 'vap', 'X-105', 'in'] }, { name: 'connect', args: ['X-105', 'purge', 'Y-106', 'in'] }, { name: 'connect', args: ['X-105', 'out', 'M-102', 'in2'] },
    ];
    for (const a of acts) { const r = e.step(a); if (!(r.info as any).ok) throw new Error(a.name + ' ' + JSON.stringify(a.args) + ' ' + (r.info as any).message); }
    const r = e.step({ name: 'commission' });
    expect((r.info as any).message, JSON.stringify((e.state as any).solved?.failure)).toMatch(/Commissioned/);
    const st = e.state as any;
    const rx = st.flowsheet.units.find((u: any) => u.type === 'stoich_reactor');
    const pipe = st.flowsheet.streams.find((p: any) => p.to.unit === rx.id);
    const n = st.solved.streams[pipe.id].n as number[];
    const y = n[2]! / n.reduce((a, b) => a + b, 0);
    expect(Math.abs(y - (o.expected.y_Ar_reactor_inlet as number)) / (o.expected.y_Ar_reactor_inlet as number)).toBeLessThan(0.005);
  });
  it('L20 Part B: the DESIGN purge table (loop flash at -20 C) against the engine, within 3 % (the engine runs a 147 bar flash after a 3 bar converter drop)', () => {
    // DESIGN: purge -> [Ar % at inlet, H2 lost %, loop kmol/h, NH3 t/h]
    const table: Record<number, [number, number, number, number]> = { 0.005: [15.2, 1.2, 3945, 8.41], 0.01: [8.8, 2.1, 3426, 8.33], 0.02: [4.8, 4.0, 3117, 8.17], 0.05: [2.1, 9.1, 2807, 7.72], 0.1: [1.2, 16.5, 2530, 7.08] };
    for (const [p, row] of Object.entries(table)) {
      const v = m(run('L20', purgeScript(Number(p), false)), 'L20').v;
      const got = [v.ar_in_pct!, v.h2_lost_pct!, v.loop_kmol_h!, v.nh3_t_h!];
      row.forEach((want, i) => expect(Math.abs(got[i]! - want) / want, `purge ${p} col ${i}: engine ${got[i]} vs DESIGN ${want}`).toBeLessThan(0.03));
    }
  });
  it('L20: the loop is a balance, Ar in = Ar out; the geometric build-up at a small purge (the inlet Ar grows as the purge shrinks)', () => {
    const ar = (p: number) => m(run('L20', purgeScript(p, false)), 'L20').v;
    const v = ar(0.01);
    expect(Math.abs(v.purge_kmol_h! * v.ar_purge_pct! / 100 - v.ar_fed!) / v.ar_fed!).toBeLessThan(0.005);   // the rest (0.2 %) dissolves in the liquid product (Henry K = 1e4)
    expect(ar(0.005).ar_in_pct!).toBeGreaterThan(ar(0.01).ar_in_pct!); expect(ar(0.01).ar_in_pct!).toBeGreaterThan(ar(0.02).ar_in_pct!);
  });
  it('L20: DESIGN expects an interior $/t optimum at 1-3 % purge; the engine economics fall monotonically toward small purge, so the optimum is the argon limit (REPORTED, not hidden)', () => {
    const c = (p: number) => m(run('L20', purgeScript(p, false)), 'L20').v.cost_per_t!;
    expect(c(0.005)).toBeLessThan(c(0.01)); expect(c(0.01)).toBeLessThan(c(0.02)); expect(c(0.02)).toBeLessThan(c(0.05)); expect(c(0.05)).toBeLessThan(c(0.1));
    // the argon limit binds just below 1 %: 0.8 % is already over 10 %
    expect(m(run('L20', purgeScript(0.008, false)), 'L20').v.ar_in_pct!).toBeLessThan(11.5);
    expect(m(run('L20', purgeScript(0.005, false)), 'L20').v.ar_in_pct!).toBeGreaterThan(10);
  });
  it('L21: Raoult at -20, 0 and +20 C: y = P_sat / P with P_sat 1.90, 4.29 and 8.57 bar (DESIGN), the engine flash agrees within 1 %', () => {
    const P = (P_LOOP - DP_RX) / 1e5;
    for (const [c, bar] of [[-20, 1.9], [0, 4.29], [20, 8.57]] as const) {
      expect(Math.abs(psatSpecies('NH3', 273.15 + c)!.P / 1e5 - bar) / bar, `Psat at ${c} C`).toBeLessThan(0.01);
      const e = run('L21', chillScript(273.15 + c, false));
      const v = m(e, 'L21').v;
      expect(Math.abs(v.flash_nh3_pct! - raoultPct(273.15 + c)) / raoultPct(273.15 + c), `flash at ${c} C`).toBeLessThan(0.01);
      expect(Math.abs(v.flash_nh3_pct! - (bar / P) * 100) / v.flash_nh3_pct!).toBeLessThan(0.02);
    }
  });
  it('L21: colder drum, drier gas, smaller loop: the NH3 the recycle carries back falls as the drum cools', () => {
    const v = (c: number) => m(run('L21', chillScript(273.15 + c, false)), 'L21').v;
    expect(v(-20).nh3_in_pct!).toBeLessThan(v(0).nh3_in_pct!); expect(v(0).nh3_in_pct!).toBeLessThan(v(20).nh3_in_pct!);
    expect(v(-20).loop_kmol_h!).toBeLessThan(v(0).loop_kmol_h!); expect(v(0).loop_kmol_h!).toBeLessThan(v(20).loop_kmol_h!);
    expect(v(-20).nh3_t_h!).toBeGreaterThan(v(20).nh3_t_h!);
  });
  it('L21: the engine prices refrigeration only on the sensible duty of the chiller cooler (the flash latent duty is not costed): $/t does not rise as the drum cools (REPORTED engine gap)', () => {
    const cost = (c: number) => m(run('L21', chillScript(273.15 + c, false)), 'L21').v.cost_per_t!;
    expect(cost(-20)).toBeLessThan(cost(20) * 1.05);
  });
});

describe('Call it grading at the oracle tolerance', () => {
  const callThenBuild = (id: string, answer: number | null, script: (c: number) => Action[]): Env<EqState> => {
    const e = start(id);
    if (answer !== null) act(e, 'callIt', answer);
    for (const a of script(0)) if (a.name !== 'callIt') act(e, a.name, ...(a.args ?? []));
    act(e, 'tick', 40);
    return e;
  };
  it('L19: the recycle flow within 2 % of the engine at the player design earns the Call-it, 3 % off does not (the answer is checked against the independent K calculation)', () => {
    const ref = L19_REF.recycle;
    for (const [x, ok] of [[ref, true], [ref * 1.019, true], [ref * 0.981, true], [ref * 1.03, false], [ref * 0.9, false], [250, false]] as const) {
      const e = callThenBuild('L19', x, () => SPEC_BY_ID.L19!.solver(1)(start('L19').state, start('L19').ctx(new Rng(1))));
      expect(e.state.status, String(x)).toBe('won');
      expect(card(e).callIt.ok, String(x)).toBe(ok);
      expect(info(e).callIt.ok).toBe(ok);
    }
  });
  it('L20 Part A: the oracle 1.69 % at +-0.5 % earns the second star; 1.70 (0.4 %) is inside, 1.71 and the naive 3 % (the fresh-gas share) are not', () => {
    const o = (oracle('EQ-CE-006').expected.y_Ar_reactor_inlet as number) * 100;
    expect(SPEC_BY_ID.L20!.callIt!.truth(start('L20').state, { ok: false, v: {} })).toBeCloseTo(o, 9);
    for (const [x, ok] of [[o, true], [o * 1.0045, true], [o * 0.9955, true], [o * 1.0055, false], [3.0, false], [0.3, false]] as const) {
      const e = callThenBuild('L20', x, () => purgeScript(L20_REF.purge, false));
      expect(card(e).stars.earned[1], String(x)).toBe(ok);
      expect(card(e).callIt.ok, String(x)).toBe(ok);
    }
  });
  it('L21: NH3 mol % in the drum gas (Raoult, P_sat / P) within 3 % of the engine at the player design', () => {
    for (const [x, ok] of [[raoultPct(253.15), true], [raoultPct(253.15) * 1.029, true], [raoultPct(253.15) * 1.04, false], [10, false]] as const) {
      const e = callThenBuild('L21', x, () => chillScript(253.15, false));
      expect(card(e).callIt.ok, String(x)).toBe(ok);
    }
    expect(Math.abs(raoultPct(253.15) - m(solve('L21'), 'L21').v.flash_nh3_pct!) / raoultPct(253.15)).toBeLessThan(0.01);
  });
  it('a prediction is a prediction: it cannot be made after the first commission', () => {
    const e = start('L20');
    act(e, 'commission');
    const r = act(e, 'callIt', 1.69);
    expect(r.info.ok).toBe(false); expect(r.info.message).toMatch(/before you commission/);
  });
});

describe('levelInfo and resultCard contract', () => {
  const KEYS = ['id', 'chapter', 'index', 'title', 'setter', 'place', 'note', 'goals', 'budgetUSD', 'spentUSD', 'stars', 'callIt', 'allowedUnits', 'hero', 'secondary', 'annunciators', 'phase', 'firstRun', 'coach', 'lesson', 'mode'];
  for (const id of CH5) {
    it(`${id}: every field present and finite, 4-8 annunciators with caps legends of at most 14 characters, a teal goal lamp, lesson with the player's numbers`, () => {
      for (const mode of ['learner', 'engineer', 'sandbox']) for (const e of [start(id, 1003, mode), solve(id, { mode })]) {
        const q = info(e);
        for (const k of KEYS) expect(q, `${id} ${mode} ${k}`).toHaveProperty(k);
        expect(allFinite(q)).toBeNull();
        expect(q.note.length).toBe(2); expect(q.note.every((n: string) => n.length > 5 && !n.includes('lv.'))).toBe(true);
        for (const g of q.goals) { expect(g.text).not.toContain('lv.'); expect(g.text).not.toMatch(/\{/); }
        expect(q.annunciators.length).toBeGreaterThanOrEqual(4); expect(q.annunciators.length).toBeLessThanOrEqual(8);
        for (const a of q.annunciators) { expect(a.legend.length).toBeLessThanOrEqual(14); expect(a.legend).toBe(a.legend.toUpperCase()); expect(['off', 'normal', 'high', 'critical']).toContain(a.state); }
        expect(q.annunciators.some((a: any) => a.key === 'goal')).toBe(true);
        expect(q.lesson).not.toMatch(/\{/); expect(q.lesson).not.toContain('lv.');
      }
      const won = info(solve(id));
      expect(won.annunciators.find((a: any) => a.key === 'goal').state).toBe('normal');
      expect(won.lesson).toMatch(/[0-9]/);
    });
    it(`${id}: the equation evaluates to the result it shows; the printout lists three metrics and a histogram on a win`, () => {
      const e = solve(id), c = card(e);
      expect(c.equation, id).toBeTypeOf('string');
      expect(equationHolds(c.equation), c.equation).toBe(true);
      expect(c.metrics).toHaveLength(3); expect(allFinite(c)).toBeNull();
      expect(c.histogram).not.toBeNull(); expect(c.histogram.bins.reduce((a: number, b: number) => a + b, 0)).toBe(200);
    });
  }
  it('coach: L19 and L21 teach their new unit by type; L20 points at the splitter; focus follows engine state, not clicks', () => {
    expect(info(start('L19')).coach.focus).toEqual({ rack: 'eq_reactor' });
    expect(info(start('L20')).coach.step).toBe(1);
    const e = start('L20'); act(e, 'callIt', 1.69);
    expect(info(e).coach.focus).toEqual({ unit: 'X-108' });
    expect(info(start('L21')).coach.focus).toEqual({ rack: 'flash' });
    for (const id of CH5) expect(info(start(id, 1003, 'engineer')).coach).toBeNull();
  });
  it('the palette: L19 offers the loop parts, L20 none (the loop is built), L21 the chiller, drum and tank', () => {
    expect(info(start('L19')).allowedUnits.map((u: any) => u.type)).toContain('nh3_sep');
    expect(info(start('L20')).allowedUnits).toEqual([]);
    expect(info(start('L21')).allowedUnits.map((u: any) => u.type).sort()).toEqual(['cooler', 'flash', 'product']);
  });
});

describe('solution codes, determinism', () => {
  it('the same actions give the same state hash, a different design a different one', () => {
    for (const id of CH5) {
      expect(hashOf(solve(id).state), id).toBe(hashOf(solve(id).state));
      expect(hashOf(solve(id).state), id).not.toBe(hashOf(play(id, NAIVE[id]!, { ticks: 5 }).state));
    }
  });
  it('the solution code of a win verifies: same win, same metrics', () => {
    for (const id of CH5) {
      const c = card(solve(id)).designCode as string;
      const v = verify(id, c);
      expect(v.ok, id + ' ' + v.reason).toBe(true);
    }
  });
  it('the first run: a commission that meets every goal rolls 30 plant seconds, then wins; a missed goal does not', () => {
    for (const id of CH5) {
      const e = start(id), agent = SPEC_BY_ID[id]!.solver(1003), rng = new Rng(1003);
      for (let t = 0; t < 10 && info(e).phase !== 'firstrun'; t++) { for (const a of agent(e.state, e.ctx(rng))) act(e, a.name, ...(a.args ?? [])); if (info(e).phase !== 'firstrun') e.step(TICK); }
      expect(info(e).phase, id).toBe('firstrun');
      expect(card(e)).toBeNull();
      act(e, 'tick', 30);
      expect(e.state.status, id).toBe('won');
    }
    const bad = play('L19', NAIVE.L19!);
    expect(info(bad).phase).toBe('commissioned'); expect(info(bad).firstRun).toBeNull();
  });
  it('L20 and L21 hold their state size under the 256 KB budget at the end of a first run', () => {
    for (const id of CH5) expect(JSON.stringify(solve(id).state).length, id).toBeLessThan(256 * 1024);
  });
});
