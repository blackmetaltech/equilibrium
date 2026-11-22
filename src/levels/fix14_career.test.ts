// F14 (Career, round 7): NEXT DECISION skips the months with nothing to decide and stops at what needs the player; one yearly decision with a real trade-off (contract, turnaround, debottleneck, hedge),
// every number from the engine, blocks the skip keys until answered; the skip player finishes in few presses and at least Steady.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, careerOf, decisionView } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { MONTHS, CareerError, foreOpen, ackWarning, advance, advanceToDecision, answerDecision, decide, initCareer, pendingDecision, score, DEC_KINDS, type Career } from '../sim/career/model';
import { humanCarefulDecisions } from '../sim/career/human';
import { carefulDecisions, type Decision } from '../sim/career/policy';
import type { EqState } from '../state';
import { en } from '../locales/en';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const L = en as Record<string, string>;
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const act = (e: Env<EqState>, name: string, ...args: unknown[]): void => { e.step({ name: 'levelAct', args: [name, ...args] } as any); };
const SEEDS = [1, 2, 3, 4, 5, 6];
const run = (c: Career, ds: Decision[]): void => { for (const d of ds) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } } };

/** The scripted skip player: only NEXT DECISION; answers the yearly decision with the careful choice; at a stop does the obvious (the human careful habits) and acknowledges the warning. */
export function skipCareer(seed: number): { c: Career; presses: number; whys: string[] } {
  const c = initCareer(seed, 'engineer'), whys: string[] = [];
  let presses = 0;
  while (c.ending === '' && presses < 200) {
    run(c, humanCarefulDecisions(c));
    if ((c.stopped ?? []).length > 0 || foreOpen(c)) ackWarning(c);
    advanceToDecision(c); presses++; whys.push(c.why!.kind);
  }
  return { c, presses, whys };
}

describe('NEXT DECISION (skip to the next thing that needs you)', () => {
  it('the scripted skip player finishes 60 months in at most 30 presses plus one per forewarning (F31), ends at least Steady, on every seed', () => {
    for (const seed of SEEDS) {
      const { c, presses, whys } = skipCareer(seed);
      expect(c.m, `seed ${seed}`).toBe(MONTHS);
      const fores = whys.filter((w) => w === 'fore').length;   // F31: the supplier's heads-up is a stop of its own, one per incident; every other stop stays inside the old limit of 30
      expect(presses - fores, `seed ${seed} presses`).toBeLessThanOrEqual(30);
      expect(['steady', 'chief'], `seed ${seed} ${c.ending}`).toContain(c.ending);
    }
  });
  it('every year contains at least one yearly decision, and each was answered by the skip player', () => {
    for (const seed of SEEDS) {
      const { c } = skipCareer(seed), ds = c.decisions ?? [];
      expect(ds.map((d) => d.year), `seed ${seed}`).toEqual([1, 2, 3, 4, 5]);
      for (const d of ds) { expect(d.choice, `seed ${seed} y${d.year}`).toBeGreaterThanOrEqual(0); expect(d.lapsed).toBe(false); expect(d.m).toBe((d.year - 1) * 12); }
      expect(new Set(ds.map((d) => d.kind)).size, `seed ${seed} variety`).toBeGreaterThanOrEqual(3);
    }
  });
  it('it never runs more than 12 months, always stops at a year end, and says why every time', () => {
    const c = initCareer(2, 'engineer');
    for (let g = 0; g < 40 && c.ending === ''; g++) {
      run(c, humanCarefulDecisions(c)); if ((c.stopped ?? []).length > 0 || foreOpen(c)) ackWarning(c);
      const m0 = c.m, n = advanceToDecision(c);
      expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(12); expect(c.m).toBe(m0 + n);
      if (Math.floor(m0 / 12) !== Math.floor(c.m / 12)) expect(c.m % 12).toBe(0);
      expect(c.why).not.toBeNull();
    }
  });
  it('it stops at every warning the +3 rule stops at (a fresh attention flag) and at an incident, never past one', () => {
    for (const seed of SEEDS) {
      const c = initCareer(seed, 'engineer');
      while (c.ending === '') {
        run(c, humanCarefulDecisions(c)); if ((c.stopped ?? []).length > 0 || foreOpen(c)) ackWarning(c);
        const before = new Set(c.plants.nh3 ? [] : []); void before;
        const flags0 = new Set<string>(); for (const p of ['nh3', 'acid', 'meoh', 'etoh'] as const) { const x = c.plants[p]; if (x.insp >= 10) flags0.add(`insp:${p}`); if (x.cat < 0.7) flags0.add(`cat:${p}`); if (x.U < 0.75) flags0.add(`foul:${p}`); }
        const m0 = c.m, n = advanceToDecision(c);
        if (n < 12 && c.m % 12 !== 0 && c.ending === '') expect(['insp', 'cat', 'foul', 'overdue', 'offer', 'gas', 'price', 'incident', 'critical', 'em', 'end', 'inc', 'fore'], `seed ${seed} m${m0}`).toContain(c.why!.kind);
        if (['insp', 'cat', 'foul'].includes(c.why!.kind)) expect((c.stopped ?? []).length).toBeGreaterThan(0);
      }
    }
  });
  it('is refused while a decision is pending or a warning is unacknowledged; one month still runs and lets the decision lapse', () => {
    const c = initCareer(1, 'engineer');
    expect(pendingDecision(c)).not.toBeNull();
    expect(() => advanceToDecision(c)).toThrow(CareerError); expect(() => advance(c, 3)).toThrow(CareerError);
    expect(c.m).toBe(0);
    advance(c, 1); expect(pendingDecision(c)).toBeNull(); expect(c.decisions![0]!.lapsed).toBe(true); expect(c.decisions![0]!.choice).toBe(1);
    expect(() => advanceToDecision(c)).not.toThrow();
  });
  it('a lapsed month does not start a second decision in the same year; answering twice is refused', () => {
    const c = initCareer(3, 'engineer');
    answerDecision(c, 1); expect(() => answerDecision(c, 0)).toThrow(CareerError);
    advanceToDecision(c); expect((c.decisions ?? []).length).toBe(1);
  });
});

