// F27 (0.8 Career): the ending names agree (the year review and the end card are one enum, one label), a booked turnaround covers the overdue stop, the strike banner is one line per plant, the turnaround card
// says what it does with the catalyst, an offer the plant cannot fill (booked outage days) is not "can fill", the year review names the mover of every term that left its share of the spread.
// (Save and resume, the scroll anchor and the reserved key widths are Godot-side: godot/tests/fix27_flow.gd.)
import { describe, expect, it } from 'vitest';
import '../locales/en';
import { CAREER, cardNote, careerOf, endingsView, outlookNote } from './career';
import { SPEC_BY_ID, SPECS } from './registry';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { PLANTS, ackWarning, advance, advanceToDecision, decide, initCareer, offerFills, outputOf, pendingDecision, worthyOffer, type Career } from '../sim/career/model';
import { playCareer, idleDecisions, recklessDecisions } from '../sim/career/policy';
import type { EqState } from '../state';

if (!SPECS.includes(CAREER)) { SPECS.push(CAREER); (SPEC_BY_ID as Record<string, typeof CAREER>)[CAREER.id] = CAREER; }
const start = (seed = 1): Env<EqState> => { const e = new Env(GAME); e.reset({ seed, level: 'CAREER', mode: 'engineer' }); return e; };
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const idleTo = (c: Career, m: number): void => { while (c.m < m && c.ending === '') advance(c, 1); };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('F27: one ending, one name', () => {
  it('when a year end ends the career, the review of that year names the same ending as the run and the end card', () => {
    let n = 0;
    for (const pol of [idleDecisions, recklessDecisions]) for (const seed of SEEDS) {
      const c = playCareer(seed, pol);
      if (c.ending !== 'sold' && c.ending !== 'shut') continue;
      const y = c.years[c.years.length - 1];
      if (y === undefined || c.m !== y.year * 12) continue;   // ended mid-year: no review of that year
      n++;
      expect(y.outlook!.course, `seed ${seed}`).toBe(c.ending);
      const note = outlookNote(y.outlook!);
      expect(note).toMatch(new RegExp(`^ENDING: ${c.ending === 'sold' ? 'SOLD' : 'SHUT'}\\.`));
      expect(note).toContain(c.ending === 'sold' ? 'The board sold the Works' : 'The regulator withdrew the permit');
      expect(note).not.toContain('COURSE');
    }
    expect(n).toBeGreaterThan(0);
  });
  it('the live ENDINGS strip of an ended run says the same', () => {
    const c = playCareer(3, idleDecisions);
    expect(['sold', 'shut']).toContain(c.ending);
    expect(endingsView(c).note).toMatch(/^ENDING: (SOLD|SHUT)\./);
  });
});

describe('F27: a booked turnaround covers the overdue stop', () => {
  it('NEXT DECISION does not stop for "overdue" at a plant whose booking (next month) resets the clock before the strike limit; without the booking it does', () => {
    const run = (book: boolean): string => {
      const c = initCareer(3, 'engineer'); if (pendingDecision(c) !== null) decide(c, 'answer', 1);
      idleTo(c, 2);
      c.plants.nh3.insp = 12;   // inspected a year ago: one more month and it is overdue
      if (book) { decide(c, 'buyCatalyst', 'nh3'); decide(c, 'turnaround', 'nh3', c.m + 1, 1, 0); }
      ackWarning(c);   // the due warning is read in both runs; only the overdue stop is in question
      advanceToDecision(c);
      return c.why!.kind;
    };
    expect(run(false)).toBe('overdue');
    expect(run(true)).not.toBe('overdue');
  });
});

