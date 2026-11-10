// Oracles of the chapter-9 mechanics (src/sim/ops): analytic or textbook, none hand-copied from the implementation.
import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { LOOP_A, LOOP_TRUE, reconcile } from './recon';
import { cpm, schedule, type Job } from './turnaround';
import { DEVS, NODE, SIGNIFICANT, SIMS, callItTout, gradeRows, minProposalUsd, simOf, tSat } from './hazop';
import { runSop } from './sop';
import { runPermit } from './permit';

describe('reconciliation (weighted least squares, closed form)', () => {
  it('one node a + b = c with equal sigma: each adjustment is its coefficient times the imbalance over 3', () => {
    const r = reconcile([[1, 1, -1]], [10, 20, 33], [1, 1, 1]);
    expect(r.eps[0]).toBeCloseTo(-1, 12); expect(r.eps[1]).toBeCloseTo(-1, 12); expect(r.eps[2]).toBeCloseTo(1, 12);
    expect(r.chi2).toBeCloseTo(9 / 3, 12);
  });
  it('the reconciled flows close every node; noise-free data are returned unchanged', () => {
    const y = [100, 405, 398, 101, 296], r = reconcile(LOOP_A, y, y.map((v) => 0.01 * v));
    for (const row of LOOP_A) expect(Math.abs(row.reduce((a, c, k) => a + c * r.xhat[k]!, 0))).toBeLessThan(1e-9);
    const t = reconcile(LOOP_A, LOOP_TRUE, LOOP_TRUE.map((v) => 0.01 * v));
    expect(t.chi2).toBeCloseTo(0, 18); t.xhat.forEach((v, i) => expect(v).toBeCloseTo(LOOP_TRUE[i]!, 9));
  });
  it('a hand-built 5-meter case with one known bias: the gross-error test names that meter, for every meter that is identifiable', () => {
    const sg = LOOP_TRUE.map((v) => 0.01 * v);
    for (const j of [0, 1, 2, 3]) {
      const y = LOOP_TRUE.slice(); y[j] = y[j]! * 1.08;
      const r = reconcile(LOOP_A, y, sg);
      expect(r.worst, `meter ${j}`).toBe(j); expect(r.z[j]!).toBeGreaterThan(3.29); expect(r.chi2).toBeGreaterThan(r.chi2Crit);
    }
  });
  it('excluding the biased meter closes the balance and recovers the truth to the noise', () => {
    const y = LOOP_TRUE.slice(); y[1] = y[1]! * 1.06;
    const r = reconcile(LOOP_A, y, LOOP_TRUE.map((v) => 0.01 * v), [1]);
    expect(r.chi2).toBeLessThan(1e-6); r.xhat.forEach((v, i) => expect(Math.abs(v - LOOP_TRUE[i]!) / LOOP_TRUE[i]!).toBeLessThan(0.03));
  });
});

describe('critical path and levelled schedule (textbook network)', () => {
  const J = (id: string, days: number, deps: string[], crew = 1, crane = 0): Job => ({ id, days, deps, crew, crane });
  const net = [J('A', 3, []), J('B', 4, ['A']), J('C', 2, ['A']), J('D', 5, ['B']), J('E', 4, ['C']), J('F', 3, ['D', 'E'])];
  it('A3 B4 C2 D5 E4 F3: length 15, critical A-B-D-F, float of C and E is 3', () => {
    const c = cpm(net);
    expect(c.length).toBe(15); expect(c.critical).toEqual(['A', 'B', 'D', 'F']);
    expect(c.ef).toMatchObject({ A: 3, B: 7, C: 5, D: 12, E: 9, F: 15 }); expect(c.float.C).toBe(3); expect(c.float.E).toBe(3); expect(c.ls.E).toBe(8);
  });
  it('two parallel jobs that need 5 of 8 crew run one after the other; the same jobs with 10 crew run together', () => {
    const jobs = [J('X', 3, [], 5), J('Y', 3, [], 5)];
    expect(schedule(jobs, ['X', 'Y'], { crew: 8, crane: 0 }).makespan).toBe(6);
    expect(schedule(jobs, ['X', 'Y'], { crew: 10, crane: 0 }).makespan).toBe(3);
  });
  it('the schedule never beats the critical path and never exceeds a limit', () => {
    const s = schedule(net.map((j) => ({ ...j, crew: 2 })), ['F', 'E', 'D', 'C', 'B', 'A'], { crew: 3, crane: 0 });
    expect(s.makespan).toBeGreaterThanOrEqual(15);
    for (let d = 0; d < s.makespan; d++) expect(net.filter((j) => s.start[j.id]! <= d && d < s.finish[j.id]!).length * 2).toBeLessThanOrEqual(4);
  });
});

