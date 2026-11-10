// Chapter 2 levels L05-L09 (Fire): solvability, the failures DESIGN names, the DESIGN reference numbers against the engine (disagreements are asserted at the engine value and
// commented), Call-it grading at the oracle tolerances, the levelInfo / resultCard contract, the shift, determinism. Expected numbers come from src/oracle/oracles.json or from the
// engine's own catalogue; the ones typed here are the DESIGN text's (and say so).
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, checkLevel, decodeSolution, hashOf } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { GAME } from '../game';
import { i18n } from '../i18n';
import { verify } from '../verify';
import oracleFile from '../oracle/oracles.json';
import { findReaction } from '../data/reactions';
import { SPECIES } from '../data/species';
import { LEVELS } from '../levels';
import { rxnDH } from '../sim/chem/reactions';
import { R_GAS } from '../sim/thermo/shomate';
import { NAIVE, SPEC_BY_ID, SPECS } from './registry';
import { CH2_SPECS } from './ch2';
import { BEST_SO2 as BEST5, REF_AIR, REF_BLOWER_KW, REF_SO2, REF_STEAM_TH, START_AIR, dhSO2, fireBuild, fireMeasures, netStar, netValue } from './l05';
import { BEST_DIL, BEST_SO2 as BEST6, airFor, burnerTadK, lineBuild, measures as lineMeasures } from './l06';
import { REF_COKE_T, cokeFor, hessBuild, hessMeasures, quenchBuild } from './l07';
import { COST_STAR, OPT_AREA, pinchBuild, pinchMeasures } from './l08';
import { ch4Facts, truthOf } from './l09';
import type { EqState } from '../state';

const CH2 = ['L05', 'L06', 'L07', 'L08', 'L09'];
/** Turns the solver needs: the 3-minute and 10-minute shifts play one plant second a turn; L08 plays its 8 hours in 10000-second ticks. */
const TURNS: Record<string, number> = { L05: 400, L06: 800, L07: 45, L08: 8, L09: 45 };
const oracles = oracleFile.oracles as unknown as { id: string; expected: Record<string, any>; inputs: Record<string, any> }[];
const oracle = (id: string) => oracles.find((o) => o.id === id)!;