describe('F27: STRIKE AHEAD is one banner', () => {
  it('one headline and one short line per plant, with the long paragraphs kept apart', () => {
    const e = start(3), c = careerOf(e.state)!; if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    idleTo(c, 11);
    for (const p of PLANTS) c.plants[p].insp = 20;
    const d = view(e).dashboard;
    expect(d.strikeLines.length).toBe(4); expect(d.strikeWarn.length).toBe(4);
    expect(d.strikeHead).toMatch(/^STRIKE AHEAD at the year-end check in month 12:/);
    for (const l of d.strikeLines as string[]) { expect(l).toMatch(/: inspection due month -?\d+, \d+ months over at the check\.$/); expect(l.length).toBeLessThan(80); }
    expect((d.strikeLines as string[]).join('').length).toBeLessThan((d.strikeWarn as string[]).join('').length / 2);
  });
});

describe('F27: the turnaround card says what it does with the catalyst', () => {
  it('before the purchase it says the price is not in the net; after it, "catalyst already bought: not counted"', () => {
    const e = start(2), c = careerOf(e.state)!; if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    const note = (): string => view(e).plants.find((q: any) => q.id === 'acid').taWeighNote[c.m + 3] as string;
    expect(note()).toContain('Catalyst not bought yet');
    decide(c, 'buyCatalyst', 'acid');
    expect(note()).toContain('Catalyst already bought: its price is not counted');
    expect(note()).toMatch(/^(Worth booking|Not yet worth it)/);
  });
});

describe('F27: an offer the plant cannot fill because of a booked outage', () => {
  it('is not "can fill": over-capacity flag, penalty in the exposure note, no stop for it, no lever for it', () => {
    const e = start(2), c = careerOf(e.state)!; if (pendingDecision(c) !== null) decide(c, 'answer', 1);
    const tpm = Math.floor(0.95 * outputOf(c, 'acid')), price = Math.round(c.prices.acid * 1.5);
    c.offers = [{ id: 91, p: 'acid', tpm, price, term: 12, pen: 220, exp: c.m + 1 }];
    expect(offerFills(c, c.offers[0]!)).toBe(true);
    expect(worthyOffer(c)?.id).toBe(91);
    let o = view(e).offers[0]; expect(o.overCapacity).toBe(false); expect(o.canFill).toBe(true);
    decide(c, 'buyCatalyst', 'acid'); decide(c, 'turnaround', 'acid', c.m + 3, 1, 0);
    expect(offerFills(c, c.offers[0]!)).toBe(false);
    expect(worthyOffer(c)).toBeNull();
    o = view(e).offers[0];
    expect(o.overCapacity).toBe(true); expect(o.canFill).toBe(false);
    expect(o.exposureNote).toMatch(/Your sulfuric acid turnaround is booked inside the term: in month \d+ the plant is out \d+ days and cannot fill it, [\d]+ t short, about [\d.]+ MUSD of penalty/);
    expect(o.exposureNote).toMatch(/^Capacity: this plant makes about/);
    expect(view(e).endings.levers.join(' ')).not.toContain('which the plant can fill');
  });
});

describe('F27: the year review names the mover of every term beyond its share of the spread', () => {
  it('across seeds, every card term whose realised figure left its share is named in the review; a term forecast at 0 has no share', () => {
    let named = 0, cards = 0;
    for (const seed of SEEDS) {
      const e = start(seed), c = careerOf(e.state)!;
      for (let g = 0; g < 120 && c.ending === ''; g++) {
        if (pendingDecision(c) !== null) decide(c, 'answer', 0);
        advance(c, 1);
      }
      for (const y of c.years) {
        const cd = y.card; if (cd === undefined) continue;
        cards++;
        const abs = cd.terms.reduce((a, x) => a + Math.abs(x.fc), 0);
        const moved = cd.terms.filter((x) => Math.abs(x.real - x.fc) > (abs > 0 ? cd.spreadUSD * Math.abs(x.fc) / abs : 0) + 5e3);
        const note = cardNote(y);
        if (moved.length === 0) expect(note).not.toContain('moved beyond their share');
        else { named++; expect(note).toContain('moved beyond their share of the stated spread'); expect(note).toContain('forecast ('); }
      }
    }
    expect(cards).toBeGreaterThan(5); expect(named).toBeGreaterThan(0);
  });
});
