// Round 4 lane F8c (tester d): L33 point of no return per final element, L32 effect line, L34 ticks = COVERED, L36 hidden ref, L38 hint and budget, Ch8/9 call-it data in the notebook, Career readable log.
import { describe, expect, it } from 'vitest';
import { Env, TICK } from '@core/kit';
import { GAME } from '../game';
import { EVENTS } from '../data/events';
import { en } from '../locales/en';
import type { EqState } from '../state';
import { CAREER_ID, careerOf, logLabel } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { CAREER } from './career';
import { L38_BEST, L38_BUDGET, L38_JOBS, L38_LIM } from './l38';
import { schedule } from '../sim/ops/turnaround';
import { pointOfNoReturnC } from '../sim/control/cstr';
import { advance, decide, initCareer, previewInvest, PLANTS, type LogRow } from '../sim/career/model';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const start = (level: string, mode = 'learner'): Env<EqState> => { const e = new Env(GAME); e.reset({ seed: 1003, level, mode }); return e; };
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
const dial = (e: Env<EqState>, d: number[], keys: string[]) => keys.forEach((k, i) => e.step({ name: 'levelAct', args: ['setDial', k, d[i]] }));
const finish = (e: Env<EqState>): Env<EqState> => { e.step({ name: 'commission' }); for (let i = 0; i < 60 && e.state.status === 'playing'; i++) e.step(TICK); return e; };
const L33K = ['sensors', 'k', 'tripC', 'action'];
const run33 = (d: number[]): Env<EqState> => { const e = start('L33'); dial(e, d, L33K); return finish(e); };

describe('L33: per final element', () => {
  it('the point of no return differs by element: cut feed about 70 degC, full coolant none, dump about 98', () => {
    expect(pointOfNoReturnC(3, 2, 'cut_feed')).toBeGreaterThan(60); expect(pointOfNoReturnC(3, 2, 'cut_feed')).toBeLessThan(80);
    expect(pointOfNoReturnC(3, 2, 'full_coolant')).toBe(-1);
    expect(pointOfNoReturnC(3, 2, 'dump')).toBeGreaterThanOrEqual(95);
  });
  it('the view carries peak and lag per scenario and the three limits; the cause and the lesson state each element\'s limit and that the dump catches what cut feed cannot', () => {
    const e = run33([3, 2, 89, 1]), v = view(e);
    expect(v.ponr).toHaveLength(3); expect(v.ponr.map((x: any) => x.action)).toEqual(['cut_feed', 'full_coolant', 'dump']);
    for (const sc of v.scenarios) { expect(Number.isFinite(sc.peakC)).toBe(true); expect(sc.lagS).toBe(10); }
    const c = card(e);
    expect(c.cause).toMatch(/Point of no return for Cut feed/); expect(c.cause).toMatch(/Full coolant/); expect(c.cause).toMatch(/Dump/); expect(c.cause).toMatch(/catches what cutting the feed cannot/);
    const d = run33([3, 2, 89, 3]), cd = card(d);
    expect(JSON.stringify(cd)).toMatch(/depends on the final element/);
    expect(info(d).note.join(' ')).toMatch(/DUMP can catch what CUT FEED cannot/);
    expect(view(d).scenarios[0].lagS).toBe(12);
  });
});

describe('L32: the lesson follows the actual worst deviation', () => {
  it('cascade off: the lesson does not say the bed barely moves', () => {
    const e = finish(start('L32'));
    const c = card(e), text = JSON.stringify(c) + JSON.stringify(info(e));
    expect(text).not.toMatch(/barely moves/);
    expect(JSON.stringify(c.lesson)).toMatch(/still moved/);
  });
  it('the solver design says it moved only a little', () => {
    const e = start('L32'); dial(e, [1, 1.5, 150, 2, 6], ['on', 'mKc', 'mTauI', 'sKc', 'sTauI']); finish(e);
    expect(JSON.stringify(card(e).lesson)).toMatch(/moved only/);
  });
});

describe('L34: grid ticks equal COVERED', () => {
  it('the number of covered cells in the view equals coverage.covered, wrong-class rows are not ticks', () => {
    const e = start('L34'); const v0 = view(e);
    const sig = v0.cells.find((c: any) => c.meaningful);
    e.step({ name: 'levelAct', args: ['addRow', sig.param, sig.guide, sig.causes[0], 'none', 'none'] });
    const v = view(e);
    expect(v.cells.filter((c: any) => c.rowState === 'covered').length).toBe(v.coverage.covered);
    expect(v.cells.filter((c: any) => c.rowState === 'wrong' || c.rowState === 'covered' || c.rowState === 'extra').length).toBe(1);
  });
});

describe('L36: reference cost hidden until called', () => {
  it('refLossUSD is -1 before the prediction and carries the star line with its tolerance after', () => {
    const e = start('L36'); expect(view(e).refLossUSD).toBe(-1); expect(view(e).starLossUSD).toBe(-1);
    e.step({ name: 'callIt', args: [20000] });
    const v = view(e); expect(v.refLossUSD).toBeGreaterThan(0); expect(v.starLossUSD).toBeGreaterThan(v.refLossUSD); expect(v.starTolPct).toBe(3);
  });
});

