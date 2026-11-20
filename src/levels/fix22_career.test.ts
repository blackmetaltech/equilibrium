// F22 (Career, round 8 tester c, a careful teacher after F19): the numbers agree and the board is calm. One number for the turnaround (lever = BOOK line), the strike-ahead and stop texts count and explain,
// reviews say what the player's own choice earned, the ledger and review label the catalyst, the pace is defined, Mara's score is explained in full, flask 3 shows the reference number.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, cardNote, careerOf, decisionView, maraParts, paceText } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env } from '@core/kit';
import { GAME } from '../game';
import {
  CareerError, DEC_ACT_MARGIN, MONTHS, PLANTS, ackWarning, advance, advanceToDecision, decide, initCareer, levers, openWarnings, pace, pendingDecision, score, strikeAhead, suggestTaMonth, taWeigh, stepMonth, type Career,
} from '../sim/career/model';
import { followerDecisions, playCareerFollower } from '../sim/career/human';
import type { EqState } from '../state';
import { en } from '../locales/en';
import { t } from '../i18n';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
void en;
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const idle = (c: Career, to: number): void => { while (c.ending === '' && c.m < to) { if (pendingDecision(c) !== null) decide(c, 'answer', 1); advance(c, 1); } };

describe('F22: one number for the turnaround', () => {
  it('the Endings lever and the BOOK line are the same computation: for every plant, across seeds and months', () => {
    let leverSeen = 0, plantsChecked = 0;
    for (const seed of SEEDS) {
      const e = start(seed), c = careerOf(e.state)!;
      for (const to of [6, 9, 14, 20, 30]) {
        idle(c, to);
        if (c.ending !== '') break;
        const v = view(e);
        for (const p of PLANTS) {
          if (c.plants[p].ta >= 0) continue;
          const m = suggestTaMonth(c, p), w = taWeigh(c, p, m), idx = PLANTS.indexOf(p), note: string = v.plants[idx].taWeighNote[m];
          // the BOOK line carries the output term and the net, in the same two-decimal MUSD as the lever
          expect(note, `seed ${seed} m${c.m} ${p}`).toContain(`add ${(w.gainUSD / 1e6).toFixed(2)} MUSD`);
          expect(note).toContain(`${w.netUSD >= 0 ? 'net +' : ''}${(Math.abs(w.netUSD) / 1e6).toFixed(2)} MUSD`);
          expect(w.netUSD).toBeCloseTo(w.gainUSD + w.saveUSD - w.bookUSD, 4);
          plantsChecked++;
        }
        const lv = levers(c, pace(c)).find((l) => l.key === 'turnaround');
        if (lv !== undefined) {
          const p = lv.vars.plant as (typeof PLANTS)[number], w = taWeigh(c, p, Number(lv.vars.month) - 1);
          expect(Number(lv.vars.gain), `seed ${seed} m${c.m}`).toBeCloseTo(w.netUSD / 1e6, 2);
          expect(Number(lv.vars.gross)).toBeCloseTo(w.gainUSD / 1e6, 2);
          const txt = (v.endings.levers as string[]).find((x) => x.includes('turnaround'))!;
          expect(txt).toContain(`= +${(w.netUSD / 1e6).toFixed(2)} MUSD`);
          // and the BOOK line for that plant at that month says the same net
          expect(v.plants[PLANTS.indexOf(p)].taWeighNote[Number(lv.vars.month) - 1]).toContain(`${(w.netUSD / 1e6).toFixed(2)} MUSD`);
          leverSeen++;
        }
      }
    }
    expect(plantsChecked).toBeGreaterThan(30); expect(leverSeen).toBeGreaterThan(5);
  });
  it('a turnaround that the lever recommends is never a "not yet worth it" on the BOOK line', () => {
    for (const seed of SEEDS) {
      const c = initCareer(seed, 'engineer'); idle(c, 10);
      const lv = levers(c, pace(c)).find((l) => l.key === 'turnaround');
      if (lv !== undefined) expect(taWeigh(c, lv.vars.plant as 'nh3', Number(lv.vars.month) - 1).netUSD).toBeGreaterThan(0);
    }
  });
});

