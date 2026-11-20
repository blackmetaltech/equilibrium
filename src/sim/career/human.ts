// The human careful player: what a tester did on the real board (+3 MONTHS key, card defaults), as a pure policy for tests.
import { CareerError, MONTHS, pendingDecision, PLANTS, ackWarning, openWarnings, advance, decide, exposure, initCareer, previewInvest, type Career } from './model';
import type { Decision } from './policy';

/** Follows the payback advice and maxes heat recovery, takes the contracts above spot that the card says the plant can fill, books turnarounds with the card's defaults (two months ahead, one crane, no extra
 * crew, every worn plant at the same stop), inspects when the due warning lights, and decides only where a +3 month advance stopped. Moves a turnaround later only to clear an overlap; no extra crews, no calendar. */
export function humanCarefulDecisions(c: Career): Decision[] {
  const d: Decision[] = [], booked: number[] = [];
  const pd = pendingDecision(c); if (pd !== null) d.push(['answer', pd.best]);   // the yearly decision card: take the option with the better expected MUSD
  if (c.m === 0) for (const p of PLANTS) d.push(['setRate', p, 0.95]);
  if (c.cash > 25e6) {
    for (const k of ['heat', 'safety', 'abate'] as const) {
      if (c.invest[k] >= (k === 'abate' ? 1 : 3)) continue;
      const pv = previewInvest(c, k);
      if (k === 'abate' ? c.m >= 12 : k === 'heat' || (pv.paybackMonths > 0 && pv.paybackMonths <= 30)) { d.push(['invest', k]); break; }
    }
  }
  for (const p of PLANTS) {
    const x = c.plants[p];
    if (x.ta < 0 && (x.cat < 0.7 || x.U < 0.75) && c.m < MONTHS - 6) {
      // the BOOK key warns when another plant's turnaround falls in the same month: the human moves later until it does not
      let m = c.m + 2;
      const tams = [...PLANTS.filter((q) => c.plants[q].ta >= 0).map((q) => c.plants[q].ta), ...booked];
      while (tams.some((t) => Math.abs(t - m) < 1)) m++;
      booked.push(m);
      if (x.stock === 0) d.push(['buyCatalyst', p]);
      d.push(['turnaround', p, m, 1, 0]);
    }
    if (x.insp >= 10 && x.ta < 0) d.push(['inspect', p]);
  }
  // the ACCEPT card shows the capacity exposure: the human takes contracts above spot that the plant can fill
  const taken: Record<string, number> = {};
  for (const o of c.offers) {
    const ex = exposure(c, o.p, o.tpm + (taken[o.p] ?? 0), o.pen);
    if (c.contracts.length < 12 && o.price > c.prices[o.p] * 1.02 && ex.shortT === 0 && o.term <= MONTHS - c.m) { d.push(['accept', o.id]); taken[o.p] = (taken[o.p] ?? 0) + o.tpm; }
  }
  return d;
}

/** Play a whole career deciding only at the stops of a `step`-month advance (the board's +3 MONTHS key), as a human does. */
export function playCareerSteps(seed: number, pol: (c: Career) => Decision[], step = 3, mode = 'engineer'): Career {
  const c = initCareer(seed, mode);
  while (c.ending === '') {
    for (const d of pol(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
    if (openWarnings(c).length > 0) ackWarning(c); // the human read the stop and pressed CONTINUE ANYWAY (the decisions above are the ones the stop asked for)
    advance(c, step);
  }
  return c;
}