describe('the yearly decision', () => {
  it('is deterministic from the seed, and all four kinds come up across the years of a career', () => {
    const a = initCareer(4, 'engineer'), b = initCareer(4, 'engineer');
    expect(JSON.stringify(a.decisions)).toBe(JSON.stringify(b.decisions));
    const kinds = new Set<string>();
    for (const seed of SEEDS) for (const d of skipCareer(seed).c.decisions!) kinds.add(d.kind);
    expect([...kinds].sort()).toEqual([...DEC_KINDS].sort());
  });
  it('each decision has two options; the careful pick is the one with the better expected MUSD; option B is the status quo at zero', () => {
    for (const seed of SEEDS) for (const d of skipCareer(seed).c.decisions!) {
      expect(d.options).toHaveLength(2); expect(d.options[1]!.effectUSD).toBe(0); expect(Number.isFinite(d.options[0]!.effectUSD)).toBe(true);
      expect(d.best).toBe(d.options[0]!.effectUSD - d.options[1]!.effectUSD > 3e5 ? 0 : 1);
    }
  });
  it('the choice changes the outcome measurably: the same career with A and with B ends at a different cash for every kind', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const base = initCareer(seed, 'engineer'); const d0 = base.decisions![0]!;
      const a = initCareer(seed, 'engineer'), b = initCareer(seed, 'engineer');
      answerDecision(a, 0); answerDecision(b, 1);
      let n = 0; while (a.m < 12 && n++ < 40) { run(a, humanCarefulDecisions(a)); run(b, humanCarefulDecisions(b)); advance(a, 1); advance(b, 1); }
      if (d0.kind === 'catgrade') expect(a.eco?.[d0.plant as 'nh3'], `seed ${seed} ${d0.kind}`).toBe(true);   // the grade pays out at the next catalyst charge, not within the year
      else expect(Math.abs(a.cash - b.cash), `seed ${seed} ${d0.kind}`).toBeGreaterThan(1e5);
      seen.add(d0.kind);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
  it('the careful policies still answer sensibly: careful and the human reach the flagship with the decisions, and a lapsed career does worse in total', () => {
    let withD = 0, without = 0;
    for (const seed of SEEDS) {
      const a = initCareer(seed, 'engineer'), b = initCareer(seed, 'engineer');
      while (a.ending === '') { run(a, carefulDecisions(a)); advance(a, 1); }
      while (b.ending === '') { run(b, carefulDecisions(b).filter((d) => d[0] !== 'answer')); advance(b, 1); }
      withD += score(a); without += score(b);
    }
    expect(withD).toBeGreaterThan(without);
  });
});

describe('the board view', () => {
  it('the first view carries the pending card (two options with MUSD), the NEXT DECISION note, and no raw string keys', () => {
    const e = start(1), d = view(e).dashboard;
    expect(d.decision.pending).toBe(true); expect(d.decision.options).toHaveLength(2);
    for (const o of d.decision.options) { expect(o.effectText).toMatch(/MUSD/); expect(o.text.length).toBeGreaterThan(20); expect(o.text).not.toMatch(/\{|lv\.CAREER/); }
    expect(d.decision.title).not.toMatch(/lv\.CAREER/); expect(d.decision.body).not.toMatch(/\{|lv\.CAREER/); expect(d.decision.hint).not.toMatch(/\{|lv\.CAREER/);
    expect(d.nextNote).toContain('waiting');
  });
  it('answering through the level action records the chosen state, unlocks the key, and the stop says why', () => {
    const e = start(1);
    act(e, 'answer', 0);
    let d = view(e).dashboard;
    expect(d.decision.pending).toBe(false); expect(d.decision.options[0].chosen).toBe(true); expect(d.nextNote).toContain('NEXT DECISION runs up to 12 months');
    act(e, 'ackWarning'); act(e, 'advanceToDecision'); d = view(e).dashboard;   // F31: a heads-up lit at the start is acknowledged first
    expect(d.month).toBeGreaterThan(0); expect(d.whyNote).toMatch(/^Stopped:/);
    expect(Object.keys(L).filter((k) => k.startsWith('lv.CAREER.why.')).length).toBeGreaterThanOrEqual(10);
  });
  it('every decision card in a whole career renders without raw keys or unfilled holes', () => {
    for (const seed of SEEDS) { const c = skipCareer(seed).c; for (const d of c.decisions!) { const v = decisionView(c, d) as any; for (const s of [v.title, v.body, v.hint, ...v.options.map((o: any) => o.text)]) expect(String(s), `${seed} ${d.kind}`).not.toMatch(/\{|lv\.CAREER|undefined|NaN/); } }
  });
});
