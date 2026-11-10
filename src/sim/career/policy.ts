// Career reference policies (tests and the level personas): the engineer who maintains the Works, and the novice who accepts everything and never maintains.
// A policy maps the Career state to a list of decisions [name, ...args]; the persona then adds `advance`. Pure.
import { MONTHS, PLANTS, contracted, DEFS, type Career, type PlantId } from './model';

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