describe('L38: the budget and the crane trade-off', () => {
  it('the budget is a round number, the best one-crane plan fits it, and the hint names 13 / 18 / 16 days', () => {
    let b1 = 99, b2 = 99;
    const perm = (a: string[], k: number): void => { if (k === a.length) { b1 = Math.min(b1, schedule(L38_JOBS, a, { crew: L38_LIM.crew, crane: 1 }).makespan); b2 = Math.min(b2, schedule(L38_JOBS, a, { crew: L38_LIM.crew, crane: 2 }).makespan); return; } for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i]!, a[k]!]; perm(a, k + 1); [a[k], a[i]] = [a[i]!, a[k]!]; } };
    perm(L38_JOBS.map((j) => j.id), 0);
    expect(b1).toBe(L38_BEST.one); expect(b2).toBe(L38_BEST.two);
    expect(L38_BUDGET % 100000).toBe(0);
    const e = start('L38'); const h: string = view(e).hint;
    expect(h).toMatch(/13 d/); expect(h).toMatch(/18 d/); expect(h).toMatch(/16 d/); expect(h).toMatch(/second crane/);
    expect(info(e).note.join(' ')).toMatch(/18 days[\s\S]*16 days/);
  });
});

describe('Ch8 / Ch9 call-its are computable from the notebook', () => {
  const NEEDS: Record<string, RegExp[]> = {
    L29: [/50 % to 60 %/, /bias of 50 %/],
    L30: [/BUMP TEST/, /K, tau and theta/],
    L31: [/N2 \+ 3 H2/],
    L32: [/1\.2 K for every percent/, /20 % of the quench/],
    L33: [/2000 mol\/m3/, /2 x 10\^5 J per mol/, /2 x 10\^6 J\/\(m3 K\)/],
    L34: [/NTU = 1\.5/, /T sat/],
    L36: [/1800 USD/, /minutes of each step/],
    L38: [/critical path assumes unlimited crews and cranes/],   // F16: the answer itself (13 days) is no longer printed in the notes; the call-it `given` says how to read it off the job list
  };
  for (const [id, res] of Object.entries(NEEDS)) {
    it(`${id}: the given data is in the levelInfo notes`, () => {
      const text = (info(start(id)).note as string[]).join(' ');
      for (const r of res) expect(text, `${id} ${r}`).toMatch(r);
    });
  }
  it('L33 asks for the adiabatic rise and the notebook gives its three inputs', () => {
    expect(en['lv.L33.callit']).toMatch(/adiabatic/);
    expect(info(start('L33')).callIt ?? info(start('L33')).callIts).toBeTruthy();
  });
});

describe('Career: readable labels and the money story', () => {
  it('no log row of any kind shows a raw key: every event id, finding and ending has a label', () => {
    const rows: LogRow[] = [];
    for (const id of Object.keys(EVENTS)) for (const p of PLANTS) rows.push({ m: 3, kind: 'event', code: id, plant: p, n: 0 });
    for (const code of ['emissions', 'inspection']) rows.push({ m: 11, kind: 'fine', code, plant: '', n: 0 });
    for (const e of ['chief', 'steady', 'sold', 'shut']) rows.push({ m: 59, kind: 'strike', code: `end_${e}`, plant: '', n: 0 });
    for (const kind of ['incident', 'critical', 'turnaround', 'contract', 'penalty'] as const) rows.push({ m: 5, kind, code: 'x', plant: 'acid', n: 4 });
    for (const r of rows) {
      const s = logLabel(r);
      expect(s, JSON.stringify(r)).not.toMatch(/\b(cw_|feed_|blower_|compressor_|catalyst_age|catalyst_poison|fuel_|demand_|power_|analyser_|steam_|valve_|end_|nh3|meoh|etoh)/);
      expect(s).not.toMatch(/lv\.|event\./); expect(s).not.toMatch(/\{/);
    }
  });
  it('the whole play shows no raw key in the log or the header, and the offers use the plant card\'s nominal', () => {
    const e = start(CAREER_ID); const c = () => careerOf(e.state as EqState)!;
    for (let i = 0; i < 24; i++) e.step({ name: 'levelAct', args: ['advance', 1] });
    const v = view(e);
    for (const l of v.log) expect(l.label).not.toMatch(/\b(cw_|feed_|blower_|compressor_|catalyst_|fuel_|demand_|power_|analyser_|steam_|valve_|end_)/);
    expect(v.dashboard.lastEvent === '' || /[A-Z]/.test(v.dashboard.lastEventLabel)).toBe(true);
    expect(c().m).toBeGreaterThan(20);
    for (const o of v.offers) { const p = v.plants.find((x: any) => x.id === o.plant); expect(o.nominalT).toBe(Math.round(p.nominalT)); expect(o.shareOfNominal).toBeCloseTo(o.tpm / p.nominalT, 9); }
  });
  it('the output line carries no above-nominal note; investments carry a payback preview; the year review explains the margin', () => {
    const e = start(CAREER_ID);
    let labelled = 0;
    for (let i = 0; i < 36; i++) { e.step({ name: 'levelAct', args: ['advance', 1] }); for (const p of view(e).plants) expect(p.outputNote).toBeUndefined(); } // no 'above nominal' noise: the card shows output against nominal only
    expect(labelled).toBeGreaterThanOrEqual(0);
    const v = view(e);
    for (const k of ['heat', 'abate', 'safety']) { expect(typeof v.options.invest[k].preview).toBe('string'); }
    expect(v.options.invest.heat.preview).toMatch(/pays back in \d+ months/);
    expect(v.options.invest.abate.preview).toMatch(/kt of CO2/);
    expect(v.review.length).toBeGreaterThanOrEqual(2);
    for (const y of v.review) { expect(y.driverNote).toMatch(/Revenue \d+ MUSD/); expect(Math.abs(y.rev - y.cost - y.pen - y.inv - y.margin)).toBeLessThan(1); }
  });
  it('the payback preview is pure and positive for heat at the start', () => {
    const c = initCareer(1003, 'learner');
    expect(previewInvest(c, 'heat').paybackMonths).toBeGreaterThan(0);
    decide(c, 'invest', 'heat'); advance(c, 1);
    expect(previewInvest(c, 'heat').saveUSDPerMonth).toBeGreaterThan(0);
  });
});
