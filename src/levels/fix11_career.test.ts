// F11 (Career, round 6 tester d): ONE five-year score (operating margin) on every surface, a pace that is not poisoned by one-off investments, levers with numbers, last/due inspection and the
// two-month warning, +3 MONTHS stops, BOOK / ACCEPT exposure, heat recovery realised vs next level.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, careerOf, endingsView, outlookNote } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { ackWarning, answerDecision, pendingDecision, CHIEF_MARGIN, INSPECT_EVERY, MONTHS, advance, attention, decide, exposure, initCareer, outlook, pace, previewInvest, score, taShort } from '../sim/career/model';
import { carefulDecisions, cautiousDecisions, playCareer } from '../sim/career/policy';
import { humanCarefulDecisions, playCareerSteps } from '../sim/career/human';
import type { EqState } from '../state';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const card = (e: Env<EqState>): any => e.engine.q('resultCard');
function played(seed: number, until = MONTHS): Env<EqState> {
  const e = new Env(GAME), rng = new Rng(seed); e.reset({ seed, level: 'CAREER', mode: 'engineer' });
  const agent = CAREER.solver!(seed);
  for (let t = 0; t < 400 && e.state.status === 'playing' && careerOf(e.state)!.m < until; t++) { for (const a of agent(e.state, e.ctx(rng))) { e.step(a); if (e.state.status !== 'playing') break; } if (e.state.status === 'playing') e.step(TICK); }
  return e;
}

describe('one score everywhere: operating margin', () => {
  it('the ledger, the strip, the measures, the end-card equation and the histogram metric read the same figure', () => {
    const e = played(1003);
    const c = careerOf(e.state)!, v = view(e), rc = card(e);
    const op = score(c);
    expect(v.dashboard.opMarginTotalUSD).toBeCloseTo(op, 0);
    expect(v.dashboard.chiefMarginUSD).toBe(CHIEF_MARGIN);
    expect(rc.metrics.find((m: any) => m.key === 'margin').value).toBeCloseTo(op / 1e6, 6);
    expect(rc.equation).toMatch(/of operating margin$/);
    expect(rc.equation).toContain(String(Math.round(op / 1e6)));
    expect(c.ending).toBe('chief');
    expect(op).toBeGreaterThanOrEqual(CHIEF_MARGIN);
    expect(rc.histogram).not.toBeNull();
  });
  it('the flagship test is operating margin, not net: a run with op >= target and net < target (the tester\'s) is still the flagship if the sheet is clean', () => {
    const c = initCareer(1, 'engineer');
    c.total.margin = 84.4e6 - 0; c.total.inv = 59e6;   // operating 143.4, net 84.4
    c.years = [1, 2, 3, 4, 5].map((y) => ({ year: y, victor: 80, noor: 100, mara: 90 })) as never;
    expect(score(c)).toBeGreaterThanOrEqual(CHIEF_MARGIN);
    c.criticals = 0; c.strikes = 0;
    const o = outlook({ ...c, m: MONTHS - 1, hist: Array.from({ length: 12 }, () => ({ m: 0, margin: 2.4e6, cash: 0, gas: 6 })) } as never);
    expect(o.rows.find((r) => r.id === 'chief')!.needs.find((n) => n.key === 'margin')!.need).toBe(CHIEF_MARGIN);
  });
  it('the pace is operating margin: an investment made now does not lower it, and it is not a linear extrapolation of the net', () => {
    const a = initCareer(5, 'engineer'), b = initCareer(5, 'engineer');
    decide(b, 'invest', 'heat'); decide(b, 'invest', 'abate'); decide(b, 'invest', 'safety');
    for (let i = 0; i < 3; i++) { advance(a, 1); advance(b, 1); }
    const spent = (b.total.inv ?? 0);
    expect(spent).toBeGreaterThan(15e6);
    expect(Math.abs(score(a) - score(b))).toBeLessThan(5e6);   // the score does not feel the 17 MUSD
    expect(Math.abs(pace(a) - pace(b))).toBeLessThan(5e6 * 20); // nor does the pace
    const net3 = (b.total.margin * MONTHS) / b.m;
    expect(net3).toBeLessThan(pace(b) - 100e6);   // the naive linear net pace (the old figure) is far below
    expect(endingsView(b).rows.find((r) => r.id === 'chief')!.needs[0]!.text).toContain(String(Math.round(pace(b) / 1e6)));
  });
  it('the course line says "on this pace" and "operating margin", and the strip and the review quote the same pace', () => {
    const c = playCareer(2, carefulDecisions);
    for (const y of c.years) { const n = outlookNote(y.outlook!); expect(n.toLowerCase()).toContain('on this pace'); expect(n).toContain('operating margin'); expect(n).toContain(String(Math.round(y.outlook!.proj / 1e6))); }
  });
});

