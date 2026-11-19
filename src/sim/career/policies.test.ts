// Career reference players over six seeds. ONE score everywhere: operating margin (score()). A careful player (follows the in-game payback advice, books turnarounds when catalyst or exchanger health
// drops, accepts contracts above spot within capacity, inspects on schedule) wins and reaches the flagship; the same habits at 80 % of nameplate stay safe and solvent and mostly end Steady; a
// HUMAN careful player (the +3 MONTHS key, card defaults, the warnings the board now shows) also reaches the flagship; the same human without the warnings does not do so reliably (that is what the
// course line is for); the idle and reckless players lose.
import { describe, expect, it } from 'vitest';
import { CHIEF_MARGIN, START_CASH, score, type Career } from './model';
import { carefulDecisions, cautiousDecisions, idleDecisions, naiveDecisions, playCareer, recklessDecisions, type Decision } from './policy';
import { humanCarefulDecisions, playCareerSteps } from './human';

const SEEDS = [1, 2, 3, 4, 5, 6];
const run = playCareer;
const incidents = (c: Career): number => c.log.filter((l) => l.kind === 'incident' || l.kind === 'critical').length;
/** the human as the tester played before the warnings: every offer above spot taken with no capacity look, every worn plant booked two months ahead at once */
const blindHuman = (c: Career): Decision[] => humanCarefulDecisions(c).filter((d) => d[0] !== 'accept').concat(c.offers.filter((o) => o.price > c.prices[o.p] * 1.02 && c.contracts.length < 12).map((o): Decision => ['accept', o.id]));

describe('career reference players', () => {
  it('careful: five years completed, positive margin and cash above the starting cash, at least Steady, on every seed', () => {
    for (const seed of SEEDS) {
      const c = run(seed, carefulDecisions);
      expect(['steady', 'chief'], `seed ${seed} ${c.ending}`).toContain(c.ending);
      expect(c.m).toBe(60); expect(c.total.margin, `seed ${seed}`).toBeGreaterThan(0); expect(c.cash).toBeGreaterThan(START_CASH);
      expect(c.cash).toBeCloseTo(START_CASH + c.total.margin, 0);
      expect(c.strikes).toBe(0);
    }
  });
  it('two endings can be steered to: careful runs reach the flagship, the same habits at 80 % of nameplate are mostly Steady and always solvent', () => {
    const careful = SEEDS.map((s) => run(s, carefulDecisions)), cautious = SEEDS.map((s) => run(s, cautiousDecisions));
    expect(careful.filter((c) => c.ending === 'chief').length).toBeGreaterThanOrEqual(5);
    expect(cautious.filter((c) => c.ending === 'steady').length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...cautious.map(score))).toBeLessThan(Math.min(...careful.map(score)));
    for (const c of cautious) { expect(c.total.margin).toBeGreaterThan(0); expect(c.cash).toBeGreaterThan(START_CASH); }
  });
  it('the score is operating margin: investments are not charged to it, and the flagship test, the review and the ending all read the same figure', () => {
    for (const seed of SEEDS) {
      const c = run(seed, carefulDecisions);
      expect(score(c)).toBeCloseTo(c.total.margin + c.total.inv, 0);
      expect(c.years.reduce((a, y) => a + y.opMargin, 0)).toBeCloseTo(score(c), 0);
      expect(c.ending === 'chief').toBe(score(c) >= CHIEF_MARGIN && c.criticals === 0 && c.strikes === 0 && c.years.reduce((a, y) => a + y.victor, 0) / c.years.length >= 60 && c.years.reduce((a, y) => a + y.mara, 0) / c.years.length >= 60 && c.years.reduce((a, y) => a + y.noor, 0) / c.years.length >= 60);
    }
  });
  it('human careful (+3 months, card defaults, follows the warnings): the flagship on at least five of six seeds, with zero strikes', () => {
    const hs = SEEDS.map((s) => playCareerSteps(s, humanCarefulDecisions, 3));
    expect(hs.filter((c) => c.ending === 'chief').length).toBeGreaterThanOrEqual(5);
    for (const c of hs) { expect(c.m).toBe(60); expect(c.strikes).toBe(0); expect(c.criticals).toBe(0); }
  });
  it('the human who ignores the capacity and overlap warnings does not reach the flagship reliably, and the course line says so early (a lever with a number by the first review)', () => {
    const bs = SEEDS.map((s) => playCareerSteps(s, blindHuman, 3));
    expect(bs.filter((c) => c.ending === 'chief').length).toBeLessThan(5);
    for (const c of bs) {
      if (c.years.length === 0) continue;
      const y = c.years[0]!;
      if (y.outlook!.course === 'steady' || y.outlook!.course === 'sold') expect(y.outlook!.levers.length, `lever on ${c.seed}`).toBeGreaterThan(0);
    }
  });
  it('idle (does nothing) loses: sold or shut on every seed', () => {
    for (const seed of SEEDS) { const c = run(seed, idleDecisions); expect(['sold', 'shut'], `seed ${seed}`).toContain(c.ending); expect(c.m).toBeLessThan(60); }
  });
  it('reckless (rate 100 %, no inspections, every offer) hits incidents and is shut or sold on every seed', () => {
    for (const seed of SEEDS) { const c = run(seed, recklessDecisions); expect(['sold', 'shut'], `seed ${seed}`).toContain(c.ending); expect(incidents(c), `seed ${seed}`).toBeGreaterThan(0); }
  });
  it('naive still loses', () => {
    for (const seed of SEEDS) expect(['sold', 'shut']).toContain(run(seed, naiveDecisions).ending);
  });
});
