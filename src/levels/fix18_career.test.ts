// F18 (Career, round 7, tester d4): the yearly cards are truthful (terms add up, comparison words match the numbers), five years draw five different cards, a warning is acknowledged one by one (plant, kind, due month),
// a booked turnaround covers its plant's warnings, stop banners clear, strikes are named and warned about ahead, plural text, one operating margin, ACCEPT shows the turnaround penalty.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, careerOf, decisionView, logLabel, mo, termsShown } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { skipCareer } from './fix14_career.test';
import { CareerError, DEC_KINDS, INSPECT_EVERY, PLANTS, ackWarning, advance, advanceToDecision, decide, initCareer, offerTaShort, openWarnings, pendingDecision, renewalParts, stepMonth, strikeAhead, type Career } from '../sim/career/model';
import { recklessDecisions, playCareer } from '../sim/career/policy';
import { carefulDecisions } from '../sim/career/policy';
import { playCareerSteps, humanCarefulDecisions } from '../sim/career/human';
import type { EqState } from '../state';
import { en } from '../locales/en';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const L = en as Record<string, string>;
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const sg2 = (c: number): string => `${c >= 0 ? '+' : '-'}${(Math.abs(c) / 100).toFixed(2)}`;
const idleTo = (c: Career, m: number): void => { while (c.m < m && c.ending === '') advance(c, 1); };

describe('F18: the yearly cards tell the truth', () => {
  it('for every card kind and seed, the displayed terms sum to the displayed MUSD of each option, in the text too', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      const { c } = skipCareer(seed);
      for (const d of c.decisions!) {
        kinds.add(d.kind);
        const v: any = decisionView(c, d);
        for (const o of v.options) {
          const cents = o.terms.reduce((a: number, x: any) => a + Math.round(x.musd * 100), 0);
          expect(cents, `seed ${seed} ${d.kind} ${o.id} terms ${JSON.stringify(o.terms)}`).toBe(Math.round(o.effMusd * 100));
          expect(Math.abs(o.effMusd * 1e6 - o.effectUSD), `${d.kind} ${o.id} against the engine`).toBeLessThanOrEqual(6000);
          if (o.terms.length > 0) {
            expect(o.effectText).toContain(sg2(Math.round(o.effMusd * 100)));
            for (const x of o.terms) expect(o.effectText).toContain(`${x.label} ${sg2(Math.round(x.musd * 100))}`);
          }
        }
        expect(v.hint).toContain(sg2(Math.round(v.options[v.best].effMusd * 100)));
      }
    }
    expect([...kinds].sort()).toEqual([...DEC_KINDS].sort());
  });
  it('the text\'s above / below match the numbers (contract: expected spot against the fixed price; hedge: expected gas against the fixed price)', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const { c } = skipCareer(seed);
      for (const d of c.decisions!) {
        if (d.kind !== 'contract' && d.kind !== 'hedge') continue;
        const v: any = decisionView(c, d), exp = Number(d.kind === 'contract' ? d.vars.expSpot : d.vars.expGas), fixed = Number(d.vars.price);
        const word = exp > fixed ? 'above' : exp < fixed ? 'below' : 'level with';
        expect(v.hint, `seed ${seed} ${d.kind}`).toMatch(new RegExp(`${d.kind === 'contract' ? 'USD/t' : 'USD/GJ'}, ${word} the (fixed )?${fixed}`));
        expect(v.hint).not.toMatch(exp > fixed ? / below the/ : / above the/);
        n++;
      }
    }
    expect(n).toBeGreaterThan(8);
  });
  it('the year-2 contract card of the report (spot above the fixed price, option A recommended) now shows why: the price term is negative, the spot-lift term pays', () => {
    let found = 0;
    for (const seed of SEEDS) for (const d of skipCareer(seed).c.decisions!) {
      if (d.kind !== 'contract' || d.best !== 0 || Number(d.vars.expSpot) <= Number(d.vars.price)) continue;
      const v: any = decisionView(skipCareer(seed).c, d), t = Object.fromEntries(v.options[0].terms.map((x: any) => [x.key, x.musd]));
      expect(t.price, 'fixed price below spot costs money').toBeLessThan(0); expect(t.depth).toBeGreaterThan(0); found++;
    }
    expect(found).toBeGreaterThan(0);
  });
  it('the turnaround card lists the terms of its number, and the Endings lever uses the same computation', () => {
    let hit = false;
    for (let seed = 1; seed <= 30 && !hit; seed++) {
      const c = initCareer(seed, 'engineer'); idleTo(c, 12);
      const d = pendingDecision(c); if (d === null || d.kind !== 'turnaround') continue;
      hit = true;
      const p = d.plant as 'nh3', terms = Object.fromEntries(d.options[0]!.terms.map((x) => [x.key, x.usd]));
      expect(Object.keys(terms)).toEqual(['incident', 'gain', 'outage', 'penalty', 'overlap', 'hire', 'catalyst']);
      const r = renewalParts(c, p);
      expect(terms.gain).toBeCloseTo(r.gross, 4); expect(terms.outage).toBeCloseTo(-r.outage, 4);
      expect(d.options[0]!.effectUSD).toBeCloseTo(Object.values(terms).reduce((a, x) => a + x, 0), 4);
      const v: any = decisionView(c, d);
      expect(v.options[0].effectText).toContain('outage'); expect(v.options[0].effectText).toContain('catalyst charge');
    }
    expect(hit).toBe(true);
  });
  it('the lever gain for a plant is the card\'s two terms, gross less outage, in MUSD that add up', () => {
    const c = initCareer(4, 'engineer'); idleTo(c, 8);
    const e = start(4); const s = careerOf(e.state)!; idleTo(s, 8);
    const lv = (view(e).endings.levers as string[]).find((x) => x.includes('turnaround'));
    expect(lv, 'turnaround lever').toBeDefined();
    const m = /\+([\d.]+) MUSD a year of output and gas back to new, less ([\d.]+) MUSD of outage, = \+([\d.]+) MUSD a year/.exec(lv!)!;
    expect(Math.round((Number(m[1]) - Number(m[2])) * 10) / 10).toBeCloseTo(Number(m[3]), 6);
  });
  it('termsShown: rounding is absorbed so the displayed terms always sum to the displayed total', () => {
    for (let k = 0; k < 200; k++) {
      const terms = [{ key: 'price', usd: (k * 7919 % 1000 - 500) * 1237 }, { key: 'depth', usd: (k * 104729 % 1000) * 3319 }, { key: 'penalty', usd: -(k * 31 % 97) * 911 }];
      const eff = terms.reduce((a, x) => a + x.usd, 0), s = termsShown(terms, eff);
      expect(s.terms.reduce((a, x) => a + x.cents, 0)).toBe(s.total);
    }
  });
});

