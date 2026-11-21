// Career reference policies (tests and the level personas): the engineer who maintains the Works, and the novice who accepts everything and never maintains.
// A policy maps the Career state to a list of decisions [name, ...args]; the persona then adds `advance`. Pure.
import { CareerError, MONTHS, pendingDecision, pendingIncident, PLANTS, advance, contracted, decide, DEFS, initCareer, previewInvest, type Career, type PlantId } from './model';

export type Decision = [string, ...unknown[]];

/** Turnaround months per plant (staggered so the Works never loses two plants at once). */
export const SOLVER_TA: Record<PlantId, number[]> = { nh3: [26, 50], meoh: [28, 52], acid: [30], etoh: [32] };

export function solverDecisions(c: Career): Decision[] {
  const d: Decision[] = [];
  if (c.m === 0) {
    for (const p of PLANTS) d.push(['setRate', p, 0.95]);
    d.push(['invest', 'heat'], ['invest', 'abate'], ['invest', 'safety']);
  }
  if (c.m === 3) d.push(['invest', 'heat']);
  for (const p of PLANTS) {
    const x = c.plants[p];
    // catalyst bought the month before its turnaround; turnaround planned once
    for (const m of SOLVER_TA[p]) {
      if (m === c.m + 1 && x.stock === 0) d.push(['buyCatalyst', p]);
      if (m === c.m + 2 && x.ta < 0) d.push(['turnaround', p, m, 2, 4]);
    }
    if (c.m === 0) d.push(['turnaround', p, SOLVER_TA[p][0], 2, 4]);
    const next = SOLVER_TA[p].find((m) => m > c.m && m >= c.m);
    if (x.insp >= 11 && x.ta !== c.m && !(next !== undefined && next <= c.m + 1)) d.push(['inspect', p]);
  }
  if (c.m === 0) d.push(['hireCrew']);
  // contracts: take a premium over spot while the plant keeps spare volume
  for (const o of c.offers) {
    const cap = DEFS[o.p].cap * c.plants[o.p].rate * 0.6;
    if (c.contracts.length < 12 && o.price >= c.prices[o.p] * 1.04 && contracted(c, o.p) + o.tpm <= cap && o.term <= MONTHS - c.m) d.push(['accept', o.id]);
  }
  return d;
}

export function naiveDecisions(c: Career): Decision[] {
  const d: Decision[] = [];
  if (c.m === 0) for (const p of PLANTS) d.push(['setRate', p, 1.1]);
  for (const o of c.offers) d.push(['accept', o.id]);
  return d;
}

/** Careful player: reads the dashboard and reacts, with no calendar. Follows the payback advice (invests while the preview pays back inside 30 months and cash stays above a reserve), books a
 * turnaround (buying the catalyst the month before) when a plant's catalyst or exchanger health drops, inspects on schedule, takes contracts above spot within capacity. */
export function carefulDecisions(c: Career): Decision[] {
  const d: Decision[] = [];
  const pd = pendingDecision(c); if (pd !== null) d.push(['answer', pd.best]);   // the yearly decision: the option with the better expected effect
  if (pendingIncident(c) !== null) d.push(['incident', 'contractor']);   // a plant incident (F29): the careful manager calls the contractor (stated, safe)
  if (c.m === 0) for (const p of PLANTS) d.push(['setRate', p, 0.95]);
  // payback advice: the invest cards state months to pay back; the player buys what pays back fast, one at a time, and keeps a cash reserve
  if (c.m % 2 === 0 && c.cash > 25e6) {
    for (const k of ['heat', 'safety', 'abate'] as const) {
      if (c.invest[k] >= (k === 'abate' ? 1 : 2)) continue;
      const pv = previewInvest(c, k);
      if (k === 'abate' ? c.m >= 12 : pv.paybackMonths > 0 && pv.paybackMonths <= 30) { d.push(['invest', k]); break; }
    }
  }
  const taAt = PLANTS.filter((p) => c.plants[p].ta >= 0).map((p) => c.plants[p].ta);
  for (const p of PLANTS) {
    const x = c.plants[p];
    // health trigger: catalyst under 0.62 or exchanger under 0.8 (the annunciators light at 0.7 / 0.75), and no other plant down within 2 months
    if (x.ta < 0 && (x.cat < 0.62 || x.U < 0.8) && c.m < MONTHS - 6 && !taAt.some((m) => Math.abs(m - (c.m + 2)) < 2)) {
      if (x.stock === 0) d.push(['buyCatalyst', p]);
      d.push(['turnaround', p, c.m + 2, 2, 4]); taAt.push(c.m + 2);
    }
    if (x.insp >= 11 && x.ta < 0) d.push(['inspect', p]);
  }
  if (c.m === 0) d.push(['hireCrew']);
  for (const o of c.offers) {
    const cap = DEFS[o.p].cap * c.plants[o.p].rate * 0.6;
    if (c.contracts.length < 12 && o.price >= c.prices[o.p] * 1.04 && contracted(c, o.p) + o.tpm <= cap && o.term <= MONTHS - c.m) d.push(['accept', o.id]);
  }
  return d;
}

/** Reckless player: every plant at 110 %, no inspections, no turnarounds, every offer accepted. */
export function recklessDecisions(c: Career): Decision[] {
  const d: Decision[] = [];
  if (c.m === 0) for (const p of PLANTS) d.push(['setRate', p, 1.0]);
  for (const o of c.offers) if (c.contracts.length < 12) d.push(['accept', o.id]);
  return d;
}

/** Cautious player: the careful player's habits at 80 % of nameplate; the yearly decision cards lapse unanswered. Safe and solvent, but the margin stays under the board target: the Steady ending. */
export function cautiousDecisions(c: Career): Decision[] {
  return carefulDecisions(c).filter((d) => d[0] !== 'answer').map((d): Decision => (d[0] === 'setRate' ? ['setRate', d[1], 0.8] : d));
}

/** Idle player: opens the Works and never decides anything. */
export const idleDecisions = (): Decision[] => [];

/** Play a whole career with a policy (decisions refused by the model are skipped, as a player's refused clicks are). */
export function playCareer(seed: number, pol: (c: Career) => Decision[], mode = 'engineer'): Career {
  const c = initCareer(seed, mode);
  while (c.ending === '') {
    for (const d of pol(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
    advance(c, 1);
  }
  return c;
}
