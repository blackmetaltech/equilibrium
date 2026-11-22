// F29 (0.8 incidents): a Career incident opens a real plant. "Inerts in the ammonia loop feed" fires in the Career, the board offers GO TO THE PLANT / CALL THE CONTRACTOR / IGNORE IT, the
// incident level (the L20 purge loop with the Career's gas and catalyst) is solved by a reference solver, and the commissioned loop maps back to the Career's numbers deterministically.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import type { EqState } from '../state';
import { SPEC_BY_ID } from './registry';
import { CAREER_FIX_NH3_INERTS, DEFAULT_PRE, FIX_ID, FIX_OUT_MIN, fixScript, loopResult } from './career_fix';
import { incidentView, logLabel } from './career';
import {
  BEST_PURGE, CLEAN, CONTRACTOR_PURGE, CONTRACTOR_USD, INC_MONTHS, INERT_STEPS, OLD_PURGE, TABLE, effectOf, kwRated, monthlyLossUSD, optionLossUSD, statedLoop, type IncidentPre, type LoopResult,
} from '../sim/career/incident';
import { CareerError, DEFS, MONTHS, advance, advanceToDecision, decide, initCareer, openWarnings, outputOf, pendingIncident, stepMonth, type Career } from '../sim/career/model';
import { carefulDecisions, idleDecisions, playCareer, recklessDecisions, type Decision } from '../sim/career/policy';
import { followerDecisions, humanCarefulDecisions, playCareerFollower, playCareerSteps } from '../sim/career/human';

const SEEDS = [1, 2, 3, 4, 5, 6];
const DEFAULT_SEED = 1;
function start(pre?: IncidentPre): Env<EqState> {
  const env = new Env(GAME);
  env.reset({ seed: 1003, level: FIX_ID, mode: 'learner' });
  if (pre !== undefined) { const r = env.step({ name: 'levelAct', args: ['career', pre] }); expect(r.info.ok, 'career pre-load accepted').toBe(true); }
  return env;
}
const measures = (e: Env<EqState>) => CAREER_FIX_NH3_INERTS.measures(e.state);
/** The loop at a purge, on a fresh plant with the incident pre-loaded (no ticks). */
function loopAt(pre: IncidentPre, purge: number): LoopResult {
  const e = start(pre);
  for (const a of fixScript(purge)) e.step(a);
  const r = loopResult(e.state);
  expect(r, `loop at ${purge}`).not.toBeNull();
  return r!;
}
/** Play the level with a persona until it ends (the first run is 30 plant seconds). */
function play(pre: IncidentPre | undefined, persona: 'solver' | 'naive', ticks = 45): Env<EqState> {
  const e = start(pre), agent = (persona === 'solver' ? CAREER_FIX_NH3_INERTS.solver : CAREER_FIX_NH3_INERTS.naive)(1003), rng = new Rng(1003);
  for (let t = 0; t < ticks && e.state.status === 'playing'; t++) {
    for (const a of agent(e.state, e.ctx(rng))) { e.step(a); if (e.state.status !== 'playing') break; }
    if (e.state.status === 'playing') e.step(TICK);
  }
  return e;
}
const tryDo = (c: Career, d: Decision): void => { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } };
/** A careful Career run month by month until the first plant incident is waiting (the policy has not answered it yet). */
function untilIncident(seed: number, mode = 'engineer'): Career {
  const c = initCareer(seed, mode);
  for (let g = 0; g < MONTHS && c.ending === '' && pendingIncident(c) === null; g++) {
    for (const d of carefulDecisions(c)) tryDo(c, d);
    advance(c, 1);
  }
  expect(pendingIncident(c), `an incident on seed ${seed}`).not.toBeNull();
  return c;
}
const clone = (c: Career): Career => JSON.parse(JSON.stringify(c)) as Career;
/** The best purge on a 0.5 % grid for this incident (the one the Career pays least for, inside the compressor rating). */
function gridBest(pre: IncidentPre): { purge: number; loss: number } {
  let best = { purge: 0, loss: Infinity };
  for (let p = 0.01; p <= 0.0601; p += 0.005) {
    const r = loopAt(pre, Math.round(p * 1000) / 1000), e = effectOf(r, pre.cat);
    if (r.kw > kwRated(pre.cat)) continue;
    const loss = optionLossUSD(pre, e, 'plant');
    if (loss < best.loss) best = { purge: Math.round(p * 1000) / 1000, loss };
  }
  return best;
}
/** Run the career month by month with the careful policy until the incident's months are over. */
function runThrough(c: Career): Career {
  const until = c.inc!.until;
  while (c.ending === '' && c.m < until) { for (const d of carefulDecisions(c)) tryDo(c, d); advance(c, 1); }
  return c;
}