describe('F18: five years, five different cards', () => {
  it('years 1 to 5 draw five different kinds on every seed (a pool of six)', () => {
    expect(DEC_KINDS.length).toBeGreaterThanOrEqual(6);
    for (const seed of SEEDS) {
      const ds = skipCareer(seed).c.decisions!;
      expect(ds.length).toBe(5);
      expect(new Set(ds.map((d) => d.kind)).size, `seed ${seed}: ${ds.map((d) => d.kind).join(',')}`).toBe(5);
      expect(ds[0]!.kind).not.toBe(ds[4]!.kind);
    }
  });
  it('the new cards act: the economy grade halves the next charge and decays faster; the crew card books the turnaround either way', () => {
    // economy grade
    const c = initCareer(1, 'engineer'); const d = { ...pendingDecision(c)! };
    const e = initCareer(2, 'engineer');
    (e.decisions ??= []).push({ year: 1, m: 0, kind: 'catgrade', plant: 'nh3', best: 1, choice: -1, lapsed: false, vars: { months: 24 }, options: [{ id: 'a', effectUSD: 0, terms: [], costUSD: 0, vars: {} }, { id: 'b', effectUSD: 0, terms: [], costUSD: 0, vars: {} }] });
    e.decisions!.splice(0, 1);
    decide(e, 'answer', 0); expect(e.eco?.nh3).toBe(true);
    const cash = e.cash; decide(e, 'buyCatalyst', 'nh3'); expect(cash - e.cash).toBe(1.5e6);
    void d;
    // crew: either answer books a turnaround for the plant two months ahead
    for (const choice of [0, 1]) {
      const f = initCareer(3, 'engineer'); f.decisions!.splice(0, 1);
      f.decisions!.push({ year: 1, m: 0, kind: 'crew', plant: 'meoh', best: 0, choice: -1, lapsed: false, vars: { months: 12 }, options: [{ id: 'a', effectUSD: 0, terms: [], costUSD: 0, vars: {} }, { id: 'b', effectUSD: 0, terms: [], costUSD: 0, vars: {} }] });
      decide(f, 'answer', choice);
      expect(f.plants.meoh.ta).toBe(2); expect(f.plants.meoh.taCrew).toBe(choice === 0 ? 4 : 0); expect(f.plants.meoh.taCrane).toBe(choice === 0 ? 2 : 1); expect(f.plants.meoh.stock).toBe(1);
    }
  });
});