describe('what would move you: levers with numbers', () => {
  it('a Steady course names levers with numbers: the gap per year, a turnaround to book, a contract to sign', () => {
    const c = playCareer(3, cautiousDecisions);
    const withLevers = c.years.map((y) => y.outlook!).filter((o) => o.course === 'steady' && o.levers.length > 0);
    expect(withLevers.length).toBeGreaterThan(0);
    const txt = withLevers.map((o) => outlookNote(o)).join(' ');
    expect(txt).toMatch(/Levers: /);
    expect(txt).toMatch(/\+\d+(\.\d)? MUSD a year/);
    expect(txt).not.toMatch(/lv\.CAREER|\{|undefined|NaN/);
  });
  it('turnaround lever: the gain shown with its terms (output and gas less outage = +x MUSD/yr); contract lever: sign at y % over spot', () => {
    const c = initCareer(4, 'engineer');
    for (let i = 0; i < 8; i++) advance(c, 1);
    const o = outlook(c);
    const ta = o.levers.find((l) => l.key === 'turnaround');
    expect(ta, 'turnaround lever').toBeDefined();
    expect(Number(ta!.vars.gain)).toBeGreaterThan(0);
    const e = endingsView(c);
    expect(e.levers.join(' ')).toMatch(/turnaround for month \d+ \(catalyst \d+ %, exchanger U \d+ %\): \+[\d.]+ MUSD of output and gas back to new and [+-]?[\d.]+ MUSD of incidents avoided over twelve months, less [\d.]+ MUSD of outage, penalty and hire = \+[\d.]+ MUSD \(the same number as the BOOK line\)/);
    expect(Number(ta!.vars.gross) + Number(ta!.vars.incident) - Number(ta!.vars.cost)).toBeCloseTo(Number(ta!.vars.gain), 1);
    c.offers = [{ id: 99, p: 'acid', tpm: 4000, price: Math.round(c.prices.acid * 1.1), term: 12, pen: 100, exp: c.m + 1 }];
    const l2 = outlook(c).levers.find((l) => l.key === 'contract');
    expect(l2).toBeDefined(); expect(l2!.vars.prem).toBe(10);
  });
});

describe('plant cards, +3 MONTHS, BOOK and ACCEPT', () => {
  it('last inspected and due month on every card; the warning lights two months before due', () => {
    const e = played(1003, 9); let v = view(e);
    for (const p of v.plants) { expect(p.inspectionNote).toMatch(/due month 13|due month/); expect(p.inspectionWarn).toBe(false); }
    const c = careerOf(e.state)!; while (c.m < 10) advance(c, 1);
    v = view(e);
    for (const p of v.plants) { if (c.plants[p.id as 'nh3'].insp >= INSPECT_EVERY - 2) { expect(p.inspectionWarn).toBe(true); expect(p.inspectionNote).toMatch(/^DUE in/); } }
    expect(v.dashboard.attentionNotes.some((t: string) => /inspection due within/.test(t))).toBe(true);
  });
  it('+3 MONTHS stops after the month an inspection comes within two months of due, a catalyst wears under 70 % or an exchanger fouls under 75 %, and at the year end; one month always runs', () => {
    const c = initCareer(1, 'engineer');
    let stoppedEarly = 0;
    while (c.ending === '' && c.m < 36) { ackWarning(c); if (pendingDecision(c) !== null) answerDecision(c, 1); const n = advance(c, 3); expect(n).toBeGreaterThanOrEqual(1); if (n < 3 && c.m % 12 !== 0) { stoppedEarly++; expect(attention(c).length).toBeGreaterThan(0); } }
    expect(stoppedEarly).toBeGreaterThan(0);
    const d = initCareer(1, 'engineer'); while (d.m < 11) advance(d, 1); ackWarning(d); expect(advance(d, 3)).toBe(1);   // month 12: the annual review
    expect(d.years.length).toBe(1);
  });
  it('BOOK data: the shortfall a turnaround leaves against the running contracts, per month, with its penalty', () => {
    const c = initCareer(6, 'engineer');
    c.contracts.push({ id: 900, p: 'acid', tpm: 40000, price: 130, left: 20, pen: 200 });
    c.plants.acid.stock = 1;
    const s = taShort(c, 'acid', 5), none = taShort(c, 'acid', 30);
    expect(s.shortT).toBeGreaterThan(0); expect(s.penaltyUSD).toBeGreaterThan(0);
    expect(none.shortT).toBe(0);   // the contract has expired by then
    const e = new Env(GAME); e.reset({ seed: 1003, level: 'CAREER', mode: 'engineer' });
    const v = view(e);
    for (const p of v.plants) { expect(p.taShort.length).toBe(MONTHS); expect(p.taShortNote.length).toBe(MONTHS); }
  });
  it('ACCEPT data: capacity exposure on every offer; over capacity says tonnes short and the penalty', () => {
    const c = initCareer(1003, 'engineer');
    const o = c.offers[0]!;
    const ok = exposure(c, o.p, 100, o.pen), over = exposure(c, o.p, 1e6, o.pen);
    expect(ok.shortT).toBe(0); expect(over.shortT).toBeGreaterThan(0); expect(over.penaltyUSD).toBeGreaterThan(0);
    const e = new Env(GAME); e.reset({ seed: 1003, level: 'CAREER', mode: 'engineer' });
    for (const x of view(e).offers) { expect(x.exposureNote).toMatch(/^Capacity: this plant makes about/); expect(x.exposureNote).not.toMatch(/\{/); }
  });
  it('heat recovery after purchase: realised saving and the next level\'s saving are separate', () => {
    const c = initCareer(1003, 'engineer');
    expect(previewInvest(c, 'heat').realisedUSDPerMonth).toBe(0);
    decide(c, 'invest', 'heat');
    const pv = previewInvest(c, 'heat');
    expect(pv.realisedUSDPerMonth).toBeGreaterThan(0); expect(pv.saveUSDPerMonth).toBeGreaterThan(0);
    const e = new Env(GAME); e.reset({ seed: 1003, level: 'CAREER', mode: 'engineer' }); e.step({ name: 'levelAct', args: ['invest', 'heat'] });
    const h = view(e).options.invest.heat;
    expect(h.realised).toMatch(/^Level 1 is saving about/); expect(h.preview).toMatch(/^Next level: saves about/);
    expect(h.realised).not.toBe(h.preview);
  });
});

describe('human careful reaches the flagship (the reconciled policy test)', () => {
  it('+3 month steps, card defaults, following the warnings: flagship on at least five of six seeds', () => {
    const r = [1, 2, 3, 4, 5, 6].map((s) => playCareerSteps(s, humanCarefulDecisions, 3).ending);
    expect(r.filter((x) => x === 'chief').length).toBeGreaterThanOrEqual(5);
  });
});
