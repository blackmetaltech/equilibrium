// Career (DEPTH "Career"): the integrated Works run for 5 seeded years in monthly steps. Pure, deterministic, plain JSON (SI-free economics: USD, t, GJ, months).
// All numbers are GAME rules (conf GAME, UNVERIFIED): prices, costs and decay rates are set to give a believable Works, not fitted to a catalogue.
// Randomness is a stateless hash of (seed, month, stream): the same decisions always replay to the same state, so a leaderboard run is verifiable.
// Decisions are plain functions (`accept`, `setRate`, `turnaround`, `inspect`, `buyCatalyst`, `hireCrew`, `invest`) and `advance` runs months until the next year end.
import { EVENTS, LEARNER_GENTLE, type EventType } from '../../data/events';
import { schedule, type Job } from '../ops/turnaround';

export const PLANTS = ['nh3', 'acid', 'meoh', 'etoh'] as const;
export type PlantId = (typeof PLANTS)[number];
export const MONTHS = 60;
export const START_CASH = 60e6;
export const LENDERS_FLOOR = -20e6;
export const OVERHEAD_USD = 6e6;
export const CREW_USD_PER_MONTH = 8e4;
export const INSPECT_EVERY = 12;
/** The regulator's year-end check: a plant more than this many months past its inspection due date is a strike. */
export const INSPECT_STRIKE_OVER = 6;
/** INSPECT is locked until this many months have passed since the last inspection or turnaround. */
export const INSPECT_MIN_GAP = 6;
export const INSPECT_USD = 1.5e5;
export const STRIKES_MAX = 3;
export const GAS0 = 6;
export const GJ_CO2 = 0.056;
export const EM_CAP_MONTHLY_USD = 1.5e6;
export const EM_CAP_T_PER_YEAR = 1.65e6;
export const EM_CAP_STEP = 0.02;
export const CRIT_FINE_USD = 2.5e6;
export const MINOR_FINE_USD = 3e5;
export const CRIT_DOWN_D = 45;
export const MINOR_DOWN_D = 8;
export const INVEST_PRICE: Record<string, number[]> = { heat: [8e6, 12e6, 16e6], abate: [6e6, 9e6, 12e6], safety: [3e6, 4.5e6, 6e6] };
export const CREW_BASE = 8;
export const CREW_STEP = 4;
export const TA_CREW_HIRE_USD = 6e5;
export const TA_CRANE_HIRE_USD = 3e5;
/** The economy catalyst grade: this fraction of the price, and its decay rate this many times the standard grade's. */
export const ECO_PRICE = 0.5;
export const ECO_DECAY = 1.15;
export const RATE_MIN = 0.5;
export const RATE_MAX = 1.1;

export interface PlantDef { id: PlantId; cap: number; price0: number; gasGJ: number; varUSD: number; fixUSD: number; catUSD: number; decay: number; foul: number; wear: number; proc: number; gasCoupling: number }
export const DEFS: Record<PlantId, PlantDef> = {
  nh3: { id: 'nh3', cap: 30000, price0: 480, gasGJ: 32, varUSD: 15, fixUSD: 3.2e6, catUSD: 3e6, decay: 0.014, foul: 0.012, wear: 0.010, proc: 1.6, gasCoupling: 0.35 },
  acid: { id: 'acid', cap: 45000, price0: 130, gasGJ: 0, varUSD: 8, fixUSD: 1.5e6, catUSD: 1.2e6, decay: 0.008, foul: 0.014, wear: 0.008, proc: 0, gasCoupling: 0.05 },
  meoh: { id: 'meoh', cap: 25000, price0: 400, gasGJ: 31, varUSD: 20, fixUSD: 2.4e6, catUSD: 2.2e6, decay: 0.016, foul: 0.010, wear: 0.009, proc: 0.3, gasCoupling: 0.3 },
  etoh: { id: 'etoh', cap: 9000, price0: 950, gasGJ: 4, varUSD: 310, fixUSD: 2e6, catUSD: 5e5, decay: 0.010, foul: 0.015, wear: 0.006, proc: 0.05, gasCoupling: 0.05 },
};

export interface Plant { /** decay multiplier of the installed catalyst grade (1 standard; absent in older saves) */ gm?: number; /** how many turnarounds the plant has had: tells one wear episode from the next (a warning is acknowledged per episode) */ gen?: number; rate: number; cat: number; U: number; wear: number; insp: number; stock: number; down: number; ta: number; taCrane: number; taCrew: number; out: number; margin: number; risk: number }
export interface Contract { id: number; p: PlantId; tpm: number; price: number; left: number; pen: number }
export interface Offer { id: number; p: PlantId; tpm: number; price: number; term: number; pen: number; exp: number }
export interface Review { year: number; rev: number; cost: number; pen: number; inv: number; fine: number; margin: number; /** operating margin: net margin before investments (catalyst, inspections, programmes) */ opMargin: number; tonnes: number; /** plant-days of lost output */ downDays: number; /** mean catalyst activity and exchanger U over the year (0..1) */ catAvg: number; uAvg: number; contractRev: number; contractT: number; /** where the Works is heading after this review (see `outlook`) */ outlook?: Outlook; capT: number; capOldT: number; criticals: number; emRatio: number; effRatio: number; victor: number; noor: number; mara: number; strike: number; cash: number; /** what the year's card said and what the year realised (see `cardReview`) */ card?: CardReview }
export interface CardTermReview { key: string; /** what the card forecast for this term over the same months as the year (USD, signed) */ fc: number; /** what the year realised for it, A less B (USD, signed) */ real: number; /** for the term made of the forecast terms not measured on their own: their keys */ parts?: string[] }
export interface CardReview { kind: string; plant: string; choice: number; lapsed: boolean; /** what the card said option A earns against B over `months` (its own full horizon) */ cardUSD: number; months: number; /** the same forecast cut to the months the review can show (the year after the card): comparable with `realisedUSD` */ fcUSD: number; fcMonths: number; /** the card's own stated uncertainty on that forecast (USD): realised inside +-spread is "as forecast" */ spreadUSD: number; within: boolean; /** the year's cash with A less the year's cash with B (the same later decisions, the same seed) */ realisedUSD: number; /** forecast and realised, term by term (they sum to fcUSD and realisedUSD) */ terms: CardTermReview[]; /** the term that moved most against its forecast, and by how much (realised less forecast, USD) */ moved: { key: string; delta: number }; /** what the market did: gas (USD/GJ) or the plant's spot price (USD/t) averaged over the year, expected and realised; 0 when the card is not about a market */ market: { kind: 'gas' | 'spot' | ''; exp: number; real: number; fixed: number }; /** A less B, by line */ diff: { rev: number; cost: number; pen: number; inv: number; down: number }; /** the month of the booking (turnaround and crew cards) */ taMonth: number }
export interface LogRow { m: number; kind: 'event' | 'notice' | 'incident' | 'critical' | 'fine' | 'strike' | 'turnaround' | 'contract' | 'penalty' | 'decision'; code: string; plant: string; n: number; /** set on the rows that cost a regulator strike: the strike count after this one */ s?: number }
export interface Hist { m: number; margin: number; cash: number; gas: number }
export type Ending = '' | 'chief' | 'steady' | 'sold' | 'shut';
export interface Career {
  v: 1; seed: number; mode: string; m: number; cash: number; gas: number; prices: Record<PlantId, number>; plants: Record<PlantId, Plant>;
  contracts: Contract[]; offers: Offer[]; nextId: number; crews: number; invest: { heat: number; abate: number; safety: number };
  strikes: number; criticals: number; ytd: { margin: number; em: number; gasGJ: number; tonnes: number; criticals: number; eff: number; effN: number; rev: number; cost: number; pen: number; inv: number; down: number; cat: number; U: number; pn: number; crev: number; ct: number };
  years: Review[]; hist: Hist[]; log: LogRow[]; total: { revenue: number; cost: number; penalty: number; margin: number; inv: number };
  last: { margin: number; revenue: number; cost: number; penalty: number; ev: string; evPlant: string };
  ending: Ending; lossYears: number;
  /** The attention flags that stopped the last multi-month advance and have not been acknowledged yet (absent in older saves). */
  stopped?: string[];
  /** Warnings the player has acknowledged, one key each (kind:plant:episode); never a blanket acknowledgement. */
  acked?: string[];
  /** Plants that buy the economy catalyst grade (half price, faster decay) */
  eco?: Partial<Record<PlantId, boolean>>;
  /** Yearly decisions: one per in-game year (absent in older saves). The last one with choice -1 is pending. */
  decisions?: YearDecision[];
  /** Debottleneck capacity added per plant (fraction of nameplate) and the gas hedge in force (fixed USD/GJ until month `until`). */
  boost?: Partial<Record<PlantId, number>>;
  hedge?: { price: number; until: number } | null;
  /** Why the last NEXT DECISION run stopped. */
  why?: StopWhy | null;
  /** The Works as JSON when this year's card was raised, and the decisions taken since (month, name, args): the year-end review replays them to price the card against the option not taken. Absent in older saves and in replays. */
  snap?: string; ops?: [number, string, ...unknown[]][]; replay?: boolean;
}