describe('F29: the incident level', () => {
  it('solves with the reference solver, on the default incident and on a Career pre-load; the old purge (the naive) chokes the loop', () => {
    const won = play(undefined, 'solver');
    expect(won.state.status).toBe('won');
    const m = measures(won);
    expect(m.v.shaft_kw!).toBeLessThanOrEqual(m.v.kw_rated!); expect(m.v.out_pct!).toBeGreaterThanOrEqual(FIX_OUT_MIN * 100);
    const c = untilIncident(DEFAULT_SEED), pre = c.inc!.pre;
    const w2 = play(pre, 'solver');
    expect(w2.state.status, 'the Career incident solves').toBe('won');
    const v = w2.engine.q('levelView') as { fix: Record<string, number>; pre: IncidentPre };
    expect(v.pre).toEqual(pre);
    expect(v.fix.y).toBe(pre.y); expect(v.fix.cat).toBe(pre.cat); expect(v.fix.m).toBe(pre.m);
    expect(v.fix.purge).toBeCloseTo(BEST_PURGE[pre.k]!, 9);
    const nv = play(undefined, 'naive');
    expect(nv.state.status).toBe('playing');
    const nm = measures(nv);
    expect(nm.ok).toBe(true); expect(nm.v.shaft_kw!).toBeGreaterThan(nm.v.kw_rated!);
    expect(CAREER_FIX_NH3_INERTS.verdict(nv.state, nm, CAREER_FIX_NH3_INERTS.goals(nv.state, nm)).key).toBe('choke');
  }, 60000);
  it('the plant carries the Career state: the argon of the event in the nitrogen feed, the converter at the catalyst approach, and the pre-load is refused after a commission', () => {
    const pre: IncidentPre = { ...DEFAULT_PRE, k: 5, y: INERT_STEPS[5], cat: 0.6 };
    const e = start(pre);
    const m = measures(e);
    expect(m.v.y_pct).toBeCloseTo(4.5, 9); expect(m.v.approach_k).toBeCloseTo(20, 9);
    const ar = e.state.feeds['F-101']!, ix = e.state.species.indexOf('Ar');
    expect(ar.x[ix]! * ar.flow * 3.6).toBeCloseTo((0.045 * 1000) / 0.955, 6);
    expect(e.state.flowsheet.units.find((u) => u.id === 'R-104')!.params.T).toBeCloseTo(723.15 + 20, 9);
    // editing the converter does not escape the catalyst: the commission puts the approach back
    e.step({ name: 'setParam', args: ['R-104', 'T', 700] });
    for (const a of fixScript(0.025)) e.step(a);
    expect(e.state.flowsheet.units.find((u) => u.id === 'R-104')!.params.T).toBeCloseTo(743.15, 9);
    const r = e.step({ name: 'levelAct', args: ['career', DEFAULT_PRE] });
    expect(r.info.ok).toBe(false);
    const bad = start(); expect(bad.step({ name: 'levelAct', args: ['career', { ...DEFAULT_PRE, y: 0.031 }] }).info.ok).toBe(false);
  });
  it('the contractor and "ignore" tables are the engine\'s own loop (1 % and 6 % purge, every inert step, approach 0 and 40 K), and the clean loop is L20\'s', () => {
    for (const [cat, row] of [[1, 0], [0.2, 1]] as const) {
      for (let k = 0; k < INERT_STEPS.length; k++) {
        const pre: IncidentPre = { ...DEFAULT_PRE, k, y: INERT_STEPS[k]!, cat };
        for (const kind of ['ignore', 'contractor'] as const) {
          const r = loopAt(pre, kind === 'ignore' ? OLD_PURGE : CONTRACTOR_PURGE), tb = TABLE[kind];
          expect(r.conv, `${kind} conv k${k} row${row}`).toBeCloseTo(tb.conv[row][k]!, 1);
          expect(Math.abs(r.kw / tb.kw[row][k]! - 1), `${kind} kW k${k} row${row}`).toBeLessThan(0.002);
          expect(r.ar, `${kind} Ar k${k} row${row}`).toBeCloseTo(tb.ar[row][k]!, 1);
          const st = statedLoop(kind, k, cat);
          expect(st.conv).toBeCloseTo(tb.conv[row][k]!, 9);
        }
      }
    }
    // the table interpolates between the two approaches to within 1 % of the engine at 20 K
    const mid: IncidentPre = { ...DEFAULT_PRE, k: 3, y: INERT_STEPS[3], cat: 0.6 };
    const r = loopAt(mid, OLD_PURGE), st = statedLoop('ignore', 3, 0.6);
    expect(Math.abs(st.kw / r.kw - 1)).toBeLessThan(0.01); expect(Math.abs(st.conv - r.conv)).toBeLessThan(0.2);
    // the clean loop: L20 at its 1 % purge
    const l20 = new Env(GAME); l20.reset({ seed: 1003, level: 'L20', mode: 'learner' }); l20.step({ name: 'setParam', args: ['X-108', 'frac', 0.01] }); l20.step({ name: 'commission' });
    const lm = SPEC_BY_ID.L20!.measures(l20.state);
    expect(lm.v.conv_overall).toBeCloseTo(CLEAN.conv[0], 2); expect(lm.v.shaft_kw).toBeCloseTo(CLEAN.kw[0], 1);
  }, 120000);
  it('the reference purge of every inert step is the best of a 0.5 % grid at the default prices (within 2 % of its Career cost)', () => {
    for (let k = 0; k < INERT_STEPS.length; k++) {
      const pre: IncidentPre = { ...DEFAULT_PRE, k, y: INERT_STEPS[k]! }, g = gridBest(pre);
      const mine = optionLossUSD(pre, effectOf(loopAt(pre, BEST_PURGE[k]!), pre.cat), 'plant');
      expect(mine, `k${k}: ${BEST_PURGE[k]} against the grid best ${g.purge}`).toBeLessThanOrEqual(g.loss * 1.02 + 1);
    }
  }, 120000);
});