describe('F18: a warning is acknowledged one by one, never globally', () => {
  const litInsp = (): Career => { const c = initCareer(1, 'engineer'); if (pendingDecision(c) !== null) decide(c, 'answer', 1); c.plants.nh3.insp = 9; advance(c, 1); return c; };
  it('an acknowledgement covers exactly the keys that were open (plant, kind, due month)', () => {
    const c = litInsp();
    const k1 = openWarnings(c); expect(k1.some((k) => k.startsWith('insp:nh3:'))).toBe(true);
    expect(() => advance(c, 3)).toThrow(CareerError); expect(() => advanceToDecision(c)).toThrow(CareerError);
    ackWarning(c); expect(openWarnings(c)).toEqual([]); expect(c.acked).toEqual(k1);
    c.plants.acid.insp = 10;   // a different plant lights its inspection warning: a new key, not covered
    const k2 = openWarnings(c); expect(k2).toEqual([`insp:acid:${c.m + 3}`]);
    expect(() => advance(c, 3)).toThrow(CareerError);
  });
  it('the report\'s case: an acknowledgement of other warnings does not let NEXT DECISION run past an inspection warning', () => {
    const c = initCareer(2, 'engineer'); if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    c.acked = ['cat:acid:0', 'foul:etoh:0', 'cat:meoh:0'];   // earlier CONTINUE ANYWAYs for other warnings
    c.plants.nh3.insp = 10;
    expect(() => advanceToDecision(c)).toThrow(CareerError);
    expect(() => advance(c, 3)).toThrow(CareerError);
    expect(c.stopped).toEqual([`insp:nh3:${c.m + 3}`]);
  });
  it('a new episode is a new key: after the inspection, the next due month needs its own acknowledgement', () => {
    const c = litInsp(); const k = openWarnings(c)[0]!; ackWarning(c);
    decide(c, 'inspect', 'nh3'); expect(openWarnings(c)).toEqual([]);
    advance(c, 1); c.plants.nh3.insp = 10; const k2 = openWarnings(c)[0]!;
    expect(k2).not.toBe(k); expect(k2.startsWith('insp:nh3:')).toBe(true);
  });
  it('a booked turnaround covers its plant: no stop for the worn catalyst or fouled exchanger before the booked month, and none for an inspection it resets in time', () => {
    const c = initCareer(1, 'engineer'); if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    const x = c.plants.meoh; x.cat = 0.6; x.U = 0.7; x.insp = 10;
    expect(openWarnings(c).filter((k) => k.includes(':meoh:')).length).toBe(3);
    decide(c, 'buyCatalyst', 'meoh'); decide(c, 'turnaround', 'meoh', c.m + 2, 1, 0);
    expect(openWarnings(c).filter((k) => k.includes(':meoh:'))).toEqual([]);
    const n = advanceToDecision(c); expect(n).toBeGreaterThanOrEqual(1);
    expect(c.why!.plant === 'meoh' && ['cat', 'foul', 'insp'].includes(c.why!.kind)).toBe(false);
    // without the charge the catalyst warning is still open (the turnaround would not renew it)
    const d = initCareer(1, 'engineer'); if (pendingDecision(d) !== null) decide(d, 'answer', 1);
    d.plants.meoh.cat = 0.6; decide(d, 'turnaround', 'meoh', d.m + 2, 1, 0);
    expect(openWarnings(d).some((k) => k.startsWith('cat:meoh:'))).toBe(true);
  });
  it('over careers: a plant with a booked turnaround and a charge in stock never has its catalyst or exchanger warning open before the booked month', () => {
    for (const seed of [1, 2, 3]) {
      const c = initCareer(seed, 'engineer');
      while (c.ending === '') {
        for (const d of humanCarefulDecisions(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
        for (const p of PLANTS) { const x = c.plants[p]; if (x.ta >= c.m && x.stock === 1) expect(openWarnings(c).filter((k) => k.startsWith(`cat:${p}:`) || k.startsWith(`foul:${p}:`))).toEqual([]); }
        if (openWarnings(c).length > 0) ackWarning(c);
        advance(c, 1);
      }
    }
  });
});

describe('F18: the stop banner, offers and strikes', () => {
  it('the Stopped banner clears once the issue is handled, and an offer stop names the product and terms (no raw id, no 0 kt)', () => {
    const e = start(2), c = careerOf(e.state)!;
    if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    c.plants.nh3.insp = 10; c.why = { kind: 'insp', plant: 'nh3', n: 1 };
    expect(view(e).dashboard.whyNote).toMatch(/^Stopped: the ammonia inspection comes due within two months/);
    decide(c, 'inspect', 'nh3'); expect(view(e).dashboard.whyNote).toBe('');
    c.offers = [{ id: 84, p: 'acid', tpm: 6200, price: Math.round(c.prices.acid * 1.12), term: 14, pen: 200, exp: c.m + 1 }]; c.why = { kind: 'offer', plant: 'acid', n: 84 };
    const w = view(e).dashboard.whyNote as string;
    expect(w).toMatch(/^Stopped: a sulfuric acid contract offer: 6\.2 kt a month at \d+ USD\/t, 12 % over spot \(\d+ USD\/t\), for 14 months/);
    expect(w).not.toMatch(/offer 84|\b0 kt|at 0 %/);
    decide(c, 'accept', 84); expect(view(e).dashboard.whyNote).toBe('');   // the offer is gone: no "0 kt a month at 0 %" banner
    c.why = { kind: 'offer', plant: 'acid', n: 12345 }; expect(view(e).dashboard.whyNote).toBe('');
  });
  it('a critical alarm names plant, month and strike number at that moment; a year-end inspection strike names the plant, month and months overdue; the review names each strike', () => {
    const c = playCareer(1, recklessDecisions);
    const crit = c.log.find((l) => l.kind === 'critical');
    expect(crit, 'a critical alarm in the reckless career').toBeDefined();
    const text = logLabel(crit!);
    expect(text).toMatch(/Critical alarm at .+ in month \d+: \d+ days down\. Regulator strike \d of 3\./);
    if (crit!.s === 1) expect(text).toContain('One strike closes the Flagship ending.');
    // inspection strike
    const e = start(3), d = careerOf(e.state)!; if (pendingDecision(d) !== null) decide(d, 'answer', 1);
    d.plants.nh3.insp = 7; d.plants.acid.insp = 7; idleTo(d, 12);
    const rows = d.log.filter((l) => l.kind === 'fine' && l.code === 'inspection');
    expect(rows.map((r) => r.plant)).toEqual(['nh3', 'acid']); expect(rows[0]!.s).toBe(1); expect(rows[1]!.s).toBeUndefined();
    expect(logLabel(rows[0]!)).toMatch(/the ammonia inspection was 7 months overdue at the year end \(month 12\), over the 6 allowed; regulator strike 1 of 3\. One strike closes the Flagship ending\./);
    expect(d.strikes).toBe(1);
    const notes = view(e).review[0].strikeNotes as string[];
    expect(notes.length).toBe(2); expect(notes[0]).toContain('ammonia');
  });
  it('the board warns ahead when an inspection will be a strike at the next year end, until it is inspected or its turnaround is booked', () => {
    const e = start(3), c = careerOf(e.state)!; if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    idleTo(c, 2);
    expect(view(e).dashboard.strikeWarn).toEqual([]);
    c.plants.nh3.insp = 14;   // due a while ago: at the year end it would be far over
    const w = view(e).dashboard.strikeWarn as string[];
    expect(w.length).toBe(1); expect(w[0]).toMatch(/STRIKE AHEAD: the ammonia inspection \(due month -?\d+\) will be \d+ months overdue at the year-end check in month 12/); expect(w[0]).toContain('One strike closes the Flagship ending.');
    decide(c, 'inspect', 'nh3'); expect(view(e).dashboard.strikeWarn).toEqual([]);
    c.plants.acid.insp = 14; decide(c, 'buyCatalyst', 'acid'); decide(c, 'turnaround', 'acid', 5, 1, 0); expect(strikeAhead(c)).toEqual([]);
  });
  it('ACCEPT shows the penalty a booked turnaround would cost against the new contract', () => {
    const e = start(2), c = careerOf(e.state)!; if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    decide(c, 'buyCatalyst', 'acid'); decide(c, 'turnaround', 'acid', c.m + 3, 1, 0);
    c.offers = [{ id: 77, p: 'acid', tpm: 30000, price: Math.round(c.prices.acid * 1.05), term: 12, pen: 220, exp: c.m + 1 }];
    const r = offerTaShort(c, c.offers[0]!); expect(r).not.toBeNull(); expect(r!.penaltyUSD).toBeGreaterThan(0);
    const o = view(e).offers[0]; expect(o.taNote).toMatch(/Your sulfuric acid turnaround is booked for month \d+: the plant is out \d+ days, so this contract would leave it [\d]+ t short that month and adds [\d.]+ MUSD of penalty\./);
    expect(o.taPenaltyUSD).toBeGreaterThan(0);
    c.plants.acid.ta = -1; expect(view(e).offers[0].taNote).toBe('');
  });
});

describe('F18: text', () => {
  it('no "month(s)" anywhere in the Career strings; singular and plural are right; a due-now inspection says so', () => {
    for (const [k, v] of Object.entries(L)) if (k.includes('CAREER')) expect(v, k).not.toContain('month(s)');
    expect(mo(1)).toBe('1 month'); expect(mo(3)).toBe('3 months');
    const e = start(1), c = careerOf(e.state)!; if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    c.plants.nh3.insp = INSPECT_EVERY; expect(view(e).plants.find((p: any) => p.id === 'nh3').inspectionNote).toMatch(/^DUE now, month /);
    c.plants.nh3.insp = INSPECT_EVERY - 1; expect(view(e).plants.find((p: any) => p.id === 'nh3').inspectionNote).toMatch(/^DUE in 1 month, month /);
    c.plants.nh3.insp = INSPECT_EVERY - 2; expect(view(e).plants.find((p: any) => p.id === 'nh3').inspectionNote).toMatch(/^DUE in 2 months, month /);
    expect(view(e).dashboard.alerts.find((a: any) => a.plant === 'nh3').text).toMatch(/inspection due within 2 months/);
    c.plants.nh3.insp = INSPECT_EVERY; expect(view(e).dashboard.alerts.find((a: any) => a.plant === 'nh3').text).toMatch(/inspection due now/);
  });
  it('one operating margin: the review table, the driver note and the Victor note carry the same number; the cap note is skipped when unchanged', () => {
    for (const seed of [1, 2, 3, 4]) {
      const e = start(seed), c = careerOf(e.state)!;
      const done = playCareerSteps(seed, carefulDecisions, 3);
      c.years = done.years; c.log = done.log; c.m = done.m;
      const v = view(e);
      for (const y of v.review) {
        expect(Math.abs(y.rev - y.cost - y.pen - y.opMarginUSD), `seed ${seed} year ${y.year}`).toBeLessThan(1);
        const op = (y.opMarginUSD / 1e6).toFixed(1);
        expect(y.victorNote).toContain(`Operating margin ${op} MUSD`); expect(y.driverNote).toContain(`operating margin ${op} MUSD`);
        const m = /from (\d+) kt to (\d+) kt/.exec(y.capNote); if (m) expect(m[1]).not.toBe(m[2]);
      }
    }
  });
  it('the Career carries no raw key and no unfilled hole in any card, note or log row of a whole career', () => {
    const c = playCareerSteps(2, humanCarefulDecisions, 3);
    for (const d of c.decisions!) { const v: any = decisionView(c, d); for (const s of [v.title, v.body, v.hint, ...v.options.flatMap((o: any) => [o.text, o.effectText])]) expect(s).not.toMatch(/\{|lv\.CAREER|undefined|NaN/); }
    for (const l of c.log) expect(logLabel(l)).not.toMatch(/\{|lv\.CAREER|undefined|NaN/);
  });
});

describe('F18: the invariants hold', () => {
  it('careful and human-careful reach Flagship on all seeds; reckless and idle lose', () => {
    for (const seed of SEEDS) {
      expect(playCareer(seed, carefulDecisions).ending, `careful ${seed}`).toBe('chief');
      expect(playCareerSteps(seed, humanCarefulDecisions, 3).ending, `human ${seed}`).toBe('chief');
    }
    for (const seed of [1, 2, 3]) {
      expect(['sold', 'shut']).toContain(playCareer(seed, recklessDecisions).ending);
      const c = initCareer(seed, 'engineer'); while (c.ending === '') advance(c, 1); expect(['sold', 'shut']).toContain(c.ending);
    }
  });
});
void stepMonth;