describe('HAZOP node (effectiveness-NTU boiler)', () => {
  it('Tsat(6 bar) matches the steam table to 1 K; the nominal outlet is the closed form', () => {
    expect(Math.abs(tSat(6) - 431.99)).toBeLessThan(1);
    expect(callItTout()).toBeCloseTo(tSat(6) + (NODE.tIn - tSat(6)) * dmath.exp(-NODE.ntu0), 12);
  });
  it('cutting the feed water leaves the gas outlet where it was (gas side limits) but loses the drum: tube metal passes the limit', () => {
    const d = DEVS.find((x) => x.param === 'flow_bfw' && x.guide === 'no')!;
    expect(simOf('flow_bfw', 'no')!.tOut).toBeCloseTo(callItTout(), 9); expect(d.pt.bfw).toBe(0);
    expect(simOf('flow_bfw', 'no')!.tubeMetal).toBeGreaterThan(NODE.tTubeMax); expect(simOf('flow_bfw', 'no')!.cls).toBe('release');
    expect(simOf('flow_bfw', 'no')!.tUncoverMin).toBeGreaterThan(10);
  });
  it('the classes follow the numbers: gas low goes below the dew point (corrosion), high gas flow only overheats the absorber', () => {
    expect(simOf('flow_gas', 'less')!.dewMargin).toBeLessThan(0); expect(simOf('flow_gas', 'less')!.cls).toBe('corrosion');
    expect(simOf('flow_gas', 'more')!.tOut).toBeGreaterThan(NODE.tAbsMax); expect(simOf('flow_gas', 'more')!.cls).toBe('operability');
    expect(simOf('flow_gas', 'reverse')!.cls).toBe('equipment'); expect(simOf('composition', 'other')!.cls).toBe('corrosion');
  });
  it('8 serious deviations; the cheapest covering set of new safeguards is the level trip plus the gas bypass', () => {
    expect(SIGNIFICANT.length).toBe(8); expect(SIMS.length).toBe(DEVS.length);
    const m = minProposalUsd(); expect(m.set).toEqual(['lal', 'tic_bypass']); expect(m.usd).toBe(75000);
  });
  it('grading: a trip on gas temperature does not act on a dry drum', () => {
    const g = gradeRows([{ param: 'flow_bfw', guide: 'no', cause: 'bfw_pump_trip', cons: 'release', safe: 'tahh' }]);
    expect(g.wrongSafe).toBe(1); expect(g.wrongClass).toBe(0); expect(g.covered).toBe(1);
  });
});

describe('start-up SOP and permit state machines', () => {
  const REF = ['cool_on', 'flare_on', 'purge', 'circ_on', 'press_test', 'heat_slow', 'intro_h2', 'press_full'];
  it('the reference SOP is safe and ready; heating 350 K at 50 K/h is 420 min', () => {
    const r = runSop(REF); expect(r.safe).toBe(true); expect(r.ready).toBe(true); expect(r.blocked).toBe(0);
    expect(r.mins).toBe(10 + 5 + 40 + 10 + 30 + 420 + 480 + 20);
  });
  it('hydrogen before the purge explodes (halts); fast heating is thermal shock; no cooling refuses the circulator', () => {
    expect(runSop(['cool_on', 'circ_on', 'heat_fast', 'intro_h2']).worst).toBe('explosion');
    expect(runSop(['cool_on', 'circ_on', 'heat_fast']).events.some((e) => e.code === 'shock')).toBe(true);
    expect(runSop(['circ_on']).blocked).toBe(1);
    expect(runSop(['cool_on', 'flare_on', 'purge', 'circ_on', 'heat_slow', 'intro_h2']).events.some((e) => e.code === 'leak')).toBe(true);
    expect(runSop(['cool_on', 'flare_on', 'circ_on', 'press_test', 'heat_slow', 'intro_h2']).halted).toBe(true);
  });
  const PREF = ['close_in_1', 'close_in_2', 'close_out_1', 'bleed_in', 'depress', 'blind', 'drain', 'purge', 'gas_test', 'lock', 'open_up', 'clean', 'reinstate'];
  it('the reference permit is safe and complete; its loss is hours x rate', () => {
    const r = runPermit(PREF); expect(r.safe).toBe(true); expect(r.done).toBe(true); expect(r.mins).toBe(3 * 3 + 5 + 10 + 90 + 20 + 60 + 15 + 10 + 5 + 480 + 30);
    expect(r.lossUsd).toBeCloseTo((r.mins / 60) * 1800, 9);
  });
  it('the passing outlet valve defeats a double block and bleed; skipping the purge fails the gas test; opening early is a release', () => {
    const dbb = PREF.map((x) => (x === 'blind' ? 'close_out_2' : x)); dbb.splice(4, 0, 'bleed_out');
    expect(runPermit(dbb).events.some((e) => e.code === 'barrier')).toBe(true);
    expect(runPermit(PREF.filter((x) => x !== 'purge')).events.some((e) => e.code === 'gas')).toBe(true);
    expect(runPermit(['close_in_1', 'close_out_1', 'depress', 'drain', 'open_up']).halted).toBe(true);
    expect(runPermit(['depress']).events[0]!.code).toBe('live');
  });
});