describe('F29: the mapping back into the Career', () => {
  it('is monotonic and sensible on the default seed: the best purge beats the contractor, which beats ignoring it; a wide-open purge is worse than the contractor', () => {
    const c = untilIncident(DEFAULT_SEED), pre = c.inc!.pre;
    const best = effectOf(loopAt(pre, BEST_PURGE[pre.k]!), pre.cat), con = effectOf(statedLoop('contractor', pre.k, pre.cat), pre.cat), ign = effectOf(statedLoop('ignore', pre.k, pre.cat), pre.cat);
    const lb = optionLossUSD(pre, best, 'plant'), lc = optionLossUSD(pre, con, 'contractor'), li = optionLossUSD(pre, ign, 'ignore');
    expect(lb).toBeGreaterThan(0); expect(lb).toBeLessThan(lc); expect(lc).toBeLessThan(li);
    expect(best.outF).toBeGreaterThan(con.outF); expect(con.outF).toBeGreaterThan(ign.outF);
    const wide = effectOf(loopAt(pre, 0.08), pre.cat);
    expect(optionLossUSD(pre, wide, 'plant')).toBeGreaterThan(lc);
    // the Career itself: three copies of the same month, three answers, run through the incident's months with the same later decisions
    const mk = (f: (x: Career) => void): Career => { const x = clone(c); f(x); return runThrough(x); };
    const fix = { ...loopAt(pre, BEST_PURGE[pre.k]!), y: pre.y, cat: pre.cat, m: pre.m };
    const cp = mk((x) => decide(x, 'incidentFix', fix)), cc = mk((x) => decide(x, 'incident', 'contractor')), ci = mk((x) => decide(x, 'incident', 'ignore'));
    expect(cp.cash).toBeGreaterThan(cc.cash); expect(cc.cash).toBeGreaterThan(ci.cash);
    // the realised gaps are the stated ones to within 20 % (spot depth, contracts and the events of those months move them a little)
    expect(Math.abs((cp.cash - cc.cash) - (lc - lb)) / (lc - lb)).toBeLessThan(0.2);
    expect(Math.abs((cc.cash - ci.cash) - (li - lc)) / (li - lc)).toBeLessThan(0.2);
  }, 60000);
  it('changes the Career numbers by the stated amount: the plant\'s output and gas follow outF and gasF in the incident months, the month does not move, the log row says what was done', () => {
    const c = untilIncident(DEFAULT_SEED), pre = c.inc!.pre, m0 = c.m, cash0 = c.cash;
    const fix = { ...loopAt(pre, 0.03), y: pre.y, cat: pre.cat, m: pre.m };
    const a = clone(c), b = clone(c);
    decide(a, 'incidentFix', fix);
    expect(a.m).toBe(m0); expect(a.cash).toBe(cash0);
    const e = effectOf(fix, pre.cat);
    expect(a.inc!.outF).toBeCloseTo(e.outF, 12); expect(a.inc!.gasF).toBeCloseTo(e.gasF, 12);
    const row = a.log[a.log.length - 1]!;
    expect(logLabel(row)).toMatch(new RegExp(`^Purge set to 3 % at the plant: inerts ${row.x!.ar} %, output back to ${row.x!.out} % for ${INC_MONTHS} months`));
    expect(row.x!.out).toBeCloseTo(Math.round(e.outF * 1000) / 10, 9);
    const iv = incidentView(a)!;
    expect(iv.pending).toBe(false); expect(String(iv.done)).toContain('You set the purge to 3 % at the plant');
    decide(b, 'incident', 'contractor');
    expect(b.cash).toBeCloseTo(cash0 - CONTRACTOR_USD, 6);
    // one month later: same seed, same events, same plant state; the ammonia made differs by exactly the ratio of the output factors, the gas bill by outF x gasF
    stepMonth(a); stepMonth(b);
    expect(a.plants.nh3.out / b.plants.nh3.out).toBeCloseTo(a.inc!.outF / b.inc!.outF, 9);
    for (const p of ['acid', 'meoh', 'etoh'] as const) expect(a.plants[p].out).toBeCloseTo(b.plants[p].out, 9);
    // the stated monthly loss is the clean month less this month on the same state
    expect(monthlyLossUSD(pre, e)).toBeGreaterThan(0);
    // after the incident's months the plant is clean again: both copies make the same ammonia
    while (a.m < a.inc!.until + 1 && a.ending === '') { stepMonth(a); stepMonth(b); }
    expect(a.plants.nh3.out).toBeCloseTo(b.plants.nh3.out, 6);
    expect(a.log.some((l) => l.kind === 'fix' && l.code === 'over')).toBe(true);
  });
  it('refuses a plant result run for another gas, catalyst or month, and a second answer', () => {
    const c = untilIncident(DEFAULT_SEED), pre = c.inc!.pre, r = loopAt(pre, 0.025);
    expect(() => decide(clone(c), 'incidentFix', { ...r, y: pre.y + 0.005, cat: pre.cat, m: pre.m })).toThrow(CareerError);
    expect(() => decide(clone(c), 'incidentFix', { ...r, y: pre.y, cat: pre.cat - 0.1, m: pre.m })).toThrow(CareerError);
    expect(() => decide(clone(c), 'incidentFix', { ...r, y: pre.y, cat: pre.cat, m: pre.m + 1 })).toThrow(CareerError);
    const x = clone(c); decide(x, 'incident', 'ignore');
    expect(() => decide(x, 'incident', 'contractor')).toThrow(CareerError);
    expect(() => decide(clone(c), 'incident', 'maybe')).toThrow(CareerError);
  });
  it('an open incident stops a multi-month run like a warning; CONTINUE ANYWAY (or one month) lets it lapse to "ignore", stated on the log', () => {
    const c = untilIncident(DEFAULT_SEED), k = `inc:nh3:${c.inc!.m}`;
    expect(openWarnings(c)).toContain(k);
    expect(() => advance(clone(c), 3)).toThrow(CareerError);
    expect(() => advanceToDecision(clone(c))).toThrow(CareerError);
    const x = clone(c); advance(x, 1);
    expect(x.inc!.choice).toBe('ignore'); expect(x.inc!.lapsed).toBe(true);
    expect(x.log.some((l) => l.kind === 'fix' && l.code === 'lapsed')).toBe(true);
    const ig = effectOf(statedLoop('ignore', c.inc!.k, c.inc!.cat), c.inc!.cat);
    expect(x.inc!.outF).toBeCloseTo(ig.outF, 12);
  });
  it('is deterministic: the same seed and the same answers replay to the same Career, and the level replays to the same state', () => {
    const run = (): Career => { const c = untilIncident(DEFAULT_SEED), pre = c.inc!.pre; decide(c, 'incidentFix', { ...loopAt(pre, BEST_PURGE[pre.k]!), y: pre.y, cat: pre.cat, m: pre.m }); return runThrough(c); };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    const pre = untilIncident(DEFAULT_SEED).inc!.pre;
    expect(hashOf(play(pre, 'solver').state)).toBe(hashOf(play(pre, 'solver').state));
  }, 60000);
});