function start(id: string, seed = 1003, mode = 'learner', region?: string): Env<EqState> {
  const env = new Env(GAME);
  env.reset({ seed, level: id, mode, ...(region ? { region } : {}) } as any);
  return env;
}
function play(id: string, persona: PersonaFactory<EqState>, opts: { seed?: number; mode?: string; ticks?: number; region?: string } = {}): Env<EqState> {
  const seed = opts.seed ?? 1003, env = start(id, seed, opts.mode ?? 'learner', opts.region);
  const agent = persona(seed), rng = new Rng(seed);
  for (let t = 0; t < (opts.ticks ?? 5) && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const solve = (id: string, o: { seed?: number; mode?: string; region?: string } = {}) => play(id, SPEC_BY_ID[id]!.solver, { ...o, ticks: TURNS[id]! });
const script = (list: Action[]): PersonaFactory<EqState> => () => { let d = false; return () => { if (d) return []; d = true; return list; }; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const act = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name, args });
const mk = (id: string, list: Action[], seed = 1003, mode = 'learner', region?: string): Env<EqState> => { const e = start(id, seed, mode, region); for (const a of list) e.step(a); return e; };
const roll = (e: Env<EqState>): Env<EqState> => { if (e.state.status === 'playing') act(e, 'tick', 40); return e; };

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
const relErr = (x: number, y: number): number => Math.abs(x - y) / Math.abs(y);
const C = (K: number): number => K - 273.15;

describe('registry', () => {
  it('the five chapter-2 levels are in the game after chapter 1, in order, with titles', () => {
    expect(CH2_SPECS.map((x) => x.id)).toEqual(CH2);
    const ids = SPECS.map((x) => x.id);
    expect(ids.slice(0, 10)).toEqual(['L00', 'L01', 'L02', 'L03', 'L04', ...CH2]);
    for (const id of CH2) {
      const l = LEVELS.find((x) => x.id === id)!;
      expect(l.title.length).toBeGreaterThan(3); expect(l.brief.length).toBeGreaterThan(10); expect(l.solver).toBeTypeOf('function');
      expect(SPEC_BY_ID[id]!.chapter).toBe(2); expect(NAIVE[id]).toBeTypeOf('function');
    }
  });
});

describe('solvability (the expert persona)', () => {
  for (const id of CH2) {
    it(`${id}: the solver wins with all three stars, idle does not, no short cheese`, () => {
      const level = LEVELS.find((l) => l.id === id)!;
      const r = checkLevel(GAME, level, { seed: 1003, cheeseDepth: 2, cheeseBudget: 400, randomRollouts: 4, randomTicks: 20, solverTicks: TURNS[id]!, idleTicks: 20 });
      expect(r.problems).toEqual([]);
      const e = solve(id);
      expect(e.state.status).toBe('won');
      expect(card(e).stars).toEqual({ have: 3, earned: [true, true, true] });
      expect(GAME.invariants!(e.state, null)).toEqual([]);
    });
  }
  it('every chapter-2 level solves in Engineer mode (budget goal listed and met) except the bench (no budget)', () => {
    for (const id of CH2) {
      const e = solve(id, { mode: 'engineer' });
      expect(e.state.status, id).toBe('won');
      const keys = info(e).goals.map((g: any) => g.key);
      if (id === 'L09') expect(keys, id).not.toContain('budget'); else expect(keys, id).toContain('budget');
      expect(info(e).goals.every((g: any) => g.met), id).toBe(true);
    }
  });
  it('the shift levels hold with all three stars on several seeds and both modes (the events differ; the solver answers with the air feed)', () => {
    for (const id of ['L05', 'L06']) for (const mode of ['learner', 'engineer']) for (const seed of [1, 2, 3, 7, 11]) {
      const e = solve(id, { seed, mode });
      expect(e.state.status, `${id} ${mode} ${seed}`).toBe('won');
      expect(card(e).stars.have, `${id} ${mode} ${seed}`).toBe(3);
    }
  });
  it('the solver also wins in the second region (prices change, the stars hold)', () => {
    for (const id of ['L05', 'L06', 'L08']) {
      const e = solve(id, { region: 'in' });
      expect(e.state.status, id).toBe('won');
      expect(card(e).stars.have, id).toBe(3);
    }
  });
});

describe('L05 Heat for Free: DESIGN reference numbers against the engine', () => {
  const run = (air: number, c = 420) => { const e = mk('L05', fireBuild(air, c, [{ name: 'commission' }])); return fireMeasures(e.state).v; };
  it('the reference design 10 % SO2: engine 940 C / 5.02 MW / 7.66 t/h against DESIGN 931 C / 4.93 MW / 7.52 t/h (the blower heats the air ~9 K)', () => {
    const v = run(REF_AIR);
    expect(v.so2_pct).toBeCloseTo(10, 6);
    expect(C(v.burner_K!)).toBeCloseTo(940.24, 1); expect(v.boiler_mw).toBeCloseTo(5.021, 2); expect(v.steam_th).toBeCloseTo(7.657, 2);
    // DESIGN (levels_calc.py, air at 25 C, no blower): the textbook adiabatic temperature is reproduced exactly by the Call-it method of L06
    expect(C(burnerTadK(10))).toBeCloseTo(931.4, 0);
    // the plant is within 1.1 % (T), 2 % (duty), 2 % (steam) of DESIGN; the difference is the compression heat of the blower
    expect(relErr(C(v.burner_K!), 931)).toBeLessThan(0.011); expect(relErr(v.boiler_mw!, 4.93)).toBeLessThan(0.02); expect(relErr(v.steam_th!, 7.52)).toBeLessThan(0.02);
    expect(v.heat_mw).toBeCloseTo(8.2456, 3);
  });
  it('11 % SO2: engine 1018 C / 8.10 t/h against DESIGN 1010 C / 7.98 t/h; the steam is duty / 2361 kJ per kg', () => {
    const v = run(100 / 0.11);
    expect(C(v.burner_K!)).toBeCloseTo(1018.4, 0); expect(v.steam_th).toBeCloseTo(8.101, 2);
    expect(relErr(C(v.burner_K!), 1010)).toBeLessThan(0.01); expect(relErr(v.steam_th!, 7.98)).toBeLessThan(0.02);
    expect(v.steam_th).toBeCloseTo((v.boiler_mw! * 1e6 * 3.6) / 2361e3, 1);
  });
  it('the star-3 reference constants are the engine values at the 10 % design (UNVERIFIED GAME constants re-derived here)', () => {
    const v = run(REF_AIR);
    expect(v.steam_th).toBeCloseTo(REF_STEAM_TH, 2); expect(v.blower_kw).toBeCloseTo(REF_BLOWER_KW, 2);
    const e = mk('L05', fireBuild(REF_AIR, 420, [{ name: 'commission' }]));
    expect(v.net_usd_h).toBeCloseTo(netValue(e.state, REF_STEAM_TH, REF_BLOWER_KW), 1);
  });
  it('the sulfur heat is S x 296.84 kJ/mol = 8.25 MW (DESIGN), from the catalogue', () => {
    expect(dhSO2()).toBeCloseTo(296.84, 1);
    expect((100 * dhSO2()) / 3600).toBeCloseTo(8.25, 2);
    expect(run(REF_AIR).heat_mw).toBeCloseTo(8.25, 2);
  });
  it('the SO2 window is 9.5-11 % of air 909-1053 kmol/h, and steam at 9.5 % is still over 7.0 t/h', () => {
    expect(run(100 / 0.095).steam_th).toBeGreaterThan(7.0);
    expect(run(100 / 0.095).so2_pct).toBeCloseTo(9.5, 3);
  });
  it('the star-3 design (10.8 %) beats the reference by more than 3 % in net value, in both regions: the 10 % reference is under the threshold, the 10.8 % design over it', () => {
    for (const region of ['global', 'in']) {
      const net = (so2: number) => { const e = mk('L05', fireBuild((100 * 100) / so2, 420, [{ name: 'commission' }]), 1003, 'learner', region); return { e, v: fireMeasures(e.state).v }; };
      const ref = net(REF_SO2), best = net(BEST5);
      const thr = netStar(ref.e.state);
      expect(ref.v.net_usd_h, region).toBeLessThan(thr); expect(best.v.net_usd_h, region).toBeGreaterThan(thr);
      expect(thr, region).toBeCloseTo(1.03 * netValue(ref.e.state, REF_STEAM_TH, REF_BLOWER_KW), 9);
      expect(card(solve('L05', { region })).stars.earned[2], region).toBe(true);
    }
  });
});

describe('L05 failures and the shift', () => {
  it('the default boiler outlet (300 C) sends cold gas to the converter: the converter-inlet alarm lights, and the cause names the extra steam', () => {
    const e = play('L05', NAIVE.L05!);
    const c = card(e);
    expect(e.state.status).toBe('playing');
    expect(c.won).toBe(false); expect(c.verdictKey).toBe('cold'); expect(c.histogram).toBeNull(); expect(c.cause).toContain('300'); expect(c.cause).toContain('9.31');
    const st = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(st.cold).toBe('critical'); expect(st.hot).toBe('normal'); expect(st.so2).toBe('normal');
    expect(info(e).goals.map((g: any) => [g.key, g.met])).toEqual([['steam', true], ['so2', true], ['inlet', false], ['shift', false]]);
  });
  it('an outlet above 420 gives too little steam and a hot gas; weak and rich gas are off spec with the air in the cause', () => {
    const hot = mk('L05', fireBuild(REF_AIR, 500, [{ name: 'commission' }]));
    expect(card(hot).verdictKey).toBe('hot');
    const weak = mk('L05', fireBuild(1200, 420, [{ name: 'commission' }]));
    expect(card(weak).verdictKey).toBe('weak'); expect(card(weak).cause).toContain('1,200');
    const rich = mk('L05', fireBuild(700, 420, [{ name: 'commission' }]));
    expect(card(rich).verdictKey).toBe('rich'); expect(card(rich).cause).toContain('700');
    expect(START_AIR).toBe(600);
  });
  it('the shift is a three-minute run with blower wear and a feed surge, drawn from the seed; the goals hold only at its end', () => {
    const e = mk('L05', fireBuild(REF_AIR, 420));
    expect(e.state.phase).toBe('shift');
    expect(e.state.shift!.len).toBe(180);
    const types = e.state.shift!.q.map((x) => x.type).sort();
    expect(types).toEqual(['blower_wear', 'feed_surge']);
    expect(info(e).phase).toBe('shift'); expect(info(e).goals.find((g: any) => g.key === 'shift').met).toBe(false);
    act(e, 'tick', 179); expect(e.state.status).toBe('playing');
    act(e, 'tick', 1); expect(e.state.status).toBe('won');
  });
  it('in Engineer mode the wear is the full 8 % and idle play lets the burner gas run off spec; the trimmed plant keeps it inside', () => {
    const cfg = { seed: 1003, mode: 'engineer' };
    const idle = play('L05', script(fireBuild((100 * 100) / BEST5, 420)), { ...cfg, ticks: 185 });
    expect(idle.state.status).toBe('playing');
    const m = fireMeasures(idle.state).v;
    expect(m.so2_pct).toBeGreaterThan(11); expect(card(idle).verdictKey).toBe('rich');
    expect(solve('L05', cfg).state.status).toBe('won');
  });
});

describe('L06 Too Hot to Hold', () => {
  const run = (y: number, dil: number, mode = 'learner') => { const e = mk('L06', lineBuild(airFor(y, dil), dil, [{ name: 'commission' }]), 1003, mode); return { e, v: lineMeasures(e.state).v }; };
  it('DESIGN: 12 % SO2 is 0.75 mol O2 per SO2 (fails the oxygen rule) and 11.5 % is 0.83 (passes); the burner gas is 1095 / 1057 C against DESIGN 1087 / 1050 (the blower heat again)', () => {
    const a = run(12, 0).v, b = run(11.5, 0).v;
    expect(a.o2_so2).toBeCloseTo(0.75, 3); expect(b.o2_so2).toBeCloseTo(0.826, 2);
    expect(C(a.burner_K!)).toBeCloseTo(1095.1, 0); expect(C(b.burner_K!)).toBeCloseTo(1056.9, 0);
    expect(relErr(C(a.burner_K!), 1087)).toBeLessThan(0.01); expect(relErr(C(b.burner_K!), 1050)).toBeLessThan(0.01);
    expect(b.o2_so2).toBeGreaterThan(0.8); expect(a.o2_so2).toBeLessThan(0.8);
  });
  it('the optimum without dilution sits where O2/SO2 = 0.8, at 11.6-11.7 % (DESIGN: 11.6-11.7 %)', () => {
    const y = 21 / 1.8;
    expect(y).toBeGreaterThan(11.6); expect(y).toBeLessThan(11.7);
    expect(run(11.6, 0).v.o2_so2).toBeGreaterThan(0.8); expect(run(11.7, 0).v.o2_so2).toBeLessThan(0.8);
  });
  it('the Call-it temperature (adiabatic, 10 % SO2, air at 25 C) is 931 C as DESIGN says, and the same function reproduces the plant when the blower heat is left out', () => {
    expect(C(burnerTadK(10))).toBeCloseTo(931.4, 0);
    expect(SPEC_BY_ID.L06!.callIt!.truth(start('L06').state, { ok: false, v: {} })).toBeCloseTo(C(burnerTadK(10)), 9);
    expect(relErr(C(burnerTadK(10)), 931)).toBeLessThan(0.0015);
  });
  it('dilution air breaks the trade: 11.9 % in the burner with 10 % of the air round it passes both rules (1087 C, O2/SO2 0.96); without dilution the same gas is short of oxygen', () => {
    const d = run(BEST6, BEST_DIL), n = run(BEST6, 0);
    expect(C(d.v.burner_K!)).toBeLessThan(1100); expect(d.v.o2_so2).toBeGreaterThan(0.8); expect(d.v.burner_so2_pct).toBeCloseTo(BEST6, 3);
    expect(n.v.o2_so2).toBeLessThan(0.8);
    expect(info(d.e).goals.filter((g: any) => g.key !== 'shift').every((g: any) => g.met)).toBe(true);
    expect(info(n.e).goals.find((g: any) => g.key === 'oxygen').met).toBe(false);
  });
  it('the lining limit (1100 C) is reached near 12.05 % in the burner: 12.2 % fails the lining goal with the temperature in the cause', () => {
    const hot = run(12.2, 0.12);
    expect(C(hot.v.burner_K!)).toBeGreaterThan(1100);
    expect(card(hot.e).verdictKey).toBe('hot'); expect(card(hot.e).cause).toContain('1,110');
  });
  it('the 12 % novice fails the oxygen rule (0.75) with its numbers; the lean gas (10 %) fails the richness goal', () => {
    const e = play('L06', NAIVE.L06!);
    expect(card(e).verdictKey).toBe('starved'); expect(card(e).cause).toContain('0.75'); expect(card(e).won).toBe(false); expect(card(e).histogram).toBeNull();
    const st = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(st.o2).toBe('high'); expect(st.hh).toBe('normal');
    const lean = run(10, 0).e;
    expect(card(lean).verdictKey).toBe('lean');
  });
  it('lining alarms: High at 1080 C and Critical at 1100 C (pinned on the burner), and an untrimmed 11.5 % plant in a full-magnitude shift damages the lining; the trim does not', () => {
    const e = mk('L06', lineBuild(airFor(11.5, 0), 0), 1003, 'engineer');
    const mon = e.state.shift!.mon.find((m) => m.u === 'R-105' && m.v === 'T')!;
    expect(mon.thr[1]! + 0).toBeGreaterThan(0);
    act(e, 'tick', 700);
    expect(e.state.shift!.stat.critS).toBeGreaterThan(0);
    expect(card(e).stars.earned[1]).toBe(false);
    const s = solve('L06', { mode: 'engineer' });
    expect(s.state.shift!.stat.critS).toBe(0);
    expect(card(s).stars.earned[1]).toBe(true);
  });
});

describe('L07 Hess\'s Road (EQ-NC-017)', () => {
  it('the engine\'s Hess sum: C to CO -110.5, CO to CO2 -283.0, C to CO2 -393.5 kJ/mol (oracle EQ-NC-017: -110.5 within 0.1 %), and 91.48 kmol/h of coke gives 10 MW (DESIGN 91.5)', () => {
    const o = oracle('EQ-NC-017');
    const a = -rxnDH(findReaction('R14')!.nu, 298.15, 'rigorous') / 1000, b = -rxnDH(findReaction('R15')!.nu, 298.15, 'rigorous') / 1000;
    const steps = o.inputs.steps as { coef: number; dH: number }[];
    const oracleDh = steps.reduce((x, st) => x + st.coef * st.dH, 0);
    expect(oracleDh).toBeCloseTo(o.expected.dH_kJ_mol as number, 9);
    expect(relErr(-a, o.expected.dH_kJ_mol as number)).toBeLessThan(0.001);
    expect(relErr(a + b, 393.5)).toBeLessThan(0.001);
    expect(cokeFor(10)).toBeCloseTo(91.48, 2); expect(relErr(cokeFor(10), 91.5)).toBeLessThan(0.001);
    expect(REF_COKE_T).toBeCloseTo((cokeFor(10) * 12.011) / 1000, 9);
  });
  it('the reference plant: 10.0 MW at the heater, nothing lost, both steps run; the gasifier released 2.81 MW (DESIGN)', () => {
    const e = mk('L07', hessBuild(cokeFor(10), (cokeFor(10) * 1.05) / 0.21));
    const v = hessMeasures(e.state).v;
    expect(v.heat_mw).toBeCloseTo(10, 3); expect(v.lost_mw).toBeLessThan(1e-3); expect(v.two_step).toBe(1); expect(v.co_slip).toBeLessThan(1e-9);
    expect(v.gas_mw).toBeCloseTo(2.81, 2); expect(v.burn_mw).toBeCloseTo(7.19, 2);
    expect(v.ledger_mw).toBeCloseTo(v.heat_mw!, 6);
  });
  it('Hess: any split of the same coke through the same two steps delivers the same heat (path independence in the ledger)', () => {
    const a = hessMeasures(mk('L07', hessBuild(cokeFor(10), (cokeFor(10) * 1.05) / 0.21)).state).v;
    const b = hessMeasures(mk('L07', hessBuild(cokeFor(10), (cokeFor(10) * 1.3) / 0.21)).state).v;
    expect(b.heat_mw).toBeCloseTo(a.heat_mw!, 6);
  });
  it('the quench novice loses the gasifier heat: 7.2 MW at the heater, 2.77 MW through the cooling water (DESIGN 2.81 MW), the ledger says so', () => {
    const e = play('L07', NAIVE.L07!);
    const v = hessMeasures(e.state).v, c = card(e);
    expect(v.heat_mw).toBeCloseTo(7.23, 2); expect(v.lost_mw).toBeCloseTo(2.77, 2); expect(v.quench_mw).toBeCloseTo(v.lost_mw!, 6);
    expect(c.verdictKey).toBe('lost'); expect(c.cause).toContain('2.77'); expect(c.cause).toContain('7.23'); expect(c.histogram).toBeNull(); expect(c.won).toBe(false);
    expect(e.state.status).toBe('playing');
    const st = Object.fromEntries(info(e).annunciators.map((a: any) => [a.key, a.state]));
    expect(st.lost).toBe('critical'); expect(st.short).toBe('high');
  });
  it('feeding more coke makes the 10 MW through the quench too (127 kmol/h): star 1 only, the ledger still shows the gasifier heat thrown away', () => {
    const coke = (10 * 3600) / 283.0;
    const e = mk('L07', quenchBuild(coke, (coke * 1.05) / 0.21));
    const v = hessMeasures(e.state).v;
    expect(v.heat_mw).toBeGreaterThan(9.8); expect(v.heat_mw).toBeLessThan(10.2); expect(v.lost_mw).toBeGreaterThan(3.5);
    roll(e);
    expect(e.state.status).toBe('won');
    expect(card(e).stars.earned).toEqual([true, false, false]);
  });
  it('too little air leaves CO to the stack with its 283 kJ/mol; one-step and over-fed plants have their own verdicts', () => {
    const short = mk('L07', hessBuild(cokeFor(10), (cokeFor(10) * 0.8) / 0.21));
    expect(card(short).verdictKey).toBe('slip'); expect(hessMeasures(short.state).v.co_slip).toBeGreaterThan(0.5);
    expect(info(short).annunciators.find((a: any) => a.key === 'co').state).toBe('critical');
    const lo = mk('L07', hessBuild(60, (60 * 1.05) / 0.21));
    expect(card(lo).verdictKey).toBe('short'); expect(card(lo).cause).toContain('91.48');
    const hi = mk('L07', hessBuild(120, (120 * 1.05) / 0.21));
    expect(card(hi).verdictKey).toBe('over');
  });
  it('first run: a commission that meets the goals runs 30 plant seconds before the win; the solver earns three stars including Call it coke within 1 %', () => {
    const e = start('L07');
    const agent = SPEC_BY_ID.L07!.solver(1003);
    for (const a of agent(e.state, e.ctx(new Rng(1)))) act(e, a.name, ...(a.args ?? []));
    expect(info(e).phase).toBe('firstrun');
    act(e, 'tick', 29); expect(e.state.status).toBe('playing');
    act(e, 'tick', 1); expect(e.state.status).toBe('won');
    expect(card(e).stars.earned).toEqual([true, true, true]);
  });
});

describe('L08 Pay Once', () => {
  const run = (area: number, region?: string) => { const e = mk('L08', pinchBuild(area, [{ name: 'commission' }]), 1003, 'learner', region); return { e, v: pinchMeasures(e.state) }; };
  it('the cost has an interior optimum in the exchanger area (global prices): it falls, bottoms out near 1000 m2 and rises again', () => {
    const cost = (a: number) => run(a).v.v.cost_usd_h!;
    const c = [200, 400, 700, 1000, 1200, 1400].map(cost);
    for (let i = 1; i <= 3; i++) expect(c[i]!).toBeLessThan(c[i - 1]!);
    expect(c[4]!).toBeGreaterThan(c[3]!); expect(c[5]!).toBeGreaterThan(c[4]!);
  });
  it('the calibrated optimum area is the cheapest area that keeps the stack at 120 C, in both regions, and the star thresholds are 1.03 x that cost', () => {
    for (const region of ['global', 'in']) {
      let best = Infinity, bestA = 0;
      for (let a = 900; a <= 1100; a += 5) {
        const r = run(a, region).v;
        if (!r.ok || C(r.v.flue_out_K!) < 120 || r.v.dt_min! < 20) continue;
        if (r.v.cost_usd_h! < best) { best = r.v.cost_usd_h!; bestA = a; }
      }
      expect(Math.abs(bestA - OPT_AREA), region).toBeLessThanOrEqual(10);
      expect(relErr(COST_STAR[region]!, best * 1.03), region).toBeLessThan(0.002);
      const at = run(OPT_AREA, region).v;
      expect(at.v.cost_usd_h!, region).toBeLessThan(COST_STAR[region]!);
      expect(C(at.v.flue_out_K!), region).toBeGreaterThanOrEqual(120);
    }
  });
  it('the exchanger saves fuel with falling returns: 1 m2 burns 3.63 MW, 990 m2 only 0.35 MW; the syngas is always at 420 C; energy: exchanger + heater = the 3.10 MW duty', () => {
    const a = run(1).v.v, b = run(OPT_AREA).v.v;
    expect(a.fuel_mw).toBeCloseTo(3.634, 2); expect(b.fuel_mw).toBeLessThan(0.4);
    expect(C(a.syn_out_K!)).toBeCloseTo(420, 3); expect(C(b.syn_out_K!)).toBeCloseTo(420, 3);
    expect(a.duty_mw).toBeCloseTo(b.duty_mw!, 6);
    expect(a.hx_mw! + a.fuel_mw! * 0.85).toBeCloseTo(a.duty_mw!, 3);
    expect(b.dt_min).toBeGreaterThan(20);
  });
  it('past the optimum the approach closes: at 2500 m2 the closest approach is under 20 K and the stack is cold (the rules, not the cost, are what stop you)', () => {
    const v = run(2500).v.v;
    expect(v.dt_min).toBeLessThan(20); expect(C(v.flue_out_K!)).toBeLessThan(120);
  });
  it('the novice with a token exchanger recovers nothing and burns 3.63 MW: verdict bare, the cause names the area and the stack temperature', () => {
    const e = play('L08', NAIVE.L08!);
    expect(card(e).verdictKey).toBe('bare'); expect(card(e).cause).toContain('3.63'); expect(card(e).cause).toContain('897'); expect(card(e).histogram).toBeNull();
    expect(info(e).annunciators.find((a: any) => a.key === 'recover').state).toBe('high');
  });
  it('the shift is 8 plant hours with a fuel price event and a hot day; the star rules (approach 20 K, stack 120 C) are checked at the end; an area past the stack limit earns star 1 only', () => {
    const e = mk('L08', pinchBuild(1100));
    expect(e.state.shift!.len).toBe(28800);
    expect(e.state.shift!.q.map((x) => x.type).every((t) => t === 'fuel_price' || t === 'cw_hot_day')).toBe(true);
    act(e, 'tick', 10000); act(e, 'tick', 10000); act(e, 'tick', 10000);
    expect(e.state.status).toBe('won');
    expect(card(e).stars.earned).toEqual([true, false, false]);
  });
});

describe('L09 Exam Bridge: Bomb vs Burner (EQ-NC-016, 019, 021)', () => {
  it('the bench: the flow calorimeter reads 890.3 kJ/mol, the bomb 885.4, and the gap is 2RT = 4.96 kJ/mol (DESIGN: dU = dH + 4.96)', () => {
    const f = ch4Facts();
    expect(f.dnG).toBe(-2);
    expect(f.gap).toBeCloseTo((2 * R_GAS * 298.15) / 1000, 9); expect(f.gap).toBeCloseTo(4.96, 2);
    expect(f.flowQ).toBeCloseTo(890.3, 1); expect(f.bombQ).toBeCloseTo(885.35, 1);
    const e = solve('L09');
    const m = SPEC_BY_ID.L09!.measures(e.state).v;
    expect(m.flow_q).toBeCloseTo(f.flowQ, 6);   // the engine's isothermal reactor duty (gas water) plus the condensation of 2 H2O
    expect(m.gas_q).toBeCloseTo(802.3, 1); expect(m.cond_q).toBeCloseTo(2 * (SPECIES['H2O']!.dHf298! - SPECIES['H2O(l)']!.dHf298!), 9);
    expect(m.gap).toBeCloseTo(4.96, 2);
  });
  it('the three NCERT items against the oracles: 35.2 g CO2 gives 314.8 kJ, the dU of vaporisation is 37.69 kJ/mol, the furnace switches on at 2000 K', () => {
    const q = -(rxnDH(findReaction('R14')!.nu, 298.15, 'rigorous') + rxnDH(findReaction('R15')!.nu, 298.15, 'rigorous')) / 1000;
    expect(relErr((35.2 / 44.0) * q, truthOf('heat_co2'))).toBeLessThan(0.005);
    expect(truthOf('heat_co2')).toBeCloseTo(-(oracle('EQ-NC-016').expected.heat_kJ as number), 9);
    const o19 = oracle('EQ-NC-019').inputs;
    expect(truthOf('du_vap')).toBeCloseTo(o19.dH_kJ - (o19.dn_gas * o19.R_J_mol_K * o19.T) / 1000, 4);
    const o21 = oracle('EQ-NC-021').inputs;
    expect(truthOf('tmin_k')).toBeCloseTo(o21.dH_kJ / o21.dS_kJ_per_K, 9); expect(truthOf('tmin_k')).toBe(2000);
  });
  it('Call it grading: ΔU at 0.5 % (the flow number ΔH is just outside), heat 0.5 %, ΔU of vaporisation 0.5 % (ΔH 40.79 is out), T 0.1 %', () => {
    const du = ch4Facts().bombQ;
    const run = (answers: [string, number][]) => {
      const e = start('L09');
      for (const [k, v] of answers) k === 'du_ch4' ? act(e, 'callIt', v) : act(e, 'predict', k, v);
      act(e, 'commission');
      return roll(e);
    };
    for (const [x, ok] of [[du, true], [du * 1.0049, true], [du * 0.9951, true], [du * 1.0051, false], [ch4Facts().flowQ, false], [du - 20, false]] as const) {
      const e = run([['du_ch4', x]]);
      expect(e.state.status === 'won', String(x)).toBe(ok);
      expect(info(e).callIt.ok === true || !ok, String(x)).toBe(true);
    }
    const cases: [string, number, number][] = [['heat_co2', 314.8, 1], ['heat_co2', 314.8 * 1.0049, 1], ['heat_co2', 314.8 * 1.0051, 0], ['du_vap', 37.688878, 1], ['du_vap', 40.79, 0], ['du_vap', 37.688878 * 0.9951, 1],
      ['tmin_k', 2000, 1], ['tmin_k', 2001.9, 1], ['tmin_k', 2002.1, 0], ['tmin_k', 2400, 0]];
    for (const [k, v, ok] of cases) {
      const m = SPEC_BY_ID.L09!.measures(run([['du_ch4', du], [k, v]]).state).v;
      expect(m.n_ncert, `${k} ${v}`).toBe(ok);
    }
  });
  it('stars: ★ the bomb prediction, ★★ two of the three items, ★★★ all three; a prediction after the run does not count', () => {
    const du = ch4Facts().bombQ;
    const stars = (items: [string, number][], late = false) => {
      const e = start('L09');
      act(e, 'callIt', du);
      for (const [k, v] of items) act(e, 'predict', k, v);
      act(e, 'commission');
      if (late) { act(e, 'setParam', 'R-102', 'T', 300); act(e, 'predict', 'tmin_k', 1500); act(e, 'commission'); }
      roll(e);
      return card(e).stars.earned;
    };
    expect(stars([])).toEqual([true, false, false]);
    expect(stars([['heat_co2', 314.8]])).toEqual([true, false, false]);
    expect(stars([['heat_co2', 314.8], ['du_vap', 37.689]])).toEqual([true, true, false]);
    expect(stars([['heat_co2', 314.8], ['du_vap', 37.689], ['tmin_k', 2000]])).toEqual([true, true, true]);
    expect(stars([['heat_co2', 314.8], ['du_vap', 40.79]], true)).toEqual([true, false, false]);
  });
  it('the novice who calls the flow calorimeter\'s number for the bomb: the cause names the 5 kJ gap; the bench animation (first run) switches the furnace on at 2000 K only for a winner', () => {
    const e = play('L09', NAIVE.L09!);
    expect(card(e).verdictKey).toBe('delta_h'); expect(card(e).cause).toContain('4.96'); expect(card(e).cause).toContain('885.4'); expect(card(e).histogram).toBeNull();
    expect(e.state.status).toBe('playing'); expect(info(e).phase).toBe('commissioned');
    const w = start('L09');
    const agent = SPEC_BY_ID.L09!.solver(1);
    for (const a of agent(w.state, w.ctx(new Rng(1)))) act(w, a.name, ...(a.args ?? []));
    expect(info(w).phase).toBe('firstrun');
    const furn = (): number => SPEC_BY_ID.L09!.measures(w.state).v.furnace_K!;
    const t0 = furn(); act(w, 'tick', 15); const t1 = furn(); act(w, 'tick', 5); const t2 = furn();
    expect(t1).toBeGreaterThan(t0); expect(t2).toBeGreaterThan(t1);
    expect(SPEC_BY_ID.L09!.measures(w.state).v.furnace_on).toBe(0);
    act(w, 'tick', 20); expect(w.state.status).toBe('won');
    expect(SPEC_BY_ID.L09!.measures(w.state).v.furnace_on).toBe(1);
    expect(card(w).card.ncert_tmin_k).toBe(2000);
  });
});

describe('Call it grading at the stated tolerances (L05 1 %, L06 1.5 %, L07 1 %)', () => {
  const graded = (id: string, answer: number) => {
    const e = start(id);
    act(e, 'callIt', answer);
    const agent = SPEC_BY_ID[id]!.solver(1003);
    for (const a of agent(e.state, e.ctx(new Rng(1)))) if (a.name !== 'callIt') act(e, a.name, ...(a.args ?? []));
    return e;
  };
  it('L05: heat released 8.25 MW (DESIGN 8.25 +- 1 %) is graded against S x dH of the catalogue', () => {
    const truth = (100 * dhSO2()) / 3600;
    expect(relErr(truth, 8.25)).toBeLessThan(0.001);
    for (const [x, ok] of [[truth, true], [truth * 1.0099, true], [truth * 0.9901, true], [truth * 1.0102, false], [truth * 0.98, false], [10, false]] as const) {
      const e = graded('L05', x); act(e, 'tick', 1);
      expect(info(e).callIt.ok, String(x)).toBe(ok); expect(info(e).callIt.answered).toBe(true);
    }
  });
  it('L06: the adiabatic temperature at 10 % SO2 within 1.5 % of 931 C', () => {
    const truth = C(burnerTadK(10));
    for (const [x, ok] of [[truth, true], [truth * 1.0149, true], [truth * 0.9851, true], [truth * 1.0152, false], [1744.9, false]] as const) {
      const e = graded('L06', x); act(e, 'tick', 1);
      expect(info(e).callIt.ok, String(x)).toBe(ok);
    }
  });
  it('L07: the coke flow within 1 % of 91.48 kmol/h earns the third star; the CO-step-only answer (127 kmol/h) does not', () => {
    for (const [x, ok] of [[cokeFor(10), true], [cokeFor(10) * 1.0099, true], [cokeFor(10) * 0.9901, true], [cokeFor(10) * 1.0102, false], [(10 * 3600) / 283.0, false]] as const) {
      const e = graded('L07', x); roll(e);
      expect(e.state.status).toBe('won');
      expect(card(e).stars.earned[2], String(x)).toBe(ok);
    }
  });
  it('F3a: L05 coach walks the burner house standalone (blower, mixer, burner, boiler, stack, pipes); the lesson hides the answer until the prediction is made', () => {
    const e = start('L05');
    const ids: string[] = [];
    for (const u of [['compressor', 4, 4], ['mixer', 10, 2], ['burner', 14, 0], ['boiler', 18, 0], ['stack', 22, 2]] as const) { ids.push(info(e).coach.text); act(e, 'placeUnit', u[0], u[1], u[2], 0); }
    expect(info(e).coach.text).toMatch(/Pipe it in order/);
    expect(new Set(ids).size).toBe(5);
    expect(info(start('L05')).lesson).toBe(''); expect(info(start('L05')).note.join(' ')).not.toMatch(/eight/i);
    const e2 = start('L05'); act(e2, 'callIt', 8.2); expect(info(e2).lesson).toMatch(/MW/);
  });
  it('F3a: a budget goal is not met before anything is built; callIts rows keep every exam answer; goal rows say pending / a window readout', () => {
    const e = start('L09'); const q0 = info(e);
    expect(q0.callIts.map((c: any) => c.key)).toEqual(['du_ch4', 'heat_co2', 'du_vap', 'tmin_k']);
    expect(q0.goals.every((g: any) => g.pending)).toBe(true); expect(q0.goals[0].text).toMatch(/pending/);
    act(e, 'callIt', 885.35); act(e, 'callIt', 314.8, 'heat_co2'); act(e, 'predict', 'tmin_k', 1500);
    const q1 = info(e);
    expect(q1.callIts.map((c: any) => [c.key, c.answered])).toEqual([['du_ch4', true], ['heat_co2', true], ['du_vap', false], ['tmin_k', true]]);
    expect(q1.callIts.every((c: any) => c.ok === undefined)).toBe(true);
    expect(q1.callIt.value).toBe(885.35); expect(q1.callIt.answered).toBe(true);
    for (const x of q1.callIts) expect(x.prompt).not.toMatch(/314|37\.69|885/);
    act(e, 'commission');
    const q2 = info(e);
    expect(q2.callIts[3].ok).toBe(false); expect(q2.callIts[3].truth).toBeGreaterThan(0);
    const b = start('L05', 1003, 'engineer');
    expect(info(b).goals.find((g: any) => g.key === 'budget')!.met).toBe(false);
    expect(info(b).goals.find((g: any) => g.key === 'so2')!.pending).toBe(true);
    const sv = solve('L05', { mode: 'engineer' });
    expect(info(sv).goals.find((g: any) => g.key === 'so2')!.readout).toMatch(/\(target 9\.5-11\)/);
    expect(info(sv).goals.find((g: any) => g.key === 'budget')!.met).toBe(true);
  });
  it('a prediction is a prediction: late is refused; L08 has none', () => {
    const e = mk('L05', fireBuild(REF_AIR, 420, [{ name: 'commission' }]));
    expect(act(e, 'callIt', 8.25).info.ok).toBe(false);
    expect(act(start('L08'), 'callIt', 1).info.ok).toBe(false);
  });
});

describe('levelInfo contract', () => {
  const KEYS = ['id', 'chapter', 'index', 'title', 'setter', 'place', 'note', 'goals', 'budgetUSD', 'spentUSD', 'stars', 'callIt', 'allowedUnits', 'hero', 'secondary', 'annunciators', 'phase', 'firstRun', 'coach', 'lesson', 'mode'];
  for (const id of CH2) {
    it(`${id}: every field is present, numbers finite, 4-8 annunciators with caps legends of at most 14 characters, at start and after the solver`, () => {
      for (const mode of ['learner', 'engineer', 'sandbox']) for (const e of [start(id, 1003, mode), solve(id, { mode })]) {
        const q = info(e);
        for (const k of KEYS) expect(q, `${id} ${mode} ${k}`).toHaveProperty(k);
        expect(allFinite(q)).toBeNull();
        expect(q.id).toBe(id); expect(q.chapter).toBe(2); expect(q.mode).toBe(mode);
        expect(q.note.length).toBeGreaterThan(0); expect(q.note.every((n: string) => n.length > 5 && !n.includes('lv.'))).toBe(true);
        for (const g of q.goals) { expect(g.text.length).toBeGreaterThan(5); expect(g.text).not.toContain('lv.'); expect(g.text).not.toMatch(/\{/); expect(typeof g.met).toBe('boolean'); }
        expect(q.stars.rules).toHaveLength(3);
        expect(q.annunciators.length).toBeGreaterThanOrEqual(4); expect(q.annunciators.length).toBeLessThanOrEqual(8);
        for (const a of q.annunciators) { expect(a.legend).toBe(a.legend.toUpperCase()); expect(a.legend.length).toBeLessThanOrEqual(14); expect(['off', 'normal', 'high', 'critical']).toContain(a.state); }
        expect(q.annunciators.some((a: any) => a.key === 'goal')).toBe(true);
        expect(q.hero.label.length).toBeGreaterThan(2); expect(q.hero.hi).toBeGreaterThanOrEqual(q.hero.lo);
        expect(q.lesson.length > 20 || (q.callIt !== null && !q.callIt.answered && q.phase === 'design' && q.lesson === ''), 'the lesson is withheld only while a prediction is open').toBe(true); expect(q.lesson).not.toMatch(/\{/);
        expect(q.setterName.length).toBeGreaterThan(3);
        expect(q.allowedUnits.every((u: any) => u.used <= u.max && u.priceUSD > 0)).toBe(true);
      }
    });
  }
  it('the setters are the cast of DESIGN: Victor, Noor, Mara, Victor, Mara; chapter 2 coaches on its new units (Learner only)', () => {
    expect(['L05', 'L06', 'L07', 'L08', 'L09'].map((id) => /Victor|Noor|Mara|Tomas/.exec(info(start(id)).setterName)![0])).toEqual(['Victor', 'Noor', 'Mara', 'Victor', 'Mara']);
    expect(info(start('L05')).coach).toMatchObject({ step: 1, total: 10 });
    expect(info(start('L05', 1003, 'engineer')).coach).toBeNull(); expect(info(start('L05', 1003, 'sandbox')).coach).toBeNull();
    const e = start('L05'); act(e, 'placeUnit', 'compressor', 4, 4, 0); expect(info(e).coach.step).toBe(2); expect(info(e).coach.focus).toEqual({ rack: 'mixer' });
    expect(info(start('L06')).coach).toMatchObject({ total: 9 }); expect(info(start('L07')).coach).toMatchObject({ total: 7 }); expect(info(start('L08')).coach).toMatchObject({ total: 4 }); expect(info(start('L09')).coach).toMatchObject({ total: 4 });
    for (const id of CH2) expect(info(solve(id)).coach).toBeNull();
  });
  it('the lesson holds the player numbers', () => {
    expect(info(solve('L05')).lesson).toContain('100'); expect(info(solve('L05')).lesson).toContain('296.8');
    expect(info(solve('L07')).lesson).toContain('393.5'); expect(info(solve('L07')).lesson).toContain('91.48');
    expect(info(solve('L09')).lesson).toContain('4.96'); expect(info(solve('L09')).lesson).toContain('2,000');
    expect(info(solve('L06')).lesson).toContain('11.9');
    expect(info(solve('L08')).lesson).toContain('990');
  });
  it('goals state their target and value after a run; budget is an Engineer goal', () => {
    const e = solve('L07');
    expect(info(e).goals[0].target).toBe(10); expect(info(e).goals[0].value).toBeCloseTo(10, 3);
    expect(info(solve('L07', { mode: 'engineer' })).goals.map((g: any) => g.key)).toEqual(['heat', 'route', 'budget']);
    expect(info(solve('L07')).spentUSD).toBeGreaterThan(0); expect(info(solve('L07')).spentUSD).toBeLessThanOrEqual(info(solve('L07')).budgetUSD);
  });
});

describe('resultCard contract', () => {
  it('no histogram on failure; a 200-sample histogram with the player marked on a win (L09 has none); passes carry no cause', () => {
    for (const id of CH2) {
      const bad = card(play(id, NAIVE[id]!, { seed: 1003, ticks: 5 }));
      expect(bad.won, id).toBe(false); expect(bad.histogram, id).toBeNull(); expect(bad.cause.length, id).toBeGreaterThan(20);
      const good = card(solve(id));
      expect(good.won, id).toBe(true); expect(good.cause, id).toBeUndefined();
      expect(good.metrics, id).toHaveLength(3);
      if (id === 'L09') { expect(good.histogram).toBeNull(); continue; }
      const h = good.histogram;
      expect(h.bins.reduce((a: number, b: number) => a + b, 0), id).toBe(200); expect(h.bins).toHaveLength(12);
      expect(h.you).toBeGreaterThanOrEqual(h.edges[0]); expect(h.you).toBeLessThanOrEqual(h.edges[12]);
    }
  });
  it('the shape of every field, finite numbers, texts without keys or braces', () => {
    for (const id of CH2) for (const e of [play(id, NAIVE[id]!, { ticks: 5 }), solve(id)]) {
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
    for (const id of CH2) for (const e of [play(id, NAIVE[id]!, { seed: 1003 }), play(id, NAIVE[id]!, { seed: 1002 }), solve(id), solve(id, { seed: 2 })]) {
      const eq = card(e).equation as string | undefined;
      if (eq === undefined) continue;
      seen++;
      expect(equationHolds(eq), `${id}: ${eq}`).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(15);
  });
  it('a failed commission prints its coded cause; before any run there is no card', () => {
    for (const id of CH2) expect(card(start(id)), id).toBeNull();
    const e = mk('L05', [...fireBuild(REF_AIR, 420, []), { name: 'setParam', args: ['K-103', 'P', 5e4] }, { name: 'commission' }]);
    const c = card(e);
    expect(c.verdictKey).toBe('solve_fail'); expect(c.won).toBe(false); expect(c.cause.length).toBeGreaterThan(10);
    expect(info(e).annunciators.find((a: any) => a.key === 'solve').state).toBe('critical');
  });
});

describe('solution codes, determinism, strings', () => {
  it('the design code of every solver run verifies on a fresh engine and reproduces the metrics', () => {
    for (const id of CH2) {
      const e = solve(id);
      const code = card(e).designCode as string;
      expect('error' in decodeSolution(code)).toBe(false);
      const v = verify(id, code);
      expect(v.ok, `${id}: ${v.reason}`).toBe(true);
      expect(v.metrics).toEqual(GAME.metrics!(e.state));
    }
  });
  it('same actions, same hash; a different attempt, a different hash', () => {
    for (const id of CH2) {
      expect(hashOf(solve(id).state), id).toBe(hashOf(solve(id).state));
      expect(hashOf(solve(id).state), id).not.toBe(hashOf(play(id, NAIVE[id]!, { ticks: 5 }).state));
    }
  });
  it('different seeds draw different events (L05): the shift schedule follows the seed', () => {
    const at = (seed: number) => JSON.stringify(mk('L05', fireBuild(REF_AIR, 420), seed).state.shift!.q.map((x) => [x.type, x.at]));
    expect(at(1)).not.toBe(at(2)); expect(at(1)).toBe(at(1));
  });
  it('no level text asks for a missing key or variable, in any mode', () => {
    i18n.clearMissing();
    for (const mode of ['learner', 'engineer', 'sandbox']) for (const id of CH2) {
      for (const e of [start(id, 1003, mode), solve(id, { mode }), play(id, NAIVE[id]!, { mode, ticks: 5 })]) { info(e); card(e); }
    }
    for (const a of [{ y: 12, d: 0 }, { y: 10, d: 0 }, { y: 12.2, d: 0.12 }]) card(mk('L06', lineBuild(airFor(a.y, a.d), a.d, [{ name: 'commission' }])));
    for (const air of [1200, 700]) card(mk('L05', fireBuild(air, 420, [{ name: 'commission' }])));
    card(mk('L05', fireBuild(REF_AIR, 500, [{ name: 'commission' }])));
    card(mk('L07', hessBuild(cokeFor(10), 300))); card(mk('L07', hessBuild(60, 300))); card(mk('L07', hessBuild(120, 700)));
    card(mk('L08', pinchBuild(2500, [{ name: 'commission' }]))); card(mk('L08', pinchBuild(1100)));
    card(mk('L09', [{ name: 'commission' }])); card(mk('L09', [{ name: 'callIt', args: [800] }, { name: 'commission' }]));
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
  it('the unit limits and palettes of the levels are enforced (one boiler in L05; the bench offers no parts)', () => {
    const e = start('L05');
    expect(act(e, 'placeUnit', 'boiler', 18, 0, 0).info.ok).toBe(true);
    expect(act(e, 'placeUnit', 'boiler', 18, 6, 0).info.ok).toBe(false);
    expect(act(e, 'placeUnit', 'hx', 12, 6, 0).info.ok).toBe(false);
    expect(act(start('L09'), 'placeUnit', 'hx', 12, 6, 0).info.ok).toBe(false);
  });
});
