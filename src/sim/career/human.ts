// The human careful player: what a tester did on the real board (+3 MONTHS key, card defaults), as a pure policy for tests.
import { CareerError, MONTHS, pendingDecision, PLANTS, ackWarning, openWarnings, advance, advanceToDecision, attention, decide, emWarn, exposure, initCareer, levers, pace, previewInvest, suggestTaMonth, warnHandled, worthyOffer, INSPECT_MIN_GAP, type Career, type PlantId } from './model';
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

/** The suggestion follower: plays like the tester who did exactly what the board told him. Every yearly card is answered with the option the card (Victor) recommends; every worn plant's turnaround is booked in the month the board
 * suggests (the first month with no other turnaround), the catalyst bought first, as the BOOK line says; an inspection is done when the alert lights; an offer the board marks good (the stop for a worthy contract, the contract lever)
 * is accepted; when the emissions warning lights, the rates it names are set; investments follow the payback line. Everything else is NEXT DECISION. */
export function followerDecisions(c: Career): Decision[] {
  const d: Decision[] = [], taken: number[] = [];
  const pd = pendingDecision(c); if (pd !== null) d.push(['answer', pd.best]);
  const ew = emWarn(c);
  if (ew !== null) {
    if (!ew.short) for (const p of PLANTS) d.push(['setRate', p, ew.rates[p]]);
    else d.push(['invest', 'abate']);
  }
  if (c.cash > 25e6) {
    for (const k of ['heat', 'safety'] as const) {
      if (c.invest[k] >= 3) continue;
      const pv = previewInvest(c, k);
      if (pv.paybackMonths > 0 && pv.paybackMonths <= 30) { d.push(['invest', k]); break; }
    }
  }
  const book = (p: PlantId): void => {
    const x = c.plants[p];
    if (x.ta >= 0 || taken.includes(-1 - PLANTS.indexOf(p))) return;
    const m = suggestTaMonth(c, p, c.m + 2, taken);
    taken.push(m, -1 - PLANTS.indexOf(p));
    if (x.stock === 0) d.push(['buyCatalyst', p]);
    d.push(['turnaround', p, m, 1, 0]);
  };
  for (const k of attention(c)) {
    const [kind, p] = k.split(':') as [string, PlantId];
    if (warnHandled(c, kind, p) || c.plants[p].ta >= 0) continue;
    if ((kind === 'cat' || kind === 'foul') && c.m < MONTHS - 6) book(p);
    if (kind === 'insp' && c.plants[p].insp >= INSPECT_MIN_GAP) d.push(['inspect', p]);
  }
  const lv = levers(c, pace(c));
  const ta = lv.find((l) => l.key === 'turnaround'); if (ta !== undefined) book(ta.vars.plant as PlantId);
  const co = lv.find((l) => l.key === 'contract'); if (co !== undefined) d.push(['accept', co.vars.id]);
  const wo = worthyOffer(c); if (wo !== null && co?.vars.id !== wo.id) d.push(['accept', wo.id]);
  return d;
}
/** Play a whole career as the follower: decide, acknowledge the stop (CONTINUE ANYWAY), then NEXT DECISION. */
export function playCareerFollower(seed: number, mode = 'engineer', pol: (c: Career) => Decision[] = followerDecisions): Career {
  const c = initCareer(seed, mode);
  for (let guard = 0; c.ending === '' && guard < 600; guard++) {
    for (const d of pol(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
    if (pendingDecision(c) !== null) { advance(c, 1); continue; }
    if (openWarnings(c).length > 0) ackWarning(c);
    try { advanceToDecision(c); } catch (e) { if (!(e instanceof CareerError)) throw e; ackWarning(c); }
  }
  return c;
}