// ------------------------------------------------------------------------------------------------ seeded draws
export function draw(seed: number, m: number, k: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(m + 1, 0x85ebca6b) ^ Math.imul(k + 7, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Irwin-Hall normal(0,1) approximation from four draws (no log, no sqrt of a draw). */
export const gauss = (seed: number, m: number, k: number): number => (draw(seed, m, k) + draw(seed, m, k + 100) + draw(seed, m, k + 200) + draw(seed, m, k + 300) - 2) * Math.sqrt(3);
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const pickPlant = (u: number): PlantId => PLANTS[Math.min(PLANTS.length - 1, Math.floor(u * PLANTS.length))]!;

// ------------------------------------------------------------------------------------------------ turnaround
export function taJobs(stock: boolean): Job[] {
  const J = (id: string, days: number, deps: string[], crew: number, crane: number): Job => ({ id, days, deps, crew, crane });
  const mid = [J('hx', 4, ['iso'], 3, 0), J('comp', 5, ['iso'], 4, 1), J('relief', 2, ['iso'], 2, 0), J('insp', 2, ['iso'], 2, 0)];
  if (stock) mid.push(J('cat', 6, ['iso'], 4, 1));
  return [J('iso', 2, [], 4, 0), ...mid, J('start', 2, mid.map((j) => j.id), 4, 0)];
}
/** Days the plant is out for a turnaround with this crane count and extra crews (priority: the crane jobs first, then longest first). */
export function taDays(stock: boolean, crane: number, extraCrew: number): number {
  const jobs = taJobs(stock);
  const prio = ['iso', ...jobs.filter((j) => j.id !== 'iso' && j.id !== 'start').sort((a, b) => b.crane - a.crane || b.days - a.days).map((j) => j.id), 'start'];
  return schedule(jobs, prio, { crew: CREW_BASE + extraCrew, crane }).makespan;
}

/** One booked turnaround, as the shared crews and crane see it. */
export interface TaBook { p: PlantId; stock: boolean; crane: number; crew: number }
/** Days each plant is out when several turnarounds fall in the same month: they draw on ONE site pool (the base crew plus every extra crew booked, the largest crane count booked), so the crane and crew jobs queue behind
 * one another. One booking alone gives exactly `taDays`. Plants queue in the fixed order of PLANTS. */
export function taGroupDays(books: TaBook[]): Record<string, number> {
  const bs = [...books].sort((a, b) => PLANTS.indexOf(a.p) - PLANTS.indexOf(b.p)), out: Record<string, number> = {};
  if (bs.length === 1) { out[bs[0]!.p] = taDays(bs[0]!.stock, bs[0]!.crane, bs[0]!.crew); return out; }
  const jobs: Job[] = [], prio: string[] = [];
  for (const b of bs) {
    const js = taJobs(b.stock).map((j): Job => ({ ...j, id: `${b.p}:${j.id}`, deps: j.deps.map((d) => `${b.p}:${d}`) }));
    jobs.push(...js);
    prio.push(`${b.p}:iso`, ...js.filter((j) => j.id !== `${b.p}:iso` && j.id !== `${b.p}:start`).sort((a, c) => c.crane - a.crane || c.days - a.days).map((j) => j.id), `${b.p}:start`);
  }
  const sc = schedule(jobs, prio, { crew: CREW_BASE + bs.reduce((a, b) => a + b.crew, 0), crane: Math.max(...bs.map((b) => b.crane)) });
  for (const b of bs) out[b.p] = sc.finish[`${b.p}:start`] ?? 0;
  return out;
}
const bookOf = (c: Career, q: PlantId): TaBook => ({ p: q, stock: c.plants[q].stock === 1, crane: c.plants[q].taCrane, crew: c.plants[q].taCrew });
/** What a turnaround of `p` in `month` really costs in days once the other plants booked that month are counted: its own days (queueing behind theirs), the days it alone would need, the days it adds to the others, and who they are. */
export interface TaOverlap { days: number; solo: number; /** plant-days the booking adds across the Works beyond its solo outage (its own queueing plus the stretch of the others) */ extraDays: number; with: PlantId[]; /** per other plant: days added to its outage */ bump: { p: PlantId; days: number }[] }
export function taOverlap(c: Career, p: PlantId, month: number, crane = 1, extraCrew = 0, stock = c.plants[p].stock === 1): TaOverlap {
  const solo = taDays(stock, crane, extraCrew);
  const others = month < c.m ? [] : PLANTS.filter((q) => q !== p && c.plants[q].ta === month).map((q) => bookOf(c, q));
  if (others.length === 0) return { days: solo, solo, extraDays: 0, with: [], bump: [] };
  const withMe = taGroupDays([...others, { p, stock, crane, crew: extraCrew }]), without = taGroupDays(others);
  const bump = others.map((o) => ({ p: o.p, days: withMe[o.p]! - without[o.p]! }));
  const days = withMe[p]!;
  return { days, solo, extraDays: days - solo + bump.reduce((a, b) => a + b.days, 0), with: others.map((o) => o.p), bump };
}
/** The month a turnaround of `p` should be booked in: `from` or the first month after it in which no other plant has a turnaround (those months share crews and crane); `taken` adds months the caller is about to book. */
export function suggestTaMonth(c: Career, p: PlantId, from = c.m + 2, taken: number[] = []): number {
  const start = Math.max(c.m, from);
  for (let m = start; m < Math.min(MONTHS, start + 12); m++) if (!taken.includes(m) && !PLANTS.some((q) => q !== p && c.plants[q].ta === m)) return m;
  return start;
}

// ------------------------------------------------------------------------------------------------ setup
const newPlant = (): Plant => ({ rate: 0.9, cat: 1, U: 1, wear: 0, insp: 0, stock: 0, down: 0, ta: -1, taCrane: 1, taCrew: 0, out: 0, margin: 0, risk: 0 });
export function initCareer(seed: number, mode: string): Career {
  const c: Career = {
    v: 1, seed, mode, m: 0, cash: START_CASH, gas: GAS0,
    prices: { nh3: DEFS.nh3.price0, acid: DEFS.acid.price0, meoh: DEFS.meoh.price0, etoh: DEFS.etoh.price0 },
    plants: { nh3: newPlant(), acid: newPlant(), meoh: newPlant(), etoh: newPlant() },
    contracts: [], offers: [], nextId: 1, crews: 0, invest: { heat: 0, abate: 0, safety: 0 }, strikes: 0, criticals: 0,
    ytd: { margin: 0, em: 0, gasGJ: 0, tonnes: 0, criticals: 0, eff: 0, effN: 0, rev: 0, cost: 0, pen: 0, inv: 0, down: 0, cat: 0, U: 0, pn: 0, crev: 0, ct: 0 }, years: [], hist: [], log: [], total: { revenue: 0, cost: 0, penalty: 0, margin: 0, inv: 0 },
    last: { margin: 0, revenue: 0, cost: 0, penalty: 0, ev: '', evPlant: '' }, ending: '', lossYears: 0,
  };
  makeOffers(c);
  raiseDecision(c);
  return c;
}
function makeOffers(c: Career): void {
  c.offers = c.offers.filter((o) => o.exp > c.m);
  for (let k = 0; k < 3; k++) {
    const p = pickPlant(draw(c.seed, c.m, 40 + k * 5)), d = DEFS[p];
    const frac = 0.1 + 0.3 * draw(c.seed, c.m, 41 + k * 5);
    const prem = -0.06 + 0.2 * draw(c.seed, c.m, 42 + k * 5);
    const term = 6 + Math.floor(19 * draw(c.seed, c.m, 43 + k * 5));
    const pen = 1.2 + 0.8 * draw(c.seed, c.m, 44 + k * 5);
    const price = Math.round(c.prices[p] * (1 + prem));
    c.offers.push({ id: c.nextId++, p, tpm: Math.round((d.cap * frac) / 100) * 100, price, term, pen: Math.round(price * pen), exp: c.m + 1 });
  }
}

// ------------------------------------------------------------------------------------------------ derived numbers (also read by the view and the personas)
export const year = (c: Career): number => Math.min(4, Math.floor(c.m / 12));
export const contracted = (c: Career, p: PlantId): number => c.contracts.filter((x) => x.p === p).reduce((a, x) => a + x.tpm, 0);
export const overdue = (c: Career, p: PlantId): number => Math.max(0, c.plants[p].insp - INSPECT_EVERY);
export const emCap = (c: Career): number => EM_CAP_T_PER_YEAR * (1 - EM_CAP_STEP * year(c));
export const gasMul = (c: Career, p: PlantId): number => { const x = c.plants[p]; return ((1 + 0.5 * (1 - x.U)) / (0.6 + 0.4 * x.cat)) * (1 - 0.07 * c.invest.heat); };
export const outputOf = (c: Career, p: PlantId): number => { const x = c.plants[p]; return DEFS[p].cap * (1 + (c.boost?.[p] ?? 0)) * x.rate * (0.4 + 0.6 * x.cat) * (1 - 0.15 * x.wear); };
/** Incident risk of a plant in a given state (wear, exchanger U, months since inspection, rate). */
const riskAt = (c: Career, x: { wear: number; U: number; insp: number; rate: number }): number =>
  clamp(0.45 * x.wear + 0.4 * Math.min(1, Math.max(0, x.insp - INSPECT_EVERY) / 6) + Math.max(0, x.rate - 0.95) * 4 + 0.3 * (1 - x.U) - 0.08 * c.invest.safety, 0, 1);
export const riskOf = (c: Career, p: PlantId): number => riskAt(c, c.plants[p]);
export const investCost = (c: Career, kind: 'heat' | 'abate' | 'safety'): number => INVEST_PRICE[kind]![c.invest[kind]] ?? 0;
/** What a catalyst charge costs this plant now (standard or economy grade). */
export const catPrice = (c: Career, p: PlantId): number => DEFS[p].catUSD * (c.eco?.[p] === true ? ECO_PRICE : 1);
export const crewLimit = (c: Career): number => CREW_BASE + c.crews * CREW_STEP;

// ------------------------------------------------------------------------------------------------ decisions
export class CareerError extends Error {}
const need = (ok: boolean, code: string): void => { if (!ok) throw new CareerError(code); };
const alive = (c: Career): void => need(c.ending === '', 'over');
const plantOf = (p: unknown): PlantId => { need(typeof p === 'string' && (PLANTS as readonly string[]).includes(p), 'plant'); return p as PlantId; };
/** Remember a decision for the year-end review's replay (only while this year's card has a snapshot). */
const rec = (c: Career, name: string, ...a: unknown[]): void => { if (c.snap !== undefined) (c.ops ??= []).push([c.m, name, ...a]); };
const spend = (c: Career, usd: number): void => { c.cash -= usd; c.ytd.margin -= usd; c.ytd.inv = (c.ytd.inv ?? 0) + usd; c.total.cost += usd; c.total.margin -= usd; c.total.inv = (c.total.inv ?? 0) + usd; };

export function accept(c: Career, id: unknown): void {
  alive(c);
  const o = c.offers.find((x) => x.id === id);
  need(o !== undefined, 'offer');
  need(c.contracts.length < 12, 'full');
  c.contracts.push({ id: o!.id, p: o!.p, tpm: o!.tpm, price: o!.price, left: o!.term, pen: o!.pen });
  c.offers = c.offers.filter((x) => x.id !== id);
  c.log.push({ m: c.m, kind: 'contract', code: 'signed', plant: o!.p, n: o!.tpm });
  rec(c, 'accept', id);
}
export function decline(c: Career, id: unknown): void { alive(c); need(c.offers.some((x) => x.id === id), 'offer'); c.offers = c.offers.filter((x) => x.id !== id); rec(c, 'decline', id); }
export function setRate(c: Career, p: unknown, rate: unknown): void {
  alive(c);
  const id = plantOf(p);
  need(typeof rate === 'number' && Number.isFinite(rate) && rate >= RATE_MIN - 1e-9 && rate <= RATE_MAX + 1e-9, 'rate');
  c.plants[id].rate = Math.round((rate as number) * 100) / 100; rec(c, 'setRate', p, rate);
}
export function inspect(c: Career, p: unknown): void {
  alive(c);
  const id = plantOf(p), x = c.plants[id];
  need(x.insp >= INSPECT_MIN_GAP, 'early');
  spend(c, INSPECT_USD); x.insp = 0; x.down += 1; rec(c, 'inspect', p);
}
export function buyCatalyst(c: Career, p: unknown): void {
  alive(c);
  const id = plantOf(p), x = c.plants[id];
  need(x.stock === 0, 'stocked');
  spend(c, catPrice(c, id)); x.stock = 1; rec(c, 'buyCatalyst', p);
}
export function turnaround(c: Career, p: unknown, month: unknown, crane: unknown = 1, extraCrew: unknown = 0): void {
  alive(c);
  const id = plantOf(p), x = c.plants[id];
  need(typeof month === 'number' && Number.isInteger(month) && month >= c.m && month < MONTHS, 'month');
  need(crane === 1 || crane === 2, 'crane');
  need(extraCrew === 0 || extraCrew === CREW_STEP, 'crew');
  x.ta = month as number; x.taCrane = crane as number; x.taCrew = extraCrew as number; rec(c, 'turnaround', p, month, crane, extraCrew);
}
export function cancelTurnaround(c: Career, p: unknown): void { alive(c); c.plants[plantOf(p)].ta = -1; rec(c, 'cancelTurnaround', p); }
export function hireCrew(c: Career): void { alive(c); need(c.crews < 3, 'crews'); c.crews++; rec(c, 'hireCrew'); }
export function doInvest(c: Career, kind: unknown): void {
  alive(c);
  need(kind === 'heat' || kind === 'abate' || kind === 'safety', 'kind');
  const k = kind as 'heat' | 'abate' | 'safety';
  need(c.invest[k] < 3, 'max');
  spend(c, investCost(c, k)); c.invest[k]++; rec(c, 'invest', kind);
}

// ------------------------------------------------------------------------------------------------ the month
interface Mods { out: Record<PlantId, number>; gas: number; spot: Record<PlantId, number>; gasPrice: number; em: number }
function applyEvents(c: Career): Mods {
  const mods: Mods = { out: { nh3: 1, acid: 1, meoh: 1, etoh: 1 }, gas: 1, spot: { nh3: 1, acid: 1, meoh: 1, etoh: 1 }, gasPrice: 1, em: 1 };
  c.last.ev = ''; c.last.evPlant = '';
  if (draw(c.seed, c.m, 1) >= 0.5) return mods;
  const types = Object.keys(EVENTS) as EventType[], total = types.reduce((a, t) => a + EVENTS[t].weight, 0);
  let u = draw(c.seed, c.m, 2) * total, ev = types[0]!;
  for (const t of types) { u -= EVENTS[t].weight; if (u < 0) { ev = t; break; } }
  const p = pickPlant(draw(c.seed, c.m, 3)), g = c.mode === 'learner' ? LEARNER_GENTLE : 1, x = c.plants[p], mag = EVENTS[ev].mag;
  const dev = (m: number): number => 1 + (m - 1) * g;
  switch (ev) {
    case 'cw_hot_day': for (const q of PLANTS) mods.out[q] *= 1 - 0.04 * g; break;
    case 'cw_pump_trip': mods.out[p] *= 1 - 0.3 * g; break;
    case 'feed_inerts': mods.out.nh3 *= 1 - 0.04 * g; mods.out.meoh *= 1 - 0.03 * g; break;
    case 'feed_surge': mods.out[p] *= 1 + 0.05 * g; break;
    case 'blower_wear': x.wear = Math.min(1, x.wear + 0.05 * g); break;
    case 'compressor_trip': x.down += Math.round(3 * g); break;
    case 'catalyst_age': x.cat *= dev(mag); break;
    case 'catalyst_poison': x.cat *= dev(mag); break;
    case 'fuel_price': mods.gasPrice = 1 + 0.8 * g; break;
    case 'demand_spike': mods.spot[p] = dev(1.3); break;
    case 'power_dip': mods.out[p] *= dev(mag); break;
    case 'analyser_fault': mods.out[p] *= 1 - 0.02 * g; break;
    case 'steam_header_low': mods.gas = 1 + 0.05 * g; break;
    case 'valve_fails_closed': x.down += Math.round(2 * g); break;
  }
  c.last.ev = ev; c.last.evPlant = p;
  c.log.push({ m: c.m, kind: 'event', code: ev, plant: p, n: 0 });
  return mods;
}

export function stepMonth(c: Career): void {
  need(c.ending === '', 'over');
  const seed = c.seed, m = c.m, mods = applyEvents(c);
  const gasP = c.hedge !== undefined && c.hedge !== null && m < c.hedge.until ? c.hedge.price : c.gas * mods.gasPrice;
  let revenue = 0, cost = OVERHEAD_USD + c.crews * CREW_USD_PER_MONTH * CREW_STEP, penalty = 0, margin = 0;
  let em = 0, gasGJ = 0, tonnes = 0, effNum = 0, effDen = 0;
  const out: Record<string, number> = {};
  // turnarounds planned for this month: cost, down days, the plant comes back as new
  const taNow = PLANTS.filter((q) => c.plants[q].ta === m), groupDays = taNow.length > 0 ? taGroupDays(taNow.map((q) => bookOf(c, q))) : {};
  for (const p of PLANTS) {
    const x = c.plants[p];
    if (x.ta !== m) continue;
    const stock = x.stock === 1, days = groupDays[p]!;
    const hire = (x.taCrew > 0 ? TA_CREW_HIRE_USD : 0) + (x.taCrane > 1 ? TA_CRANE_HIRE_USD : 0);
    cost += hire; x.down += days;
    x.U = 1; x.wear = 0; x.insp = 0; x.gen = (x.gen ?? 0) + 1; if (stock) { x.cat = 1; x.stock = 0; x.gm = c.eco?.[p] === true ? ECO_DECAY : 1; }
    x.ta = -1; c.log.push({ m, kind: 'turnaround', code: stock ? 'full' : 'nocat', plant: p, n: days });
  }
  // production and sales
  const spot: Record<string, number> = {};
  for (const p of PLANTS) {
    const x = c.plants[p], d = DEFS[p];
    const days = Math.min(30, x.down); x.down -= days; c.ytd.down = (c.ytd.down ?? 0) + days; c.ytd.cat = (c.ytd.cat ?? 0) + x.cat; c.ytd.U = (c.ytd.U ?? 0) + x.U; c.ytd.pn = (c.ytd.pn ?? 0) + 1;
    const o = outputOf(c, p) * mods.out[p] * (1 - days / 30);
    out[p] = o; x.out = o; tonnes += o;
    const need_ = contracted(c, p), deliver = Math.min(o, need_), short = Math.max(0, need_ - o);
    let rev = 0, pen = 0;
    c.ytd.ct = (c.ytd.ct ?? 0) + deliver;
    for (const k of c.contracts) if (k.p === p) { const share = need_ > 0 ? (k.tpm / need_) * deliver : 0; rev += share * k.price; c.ytd.crev = (c.ytd.crev ?? 0) + share * k.price; pen += Math.max(0, k.tpm - share) * k.pen; }
    const spotQty = Math.max(0, o - deliver);
    spot[p] = c.prices[p] * mods.spot[p] * (1 - 0.15 * (spotQty / d.cap));
    rev += spotQty * spot[p]!;
    const gj = o * d.gasGJ * gasMul(c, p) * mods.gas;
    const cst = d.varUSD * o + d.fixUSD + gj * gasP;
    const e = (gj * GJ_CO2 + o * d.proc) * (1 - 0.12 * c.invest.abate);
    revenue += rev; cost += cst; penalty += pen; em += e; gasGJ += gj;
    x.margin = rev - cst - pen; margin += x.margin;
    if (d.gasGJ > 0 && o > 0) { effNum += gj / o; effDen += d.gasGJ; }
    if (short > 0) c.log.push({ m, kind: 'penalty', code: 'short', plant: p, n: Math.round(short) });
  }
  margin = revenue - cost - penalty;
  // integrity: risk, incidents, fines, strikes
  let fines = 0;
  for (const p of PLANTS) {
    const x = c.plants[p], r = riskOf(c, p);
    x.risk = r;
    const pr = clamp((r - 0.35) * 0.6, 0, 0.9), u = draw(seed, m, 60 + PLANTS.indexOf(p) * 3);
    if (u >= pr) continue;
    if (u < pr * 0.4) {
      c.criticals++; c.ytd.criticals++; c.strikes++; x.down += CRIT_DOWN_D; x.wear = 0; fines += CRIT_FINE_USD;
      c.log.push({ m, kind: 'critical', code: 'incident', plant: p, n: CRIT_DOWN_D, s: c.strikes });
    } else { x.down += MINOR_DOWN_D; fines += MINOR_FINE_USD; c.log.push({ m, kind: 'incident', code: 'minor', plant: p, n: MINOR_DOWN_D }); }
  }
  cost += fines; margin -= fines;
  c.cash += margin;
  c.total.revenue += revenue; c.total.cost += cost; c.total.penalty += penalty; c.total.margin += margin;
  c.last.margin = margin; c.last.revenue = revenue; c.last.cost = cost; c.last.penalty = penalty;
  c.ytd.rev = (c.ytd.rev ?? 0) + revenue; c.ytd.cost = (c.ytd.cost ?? 0) + cost; c.ytd.pen = (c.ytd.pen ?? 0) + penalty;
  c.ytd.margin += margin; c.ytd.em += em; c.ytd.gasGJ += gasGJ; c.ytd.tonnes += tonnes; if (effDen > 0) { c.ytd.eff += effNum / effDen * 1; c.ytd.effN++; }
  c.hist.push({ m, margin, cash: c.cash, gas: gasP });
  if (c.hist.length > MONTHS) c.hist.shift();
  // contracts run down
  for (const k of c.contracts) k.left--;
  c.contracts = c.contracts.filter((k) => k.left > 0);
  // ageing
  for (const p of PLANTS) {
    const x = c.plants[p], d = DEFS[p];
    x.cat = Math.max(0.2, x.cat * (1 - d.decay * x.rate * (x.gm ?? 1)));
    x.U = Math.max(0.5, x.U - d.foul * x.rate);
    x.wear = Math.min(1, x.wear + d.wear * x.rate * x.rate);
    x.insp += 1;
  }
  // markets
  const gz = gauss(seed, m, 10);
  c.gas = clamp(c.gas + 0.2 * (GAS0 - c.gas) + 0.8 * gz, 2.5, 16);
  for (const p of PLANTS) {
    const d = DEFS[p], tgt = d.price0 * (1 + d.gasCoupling * (c.gas - GAS0) / GAS0);
    c.prices[p] = Math.max(0.4 * d.price0, c.prices[p] + 0.15 * (tgt - c.prices[p]) + 0.04 * d.price0 * gauss(seed, m, 20 + PLANTS.indexOf(p)));
  }
  c.m++;
  makeOffers(c);
  if (c.cash < LENDERS_FLOOR) finish(c, 'sold');
  else if (c.strikes >= STRIKES_MAX) finish(c, 'shut');
  if (c.ending === '' && c.m % 12 === 0) yearEnd(c);
  if (c.ending === '' && c.m >= MONTHS) finish(c, endingOf(c));
  if (c.ending === '' && c.m % 12 === 0 && c.m < MONTHS) raiseDecision(c);
}

function finish(c: Career, e: Ending): void { c.ending = e; c.log.push({ m: c.m, kind: 'strike', code: `end_${e}`, plant: '', n: c.strikes }); }

export const CHIEF_MARGIN = 1.4e8;
/** The board's yearly target IS the Flagship total spread over the five years (140 MUSD in five years = 28 MUSD a year on pace). */
export const MARGIN_TARGET_YEAR = CHIEF_MARGIN / 5;
function yearEnd(c: Career): void {
  const y = c.m / 12 - 1, yt = c.ytd;
  const emRatio = yt.em / (EM_CAP_T_PER_YEAR * (1 - EM_CAP_STEP * y));
  const effRatio = yt.effN > 0 ? yt.eff / yt.effN : 1;
  let strike = 0, fine = 0;
  if (emRatio > 1) { fine = EM_CAP_MONTHLY_USD * (emRatio - 1) * 12 + EM_CAP_MONTHLY_USD; strike++; c.cash -= fine; c.total.margin -= fine; c.log.push({ m: c.m, kind: 'fine', code: 'emissions', plant: '', n: Math.round(emRatio * 100), s: c.strikes + strike }); }
  // every plant past the inspection limit is named in the log; the regulator counts them as one strike
  const late = PLANTS.filter((p) => overdue(c, p) > INSPECT_STRIKE_OVER);
  if (late.length > 0) strike++;
  late.forEach((p, i) => c.log.push({ m: c.m, kind: 'fine', code: 'inspection', plant: p, n: overdue(c, p), ...(i === 0 ? { s: c.strikes + strike } : {}) }));
  c.strikes += strike;
  // Victor judges operating performance: margin before investments. The return on a programme (less gas, fewer fines) is already inside it, its price is not charged to the score.
  const opMargin = yt.margin + (yt.inv ?? 0) - fine, net = yt.margin - fine;
  const victor = clamp(Math.round((opMargin / MARGIN_TARGET_YEAR) * 100), 0, 100);
  const pn = Math.max(1, yt.pn ?? 0), catAvg = (yt.cat ?? 0) / pn, uAvg = (yt.U ?? 0) / pn;
  const noor = clamp(Math.round(100 - 45 * yt.criticals - 100 * Math.max(0, emRatio - 0.9) - 25 * strike), 0, 100);
  // Mara also reads the equipment: a fouled exchanger and a tired catalyst cost points even when a heat-recovery programme hides them in the gas figure.
  const mara = clamp(Math.round(100 - 250 * Math.max(0, effRatio - 1) - 100 * Math.max(0, 0.95 - uAvg) - 80 * Math.max(0, 0.9 - catAvg)), 0, 100);
  c.years.push({ year: y + 1, rev: yt.rev ?? 0, cost: (yt.cost ?? 0) + fine, pen: yt.pen ?? 0, inv: yt.inv ?? 0, fine, margin: net, opMargin, tonnes: yt.tonnes, downDays: yt.down ?? 0, catAvg, uAvg, contractRev: yt.crev ?? 0, contractT: yt.ct ?? 0, capT: emCap(c), capOldT: EM_CAP_T_PER_YEAR * (1 - EM_CAP_STEP * y), criticals: yt.criticals, emRatio, effRatio, victor, noor, mara, strike, cash: c.cash });
  c.lossYears = opMargin < 0 ? c.lossYears + 1 : 0;
  c.years[c.years.length - 1]!.outlook = outlook(c);
  const cr = cardReview(c); if (cr !== undefined) c.years[c.years.length - 1]!.card = cr;
  c.snap = undefined; c.ops = undefined;
  c.ytd = { margin: 0, em: 0, gasGJ: 0, tonnes: 0, criticals: 0, eff: 0, effN: 0, rev: 0, cost: 0, pen: 0, inv: 0, down: 0, cat: 0, U: 0, pn: 0, crev: 0, ct: 0 };
  if (c.ending === '' && c.m < MONTHS) c.log.push({ m: c.m, kind: 'notice', code: 'cap', plant: '', n: Math.round(emCap(c) / 1000) });
  if (c.lossYears >= 2 || c.cash < 0) finish(c, 'sold');
  else if (c.strikes >= STRIKES_MAX) finish(c, 'shut');
}
/** The year's card priced against the road not taken: the Works as it stood when the card was raised, run to this year end with the same later decisions and the same seed, once with option A and once with B; the difference in cash is what the card realised.
 * It is set beside the card's own forecast for the same months (`DecYear`), term by term, so a gap names the term that moved: the market (gas or spot, with the averages), the penalties, the catalyst bill, the rest. */
function cardReview(c: Career): CardReview | undefined {
  if (c.snap === undefined || c.replay === true) return undefined;
  const d = (c.decisions ?? []).find((x) => x.year === c.years.length);
  if (d === undefined || d.choice < 0) return undefined;
  const target = c.m, ops = c.ops ?? [], plant = d.plant === '' ? null : d.plant;
  const world = (choice: number): { w: Career; spot: number[] } => {
    const w = JSON.parse(c.snap!) as Career; w.replay = true;
    const spot: number[] = [];
    try { answerDecision(w, choice); } catch (e) { if (!(e instanceof CareerError)) throw e; }
    while (w.ending === '' && w.m < target) {
      if (plant !== null) spot.push(w.prices[plant]);
      for (const o of ops) if (o[0] === w.m) { try { decide(w, o[1], ...o.slice(2)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
      stepMonth(w);
    }
    return { w, spot };
  };
  const other = world(1 - d.choice), alt = other.w, A = d.choice === 0 ? c : alt, B = d.choice === 0 ? alt : c;
  const ya = A.years[c.years.length - 1], yb = B.years[c.years.length - 1];
  if (ya === undefined || yb === undefined) return undefined;
  const real = A.cash - B.cash, yr = d.yr ?? yearOf(Number(d.vars.months ?? 12), d.options[0]!.terms, halfTerms(d.options[0]!.terms));
  const diff = { rev: ya.rev - yb.rev + 0, cost: ya.cost - yb.cost + 0, pen: ya.pen - yb.pen + 0, inv: ya.inv - yb.inv + 0, down: ya.downDays - yb.downDays + 0 };
  // what the market did over the year (it does not depend on the player: the world that replays has it): gas as the unhedged world paid it, or the plant's spot price
  const unhedged = d.kind === 'hedge' ? (d.choice === 0 ? alt : c) : alt, last12 = unhedged.hist.slice(-DEC_YEAR);
  const market: CardReview['market'] = d.kind === 'hedge' ? { kind: 'gas', exp: yr.exp, fixed: Number(d.vars.price), real: last12.length > 0 ? last12.reduce((a, r) => a + r.gas, 0) / last12.length : 0 }
    : d.kind === 'contract' && other.spot.length > 0 ? { kind: 'spot', exp: yr.exp, fixed: Number(d.vars.price), real: other.spot.slice(0, yr.months).reduce((a, x) => a + x, 0) / Math.min(yr.months, other.spot.length) } : { kind: '', exp: 0, real: 0, fixed: 0 };
  // the terms the ledger measures on their own (penalties, the catalyst or build bill, the emissions fine, the fixed price against the spot walk); the rest of the forecast terms are one lump
  const measured: Record<string, number> = {};
  if (d.kind === 'hedge') measured.gas = real;
  else {
    if (yr.terms.some((x) => x.key === 'penalty')) measured.penalty = -diff.pen;
    if (yr.terms.some((x) => x.key === 'catalyst')) measured.catalyst = -diff.inv;
    if (yr.terms.some((x) => x.key === 'saving')) measured.saving = -diff.inv;
    if (yr.terms.some((x) => x.key === 'build')) measured.build = -diff.inv;
    if (yr.terms.some((x) => x.key === 'fine')) measured.fine = -(ya.fine - yb.fine);
    if (d.kind === 'contract' && market.kind === 'spot') { const n = Math.min(yr.months, other.spot.length), dE = yr.aux.dE ?? 0, price = Number(d.vars.price); measured.price = other.spot.slice(0, n).reduce((a, x) => a + dE * (price - x), 0); }
  }
  const terms: CardTermReview[] = []; let fcRest = 0, realRest = real; const rest: string[] = [];
  for (const x of yr.terms) {
    if (measured[x.key] !== undefined) { terms.push({ key: x.key, fc: x.usd, real: measured[x.key]! }); realRest -= measured[x.key]!; } else { fcRest += x.usd; rest.push(x.key); }
  }
  if (rest.length > 0) terms.push({ key: 'rest', fc: fcRest, real: realRest, parts: rest });
  else if (Math.abs(realRest) > 1) terms.push({ key: 'rest', fc: 0, real: realRest, parts: [] });
  let moved = { key: terms[0]?.key ?? '', delta: 0 };
  for (const x of terms) if (Math.abs(x.real - x.fc) >= Math.abs(moved.delta)) moved = { key: x.key, delta: x.real - x.fc };
  const nz = (x: number): number => x + 0;   // never -0 (it does not survive JSON)
  for (const x of terms) { x.fc = nz(x.fc); x.real = nz(x.real); }
  moved.delta = nz(moved.delta);
  return { kind: d.kind, plant: d.plant, choice: d.choice, lapsed: d.lapsed, cardUSD: d.options[0]!.effectUSD, months: Number(d.vars.months ?? 12), fcUSD: nz(yr.effectUSD), fcMonths: yr.months, spreadUSD: yr.spreadUSD, within: Math.abs(real - yr.effectUSD) <= yr.spreadUSD, realisedUSD: nz(real), terms, moved, market, diff, taMonth: Number(d.vars.taMonth ?? -1) };
}
/** THE five-year score everywhere (ledger, ENDINGS, course line, Flagship test, end card, histogram): operating margin = revenue less operating cost, penalties and fines. Investments (catalyst, inspections, programmes) are not charged to it; they are judged by their payback. */
export const score = (c: Career): number => c.total.margin + (c.total.inv ?? 0);
/** The score the five years end at if the last 12 months (all of them before a year is done) repeat for the months still to run. */
export function pace(c: Career): number {
  if (c.m <= 0) return 0;
  const h = c.hist.slice(-12);
  return score(c) + (MONTHS - c.m) * (h.reduce((a, r) => a + r.margin, 0) / Math.max(1, h.length));
}
export function endingOf(c: Career): Ending {
  const last = c.years[c.years.length - 1];
  const avg = (k: 'victor' | 'noor' | 'mara'): number => c.years.reduce((a, y) => a + y[k], 0) / Math.max(1, c.years.length);
  const good = last !== undefined && avg('victor') >= 60 && avg('noor') >= 60 && avg('mara') >= 60;
  return score(c) >= CHIEF_MARGIN && c.criticals === 0 && c.strikes === 0 && good ? 'chief' : 'steady';
}


// ------------------------------------------------------------------------------------------------ the endings and the course towards them
export const CHIEF_SCORE = 60;
export const SOLD_FLOOR_USD = 1e7;
export type EndId = 'sold' | 'shut' | 'steady' | 'chief';
export interface EndNeed { key: string; have: number; need: number; met: boolean }
export interface EndRow { id: EndId; state: 'achieved' | 'course' | 'open' | 'danger' | 'closed'; needs: EndNeed[] }
export interface Outlook { course: EndId; rows: EndRow[]; /** five-year operating margin if the last twelve months repeat, USD */ proj: number; /** concrete levers with numbers (see `levers`) */ levers: Lever[]; /** Chief Engineer needs still unmet (keys of rows[chief].needs) */ gaps: string[]; /** true when a critical alarm or a strike has closed the flagship ending */ chiefClosed: boolean }
/** What an extra contract of `tpm` t/month does to the plant's capacity position: the plant's nominal output now, what is already contracted, the total with this one and the tonnes short when it is over. */
export interface Exposure { nominalT: number; contractedT: number; afterT: number; shortT: number; /** USD a month of penalty if the plant ran exactly at its nominal output */ penaltyUSD: number }
export function exposure(c: Career, p: PlantId, tpm: number, pen: number): Exposure {
  const nominalT = outputOf(c, p), contractedT = contracted(c, p), afterT = contractedT + tpm, shortT = Math.max(0, afterT - nominalT);
  return { nominalT, contractedT, afterT, shortT, penaltyUSD: shortT * pen };
}
/** What a turnaround of this plant in `month` costs the contracts: the plant is out `days` of that month, so it can ship only the rest; the tonnes short against the contracts still running, and their penalty. */
export function taShort(c: Career, p: PlantId, month: number, crane = 1, extraCrew = 0, daysOverride?: number): { days: number; shortT: number; penaltyUSD: number } {
  const days = Math.min(30, daysOverride ?? taOverlap(c, p, month, crane, extraCrew).days), ks = c.contracts.filter((k) => k.p === p && k.left > month - c.m);
  const need_ = ks.reduce((a, k) => a + k.tpm, 0), can = outputOf(c, p) * (1 - days / 30), deliver = Math.min(can, need_);
  let pen = 0;
  for (const k of ks) pen += Math.max(0, k.tpm - (need_ > 0 ? (k.tpm / need_) * deliver : 0)) * k.pen;
  return { days, shortT: Math.max(0, need_ - can), penaltyUSD: pen };
}
export interface Lever { key: 'gap' | 'turnaround' | 'contract' | 'inspect'; vars: Record<string, number | string> }
const unitMargin = (c: Career, p: PlantId): number => c.prices[p] - DEFS[p].varUSD - DEFS[p].gasGJ * gasMul(c, p) * c.gas;
/** USD a turnaround would add to this plant over `months` months (a year unless the game ends sooner), as its two terms: `gross` (catalyst and exchanger back to new: more output and less gas) and `outage` (the contribution lost while the plant is out). The catalyst is taken at `catAt` if it is still above it. */
export function renewalParts(c: Career, p: PlantId, catAt = 1, months = 12): { gross: number; outage: number } {
  const x = c.plants[p], d = DEFS[p], cat = Math.min(x.cat, catAt), keep = 1 - 0.15 * x.wear;
  const dOut = d.cap * x.rate * 0.6 * (1 - cat) * keep, out = outputOf(c, p);
  const um = unitMargin(c, p), mulNow = ((1 + 0.5 * (1 - x.U)) / (0.6 + 0.4 * cat)) * (1 - 0.07 * c.invest.heat), mulNew = 1 - 0.07 * c.invest.heat;
  const gas = out * d.gasGJ * (mulNow - mulNew) * c.gas;
  return { gross: months * dOut * Math.max(0, um) + months * Math.max(0, gas), outage: (taDays(true, 1, 0) / 30) * out * Math.max(0, um) };
}
/** USD a year a turnaround would add to this plant, net of its outage (gross less outage of `renewalParts`). */
export function renewalGain(c: Career, p: PlantId, catAt = 1): number { const r = renewalParts(c, p, catAt); return r.gross - r.outage; }
/** Where the capacity of a plant stands against what is contracted: tonnes a month the plant can make at its present state and rate, and the exposure with an extra contract of `extra` t/month. */
export const capacityT = (c: Career, p: PlantId): number => outputOf(c, p);
/** Concrete levers toward the flagship, each with its number. Pure. */
export function levers(c: Career, proj: number): Lever[] {
  const out: Lever[] = [];
  const left = Math.max(1, MONTHS - c.m);
  if (c.m > 0 && proj < CHIEF_MARGIN) out.push({ key: 'gap', vars: { gap: Math.round((CHIEF_MARGIN - proj) / 1e5) / 10, perYear: Math.round(((CHIEF_MARGIN - proj) / left) * 12 / 1e5) / 10, left } });
  // ONE number for the turnaround: the lever is the BOOK line (`taWeigh`) at the month the board suggests: output and gas back to new + incidents avoided - outage, penalty, hire and overlap
  let best: { p: PlantId; g: number; m: number } | null = null;
  for (const p of PLANTS) if (c.plants[p].ta < 0 && renewalGain(c, p) > 2e5) { const m = suggestTaMonth(c, p), g = taWeigh(c, p, m).netUSD; if (g > 2e5 && (best === null || g > best.g)) best = { p, g, m }; }
  if (best !== null && c.m < MONTHS - 8) {
    const w = taWeigh(c, best.p, best.m), f = (v: number): string => (v / 1e6).toFixed(2);
    out.push({ key: 'turnaround', vars: { plant: best.p, month: best.m + 1, cat: Math.round(c.plants[best.p].cat * 100), u: Math.round(c.plants[best.p].U * 100), gross: f(w.gainUSD), incident: f(w.saveUSD), cost: f(w.bookUSD), outage: f(w.outageUSD), gain: f(w.netUSD), net: w.netUSD, months: w.months } });
  }
  let bo: { id: number; p: PlantId; g: number; prem: number; tpm: number } | null = null;
  for (const o of c.offers) {
    const prem = o.price / c.prices[o.p] - 1, g = (o.price - c.prices[o.p]) * o.tpm * 12;
    if (prem > 0.03 && contracted(c, o.p) + o.tpm <= capacityT(c, o.p) && (bo === null || g > bo.g)) bo = { id: o.id, p: o.p, g, prem, tpm: o.tpm };
  }
  if (bo !== null) out.push({ key: 'contract', vars: { id: bo.id, plant: bo.p, tpm: Math.round(bo.tpm / 100) / 10, prem: Math.round(bo.prem * 100), gain: Math.round(bo.g / 1e5) / 10 } });
  const due = PLANTS.filter((p) => c.plants[p].insp >= INSPECT_EVERY - INSPECT_WARN && c.plants[p].ta !== c.m && !warnHandled(c, 'insp', p));
  if (due.length > 0) out.push({ key: 'inspect', vars: { plant: due[0]!, left: Math.max(0, INSPECT_EVERY - c.plants[due[0]!].insp) } });
  return out;
}
/** Where this Works is heading and what each ending needs. Pure; read by the year review and the board strip. A score need is not judged before the first review (have = -1). */
export function outlook(c: Career): Outlook {
  const n = c.years.length, avg = (k: 'victor' | 'noor' | 'mara'): number => (n > 0 ? c.years.reduce((a, y) => a + y[k], 0) / n : -1);
  const proj = pace(c);
  const N = (key: string, have: number, need: number, met: boolean): EndNeed => ({ key, have, need, met });
  const chiefNeeds = [
    N('margin', proj, CHIEF_MARGIN, proj >= CHIEF_MARGIN), N('criticals', c.criticals, 0, c.criticals === 0), N('strikes', c.strikes, 0, c.strikes === 0),
    ...(['victor', 'noor', 'mara'] as const).map((k) => N(k, avg(k), CHIEF_SCORE, n === 0 || avg(k) >= CHIEF_SCORE)),
  ];
  const steadyNeeds = [N('tenure', c.m, MONTHS, c.m >= MONTHS), N('cash', c.cash, 0, c.cash >= 0), N('strikes_max', c.strikes, STRIKES_MAX, c.strikes < STRIKES_MAX)];
  const soldNeeds = [N('loss_years', c.lossYears, 2, c.lossYears >= 2), N('cash_floor', c.cash, LENDERS_FLOOR, c.cash < LENDERS_FLOOR)];
  const shutNeeds = [N('strikes_max', c.strikes, STRIKES_MAX, c.strikes >= STRIKES_MAX)];
  const chiefClosed = c.criticals > 0 || c.strikes > 0;
  const gaps = chiefNeeds.filter((x) => !x.met).map((x) => x.key);
  let course: EndId = gaps.length === 0 ? 'chief' : 'steady';
  if (c.cash < SOLD_FLOOR_USD || c.lossYears >= 1) course = 'sold';
  if (c.strikes >= STRIKES_MAX - 1 || c.criticals >= STRIKES_MAX - 1) course = 'shut';
  if (c.ending !== '') course = c.ending;
  const row = (id: EndId, needs: EndNeed[]): EndRow => {
    const done = c.ending === id, over = c.ending !== '' && !done;
    const state = done ? 'achieved' : over ? 'closed' : id === course ? (id === 'sold' || id === 'shut' ? 'danger' : 'course') : id === 'chief' && chiefClosed ? 'closed' : 'open';
    return { id, state, needs };
  };
  return { course, rows: [row('sold', soldNeeds), row('shut', shutNeeds), row('steady', steadyNeeds), row('chief', chiefNeeds)], proj, levers: levers(c, proj), gaps, chiefClosed };
}

// ------------------------------------------------------------------------------------------------ the year end, seen coming: emissions against the cap, and the ending a year end would bring
/** The emissions warning opens this many months before the year-end check (the check is at the end of month 12 of the year). */
export const EM_WARN_MONTHS = 6;
/** The ending warning stops a multi-month run this many months before the year end that would end the career. */
export const END_STOP_MONTHS = 3;
/** Year-end emissions (t) projected from the Works as it stands: the plants aged month by month (catalyst, exchanger and compressor wear as `stepMonth` ages them), booked turnarounds and the outage days still to run included,
 * every rate multiplied by `scale`, `extraAbate` more abatement levels. No events: the run rate, not a forecast of luck. */
export function emProject(c: Career, scale = 1, extraAbate = 0): number {
  const toCheck = 12 - (c.m % 12), abate = Math.min(3, c.invest.abate + extraAbate);
  const st = {} as Record<PlantId, { cat: number; U: number; wear: number; down: number }>;
  for (const p of PLANTS) { const x = c.plants[p]; st[p] = { cat: x.cat, U: x.U, wear: x.wear, down: x.down }; }
  let em = c.ytd.em;
  for (let k = 0; k < toCheck; k++) {
    const mo = c.m + k, taNow = PLANTS.filter((q) => c.plants[q].ta === mo), gd = taNow.length > 0 ? taGroupDays(taNow.map((q) => bookOf(c, q))) : {};
    for (const p of PLANTS) {
      const x = c.plants[p], d = DEFS[p], s = st[p], rate = Math.max(RATE_MIN, Math.min(RATE_MAX, x.rate * scale));
      if (x.ta === mo) { s.down += gd[p]!; s.U = 1; s.wear = 0; if (x.stock === 1) s.cat = 1; }
      const days = Math.min(30, s.down); s.down -= days;
      const o = d.cap * (1 + (c.boost?.[p] ?? 0)) * rate * (0.4 + 0.6 * s.cat) * (1 - 0.15 * s.wear) * (1 - days / 30);
      const mul = ((1 + 0.5 * (1 - s.U)) / (0.6 + 0.4 * s.cat)) * (1 - 0.07 * c.invest.heat);
      em += (o * d.gasGJ * mul * GJ_CO2 + o * d.proc) * (1 - 0.12 * abate);
      s.cat = Math.max(0.2, s.cat * (1 - d.decay * rate * (x.ta === mo && x.stock === 1 ? (c.eco?.[p] === true ? ECO_DECAY : 1) : (x.gm ?? 1)))); s.U = Math.max(0.5, s.U - d.foul * rate); s.wear = Math.min(1, s.wear + d.wear * rate * rate);
    }
  }
  return em;
}
export interface EmWarn { /** the projected year-end emissions (t) and the cap (t) */ projT: number; capT: number; ratio: number; /** months to the year-end check */ toCheck: number; /** the rate each plant would have to run at from now on to end at 98 % of the cap (floored at the minimum rate) */ rates: Record<PlantId, number>; /** the same, as one scale factor on every rate */ scale: number; /** true when even the lowest rates would not be enough */ short: boolean; /** abatement: the next level's price (USD, 0 when finished) and the t it would cut from here */ abateUSD: number; abateCutT: number; /** true when that next level alone brings the projection under the cap */ abateEnough: boolean }
/** Year-end emissions projected from the state of now. A projection over the cap is a regulator strike at the year end unless a lever is pulled: warned from EM_WARN_MONTHS ahead. Null when the projection is under the cap. */
export function emWarn(c: Career): EmWarn | null {
  if (c.ending !== '' || c.m >= MONTHS) return null;
  const toCheck = 12 - (c.m % 12);
  if (toCheck > EM_WARN_MONTHS) return null;
  const cap = emCap(c), projT = emProject(c), ratio = projT / cap;
  if (ratio <= 1) return null;
  let lo = 0, hi = 1;   // bisection on the one factor that scales every rate: the largest factor that still ends at 98 % of the cap
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (emProject(c, mid) <= 0.98 * cap) lo = mid; else hi = mid; }
  const rates = {} as Record<PlantId, number>; let short = false;
  for (const p of PLANTS) { const r = Math.floor(c.plants[p].rate * lo * 100) / 100; if (r < RATE_MIN) { short = true; rates[p] = RATE_MIN; } else rates[p] = r; }
  const cut = c.invest.abate < 3 ? projT - emProject(c, 1, 1) : 0;
  return { projT, capT: cap, ratio, toCheck, rates, scale: lo, short, abateUSD: c.invest.abate < 3 ? investCost(c, 'abate') : 0, abateCutT: cut, abateEnough: c.invest.abate < 3 && projT - cut <= cap };
}
export interface EndAhead { ending: 'sold' | 'shut'; why: 'loss' | 'cash' | 'strikes'; toCheck: number; /** month number of the year-end check (1-based) */ checkMonth: number; /** this year's projected operating margin, USD, and last year's */ yearOp: number; prevOp: number; prevYear: number; cashProj: number }
/** The ending the coming year end would bring if nothing changes: the board sells after a second losing year in a row (or cash under zero), the regulator shuts the site at the third strike. Projected from the last three months' run rate. */
export function endAhead(c: Career): EndAhead | null {
  if (c.ending !== '' || c.m >= MONTHS + 0 || c.m === 0) return null;
  const toCheck = 12 - (c.m % 12), h = c.hist.slice(-3), rate = h.length > 0 ? h.reduce((a, r) => a + r.margin, 0) / h.length : 0;
  const ew = emWarn(c), fine = ew !== null && ew.ratio > 1 ? EM_CAP_MONTHLY_USD * ((ew.ratio - 1) * 12 + 1) : 0;
  const yearOp = c.ytd.margin + (c.ytd.inv ?? 0) + toCheck * rate - fine, cashProj = c.cash + toCheck * rate - fine;
  const last = c.years[c.years.length - 1], base = { toCheck, checkMonth: c.m + toCheck, yearOp, prevOp: last?.opMargin ?? 0, prevYear: last?.year ?? 0, cashProj };
  if (c.lossYears >= 1 && yearOp < 0) return { ending: 'sold', why: 'loss', ...base };
  if (cashProj < 0) return { ending: 'sold', why: 'cash', ...base };
  if (c.strikes + (strikeAhead(c).length > 0 ? 1 : 0) + (ew !== null ? 1 : 0) >= STRIKES_MAX) return { ending: 'shut', why: 'strikes', ...base };
  return null;
}
/** Why a career ended, as data: the losing years in a row, the cash, or the strikes. */
export interface EndWhy { kind: 'loss' | 'cash' | 'strikes' | 'tenure'; years: { year: number; op: number }[] }
export function endWhy(c: Career): EndWhy {
  const loss: { year: number; op: number }[] = [];
  for (let i = c.years.length - 1; i >= 0 && c.years[i]!.opMargin < 0; i--) loss.unshift({ year: c.years[i]!.year, op: c.years[i]!.opMargin });
  if (c.ending === 'sold') return loss.length >= 2 ? { kind: 'loss', years: loss } : { kind: 'cash', years: loss };
  if (c.ending === 'shut') return { kind: 'strikes', years: [] };
  return { kind: 'tenure', years: [] };
}

/** Things that need the player's attention, as flags (the board lights them; a multi-month `advance` stops when a new one appears). */
export const INSPECT_WARN = 2;
export const CAT_WORN = 0.7;
export const U_FOULED = 0.75;
export function attention(c: Career): string[] {
  const out: string[] = [];
  for (const p of PLANTS) {
    const x = c.plants[p];
    if (x.insp >= INSPECT_EVERY - INSPECT_WARN) out.push(`insp:${p}`);
    if (x.cat < CAT_WORN) out.push(`cat:${p}`);
    if (x.U < U_FOULED) out.push(`foul:${p}`);
  }
  return out;
}
/** The inspection due month (1-based) of a plant: fixed while the plant is not inspected, however many months pass. */
export const inspDueMonth = (c: Career, p: PlantId): number => c.m + (INSPECT_EVERY - c.plants[p].insp) + 1;
/** The key of one warning: kind, plant and the episode (inspection: its due month; catalyst or exchanger: the turnaround count). An acknowledgement covers exactly one such key. */
export const warnKey = (c: Career, kind: string, p: PlantId): string => `${kind}:${p}:${kind === 'insp' ? inspDueMonth(c, p) : (c.plants[p].gen ?? 0)}`;
/** True when a booked turnaround already takes care of the warning before it can matter: it resets the inspection clock (if it comes before the plant is a strike: no more than INSPECT_STRIKE_OVER months past due, or before the coming year-end check), the exchanger, and the catalyst (when a charge is in stock). A plant already a month or two overdue is still covered by a turnaround booked soon: the card says OVERDUE, the strike warning stays off, and the run is not stopped for it again. */
export function warnHandled(c: Career, kind: string, p: PlantId): boolean {
  const x = c.plants[p];
  if (x.ta < c.m) return false;
  if (kind === 'insp') return x.insp + (x.ta - c.m) <= INSPECT_EVERY + INSPECT_STRIKE_OVER || x.ta < c.m + (12 - (c.m % 12));
  if (kind === 'cat') return x.stock === 1;
  return true;
}
/** The warnings that are lit, not handled by a booked turnaround and not yet acknowledged: what a multi-month run must not ride through. Keys as `warnKey`. */
export function openWarnings(c: Career): string[] {
  const acked = c.acked ?? [];
  const keys = attention(c).map((k) => k.split(':') as [string, PlantId]).filter(([kind, p]) => !warnHandled(c, kind, p)).map(([kind, p]) => warnKey(c, kind, p));
  // the year-end projections: emissions over the cap (a regulator strike) and an ending the year end would bring; each lights once per year and ending
  if (emWarn(c) !== null) keys.push(`em:all:${year(c)}`);
  const ea = endAhead(c);
  if (ea !== null && ea.toCheck <= END_STOP_MONTHS) keys.push(`end:all:${year(c)}:${ea.ending}`);
  return keys.filter((k) => !acked.includes(k));
}
/** Run up to `months` months. A multi-month run stops after the month in which an inspection comes within two months of due, a catalyst wears under 70 %, an exchanger fouls under 75 %, or the year ends (always at least one month);
 * it does not start while a warning is open (lit, not handled by a booked turnaround, not acknowledged one by one).
 * A pending yearly decision blocks every multi-month run; a single month always runs and lets the decision lapse to "do nothing". */
export function advance(c: Career, months: unknown = 1): number {
  alive(c);
  need(typeof months === 'number' && Number.isInteger(months) && months >= 1 && months <= 12, 'months');
  const pend = pendingDecision(c);
  need((months as number) === 1 || pend === null, 'decision');
  if (pend !== null) { pend.choice = 1; pend.lapsed = true; }
  c.why = null;
  const open = openWarnings(c);
  if ((months as number) > 1 && open.length > 0) { c.stopped = open; need(false, 'ack'); }
  c.stopped = [];
  let n = 0;
  while (n < (months as number) && c.ending === '') {
    stepMonth(c); n++;
    if (c.m % 12 === 0) break;
    const fresh = openWarnings(c);
    if ((months as number) > 1 && fresh.length > 0) { c.stopped = fresh; break; }
  }
  return n;
}
/** Acknowledge the warnings that are open now (each by its own key: plant, kind and due month); a warning that lights later is a new one and stops the run again. */
export function ackWarning(c: Career): void { alive(c); c.acked = [...(c.acked ?? []), ...openWarnings(c).filter((k) => !(c.acked ?? []).includes(k))]; c.stopped = []; }

/** One decision by name (the level actions call this); unknown names and refused decisions throw CareerError. */
export function decide(c: Career, name: string, ...a: unknown[]): void {
  switch (name) {
    case 'accept': return accept(c, a[0]);
    case 'decline': return decline(c, a[0]);
    case 'setRate': return setRate(c, a[0], a[1]);
    case 'inspect': return inspect(c, a[0]);
    case 'buyCatalyst': return buyCatalyst(c, a[0]);
    case 'turnaround': return turnaround(c, a[0], a[1], a[2], a[3]);
    case 'cancelTurnaround': return cancelTurnaround(c, a[0]);
    case 'hireCrew': return hireCrew(c);
    case 'invest': return doInvest(c, a[0]);
    case 'ackWarning': return ackWarning(c);
    case 'advance': advance(c, a[0]); return;
    case 'advanceToDecision': advanceToDecision(c); return;
    case 'answer': return answerDecision(c, a[0]);
    default: throw new CareerError('action');
  }
}

// ------------------------------------------------------------------------------------------------ investment payback preview (read by the view)
export interface InvestPreview { /** USD a month the next level saves at today's plant state (0 when its value is not cash). */ saveUSDPerMonth: number; /** Months to pay the price back from that saving; 0 when there is no cash payback. */ paybackMonths: number; /** heat: GJ a month saved; abate: tonnes of CO2 a year cut; safety: points of incident risk removed per plant. */ effect: number; /** heat only: USD a month the levels already bought are saving at today's plant state, and GJ a month */ realisedUSDPerMonth: number; realisedGJ: number }
export function previewInvest(c: Career, kind: 'heat' | 'abate' | 'safety'): InvestPreview {
  const price = investCost(c, kind), lvl = c.invest[kind];
  if (kind === 'heat') {
    let gasGJ = 0;
    for (const p of PLANTS) gasGJ += outputOf(c, p) * DEFS[p].gasGJ * gasMul(c, p);
    const keep = (1 - 0.07 * (lvl + 1)) / (1 - 0.07 * lvl), gj = gasGJ * (1 - keep), usd = gj * c.gas;
    const realGJ = lvl > 0 ? gasGJ * (1 / (1 - 0.07 * lvl) - 1) : 0;
    return { saveUSDPerMonth: usd, paybackMonths: usd > 0 ? price / usd : 0, effect: gj, realisedUSDPerMonth: realGJ * c.gas, realisedGJ: realGJ };
  }
  if (kind === 'abate') {
    let em = 0;
    for (const p of PLANTS) em += outputOf(c, p) * DEFS[p].gasGJ * gasMul(c, p) * GJ_CO2 + outputOf(c, p) * DEFS[p].proc;
    const keep = (1 - 0.12 * (lvl + 1)) / (1 - 0.12 * lvl);
    return { saveUSDPerMonth: 0, paybackMonths: 0, effect: em * 12 * (1 - keep), realisedUSDPerMonth: 0, realisedGJ: 0 };
  }
  let exp = 0;
  for (const p of PLANTS) {
    const r = riskOf(c, p), pr = (x: number): number => clamp((x - 0.35) * 0.6, 0, 0.9);
    exp += (pr(r) - pr(r - 0.08)) * (0.4 * CRIT_FINE_USD + 0.6 * MINOR_FINE_USD);
  }
  return { saveUSDPerMonth: exp, paybackMonths: exp > 0 ? price / exp : 0, effect: 8, realisedUSDPerMonth: 0, realisedGJ: 0 };
}


// ------------------------------------------------------------------------------------------------ one inspection state per plant, the alerts, and the cost of booking against the cost of waiting
export type InspState = { kind: 'locked' | 'ok' | 'due' | 'overdue'; /** months of the state: locked: months still locked; due: months to the due date; overdue: months past it */ n: number; /** month number (1-based) the inspection is or was due */ dueMonth: number; /** months until the overdue count passes INSPECT_STRIKE_OVER (a strike at the year end); 0 when already past */ strikeIn: number };
/** THE inspection state of a plant, a single one: locked (inspected under six months ago), ok, due (within two months), or overdue. Overdue by more than INSPECT_STRIKE_OVER months at a year end is a regulator strike. */
export function inspState(c: Career, p: PlantId): InspState {
  const x = c.plants[p], dueMonth = c.m + Math.max(0, INSPECT_EVERY - x.insp) + 1, od = overdue(c, p);
  if (od > 0) return { kind: 'overdue', n: od, dueMonth: c.m - od + 1, strikeIn: Math.max(0, INSPECT_STRIKE_OVER - od + 1) };
  if (x.insp >= INSPECT_EVERY - INSPECT_WARN) return { kind: 'due', n: INSPECT_EVERY - x.insp, dueMonth, strikeIn: 0 };
  if (x.insp < INSPECT_MIN_GAP) return { kind: 'locked', n: INSPECT_MIN_GAP - x.insp, dueMonth, strikeIn: 0 };
  return { kind: 'ok', n: INSPECT_EVERY - x.insp, dueMonth, strikeIn: 0 };
}
/** Expected cost of the incidents of one month at risk `r`: the chance of an incident times (a fine plus the outage days at `perDayUSD`), critical 40 % and minor 60 % of them. */
const incidentUSD = (r: number, perDayUSD: number): number => clamp((r - 0.35) * 0.6, 0, 0.9) * (0.4 * (CRIT_FINE_USD + CRIT_DOWN_D * perDayUSD) + 0.6 * (MINOR_FINE_USD + MINOR_DOWN_D * perDayUSD));
export const TA_HORIZON = 12;
export interface TaWeigh { /** cost of booking: outage lost contribution + contract penalty + crane and crew hire + the overlap with other booked turnarounds */ bookUSD: number; outageUSD: number; penaltyUSD: number; hireUSD: number; /** extra plant-days and USD an overlap with turnarounds booked the same month adds (the stretch of this outage and of theirs); 0 without overlap */ overlapDays: number; overlapUSD: number; /** expected incident cost over the horizon if the plant is not renewed / if it is */ skipUSD: number; afterUSD: number; saveUSD: number; /** a year of output and gas back to new (`renewalParts` gross): the same term the yearly card and the Endings lever count */ gainUSD: number; /** months of the game left to earn the benefits in: the horizon of the incident and gain terms, at most TA_HORIZON (a year), fewer at the end of the game */ months: number; /** months of output and gas back to new after the outage month, at most a year */ gainMonths: number; /** incidents avoided + output and gas back to new - bookUSD */ netUSD: number }
/** Booking a turnaround in `month` against not booking: what it costs now (outage, penalty, hire) and the expected incident cost it removes over the next TA_HORIZON months (risk grows with wear and fouling). */
export function taWeigh(c: Career, p: PlantId, month: number, crane = 1, extraCrew = 0): TaWeigh {
  const x = c.plants[p], d = DEFS[p], ov = taOverlap(c, p, month, crane, extraCrew), sh = taShort(c, p, month, crane, extraCrew, ov.days);
  const perDay = (outputOf(c, p) * Math.max(0, unitMargin(c, p))) / 30;
  // the part of the outage and penalty that exists only because another turnaround shares the crews and crane: this plant's own stretch, and the days (and penalties) it adds to the plants already booked
  const solo = taShort(c, p, month, crane, extraCrew, ov.solo);
  let overlapUSD = (sh.days - solo.days) * perDay + (sh.penaltyUSD - solo.penaltyUSD);
  for (const b of ov.bump) { const q = b.p, xq = c.plants[q], dq = taOverlap(c, q, month, xq.taCrane, xq.taCrew).days; overlapUSD += b.days * ((outputOf(c, q) * Math.max(0, unitMargin(c, q))) / 30) + (taShort(c, q, month, xq.taCrane, xq.taCrew, dq + b.days).penaltyUSD - taShort(c, q, month, xq.taCrane, xq.taCrew, dq).penaltyUSD); }
  const outageUSD = solo.days * perDay, hireUSD = (extraCrew > 0 ? TA_CREW_HIRE_USD : 0) + (crane > 1 ? TA_CRANE_HIRE_USD : 0), penaltyUSD = solo.penaltyUSD;
  const age = (j: number, from: { wear: number; U: number; insp: number }): { wear: number; U: number; insp: number; rate: number } =>
    ({ wear: Math.min(1, from.wear + d.wear * x.rate * x.rate * j), U: Math.max(0.5, from.U - d.foul * x.rate * j), insp: from.insp + j, rate: x.rate });
  const t = clamp(month - c.m, 0, TA_HORIZON - 1), H = clamp(MONTHS - c.m, 0, TA_HORIZON), gainMonths = clamp(MONTHS - 1 - month, 0, TA_HORIZON);
  let skipUSD = 0, afterUSD = 0;
  for (let j = 0; j < H; j++) {
    skipUSD += incidentUSD(riskAt(c, age(j, x)), perDay);
    afterUSD += incidentUSD(riskAt(c, j < t ? age(j, x) : age(j - t, { wear: 0, U: 1, insp: 0 })), perDay);
  }
  const bookUSD = outageUSD + penaltyUSD + hireUSD + overlapUSD, saveUSD = skipUSD - afterUSD, gainUSD = renewalParts(c, p, 1, gainMonths).gross;
  return { bookUSD, outageUSD, penaltyUSD, hireUSD, overlapDays: ov.extraDays, overlapUSD, skipUSD, afterUSD, saveUSD, gainUSD, months: H, gainMonths, netUSD: saveUSD + gainUSD - bookUSD };
}
/** Alerts the office shows at the top: an inspection due or overdue, a worn catalyst, a fouled exchanger. Each names its plant (the board jumps to its card). */
export interface Alert { kind: 'insp' | 'cat' | 'foul'; plant: PlantId }
export function alerts(c: Career): Alert[] {
  return attention(c).map((k) => { const [kind, plant] = k.split(':') as [Alert['kind'], PlantId]; return { kind, plant }; });
}

/** A plant whose inspection will be a regulator strike at the coming year end unless it is done (or a turnaround books it) first: the board says so ahead of time. */
export interface StrikeAhead { plant: PlantId; /** months past due the plant will be at the year end if nothing is done */ over: number; dueMonth: number; /** month number of the year-end check */ checkMonth: number; /** the strike this would be (1-based) */ strikeNo: number }
export function strikeAhead(c: Career): StrikeAhead[] {
  if (c.ending !== '') return [];
  const toCheck = 12 - (c.m % 12), out: StrikeAhead[] = [];
  for (const p of PLANTS) {
    const x = c.plants[p], proj = x.insp + toCheck - INSPECT_EVERY;
    if (proj <= INSPECT_STRIKE_OVER || (x.ta >= c.m && x.ta < c.m + toCheck)) continue;   // a strike needs MORE than INSPECT_STRIKE_OVER months overdue at the year-end check
    out.push({ plant: p, over: proj, dueMonth: inspDueMonth(c, p), checkMonth: c.m + toCheck, strikeNo: c.strikes + 1 });
  }
  return out;
}
/** What signing an offer does to a plant that has a turnaround booked inside the contract term: the plant is out for days that month, so it ships less than the contracts (this one included) ask; the tonnes short and the penalty this contract adds. */
export function offerTaShort(c: Career, o: Offer): { month: number; days: number; shortT: number; penaltyUSD: number } | null {
  const x = c.plants[o.p];
  if (x.ta < c.m || x.ta - c.m >= o.term) return null;
  const month = x.ta, days = Math.min(30, taOverlap(c, o.p, month, x.taCrane, x.taCrew).days), ks = [...c.contracts.filter((k) => k.p === o.p && k.left > month - c.m), { tpm: o.tpm, pen: o.pen }];
  const base = taShort(c, o.p, month, x.taCrane, x.taCrew), need_ = ks.reduce((a, k) => a + k.tpm, 0), can = outputOf(c, o.p) * (1 - days / 30), deliver = Math.min(can, need_);
  let pen = 0;
  for (const k of ks) pen += Math.max(0, k.tpm - (need_ > 0 ? (k.tpm / need_) * deliver : 0)) * k.pen;
  const shortT = Math.max(0, need_ - can);
  return shortT > 1 ? { month, days, shortT, penaltyUSD: Math.max(0, pen - base.penaltyUSD) } : null;
}


// ------------------------------------------------------------------------------------------------ the yearly decision
// One decision a year, drawn from a pool of four (rotated from the seed so all four kinds come up), each with two options and an expected effect in USD computed from the engine's own formulas on a no-noise forecast of
// the gas and price walk (the same mean reversion `stepMonth` applies). Option 0 acts, option 1 is the status quo ("do nothing"), which a lapsed decision takes.
export type DecKind = 'contract' | 'turnaround' | 'debottleneck' | 'hedge' | 'catgrade' | 'crew';
export const DEC_KINDS: readonly DecKind[] = ['contract', 'turnaround', 'debottleneck', 'hedge', 'catgrade', 'crew'];
/** One term of an option's expected effect (USD, signed): the terms of an option add up to its `effectUSD` exactly. */
export interface DecTerm { key: string; usd: number }
export interface DecOption { id: 'a' | 'b'; /** expected effect against doing nothing, USD over `YearDecision.vars.months`: the sum of `terms` */ effectUSD: number; /** what the effect is made of, each in USD, summing to `effectUSD` */ terms: DecTerm[]; /** cash paid now */ costUSD: number; vars: Record<string, number | string> }
/** Option A's forecast over the first `months` months (at most twelve: the year to the next review), by term, and the uncertainty the card states on it (USD); `aux` carries what the review needs to measure the terms (market average expected, tonnes). */
export interface DecYear { months: number; effectUSD: number; terms: DecTerm[]; spreadUSD: number; exp: number; aux: Record<string, number> }
export interface YearDecision { year: number; m: number; kind: DecKind; plant: PlantId | ''; options: DecOption[]; /** index of the option with the better expected effect (the careful pick) */ best: number; vars: Record<string, number | string>; /** -1 pending, else the option taken */ choice: number; lapsed: boolean; /** the forecast of option A cut to the year the review looks at, with the card's stated uncertainty (absent in older saves) */ yr?: DecYear }
export interface StopWhy { kind: string; plant: string; n: number; /** the event of the month the run stopped in (code, plant), so the stop can name what happened */ ev?: string; evPlant?: string }
/** Victor recommends acting (option A) only when A's expected effect beats doing nothing by more than this: the forecast is a no-noise mean, so a sliver of expected gain does not pay for the risk of being wrong. */
export const DEC_ACT_MARGIN = 3e5;
export const DEC_CONTRACT_DISCOUNT = 0.03, DEC_CONTRACT_TERM = 18, DEC_CONTRACT_FRAC = 0.2, DEC_BOOST = 0.08, DEC_BOOST_PAYBACK_YEARS = 1.7, DEC_BOOST_HORIZON = 24, DEC_HEDGE_MARGIN = 0.05, DEC_HEDGE_STRESS_GAS = 12, DEC_TA_LEAD = 2, DEC_EM_SAFE = 0.97;
export const pendingDecision = (c: Career): YearDecision | null => { const d = (c.decisions ?? [])[(c.decisions ?? []).length - 1]; return d !== undefined && d.choice === -1 ? d : null; };

interface Fcst { gas: number[]; price: Record<PlantId, number[]>; /** mean multiplier the fuel-price event puts on the gas price a month */ evGas: number }
/** The expected walk of gas and spot prices for `h` months from now (no noise): the engine's own mean reversion. */
function forecast(c: Career, h: number): Fcst {
  const types = Object.keys(EVENTS) as EventType[], total = types.reduce((a, t) => a + EVENTS[t].weight, 0), g = c.mode === 'learner' ? LEARNER_GENTLE : 1;
  const evGas = 1 + 0.5 * (EVENTS.fuel_price.weight / total) * 0.8 * g;
  let gas = c.gas; const price = { ...c.prices }; const out: Fcst = { gas: [], price: { nh3: [], acid: [], meoh: [], etoh: [] }, evGas };
  for (let k = 0; k < h; k++) {
    out.gas.push(gas); for (const p of PLANTS) out.price[p].push(price[p]);
    gas = clamp(gas + 0.2 * (GAS0 - gas), 2.5, 16);
    for (const p of PLANTS) { const d = DEFS[p]; price[p] = Math.max(0.4 * d.price0, price[p] + 0.15 * (d.price0 * (1 + d.gasCoupling * (gas - GAS0) / GAS0) - price[p])); }
  }
  return out;
}
const gasUseGJ = (c: Career): number => PLANTS.reduce((a, p) => a + outputOf(c, p) * DEFS[p].gasGJ * gasMul(c, p), 0);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x / 1e4) / 100;
const sumTerms = (t: DecTerm[]): number => t.reduce((a, x) => a + x.usd, 0);
/** An option whose effect IS the sum of its terms. */
const mkOpt = (id: 'a' | 'b', terms: DecTerm[], costUSD: number, vars: Record<string, number | string>): DecOption => ({ id, effectUSD: sumTerms(terms), terms, costUSD, vars });
/** The review horizon of a card: it is looked at again at the next year end, so at most twelve months of its forecast can be shown. */
export const DEC_YEAR = 12;
/** A card's forecast cut to the review's year, with the uncertainty stated for it. */
const yearOf = (months: number, terms: DecTerm[], spreadUSD: number, exp = 0, aux: Record<string, number> = {}): DecYear => ({ months, effectUSD: sumTerms(terms), terms, spreadUSD, exp, aux });
/** Half the size of the terms a no-noise forecast is made of (at least 1 MUSD): events, outages and the market make a card's realised effect wander by about that much. */
const halfTerms = (terms: DecTerm[]): number => Math.max(1e6, 0.5 * terms.reduce((a, x) => a + Math.abs(x.usd), 0));
/** Two standard deviations (USD) of the gas bill over `h` months against its own forecast: the gas walk (mean reversion 0.2, shock 0.8 a month) and the fuel-price event, for a burn of `gj` GJ a month. */
export function gasSpread(c: Career, gj: number, h: number, gasMean: number): number {
  const g = c.mode === 'learner' ? LEARNER_GENTLE : 1, total = (Object.keys(EVENTS) as EventType[]).reduce((a, t) => a + EVENTS[t].weight, 0), pe = 0.5 * (EVENTS.fuel_price.weight / total);
  let v = 0;
  for (let j = 1; j < h; j++) { let a = 0; for (let k = j; k < h; k++) { let r = 1; for (let i = 0; i < k - j; i++) r *= 0.8; a += 0.8 * r; } v += a * a; }
  v += h * pe * (1 - pe) * (0.8 * g * gasMean) * (0.8 * g * gasMean);
  return 2 * gj * Math.sqrt(v);
}
/** Two standard deviations (USD) of the fixed-price term of a contract of `tpm` t/month over `h` months: the spot walk (reversion 0.15, shock 4 % of the mean price a month, plus its gas coupling), every month treated as moving together. */
export function spotSpread(p: PlantId, tpm: number, h: number): number {
  const d = DEFS[p]; let sum = 0, v = 0;
  for (let k = 0; k < h; k++) { sum += Math.sqrt(v + (d.gasCoupling * 1.3 / GAS0 * d.price0) * (d.gasCoupling * 1.3 / GAS0 * d.price0) * Math.min(1, k / 6)); v = v * 0.85 * 0.85 + (0.04 * d.price0) * (0.04 * d.price0); }
  return 2 * tpm * sum;
}

function contractDecision(c: Career, p: PlantId): YearDecision | null {
  const d = DEFS[p], o = outputOf(c, p), tpm = Math.round((d.cap * DEC_CONTRACT_FRAC) / 100) * 100, have = contracted(c, p);
  if (have + tpm > o * 0.9 || c.contracts.length >= 12) return null;
  const price = Math.round(c.prices[p] * (1 - DEC_CONTRACT_DISCOUNT)), term = Math.min(DEC_CONTRACT_TERM, MONTHS - c.m), pen = Math.round(price * 1.6);
  if (term < 6) return null;
  const f = forecast(c, term);
  // the effect on the Works, term by term: the fixed price against spot on the contracted tonnes; what the spot tonnes left over fetch (selling fewer of them lifts their price); the penalty on tonnes the plant cannot deliver
  let tPrice = 0, tDepth = 0, tPen = 0, yPrice = 0, yDepth = 0, yPen = 0, ySpot = 0;
  const yMonths = Math.min(term, DEC_YEAR), free0 = Math.max(0, o - have), dE0 = Math.min(tpm, free0);
  for (let k = 0; k < term; k++) {
    const s = f.price[p][k]!, free = Math.max(0, o - have), dE = Math.min(tpm, free), spotBefore = free * s * (1 - 0.15 * (free / d.cap)), spotAfter = (free - dE) * s * (1 - 0.15 * ((free - dE) / d.cap));
    const a = dE * (price - s), b = dE * s + spotAfter - spotBefore, e = -Math.max(0, have + tpm - o) * pen;
    tPrice += a; tDepth += b; tPen += e;
    if (k < yMonths) { yPrice += a; yDepth += b; yPen += e; ySpot += s; }
  }
  const terms: DecTerm[] = [{ key: 'price', usd: tPrice }, { key: 'depth', usd: tDepth }, { key: 'penalty', usd: tPen }];
  const yr = yearOf(yMonths, [{ key: 'price', usd: yPrice }, { key: 'depth', usd: yDepth }, { key: 'penalty', usd: yPen }], spotSpread(p, dE0, yMonths) + 0.9 * tpm * pen, ySpot / yMonths, { dE: dE0 });
  const avgSpot = f.price[p].reduce((a, x) => a + x, 0) / term, mean = d.price0;
  const vars = { plant: p, tpm, price, spot: Math.round(c.prices[p]), term, months: term, expSpot: Math.round(avgSpot), pen, mean };
  return { year: 0, m: 0, kind: 'contract', plant: p, vars, best: 0, choice: -1, lapsed: false, yr, options: [mkOpt('a', terms, 0, { price, tpm, term }), mkOpt('b', [], 0, { spot: Math.round(c.prices[p]), expSpot: Math.round(avgSpot) })] };
}
function turnaroundDecision(c: Career): YearDecision | null {
  if (c.m > MONTHS - 12) return null;
  let best: { p: PlantId; terms: DecTerm[]; w: TaWeigh; cat: number; gr: { gross: number; outage: number }; m: number } | null = null;
  for (const p of PLANTS) {
    const x = c.plants[p]; if (x.ta >= 0) continue;
    const tm = suggestTaMonth(c, p, c.m + DEC_TA_LEAD), w = taWeigh(c, p, tm), cat = x.stock === 0 ? catPrice(c, p) : 0, gr = renewalParts(c, p);
    // incident cost removed + a year of output and gas back to new - the outage - contract penalty - hire - the catalyst charge
    const terms: DecTerm[] = [{ key: 'incident', usd: w.saveUSD }, { key: 'gain', usd: w.gainUSD }, { key: 'outage', usd: -gr.outage }, { key: 'penalty', usd: -w.penaltyUSD }, { key: 'overlap', usd: -w.overlapUSD }, { key: 'hire', usd: -w.hireUSD }, { key: 'catalyst', usd: -cat }];
    if (best === null || sumTerms(terms) > sumTerms(best.terms)) best = { p, terms, w, cat, gr, m: tm };
  }
  if (best === null) return null;
  const { p, w, gr } = best, x = c.plants[p], days = taDays(true, 1, 0);
  const vars = { plant: p, month: best.m + 1, taMonth: best.m, shifted: best.m > c.m + DEC_TA_LEAD ? 1 : 0, days, cat: Math.round(x.cat * 100), u: Math.round(x.U * 100), months: 12 };
  return { year: 0, m: 0, kind: 'turnaround', plant: p, vars, best: 0, choice: -1, lapsed: false, yr: yearOf(12, best.terms, halfTerms(best.terms)), options: [
    mkOpt('a', best.terms, best.cat, { skip: r2(w.skipUSD), after: r2(w.afterUSD), outage: r2(gr.outage), pen: r2(w.penaltyUSD), cat: r2(best.cat) }),
    mkOpt('b', [], 0, { risk: Math.round(riskOf(c, p) * 100) })] };
}
/** CO2 a year (t) at the present state, with every plant taken at no less than 95 % of nameplate (the rate a careful player settles at), and with `extraP` taking the extra capacity `x`. */
function emissionsYear(c: Career, extraP: PlantId | '' = '', x = 0): number {
  let em = 0;
  for (const p of PLANTS) {
    const d = DEFS[p], scale = Math.max(1, 0.95 / c.plants[p].rate) * (p === extraP ? 1 + x / (1 + (c.boost?.[p] ?? 0)) : 1), o = outputOf(c, p) * scale;
    em += (o * d.gasGJ * gasMul(c, p) * GJ_CO2 + o * d.proc) * (1 - 0.12 * c.invest.abate);
  }
  return em * 12;
}
function debottleneckDecision(c: Career): YearDecision | null {
  const h = Math.min(DEC_BOOST_HORIZON, MONTHS - c.m);
  if (h < 6) return null;
  let p: PlantId | null = null, bestM = -1;
  for (const q of PLANTS) { const um = DEFS[q].price0 - DEFS[q].varUSD - DEFS[q].gasGJ * GAS0, v = outputOf(c, q) * um; if (v > bestM) { bestM = v; p = q; } }
  const q = p!, d = DEFS[q], dO = (outputOf(c, q) / (1 + (c.boost?.[q] ?? 0))) * DEC_BOOST, refUm = d.price0 - d.varUSD - d.gasGJ * GAS0;
  const cost = Math.round((DEC_BOOST_PAYBACK_YEARS * 12 * d.cap * DEC_BOOST * 0.9 * refUm) / 1e5) * 1e5, f = forecast(c, h);
  let gain = 0, yGain = 0;
  for (let k = 0; k < h; k++) { const g1 = dO * (f.price[q][k]! - d.varUSD - d.gasGJ * gasMul(c, q) * f.gas[k]! * f.evGas); gain += g1; if (k < DEC_YEAR) yGain += g1; }
  // the extra tonnes emit: the card states the emissions against the cap, and a plant pushed over it risks the year-end fine and a regulator strike
  const em0 = emissionsYear(c), em1 = emissionsYear(c, q, DEC_BOOST), cap = emCap(c), ratio = em1 / cap;
  const fine = ratio > DEC_EM_SAFE ? EM_CAP_MONTHLY_USD * (Math.max(0, ratio - 1) * 12 + 1) : 0;
  const perYear = (gain / h) * 12, vars = { plant: q, pct: Math.round(DEC_BOOST * 100), dT: Math.round(dO), months: h, perYear: r1(perYear / 1e6), price: r1(cost / 1e6), dEm: Math.round((em1 - em0) / 1000), ratio: Math.round(ratio * 100), safe: Math.round(DEC_EM_SAFE * 100), fine: r1(fine / 1e6) };
  const yTerms: DecTerm[] = [{ key: 'gain', usd: yGain }, { key: 'build', usd: -cost }, { key: 'fine', usd: -fine }];
  return { year: 0, m: 0, kind: 'debottleneck', plant: q, vars, best: 0, choice: -1, lapsed: false, yr: yearOf(Math.min(h, DEC_YEAR), yTerms, halfTerms(yTerms)), options: [mkOpt('a', [{ key: 'gain', usd: gain }, { key: 'build', usd: -cost }, { key: 'fine', usd: -fine }], cost, { gain: r1(gain / 1e6), price: r1(cost / 1e6), fine: r1(fine / 1e6) }), mkOpt('b', [], 0, {})] };
}
function hedgeDecision(c: Career): YearDecision | null {
  const h = Math.min(12, MONTHS - c.m);
  if (h < 3) return null;
  const strike = Math.round(c.gas * (1 + DEC_HEDGE_MARGIN) * 100) / 100, f = forecast(c, h), gj = gasUseGJ(c);
  let eff = 0, stress = 0;
  for (let k = 0; k < h; k++) { eff += gj * (f.gas[k]! * f.evGas - strike); stress += gj * (DEC_HEDGE_STRESS_GAS - strike); }
  const avg = (f.gas.reduce((a, x) => a + x, 0) / h) * f.evGas, vars = { price: strike, gas: Math.round(c.gas * 100) / 100, expGas: Math.round(avg * 100) / 100, gj: Math.round(gj / 1000), months: h, stress: r1(stress / 1e6), stressGas: DEC_HEDGE_STRESS_GAS };
  return { year: 0, m: 0, kind: 'hedge', plant: '', vars, best: 0, choice: -1, lapsed: false, yr: yearOf(h, [{ key: 'gas', usd: eff }], gasSpread(c, gj, h, avg), avg), options: [mkOpt('a', [{ key: 'gas', usd: eff }], 0, { price: strike, stress: r1(stress / 1e6) }), mkOpt('b', [], 0, { gas: Math.round(c.gas * 100) / 100, expGas: Math.round(avg * 100) / 100 })] };
}
/** Economy catalyst grade: half the price of every charge, but it decays faster. Effect over the horizon: the saving on the next charge against the output and gas the faster decay costs on the forecast walk. */
function catgradeDecision(c: Career): YearDecision | null {
  const h = Math.min(DEC_BOOST_HORIZON, MONTHS - c.m);
  if (h < 12) return null;
  const f = forecast(c, h);
  let best: { p: PlantId; terms: DecTerm[]; yTerms: DecTerm[] } | null = null;
  for (const p of PLANTS) {
    if (c.eco?.[p] === true) continue;
    const x = c.plants[p], d = DEFS[p], heat = 1 - 0.07 * c.invest.heat;
    const margin = (cat: number, k: number): number => d.cap * (1 + (c.boost?.[p] ?? 0)) * x.rate * (0.4 + 0.6 * cat) * (f.price[p][k]! - d.varUSD - d.gasGJ * (heat / (0.6 + 0.4 * cat)) * f.gas[k]! * f.evGas);
    let loss = 0, yLoss = 0, cs = 1, ce = 1;
    for (let k = DEC_TA_LEAD; k < h; k++) { const l1 = margin(cs, k) - margin(ce, k); loss += l1; if (k < DEC_YEAR) yLoss += l1; cs *= 1 - d.decay * x.rate; ce *= 1 - d.decay * x.rate * ECO_DECAY; }
    const terms: DecTerm[] = [{ key: 'saving', usd: d.catUSD * (1 - ECO_PRICE) }, { key: 'loss', usd: -loss }];
    if (best === null || sumTerms(terms) > sumTerms(best.terms)) best = { p, terms, yTerms: [{ key: 'saving', usd: d.catUSD * (1 - ECO_PRICE) }, { key: 'loss', usd: -yLoss }] };
  }
  if (best === null) return null;
  const { p, terms } = best, d = DEFS[p];
  const vars = { plant: p, price: r2(d.catUSD), eco: r2(d.catUSD * ECO_PRICE), pct: Math.round((1 - ECO_PRICE) * 100), decay: Math.round((ECO_DECAY - 1) * 100), months: h, save: r2(terms[0]!.usd), loss: r2(-terms[1]!.usd) };
  return { year: 0, m: 0, kind: 'catgrade', plant: p, vars, best: 0, choice: -1, lapsed: false, yr: yearOf(Math.min(h, DEC_YEAR), best.yTerms, halfTerms(best.yTerms)), options: [mkOpt('a', terms, 0, { eco: vars.eco, save: vars.save, loss: vars.loss }), mkOpt('b', [], 0, { price: vars.price })] };
}
/** A worn plant's turnaround, booked either way: with contractors (a second crane and four extra hands, hired) or with the Works' own crew and one crane. Option A's effect is the outage and penalty it saves less the hire; B is the baseline. */
function crewDecision(c: Career): YearDecision | null {
  if (c.m > MONTHS - 12) return null;
  let best: { p: PlantId; terms: DecTerm[]; days: [number, number]; month: number } | null = null;
  for (const p of PLANTS) {
    const x = c.plants[p];
    if (x.ta >= 0 || (x.cat >= 0.8 && x.U >= 0.85)) continue;
    const month = suggestTaMonth(c, p, c.m + DEC_TA_LEAD);
    const wa = taWeigh(c, p, month, 2, CREW_STEP), wb = taWeigh(c, p, month, 1, 0);
    const terms: DecTerm[] = [{ key: 'outage', usd: wb.outageUSD - wa.outageUSD }, { key: 'penalty', usd: wb.penaltyUSD - wa.penaltyUSD }, { key: 'overlap', usd: wb.overlapUSD - wa.overlapUSD }, { key: 'hire', usd: -wa.hireUSD }];
    if (best === null || sumTerms(terms) > sumTerms(best.terms)) best = { p, terms, month, days: [taShort(c, p, month, 2, CREW_STEP).days, taShort(c, p, month, 1, 0).days] };
  }
  if (best === null) return null;
  const { p, terms, days, month } = best, x = c.plants[p], cat = x.stock === 0 ? catPrice(c, p) : 0;
  const vars = { plant: p, month: month + 1, taMonth: month, shifted: month > c.m + DEC_TA_LEAD ? 1 : 0, cat: Math.round(x.cat * 100), u: Math.round(x.U * 100), daysA: days[0], daysB: days[1], hire: r2(TA_CREW_HIRE_USD + TA_CRANE_HIRE_USD), catUSD: r2(cat), months: 12 };
  return { year: 0, m: 0, kind: 'crew', plant: p, vars, best: 0, choice: -1, lapsed: false, yr: yearOf(12, terms, halfTerms(terms)), options: [mkOpt('a', terms, cat, { daysA: days[0], hire: vars.hire }), mkOpt('b', [], cat, { daysB: days[1] })] };
}
const dkind = (c: Career, kind: DecKind): YearDecision | null => {
  switch (kind) {
    case 'contract': { const first = Math.floor(draw(c.seed, c.m, 501) * PLANTS.length); for (let j = 0; j < PLANTS.length; j++) { const d = contractDecision(c, PLANTS[(first + j) % PLANTS.length]!); if (d !== null) return d; } return null; }
    case 'turnaround': return turnaroundDecision(c);
    case 'debottleneck': return debottleneckDecision(c);
    case 'catgrade': return catgradeDecision(c);
    case 'crew': return crewDecision(c);
    default: return hedgeDecision(c);
  }
};
/** Raise this year's decision: the kind rotates from the seed, and a kind not yet drawn this career comes before one that was, so five years show five different cards while the pool allows. A kind that does not apply gives way to the next. */
function raiseDecision(c: Career): void {
  if (c.ending !== '') return;
  c.snap = undefined; c.ops = undefined;
  const y = year(c), start = Math.floor(draw(c.seed, 0, 500) * DEC_KINDS.length), used = (c.decisions ?? []).map((d) => d.kind), n = DEC_KINDS.length;
  for (const fresh of [true, false]) {
    for (let i = 0; i < n; i++) {
      const kind = DEC_KINDS[(start + y + i) % n]!;
      if (fresh && used.includes(kind)) continue;
      const d = dkind(c, kind);
      if (d === null) continue;
      d.year = y + 1; d.m = c.m; d.best = d.options[0]!.effectUSD - d.options[1]!.effectUSD > DEC_ACT_MARGIN ? 0 : 1;
      (c.decisions ??= []).push(d); c.log.push({ m: c.m, kind: 'decision', code: kind, plant: d.plant, n: y + 1 });
      if (c.replay !== true) { c.snap = JSON.stringify({ ...c, snap: undefined, ops: undefined }); c.ops = []; }
      return;
    }
  }
}
/** Answer the pending yearly decision: 0 takes the action, 1 does nothing. */
export function answerDecision(c: Career, choice: unknown): void {
  const keep = c.snap; c.snap = undefined;   // what the answer does inside is part of the answer, not a separate decision to replay
  try { answerInner(c, choice); } finally { c.snap = keep; }
}
function answerInner(c: Career, choice: unknown): void {
  alive(c);
  const d = pendingDecision(c);
  need(d !== null, 'nodecision');
  need(choice === 0 || choice === 1, 'choice');
  if (choice === 0) {
    const v = d!.vars;
    switch (d!.kind) {
      case 'contract': need(c.contracts.length < 12, 'full'); c.contracts.push({ id: c.nextId++, p: d!.plant as PlantId, tpm: v.tpm as number, price: v.price as number, left: v.term as number, pen: v.pen as number }); c.log.push({ m: c.m, kind: 'contract', code: 'signed', plant: d!.plant, n: v.tpm as number }); break;
      case 'turnaround': { const p = d!.plant as PlantId, x = c.plants[p]; if (x.stock === 0) buyCatalyst(c, p); x.ta = (v.taMonth as number | undefined) ?? c.m + DEC_TA_LEAD; x.taCrane = 1; x.taCrew = 0; break; }
      case 'debottleneck': { const q = d!.plant as PlantId; spend(c, d!.options[0]!.costUSD); (c.boost ??= {})[q] = (c.boost[q] ?? 0) + DEC_BOOST; break; }
      case 'hedge': c.hedge = { price: v.price as number, until: c.m + (v.months as number) }; break;
      case 'catgrade': (c.eco ??= {})[d!.plant as PlantId] = true; break;
      case 'crew': { const p = d!.plant as PlantId; if (c.plants[p].stock === 0) buyCatalyst(c, p); turnaround(c, p, (v.taMonth as number | undefined) ?? c.m + DEC_TA_LEAD, 2, CREW_STEP); break; }
    }
  } else if (d!.kind === 'contract') { c.nextId++; }   // option B takes the id option A would have used: the offers that come later carry the same ids in both worlds, so the review's replay accepts the same offers
  else if (d!.kind === 'crew') { const p = d!.plant as PlantId; if (c.plants[p].stock === 0) buyCatalyst(c, p); turnaround(c, p, (d!.vars.taMonth as number | undefined) ?? c.m + DEC_TA_LEAD, 1, 0); }
  d!.choice = choice as number;
}

/** A contract offer worth stopping for: well above spot, the plant can fill it, and the gain is big enough to matter (a year of the premium on the volume). */
export const OFFER_STOP_PREM = 0.08, OFFER_STOP_GAIN = 6e6;
export function worthyOffer(c: Career): Offer | null {
  let best: Offer | null = null, bg = 0;
  for (const o of c.offers) {
    const g = (o.price - c.prices[o.p]) * o.tpm * 12;
    if (c.contracts.length < 12 && o.price >= c.prices[o.p] * (1 + OFFER_STOP_PREM) && g >= OFFER_STOP_GAIN && exposure(c, o.p, o.tpm, o.pen).shortT === 0 && o.term <= MONTHS - c.m && g > bg) { best = o; bg = g; }
  }
  return best;
}
export const SWING_GAS = 0.5, SWING_PRICE = 0.2, SKIP_MAX = 12;
/** Run months until something needs the player (at most SKIP_MAX): a yearly decision or the annual review, a contract worth taking, a warning the +3 rule stops at (inspection due, catalyst worn, exchanger fouled), a plant newly past its
 * inspection date, an incident, a big gas or price swing, or the end. Never runs past a pending decision or an unacknowledged warning. `c.why` says what stopped it. */
export function advanceToDecision(c: Career): number {
  alive(c);
  need(pendingDecision(c) === null, 'decision');
  const open = openWarnings(c);
  if (open.length > 0) { c.stopped = open; need(false, 'ack'); }
  c.stopped = [];
  const gas0 = c.gas, p0 = { ...c.prices }, od0 = new Set(PLANTS.filter((p) => overdue(c, p) > 0));
  let n = 0, why: StopWhy = { kind: 'limit', plant: '', n: SKIP_MAX };
  while (n < SKIP_MAX && c.ending === '') {
    stepMonth(c); n++;
    if (c.ending !== '') { why = { kind: 'end', plant: '', n: 0 }; break; }
    if (pendingDecision(c) !== null) { why = { kind: 'decision', plant: pendingDecision(c)!.plant, n: c.m / 12 }; break; }
    if (c.m % 12 === 0) { why = { kind: 'year', plant: '', n: c.m / 12 }; break; }
    const bad = c.log.filter((l) => l.m === c.m - 1 && (l.kind === 'critical' || l.kind === 'incident')).pop();
    if (bad !== undefined) { why = { kind: bad.kind, plant: bad.plant, n: bad.n }; break; }
    const fresh = openWarnings(c);
    if (fresh.length > 0) { c.stopped = fresh; const pick = fresh.find((k) => k.startsWith('end:')) ?? fresh.find((k) => k.startsWith('em:')) ?? fresh[0]!, [kind, plant] = pick.split(':'); why = { kind: kind!, plant: plant!, n: fresh.length, ev: c.last.ev, evPlant: c.last.evPlant }; break; }   // every open warning is in c.stopped; the banner lists them all
    // plants that passed their inspection date this month stop the run ONCE, all of them listed (plant names joined with commas; n = the worst count)
    const newOd = PLANTS.filter((p) => overdue(c, p) > 0 && !od0.has(p));
    if (newOd.length > 0) { const all = PLANTS.filter((p) => overdue(c, p) > 0); why = { kind: 'overdue', plant: all.join(','), n: Math.max(...all.map((p) => overdue(c, p))) }; break; }
    const o = worthyOffer(c);
    if (o !== null) { why = { kind: 'offer', plant: o.p, n: o.id }; break; }
    if (Math.abs(c.gas / gas0 - 1) >= SWING_GAS) { why = { kind: 'gas', plant: '', n: Math.round((c.gas / gas0 - 1) * 100) }; break; }
    const sp = PLANTS.find((p) => Math.abs(c.prices[p] / p0[p] - 1) >= SWING_PRICE);
    if (sp !== undefined) { why = { kind: 'price', plant: sp, n: Math.round((c.prices[sp] / p0[sp] - 1) * 100) }; break; }
  }
  c.why = why;
  return n;
}
