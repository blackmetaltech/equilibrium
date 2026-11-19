// Career reference players over six seeds: a careful player (follows the in-game payback advice, books turnarounds when catalyst or exchanger health drops, accepts contracts above spot
// within capacity, inspects on schedule) wins and reaches at least the middle ending; a cautious one steers to Steady; the idle and reckless players lose.
import { describe, expect, it } from 'vitest';
import { START_CASH, type Career } from './model';
import { carefulDecisions, cautiousDecisions, idleDecisions, playCareer, recklessDecisions } from './policy';

const SEEDS = [1, 2, 3, 4, 5, 6];
const run = playCareer;
const incidents = (c: Career): number => c.log.filter((l) => l.kind === 'incident' || l.kind === 'critical').length;

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
  it('two endings can be steered to: careful runs reach the flagship, the same habits at 80 % of nameplate end Steady', () => {
    const careful = SEEDS.map((s) => run(s, carefulDecisions)), cautious = SEEDS.map((s) => run(s, cautiousDecisions));
    expect(careful.filter((c) => c.ending === 'chief').length).toBeGreaterThanOrEqual(5);
    expect(cautious.filter((c) => c.ending === 'steady').length).toBe(SEEDS.length);
    for (const c of cautious) { expect(c.total.margin).toBeGreaterThan(0); expect(c.cash).toBeGreaterThan(START_CASH); }
  });
  it('idle (does nothing) loses: sold or shut on every seed', () => {
    for (const seed of SEEDS) { const c = run(seed, idleDecisions); expect(['sold', 'shut'], `seed ${seed}`).toContain(c.ending); expect(c.m).toBeLessThan(60); }
  });
  it('reckless (rate 100 %, no inspections, every offer) hits incidents and is shut or sold on every seed', () => {
    for (const seed of SEEDS) { const c = run(seed, recklessDecisions); expect(['sold', 'shut'], `seed ${seed}`).toContain(c.ending); expect(incidents(c), `seed ${seed}`).toBeGreaterThan(0); }
  });
});