describe('F29: the reference players still end where they did', () => {
  it('careful, human-careful and follower take the contractor and still reach the Flagship; idle and reckless still lose; incidents happen on most seeds', () => {
    const careful = SEEDS.map((s) => playCareer(s, carefulDecisions)), human = SEEDS.map((s) => playCareerSteps(s, humanCarefulDecisions, 3)), follow = SEEDS.map((s) => playCareerFollower(s, 'engineer', followerDecisions));
    const fixes = (c: Career): number => c.log.filter((l) => l.kind === 'fix' && l.code === 'contractor').length;
    expect(careful.filter((c) => fixes(c) > 0).length).toBeGreaterThanOrEqual(3);
    expect(careful.filter((c) => c.ending === 'chief').length).toBeGreaterThanOrEqual(5);
    expect(human.filter((c) => c.ending === 'chief').length).toBeGreaterThanOrEqual(5);
    expect(follow.filter((c) => c.ending === 'chief').length).toBeGreaterThanOrEqual(5);
    for (const s of SEEDS) {
      expect(['sold', 'shut']).toContain(playCareer(s, idleDecisions).ending);
      expect(['sold', 'shut']).toContain(playCareer(s, recklessDecisions).ending);
    }
    void DEFS; void outputOf;
  }, 120000);
});