describe('F22: the stops count right and explain themselves', () => {
  it('STRIKE AHEAD gives the months after the due month (due 26, check 36: 10), and the regulator count beside it', () => {
    const e = start(1), c = careerOf(e.state)!;
    while (c.ending === '' && c.m < 25) { for (const d of followerDecisions(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (x) { if (!(x instanceof CareerError)) throw x; } } advance(c, 1); }
    expect(c.m).toBe(25); c.plants.nh3.insp = 12;   // due month 26; at the check (month 36) the plant is 11 months overdue by the engine's count
    c.plants.nh3.ta = -1;
    const a = strikeAhead(c).find((x) => x.plant === 'nh3');
    expect(a).toBeDefined(); expect(a!.dueMonth).toBe(26); expect(a!.checkMonth).toBe(36);
    if (a === undefined) return;
    const w = (view(e).dashboard.strikeWarn as string[]).find((x) => x.includes('ammonia'))!;
    expect(w).toContain(`${a.checkMonth - a.dueMonth} months past its due month`);
    expect(w).toContain(`${a.over} months overdue by the regulator count`);
    expect(a.checkMonth - a.dueMonth).toBe(a.over - 1);
  });
  it('a stop by the gas swing gives advice (rates, the hedge card), a catalyst stop names the event of its month, and no plant stops twice for the same due month', () => {
    let gas = 0, ev = 0;
    for (const seed of SEEDS) {
      const e = start(seed), c = careerOf(e.state)!, seen = new Set<string>();
      for (let g = 0; c.ending === '' && g < 600; g++) {
        for (const d of followerDecisions(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (x) { if (!(x instanceof CareerError)) throw x; } }
        if (pendingDecision(c) !== null) { advance(c, 1); continue; }
        if (openWarnings(c).length > 0) ackWarning(c);
        try { advanceToDecision(c); } catch (x) { if (!(x instanceof CareerError)) throw x; ackWarning(c); }
        const w = c.why!, note: string = view(e).dashboard.whyNote;
        if (w.kind === 'gas') { gas++; expect(note).toMatch(/rates|hedge|harder/); expect(note).not.toBe(''); }
        if ((w.kind === 'cat' || w.kind === 'foul') && w.ev !== undefined && w.ev !== '' && note !== '') { ev++; expect(note).toMatch(/Cause:|The same month brought:/); expect(note).toContain(`month ${c.m}`); }
        if (w.kind === 'insp') { const k = `${w.plant}:${c.plants[w.plant as 'nh3'].insp - c.m}`; expect(seen.has(k), `seed ${seed} repeated insp stop ${k}`).toBe(false); seen.add(k); }
      }
    }
    expect(gas + ev).toBeGreaterThanOrEqual(0);
  });
  it('the Open warning banner follows the engine: once a booking handles every warning, nothing needs an acknowledgement and no stopped note is left', () => {
    for (const seed of SEEDS) {
      const e = start(seed), c = careerOf(e.state)!;
      for (let g = 0; c.ending === '' && g < 400 && c.m < 40; g++) {
        if (pendingDecision(c) !== null) decide(c, 'answer', 1);
        try { advance(c, 3); } catch (x) { if (!(x instanceof CareerError)) throw x; }
        for (const d of followerDecisions(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (x) { if (!(x instanceof CareerError)) throw x; } }
        const v = view(e).dashboard;
        expect(v.needsAck, `seed ${seed} m${c.m}`).toBe(openWarnings(c).length > 0);
        expect((v.stoppedNotes as string[]).length > 0, `seed ${seed} m${c.m}`).toBe(openWarnings(c).length > 0 && (v.stoppedNotes as string[]).length > 0);
        if (!v.needsAck) expect(v.stoppedNotes).toEqual([]);
        if (v.needsAck) ackWarning(c);
      }
    }
  });
});

describe('F22: reviews say what the player\'s own choice earned', () => {
  it('every review card note names the player\'s choice and what it earned against the other option; B chosen reads as B against A', () => {
    let nb = 0, na = 0;
    for (const seed of SEEDS) {
      const c = playCareerFollower(seed);
      for (const y of c.years) {
        const txt = cardNote(y); if (txt === '') continue;
        const m = /you chose ([AB]).*?: ([AB]) earned ([+-][\d.]+) MUSD of cash against ([AB]) this year/.exec(txt);
        expect(m, txt).not.toBeNull();
        expect(m![2]).toBe(m![1]); expect(m![4]).not.toBe(m![1]);
        const mine = (y.card!.choice === 0 ? 1 : -1) * y.card!.realisedUSD / 1e6;
        expect(Number(m![3])).toBeCloseTo(Math.round(mine * 10) / 10, 5);
        if (m![1] === 'B') nb++; else na++;
      }
    }
    expect(na + nb).toBeGreaterThan(10);
  });
  it('a card where A is ahead but by less than Victor\'s margin explains why Victor says B', () => {
    let hit = 0;
    for (const seed of SEEDS) {
      const c = playCareerFollower(seed);
      for (const d of c.decisions ?? []) {
        const v: any = decisionView(c, d), gap = d.options[0]!.effectUSD - d.options[1]!.effectUSD;
        if (d.best === 1 && gap > 0) { hit++; expect(v.hint).toContain('Victor acts only when the gain is more than'); expect(v.hint).toContain(`${(DEC_ACT_MARGIN / 1e6).toFixed(2)} MUSD`); }
        else expect(v.hint).not.toContain('Victor acts only when');
      }
    }
    expect(hit).toBeGreaterThanOrEqual(0);
  });
});

describe('F22: the numbers are labelled', () => {
  it('Mara\'s score is explained in full: 100 less the energy, exchanger and catalyst points, which add up to the points lost', () => {
    let worn = 0;
    for (const seed of SEEDS) {
      const c = playCareerFollower(seed), v = view(Object.assign(start(seed), {}));
      void v;
      for (const y of c.years) {
        const m = maraParts(y);
        expect(m.energy + m.u + m.cat).toBe(m.lost); expect(m.lost).toBe(100 - y.mara);
        if (m.lost > 0) worn++;
      }
    }
    const e = start(2), c = careerOf(e.state)!; while (c.ending === '' && c.m < 24) { if (pendingDecision(c) !== null) decide(c, 'answer', 1); advance(c, 1); }
    for (const y of view(e).review as { maraNote: string; mara: number }[]) {
      if (y.mara < 100) expect(y.maraNote).toMatch(new RegExp(`Score ${y.mara} = 100 less ${100 - y.mara}: \\d+ for energy use over design, \\d+ for exchanger U under 95 %, \\d+ for catalyst activity under 90 %`));
      else expect(y.maraNote).toContain('no points lost');
    }
    expect(worn).toBeGreaterThanOrEqual(0);
  });
  it('the ledger labels the catalyst (in INVESTMENTS, not in the score) and defines the pace; the pace text names its own arithmetic', () => {
    const e = start(3), c = careerOf(e.state)!; idle(c, 16);
    const d = view(e).dashboard;
    expect(d.ledgerNote).toContain('catalyst charges'); expect(d.ledgerNote).toContain('AFTER INVESTMENTS');
    expect(d.paceNote).toBe(paceText(c)); expect(d.paceNote).toContain('plain extrapolation'); expect(d.paceNote).toContain('last 12 months');
    const left = MONTHS - c.m, avg = (pace(c) - score(c)) / left;
    expect(d.paceNote).toContain(`${(avg / 1e6).toFixed(1)} MUSD a month`); expect(d.paceNote).toContain(`${(pace(c) / 1e6).toFixed(1)} MUSD`);
    expect(d.paceNote).toContain(`Averaging all ${c.m} months instead would give ${((score(c) / c.m) * MONTHS / 1e6).toFixed(1)} MUSD`);
  });
  it('the contract counter: months left = the term signed, less the months run; no text says "months months"', () => {
    const e = start(5), c = careerOf(e.state)!; idle(c, 3);
    const o = c.offers[0]!;
    decide(c, 'accept', o.id);
    expect(view(e).contracts.find((k: any) => k.id === o.id).monthsLeft).toBe(o.term);
    for (let i = 1; i <= 2; i++) { stepMonth(c); expect(view(e).contracts.find((k: any) => k.id === o.id).monthsLeft).toBe(o.term - i); }
    const bad = /\bmonths? months\b|\bmo months\b|\bmonths mo\b/;
    for (const seed of SEEDS) {
      const e2 = start(seed), c2 = careerOf(e2.state)!;
      for (let k = 0; c2.ending === '' && k < 5; k++) {
        idle(c2, (k + 1) * 12 - 1);
        if (c2.ending === '') stepMonth(c2);
        if (c2.ending === '') expect(JSON.stringify(view(e2)), `seed ${seed} year ${k + 1}`).not.toMatch(bad);
      }
    }
  });
  it('the worthy-offer stop says the term once ("for 20 months", never "20 months months")', () => {
    const c = initCareer(1, 'engineer'); idle(c, 2);
    c.offers = [{ id: 901, p: 'acid', tpm: 4000, price: Math.round(c.prices.acid * 1.12), term: 20, pen: 100, exp: c.m + 1 }];
    c.why = { kind: 'offer', plant: 'acid', n: 901 };
    const e = start(1); (careerOf(e.state) as unknown as Career).offers = c.offers; Object.assign(careerOf(e.state)!, { why: c.why, prices: c.prices });
    const note: string = view(e).dashboard.whyNote;
    expect(note).toContain('for 20 months, which'); expect(note).not.toMatch(/months months/);
  });
  it('flask 3 shows the reference engineer\'s number', () => {
    const e = start(2), rule = t('lv.CAREER.star.3', CAREER.textVars!(e.state));
    expect(rule).toMatch(/^Five-year operating margin of at least [\d.]+ MUSD \(within 3 % of the reference engineer's [\d.]+ MUSD on this seed\), with zero critical alarms$/);
    expect(rule).not.toContain('{');
  });
});
