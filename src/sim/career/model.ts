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
export const RATE_MIN = 0.5;
export const RATE_MAX = 1.1;

export interface PlantDef { id: PlantId; cap: number; price0: number; gasGJ: number; varUSD: number; fixUSD: number; catUSD: number; decay: number; foul: number; wear: number; proc: number; gasCoupling: number }
export const DEFS: Record<PlantId, PlantDef> = {
  nh3: { id: 'nh3', cap: 30000, price0: 480, gasGJ: 32, varUSD: 15, fixUSD: 3.2e6, catUSD: 3e6, decay: 0.014, foul: 0.012, wear: 0.010, proc: 1.6, gasCoupling: 0.35 },
  acid: { id: 'acid', cap: 45000, price0: 130, gasGJ: 0, varUSD: 8, fixUSD: 1.5e6, catUSD: 1.2e6, decay: 0.008, foul: 0.014, wear: 0.008, proc: 0, gasCoupling: 0.05 },
  meoh: { id: 'meoh', cap: 25000, price0: 400, gasGJ: 31, varUSD: 20, fixUSD: 2.4e6, catUSD: 2.2e6, decay: 0.016, foul: 0.010, wear: 0.009, proc: 0.3, gasCoupling: 0.3 },
  etoh: { id: 'etoh', cap: 9000, price0: 950, gasGJ: 4, varUSD: 310, fixUSD: 2e6, catUSD: 5e5, decay: 0.010, foul: 0.015, wear: 0.006, proc: 0.05, gasCoupling: 0.05 },
};

