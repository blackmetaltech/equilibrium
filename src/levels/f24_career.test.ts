// F24 (0.7 Career): the gate is "no card's MUSD can differ from the realised year by more than its own stated terms allow". One Flagship number; the year review's card line compares like with like
// (the same months, the same terms, the replay that diverged on offer ids fixed); a booked turnaround covers its plant's inspection warning; benefit horizons stop at month 60; the small texts say what they do.
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { CAREER, cardNote, careerOf, decisionView } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { CHIEF_MARGIN, answerDecision, decide, initCareer, openWarnings, pendingDecision, taWeigh, advance, type Career } from '../sim/career/model';
import { playCareerFollower } from '../sim/career/human';
import type { EqState } from '../state';
import { en } from '../locales/en';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const L = en as Record<string, string>;
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('F24: one Flagship', () => {
  it('Flagship is the 140 MUSD ending everywhere; the third flask is the reference engineer\'s own seed mark and says it is not the Flagship line', () => {
    expect(CHIEF_MARGIN).toBe(1.4e8);
    const refs = new Set<string>();
    for (const seed of [1, 2, 3, 5]) {
      const e = start(seed), rules = (e.engine.q('levelInfo') as any).stars.rules as string[];
      expect(rules[1]).toMatch(/^Flagship: .*140 MUSD/);
      expect(rules[2]).not.toMatch(/^Flagship/); expect(rules[2]).toMatch(/not the 140 MUSD Flagship line/); expect(rules[2]).toMatch(/within 3 % of the reference engineer's [\d.]+ MUSD on this seed/);
      refs.add(/reference engineer's ([\d.]+) MUSD/.exec(rules[2]!)![1]!);
    }
    expect(refs.size).toBeGreaterThan(1);   // the reference mark moves per seed; the Flagship line never does
    for (const [k, v] of Object.entries(L).filter(([x]) => x.startsWith('lv.CAREER.'))) for (const m of v.matchAll(/Flagship[^.]{0,40}?(\d{2,3}) MUSD/gi)) expect(m[1], k).toBe('140');
  });
});

describe('F24: the year review prices the card like for like', () => {
  const careers = SEEDS.map((s) => playCareerFollower(s));
  const cards = careers.flatMap((c) => c.years.filter((y) => y.card !== undefined).map((y) => ({ c, y, k: y.card! })));
  it('every card kind appears, and the terms add up: forecast terms to the forecast, realised terms to the realised year', () => {
    expect(new Set(cards.map((x) => x.k.kind)).size).toBeGreaterThanOrEqual(5);
    for (const { k, c } of cards) {
      expect(k.terms.reduce((a, x) => a + x.fc, 0), `${c.seed} ${k.kind}`).toBeCloseTo(k.fcUSD, 0);
      expect(k.terms.reduce((a, x) => a + x.real, 0), `${c.seed} ${k.kind}`).toBeCloseTo(k.realisedUSD, 0);
      expect(k.fcMonths).toBeLessThanOrEqual(12);
    }
  });
  it('the realised year is inside the card\'s stated spread, or the review itemises the gap by term and names the term that moved', () => {
    let inside = 0;
    for (const { c, y, k } of cards) {
      const txt = cardNote(y);
      if (Math.abs(k.realisedUSD - k.fcUSD) <= k.spreadUSD) { inside++; expect(k.within).toBe(true); expect(txt).toContain('inside the card\'s stated spread'); continue; }
      expect(k.within, `${c.seed} ${k.kind}`).toBe(false);
      expect(txt).toContain('outside the card\'s stated spread'); expect(txt).toContain('By term, forecast and realised');
      const mv = k.terms.find((x) => x.key === k.moved.key)!;
      expect(mv, `${c.seed} ${k.kind}`).toBeDefined();
      expect(k.moved.delta).toBeCloseTo(mv.real - mv.fc, 0);
      for (const x of k.terms) expect(Math.abs(mv.real - mv.fc) + 1e-6).toBeGreaterThanOrEqual(Math.abs(x.real - x.fc));
    }
    expect(inside / cards.length).toBeGreaterThan(0.85);
  });
  it('a long contract and a gas hedge are held to their stated spread outright, and the market they moved with is named', () => {
    const cs = cards.filter((x) => x.k.kind === 'contract' || x.k.kind === 'hedge');
    expect(cs.length).toBeGreaterThanOrEqual(8);
    for (const { c, y, k } of cs) {
      expect(Math.abs(k.realisedUSD - k.fcUSD), `${c.seed} y${y.year} ${k.kind}`).toBeLessThanOrEqual(k.spreadUSD);
      expect(k.market.kind).toBe(k.kind === 'hedge' ? 'gas' : 'spot'); expect(k.market.real).toBeGreaterThan(0);
      expect(cardNote(y)).toMatch(k.kind === 'hedge' ? /Gas averaged [\d.]+ USD\/GJ over the year against the [\d.]+ USD\/GJ the card expected/ : /spot price averaged \d+ USD\/t over the year against the \d+ USD\/t the card expected/);
    }
  });
  it('a contract below the expected spot cannot "earn" tens of MUSD in the year: its realised price term has the sign of the market, the lift term is the spot-depth effect', () => {
    for (const { c, k } of cards.filter((x) => x.k.kind === 'contract')) {
      const price = k.terms.find((x) => x.key === 'price')!;
      expect(Math.abs(price.real - price.fc), `${c.seed}`).toBeLessThan(k.spreadUSD);
      if (k.market.real > k.market.fixed) expect(price.real).toBeLessThan(0);
    }
  });
  it('both worlds of the replay carry the same offer ids: answering the contract card either way leaves nextId level', () => {
    for (const seed of SEEDS) {
      const ids: number[] = [];
      for (const ch of [0, 1]) { const c = initCareer(seed, 'engineer'); if (pendingDecision(c)!.kind !== 'contract') break; answerDecision(c, ch); ids.push(c.nextId); }
      if (ids.length === 2) expect(ids[0]).toBe(ids[1]);
    }
  });
  it('the card states its own uncertainty before the player chooses', () => {
    for (const seed of SEEDS) {
      const c = initCareer(seed, 'engineer'), v: any = decisionView(c, pendingDecision(c)!);
      expect(v.options[0].effectText).toMatch(/Stated uncertainty: the year can end ±?[\d.]+ MUSD either side/);
    }
  });
});

describe('F24: a booked turnaround covers its plant\'s inspection warning', () => {
  const ready = (insp: number, m: number): Career => {
    const c = initCareer(3, 'engineer'); answerDecision(c, 1); while (c.m < m) advance(c, 1);
    for (const p of ['nh3', 'acid', 'meoh', 'etoh'] as const) { c.plants[p].insp = 0; c.plants[p].cat = 1; c.plants[p].U = 1; }
    c.plants.nh3.insp = insp; return c;
  };
  it('month 13 (a month overdue) and month 33: booking two months ahead clears the open insp warning, so NEXT DECISION can run', () => {
    for (const [insp, m] of [[13, 13], [13, 33], [11, 13], [12, 33]] as const) {
      const c = ready(insp, m);
      expect(openWarnings(c).some((k) => k.startsWith('insp:nh3')), `before ${m}`).toBe(true);
      decide(c, 'buyCatalyst', 'nh3'); decide(c, 'turnaround', 'nh3', c.m + 2, 1, 0);
      expect(openWarnings(c).some((k) => k.startsWith('insp:nh3')), `after ${m}`).toBe(false);
      expect(openWarnings(c).filter((k) => !k.startsWith('end:') && !k.startsWith('em:'))).toEqual([]);   // (an idle year can still light the ending-ahead line; that is another warning)
    }
  });
  it('a booking that lands past the strike limit and after the year-end check does not cover it', () => {
    const c = ready(15, 13); decide(c, 'turnaround', 'nh3', 40, 1, 0);
    expect(openWarnings(c).some((k) => k.startsWith('insp:nh3'))).toBe(true);
  });
  it('the plant card says an overdue plant is covered', () => {
    const e = start(3), c = careerOf(e.state)!; answerDecision(c, 1); while (c.m < 13) advance(c, 1);
    c.plants.nh3.insp = 13; c.plants.nh3.stock = 1; decide(c, 'turnaround', 'nh3', c.m + 2, 1, 0);
    expect(view(e).plants[0].inspectionNote).toMatch(/OVERDUE 1 month .*the turnaround booked for month \d+ resets it/);
    expect((view(e).dashboard.stoppedNotes as string[]).some((n) => /ammonia/i.test(n) && /inspection due/.test(n))).toBe(false);
  });
});

describe('F24: the benefit horizon stops at month 60, and the small texts say what they do', () => {
  it('BOOK at month 58 speaks of the 2 months left, never "over the year"', () => {
    const e = start(1), c = careerOf(e.state)!; c.m = 58;
    const n = (view(e).plants[0].taWeighNote as string[])[59]!;
    expect(n).toContain('over the 2 months left'); expect(n).not.toContain('over the year'); expect(n).not.toContain('twelve months');
    expect(taWeigh(c, 'nh3', 59).months).toBe(2); expect(taWeigh(c, 'nh3', 59).gainMonths).toBe(0);
    c.m = 48; expect(taWeigh(c, 'nh3', 50).months).toBe(12); expect(taWeigh(c, 'nh3', 50).gainMonths).toBe(9);
    expect((view(e).plants[0].taWeighNote as string[])[50]).toContain('over the 9 months left');
  });
  it('an early BOOK keeps the year wording', () => {
    const e = start(1), n = (view(e).plants[0].taWeighNote as string[])[3]!;
    expect(n).toContain('over twelve months'); expect(n).toContain('over the year');
  });
  it('an offer says why the plant\'s capacity is what it is this month', () => {
    const e = start(2);
    for (const o of view(e).offers) { expect(o.exposureNote).toMatch(/this month \(rate x[\d.]+, catalyst \d+ %, compressor wear \d+ %/); }
  });
  it('INSPECT says what it resets and what it leaves to a turnaround', () => {
    const e = start(2), p = view(e).plants[0];
    expect(p.inspectDoes).toMatch(/resets only the inspection clock/); expect(p.inspectDoes).toMatch(/does not renew the catalyst \(\d+ % now\), the exchanger \(U \d+ %\) or the compressor \(wear \d+ %\)/); expect(p.inspectDoes).toMatch(/only a turnaround does that/);
  });
  it('the hedge card does not say the plant buys gas below the market', () => {
    expect(L['lv.CAREER.dec.term.gas']).not.toMatch(/below the market/); expect(L['lv.CAREER.dec.term.gas']).toMatch(/fixed gas price against the expected market price/);
  });
});