export interface Plant { rate: number; cat: number; U: number; wear: number; insp: number; stock: number; down: number; ta: number; taCrane: number; taCrew: number; out: number; margin: number; risk: number }
export interface Contract { id: number; p: PlantId; tpm: number; price: number; left: number; pen: number }
export interface Offer { id: number; p: PlantId; tpm: number; price: number; term: number; pen: number; exp: number }
export interface Review { year: number; rev: number; cost: number; pen: number; inv: number; fine: number; margin: number; /** operating margin: net margin before investments (catalyst, inspections, programmes) */ opMargin: number; tonnes: number; /** plant-days of lost output */ downDays: number; /** mean catalyst activity and exchanger U over the year (0..1) */ catAvg: number; uAvg: number; contractRev: number; contractT: number; /** where the Works is heading after this review (see `outlook`) */ outlook?: Outlook; capT: number; capOldT: number; criticals: number; emRatio: number; effRatio: number; victor: number; noor: number; mara: number; strike: number; cash: number }
export interface LogRow { m: number; kind: 'event' | 'notice' | 'incident' | 'critical' | 'fine' | 'strike' | 'turnaround' | 'contract' | 'penalty'; code: string; plant: string; n: number }
export interface Hist { m: number; margin: number; cash: number; gas: number }
export type Ending = '' | 'chief' | 'steady' | 'sold' | 'shut';
export interface Career {
  v: 1; seed: number; mode: string; m: number; cash: number; gas: number; prices: Record<PlantId, number>; plants: Record<PlantId, Plant>;
  contracts: Contract[]; offers: Offer[]; nextId: number; crews: number; invest: { heat: number; abate: number; safety: number };
  strikes: number; criticals: number; ytd: { margin: number; em: number; gasGJ: number; tonnes: number; criticals: number; eff: number; effN: number; rev: number; cost: number; pen: number; inv: number; down: number; cat: number; U: number; pn: number; crev: number; ct: number };
  years: Review[]; hist: Hist[]; log: LogRow[]; total: { revenue: number; cost: number; penalty: number; margin: number; inv: number };
  last: { margin: number; revenue: number; cost: number; penalty: number; ev: string; evPlant: string };
  ending: Ending; lossYears: number;
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
export const outputOf = (c: Career, p: PlantId): number => { const x = c.plants[p]; return DEFS[p].cap * x.rate * (0.4 + 0.6 * x.cat) * (1 - 0.15 * x.wear); };
export function riskOf(c: Career, p: PlantId): number {
  const x = c.plants[p];
  return clamp(0.45 * x.wear + 0.4 * Math.min(1, overdue(c, p) / 6) + Math.max(0, x.rate - 0.95) * 4 + 0.3 * (1 - x.U) - 0.08 * c.invest.safety, 0, 1);
}
export const investCost = (c: Career, kind: 'heat' | 'abate' | 'safety'): number => INVEST_PRICE[kind]![c.invest[kind]] ?? 0;
export const crewLimit = (c: Career): number => CREW_BASE + c.crews * CREW_STEP;

// ------------------------------------------------------------------------------------------------ decisions
export class CareerError extends Error {}
const need = (ok: boolean, code: string): void => { if (!ok) throw new CareerError(code); };
const alive = (c: Career): void => need(c.ending === '', 'over');
const plantOf = (p: unknown): PlantId => { need(typeof p === 'string' && (PLANTS as readonly string[]).includes(p), 'plant'); return p as PlantId; };
const spend = (c: Career, usd: number): void => { c.cash -= usd; c.ytd.margin -= usd; c.ytd.inv = (c.ytd.inv ?? 0) + usd; c.total.cost += usd; c.total.margin -= usd; c.total.inv = (c.total.inv ?? 0) + usd; };

export function accept(c: Career, id: unknown): void {
  alive(c);
  const o = c.offers.find((x) => x.id === id);
  need(o !== undefined, 'offer');
  need(c.contracts.length < 12, 'full');
  c.contracts.push({ id: o!.id, p: o!.p, tpm: o!.tpm, price: o!.price, left: o!.term, pen: o!.pen });
  c.offers = c.offers.filter((x) => x.id !== id);
  c.log.push({ m: c.m, kind: 'contract', code: 'signed', plant: o!.p, n: o!.tpm });
}
export function decline(c: Career, id: unknown): void { alive(c); need(c.offers.some((x) => x.id === id), 'offer'); c.offers = c.offers.filter((x) => x.id !== id); }
export function setRate(c: Career, p: unknown, rate: unknown): void {
  alive(c);
  const id = plantOf(p);
  need(typeof rate === 'number' && Number.isFinite(rate) && rate >= RATE_MIN - 1e-9 && rate <= RATE_MAX + 1e-9, 'rate');
  c.plants[id].rate = Math.round((rate as number) * 100) / 100;
}
export function inspect(c: Career, p: unknown): void {
  alive(c);
  const id = plantOf(p), x = c.plants[id];
  need(x.insp >= 6, 'early');
  spend(c, INSPECT_USD); x.insp = 0; x.down += 1;
}
export function buyCatalyst(c: Career, p: unknown): void {
  alive(c);
  const id = plantOf(p), x = c.plants[id];
  need(x.stock === 0, 'stocked');
  spend(c, DEFS[id].catUSD); x.stock = 1;
}
export function turnaround(c: Career, p: unknown, month: unknown, crane: unknown = 1, extraCrew: unknown = 0): void {
  alive(c);
  const id = plantOf(p), x = c.plants[id];
  need(typeof month === 'number' && Number.isInteger(month) && month >= c.m && month < MONTHS, 'month');
  need(crane === 1 || crane === 2, 'crane');
  need(extraCrew === 0 || extraCrew === CREW_STEP, 'crew');
  x.ta = month as number; x.taCrane = crane as number; x.taCrew = extraCrew as number;
}
export function cancelTurnaround(c: Career, p: unknown): void { alive(c); c.plants[plantOf(p)].ta = -1; }
export function hireCrew(c: Career): void { alive(c); need(c.crews < 3, 'crews'); c.crews++; }
export function doInvest(c: Career, kind: unknown): void {
  alive(c);
  need(kind === 'heat' || kind === 'abate' || kind === 'safety', 'kind');
  const k = kind as 'heat' | 'abate' | 'safety';
  need(c.invest[k] < 3, 'max');
  spend(c, investCost(c, k)); c.invest[k]++;
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
  const gasP = c.gas * mods.gasPrice;
  let revenue = 0, cost = OVERHEAD_USD + c.crews * CREW_USD_PER_MONTH * CREW_STEP, penalty = 0, margin = 0;
  let em = 0, gasGJ = 0, tonnes = 0, effNum = 0, effDen = 0;
  const out: Record<string, number> = {};
  // turnarounds planned for this month: cost, down days, the plant comes back as new
  for (const p of PLANTS) {
    const x = c.plants[p];
    if (x.ta !== m) continue;
    const stock = x.stock === 1, days = taDays(stock, x.taCrane, x.taCrew);
    const hire = (x.taCrew > 0 ? TA_CREW_HIRE_USD : 0) + (x.taCrane > 1 ? TA_CRANE_HIRE_USD : 0);
    cost += hire; x.down += days;
    x.U = 1; x.wear = 0; x.insp = 0; if (stock) { x.cat = 1; x.stock = 0; }
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
      c.log.push({ m, kind: 'critical', code: 'incident', plant: p, n: CRIT_DOWN_D });
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
    x.cat = Math.max(0.2, x.cat * (1 - d.decay * x.rate));
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
}

function finish(c: Career, e: Ending): void { c.ending = e; c.log.push({ m: c.m, kind: 'strike', code: `end_${e}`, plant: '', n: c.strikes }); }

export const MARGIN_TARGET_YEAR = 40e6;
export const CHIEF_MARGIN = 1.4e8;
function yearEnd(c: Career): void {
  const y = c.m / 12 - 1, yt = c.ytd;
  const emRatio = yt.em / (EM_CAP_T_PER_YEAR * (1 - EM_CAP_STEP * y));
  const effRatio = yt.effN > 0 ? yt.eff / yt.effN : 1;
  let strike = 0, fine = 0;
  if (emRatio > 1) { fine = EM_CAP_MONTHLY_USD * (emRatio - 1) * 12 + EM_CAP_MONTHLY_USD; strike++; c.cash -= EM_CAP_MONTHLY_USD * (emRatio - 1) * 12 + EM_CAP_MONTHLY_USD; c.total.margin -= EM_CAP_MONTHLY_USD * (emRatio - 1) * 12 + EM_CAP_MONTHLY_USD; c.log.push({ m: c.m, kind: 'fine', code: 'emissions', plant: '', n: Math.round((emRatio - 1) * 1000) }); }
  if (PLANTS.some((p) => overdue(c, p) > 6)) { strike++; c.log.push({ m: c.m, kind: 'fine', code: 'inspection', plant: '', n: 0 }); }
  c.strikes += strike;
  // Victor judges operating performance: margin before investments. The return on a programme (less gas, fewer fines) is already inside it, its price is not charged to the score.
  const opMargin = yt.margin + (yt.inv ?? 0) - fine, net = yt.margin - fine;
  const victor = clamp(Math.round((opMargin / MARGIN_TARGET_YEAR) * 100), 0, 100);
  const pn = Math.max(1, yt.pn ?? 0), catAvg = (yt.cat ?? 0) / pn, uAvg = (yt.U ?? 0) / pn;
  const noor = clamp(Math.round(100 - 45 * yt.criticals - 100 * Math.max(0, emRatio - 0.9) - 25 * strike), 0, 100);
  // Mara also reads the equipment: a fouled exchanger and a tired catalyst cost points even when a heat-recovery programme hides them in the gas figure.
  const mara = clamp(Math.round(100 - 250 * Math.max(0, effRatio - 1) - 100 * Math.max(0, 0.95 - uAvg) - 80 * Math.max(0, 0.9 - catAvg)), 0, 100);
  c.years.push({ year: y + 1, rev: yt.rev ?? 0, cost: yt.cost ?? 0, pen: yt.pen ?? 0, inv: yt.inv ?? 0, fine, margin: net, opMargin, tonnes: yt.tonnes, downDays: yt.down ?? 0, catAvg, uAvg, contractRev: yt.crev ?? 0, contractT: yt.ct ?? 0, capT: emCap(c), capOldT: EM_CAP_T_PER_YEAR * (1 - EM_CAP_STEP * y), criticals: yt.criticals, emRatio, effRatio, victor, noor, mara, strike, cash: c.cash });
  c.lossYears = opMargin < 0 ? c.lossYears + 1 : 0;
  c.years[c.years.length - 1]!.outlook = outlook(c);
  c.ytd = { margin: 0, em: 0, gasGJ: 0, tonnes: 0, criticals: 0, eff: 0, effN: 0, rev: 0, cost: 0, pen: 0, inv: 0, down: 0, cat: 0, U: 0, pn: 0, crev: 0, ct: 0 };
  if (c.ending === '' && c.m < MONTHS) c.log.push({ m: c.m, kind: 'notice', code: 'cap', plant: '', n: Math.round(emCap(c) / 1000) });
  if (c.lossYears >= 2 || c.cash < 0) finish(c, 'sold');
  else if (c.strikes >= STRIKES_MAX) finish(c, 'shut');
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
export function taShort(c: Career, p: PlantId, month: number, crane = 1, extraCrew = 0): { days: number; shortT: number; penaltyUSD: number } {
  const x = c.plants[p], days = Math.min(30, taDays(x.stock === 1, crane, extraCrew)), ks = c.contracts.filter((k) => k.p === p && k.left > month - c.m);
  const need_ = ks.reduce((a, k) => a + k.tpm, 0), can = outputOf(c, p) * (1 - days / 30), deliver = Math.min(can, need_);
  let pen = 0;
  for (const k of ks) pen += Math.max(0, k.tpm - (need_ > 0 ? (k.tpm / need_) * deliver : 0)) * k.pen;
  return { days, shortT: Math.max(0, need_ - can), penaltyUSD: pen };
}
export interface Lever { key: 'gap' | 'turnaround' | 'contract' | 'inspect'; vars: Record<string, number | string> }
const unitMargin = (c: Career, p: PlantId): number => c.prices[p] - DEFS[p].varUSD - DEFS[p].gasGJ * gasMul(c, p) * c.gas;
/** USD a year a turnaround would add to this plant, net of its outage: catalyst and exchanger back to new, with the catalyst taken at `catAt` if it is still above it. */
export function renewalGain(c: Career, p: PlantId, catAt = 1): number {
  const x = c.plants[p], d = DEFS[p], cat = Math.min(x.cat, catAt), keep = 1 - 0.15 * x.wear;
  const dOut = d.cap * x.rate * 0.6 * (1 - cat) * keep, out = outputOf(c, p);
  const um = unitMargin(c, p), mulNow = ((1 + 0.5 * (1 - x.U)) / (0.6 + 0.4 * cat)) * (1 - 0.07 * c.invest.heat), mulNew = 1 - 0.07 * c.invest.heat;
  const gas = out * d.gasGJ * (mulNow - mulNew) * c.gas;
  const outage = (taDays(true, 1, 0) / 30) * out * Math.max(0, um);
  return 12 * dOut * Math.max(0, um) + 12 * Math.max(0, gas) - outage;
}
/** Where the capacity of a plant stands against what is contracted: tonnes a month the plant can make at its present state and rate, and the exposure with an extra contract of `extra` t/month. */
export const capacityT = (c: Career, p: PlantId): number => outputOf(c, p);
/** Concrete levers toward the flagship, each with its number. Pure. */
export function levers(c: Career, proj: number): Lever[] {
  const out: Lever[] = [];
  const left = Math.max(1, MONTHS - c.m);
  if (c.m > 0 && proj < CHIEF_MARGIN) out.push({ key: 'gap', vars: { gap: Math.round((CHIEF_MARGIN - proj) / 1e5) / 10, perYear: Math.round(((CHIEF_MARGIN - proj) / left) * 12 / 1e5) / 10, left } });
  let best: { p: PlantId; g: number } | null = null;
  for (const p of PLANTS) if (c.plants[p].ta < 0) { const g = renewalGain(c, p, 0.8); if (g > 2e5 && (best === null || g > best.g)) best = { p, g }; }
  if (best !== null && c.m < MONTHS - 8) out.push({ key: 'turnaround', vars: { plant: best.p, cat: Math.round(c.plants[best.p].cat * 100), gain: Math.round(best.g / 1e5) / 10 } });
  let bo: { id: number; p: PlantId; g: number; prem: number; tpm: number } | null = null;
  for (const o of c.offers) {
    const prem = o.price / c.prices[o.p] - 1, g = (o.price - c.prices[o.p]) * o.tpm * 12;
    if (prem > 0.03 && contracted(c, o.p) + o.tpm <= capacityT(c, o.p) && (bo === null || g > bo.g)) bo = { id: o.id, p: o.p, g, prem, tpm: o.tpm };
  }
  if (bo !== null) out.push({ key: 'contract', vars: { plant: bo.p, tpm: Math.round(bo.tpm / 100) / 10, prem: Math.round(bo.prem * 100), gain: Math.round(bo.g / 1e5) / 10 } });
  const due = PLANTS.filter((p) => c.plants[p].insp >= INSPECT_EVERY - INSPECT_WARN && c.plants[p].ta !== c.m);
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
/** Run up to `months` months. A multi-month run stops after the month in which an inspection comes within two months of due, a catalyst wears under 70 %, an exchanger fouls under 75 %, or the year ends (always at least one month). */
export function advance(c: Career, months: unknown = 1): number {
  alive(c);
  need(typeof months === 'number' && Number.isInteger(months) && months >= 1 && months <= 12, 'months');
  let n = 0;
  const before = new Set(attention(c));
  while (n < (months as number) && c.ending === '') {
    stepMonth(c); n++;
    if (c.m % 12 === 0) break;
    if ((months as number) > 1 && attention(c).some((k) => !before.has(k))) break;
  }
  return n;
}

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
    case 'advance': advance(c, a[0]); return;
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
