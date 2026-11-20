// CAREER (DEPTH "Career", chapter 10): the integrated Works run for five seeded years, month by month (src/sim/career/model.ts).
// Why `levelAct('advance')` and not `tick`: one action = up to a year of plant months, so a verify/replay is ~60 cheap decisions rather than 6 million ticks, an idle player (ticks only) cannot
// finish the career, and the state is a pure function of the player's decisions and the seed (leaderboard: 5-year margin with zero Critical alarms, replayed by `decide`).
// A carrier plant (feed -> product) is commissioned so the key, the phase machine and the printout behave as in the other chapters; the career itself is the level-local `s.lv.c`.
import { fail } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import {
  CHIEF_MARGIN, MARGIN_TARGET_YEAR, CREW_BASE, DEFS, EM_CAP_STEP, INSPECT_EVERY, INVEST_PRICE, MONTHS, PLANTS, RATE_MAX, RATE_MIN, STRIKES_MAX, START_CASH, TA_CRANE_HIRE_USD, TA_CREW_HIRE_USD,
  CareerError, INSPECT_STRIKE_OVER, SKIP_MAX, catPrice, offerTaShort, openWarnings, strikeAhead, warnHandled, inspDueMonth, type DecTerm, DEC_CONTRACT_DISCOUNT, pendingDecision, worthyOffer, type YearDecision, INSPECT_WARN, advance, alerts, attention, inspState, taWeigh, contracted, crewLimit, decide, emCap, exposure, gasMul, initCareer, investCost, outlook, outputOf, overdue, pace, previewInvest, riskOf, score, taDays, taShort, year, type Career, type EndNeed, type Lever, type LogRow, type Outlook,
} from '../sim/career/model';
import { naiveDecisions, solverDecisions, type Decision } from '../sim/career/policy';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, carrierSetup, goalLamp, lit } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';

type S = Readonly<EqState>;
export const CAREER_ID = 'CAREER';
const END_CODE = { '': 0, chief: 1, steady: 2, sold: 3, shut: 4 } as const;
const KEYS = ['months', 'year', 'margin', 'cash', 'gas', 'criticals', 'strikes', 'end', 'emRatio', 'minCat', 'minU', 'overdue', 'contracts', 'revenue', 'cost', 'penalty', 'ref', 'inspWarn'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const M = (x: number): number => Math.round(x / 1e6);
/** The plain product name for sentences and logs (the formula in brackets appears once, on the plant card). */
const plantLabel = (p: string): string => ((PLANTS as readonly string[]).includes(p) ? t(`lv.CAREER.plant.${p}`).replace(/ \(.*\)$/, '') : '');
/** "1 month" / "3 months"; "now" / "in 2 months" (never "month(s)", never "within 0 months"). */
export const mo = (n: number): string => `${n} month${n === 1 ? '' : 's'}`;
export const inMonths = (n: number): string => (n <= 0 ? 'now' : `in ${mo(n)}`);
const withinMonths = (n: number): string => (n <= 0 ? 'now' : `within ${mo(n)}`);
/** A log row as a sentence: events by their title, findings and endings by a readable name, never a raw key. A strike names its plant, month and cause at that moment. */
export function logLabel(l: LogRow): string {
  const plant = plantLabel(l.plant);
  const sv = { plant: plant.toLowerCase(), n: l.n, s: l.s ?? 0, max: STRIKES_MAX, month: l.kind === 'fine' ? l.m : l.m + 1 };
  switch (l.kind) {
    case 'event': return t('lv.CAREER.log.event', { title: t(`event.${l.code}.title`), plant });
    case 'critical': return t('lv.CAREER.log.critical', { ...sv, plant }) + (l.s === 1 ? t('lv.CAREER.log.strike_flag') : '');
    case 'fine': return t('lv.CAREER.log.fine', { finding: t(`lv.CAREER.fine.${l.code === 'inspection' && l.s === undefined ? 'inspection_more' : l.code}`, sv) }) + (l.s === 1 ? t('lv.CAREER.log.strike_flag') : '');
    case 'strike': return t('lv.CAREER.log.strike', { ending: t(`lv.CAREER.endlog.${l.code}`) });
    default: return t(`lv.CAREER.log.${l.kind}`, { plant, n: l.n });
  }
}
/** Why a year ended as it did: revenue less operating cost and penalties = operating margin; investments apart; net; and the biggest drag. */
function driverNote(y: Career['years'][number]): string {
  const op = y.rev - y.cost - y.pen;   // the review's cost includes the year-end fine, so this IS the operating margin of the table and of the score
  const drag = Math.max(y.cost - y.fine, y.pen, y.inv, y.fine);
  const key = y.margin >= 0 ? 'ok' : drag === y.inv ? 'inv' : drag === y.pen ? 'pen' : drag === y.fine ? 'fine' : 'cost';
  const d1 = (x: number): string => (x / 1e6).toFixed(1);
  return t(`lv.CAREER.driver.${key}`, { rev: d1(y.rev), cost: d1(y.cost), pen: d1(y.pen), inv: d1(y.inv), fine: d1(y.fine), margin: d1(y.margin), op: d1(op) });
}
const sgn = (x: number, d = 1): string => `${x >= 0 ? '+' : '-'}${(Math.abs(x) / 1e6).toFixed(d)}`;
/** Why revenue moved: volume (tonnes at last year's average price) and price (the price change on this year's tonnes), with the plant state and the contract share behind the volume. */
export function revenueNote(y: Career['years'][number], prev: Career['years'][number] | undefined): string {
  const kt = Math.round(y.tonnes / 1000), price = y.tonnes > 0 ? y.rev / y.tonnes : 0;
  const base = { rev: (y.rev / 1e6).toFixed(1), kt, price: Math.round(price), crev: M(y.contractRev), ct: Math.round(y.contractT / 1000), down: Math.round(y.downDays), cat: Math.round(y.catAvg * 100), u: Math.round(y.uAvg * 100) };
  const contracts = t(y.contractT > 0 ? 'lv.CAREER.rev.contracts' : 'lv.CAREER.rev.nocontracts', base);
  if (prev === undefined || prev.tonnes <= 0) return t('lv.CAREER.rev.first', { ...base, contracts });
  const p0 = prev.rev / prev.tonnes, vol = (y.tonnes - prev.tonnes) * p0, pr = (price - p0) * y.tonnes;
  return t('lv.CAREER.rev.change', { ...base, contracts, dir: y.rev >= prev.rev ? t('lv.CAREER.rev.rose') : t('lv.CAREER.rev.fell'), rev0: (prev.rev / 1e6).toFixed(1), diff: sgn(y.rev - prev.rev), vol: sgn(vol), pr: sgn(pr), kt0: Math.round(prev.tonnes / 1000), p0: Math.round(p0), down0: Math.round(prev.downDays), cat0: Math.round(prev.catAvg * 100), u0: Math.round(prev.uAvg * 100) });
}

/** One need of an ending as a sentence with the player's number (MUSD for money, points for scores). */
function needText(n: EndNeed): string {
  const money = n.key === 'margin' || n.key === 'cash' || n.key === 'cash_floor';
  const v = (x: number): string | number => (money ? Math.round(x / 1e6) : Math.round(x));
  return t(`lv.CAREER.end.need.${n.key}`, { have: n.have < 0 && !money ? '-' : v(n.have), need: v(n.need) });
}
/** One lever as a sentence with its number. */
export function leverText(l: Lever): string {
  const v = { ...l.vars, plant: typeof l.vars.plant === 'string' ? plantLabel(l.vars.plant).toLowerCase() : '', when: withinMonths(Number(l.vars.left ?? 0)) };
  return t(`lv.CAREER.lever.${l.key}`, v);
}
/** The year-review announcement: where the Works is heading, and what would move it toward the other ending. */
export function outlookNote(o: Outlook, withLevers = true): string {
  const chief = o.rows.find((r) => r.id === 'chief')!;
  const open = chief.needs.filter((x) => !x.met).map(needText).join('; ');
  const vars = { proj: Math.round(o.proj / 1e6), target: M(chief.needs[0]!.need), gaps: open };
  const lv = withLevers && o.levers.length > 0 ? ` ${t('lv.CAREER.outlook.levers', { list: o.levers.map(leverText).join('; ') })}.` : '';
  switch (o.course) {
    case 'chief': return `${t('lv.CAREER.outlook.chief', vars)} ${t('lv.CAREER.outlook.chief_slide', vars)}${lv}`;
    case 'steady': return `${t('lv.CAREER.outlook.steady', vars)} ${t(o.chiefClosed ? 'lv.CAREER.outlook.steady_closed' : 'lv.CAREER.outlook.steady_toward', vars)}${lv}`;
    case 'sold': return `${t('lv.CAREER.outlook.sold', vars)} ${t('lv.CAREER.outlook.sold_back', vars)}${lv}`;
    default: return `${t('lv.CAREER.outlook.shut', vars)} ${t('lv.CAREER.outlook.shut_back', vars)}${lv}`;
  }
}
/** The strip on the board: the four endings with their state and what each needs (text ready to draw). */
export function endingsView(c: Career): { course: string; note: string; levers: string[]; rows: { id: string; label: string; state: string; needs: { text: string; met: boolean }[] }[] } {
  const o = outlook(c);
  return { course: o.course, note: outlookNote(o, false), levers: o.levers.map(leverText), rows: o.rows.map((r) => ({ id: r.id, label: t(`lv.CAREER.end.label.${r.id}`), state: r.state, needs: r.needs.map((n) => ({ text: needText(n), met: n.met })) })) };
}
const victorText = (y: Career['years'][number]): string => t('lv.CAREER.victor', { op: (y.opMargin / 1e6).toFixed(1), inv: (y.inv / 1e6).toFixed(1), net: (y.margin / 1e6).toFixed(1), target: M(MARGIN_TARGET_YEAR), cash: (y.cash / 1e6).toFixed(1) });
const maraText = (y: Career['years'][number]): string => {
  const pts = Math.round(100 * Math.max(0, 0.95 - y.uAvg) + 80 * Math.max(0, 0.9 - y.catAvg));
  return t(pts > 0 ? 'lv.CAREER.mara_worn' : 'lv.CAREER.mara', { eff: Math.round(y.effRatio * 100), u: Math.round(y.uAvg * 100), cat: Math.round(y.catAvg * 100), pts });
};
const capText = (y: Career['years'][number]): string => y.capOldT > 0 && y.capT > 0 && Math.round(y.capOldT / 1000) !== Math.round(y.capT / 1000) ? t('lv.CAREER.capnote', { old: Math.round(y.capOldT / 1000), now: Math.round(y.capT / 1000) }) : '';
const investText = (c: Career, k: 'heat' | 'abate' | 'safety'): string => {
  const pv = previewInvest(c, k), price = investCost(c, k);
  if (price <= 0) return '';
  if (k === 'abate') return t('lv.CAREER.invest.abate', { t: Math.round(pv.effect / 1000) });
  if (pv.paybackMonths <= 0) return t(`lv.CAREER.invest.${k}_none`, {});
  return t(`lv.CAREER.invest.${k}`, { gas: Math.round(c.gas * 100) / 100, save: Math.round(pv.saveUSDPerMonth / 1e4) / 100, months: Math.round(pv.paybackMonths), gj: Math.round(pv.effect), pts: pv.effect });
};

/** One attention flag (`insp:nh3`, `cat:acid`, `foul:meoh`) as a sentence. */
const attentionNote = (c: Career, k: string): string => {
  const [kind, p] = k.split(':') as [string, (typeof PLANTS)[number]], x = c.plants[p];
  return t(`lv.CAREER.attn.${kind}`, { plant: plantLabel(p), when: withinMonths(Math.max(0, INSPECT_EVERY - x.insp)), pct: Math.round((kind === 'cat' ? x.cat : x.U) * 100) });
};
/** Why a +3 MONTHS advance would stop now: the flags lit at this moment, as sentences. */
const attentionNotes = (c: Career): string[] => attention(c).map((k) => attentionNote(c, k));
/** ONE inspection state per plant card: locked, ok, due in N, or overdue (and when an overdue plant becomes a regulator strike). */
const inspNote = (c: Career, p: (typeof PLANTS)[number]): string => {
  const x = c.plants[p], st = inspState(c, p), v = { n: st.n, mo: mo(st.n), when: inMonths(st.n), due: st.dueMonth, over: INSPECT_STRIKE_OVER, strike: st.strikeIn, last: c.m - x.insp + 1 };
  if (st.kind === 'overdue') return t(st.strikeIn > 0 ? 'lv.CAREER.card.insp_over' : 'lv.CAREER.card.insp_over_now', v);
  if (st.kind === 'due') return t('lv.CAREER.card.insp_warn', v);
  if (st.kind === 'locked') return t(x.insp >= c.m ? 'lv.CAREER.card.insp_locked_new' : 'lv.CAREER.card.insp_locked', v);
  return t(x.insp >= c.m ? 'lv.CAREER.card.insp_never' : 'lv.CAREER.card.insp_last', v);
};
/** The BOOK line: what booking in month `m` costs against what not booking is expected to cost over the next twelve months. */
const weighNote = (c: Career, p: (typeof PLANTS)[number], m: number): string => {
  const x = c.plants[p], w = taWeigh(c, p, m, x.taCrane, x.taCrew), u = (v: number): string => (v / 1e6).toFixed(2);
  return t(w.netUSD >= 0 ? 'lv.CAREER.warn.weigh_book' : 'lv.CAREER.warn.weigh_wait', { book: u(w.bookUSD), outage: u(w.outageUSD), pen: u(w.penaltyUSD), hire: u(w.hireUSD), skip: u(w.skipUSD), after: u(w.afterUSD), save: u(w.saveUSD), net: u(Math.abs(w.netUSD)) });
};
const exposureNote = (c: Career, o: Career['offers'][number]): string => {
  const e = exposure(c, o.p, o.tpm, o.pen), v = { nom: Math.round(e.nominalT), have: Math.round(e.contractedT), after: Math.round(e.afterT), pct: Math.round((100 * e.afterT) / Math.max(1, e.nominalT)), short: Math.round(e.shortT), usd: (e.penaltyUSD / 1e6).toFixed(2) };
  return t(e.shortT > 0 ? 'lv.CAREER.warn.exposure_short' : 'lv.CAREER.warn.exposure', v);
};
/** What the levels already bought are saving today (heat recovery only; empty before the first purchase). Shown apart from the next level's line. */
const realisedText = (c: Career, k: 'heat' | 'abate' | 'safety'): string => {
  if (k !== 'heat' || c.invest.heat <= 0) return '';
  const pv = previewInvest(c, 'heat');
  return t('lv.CAREER.invest.heat_have', { lvl: c.invest.heat, save: Math.round(pv.realisedUSDPerMonth / 1e4) / 100, gj: Math.round(pv.realisedGJ) });
};


// ------------------------------------------------------------------------------------------------ the yearly decision card and the NEXT DECISION key
const mu = (x: number, d = 1): string => `${x >= 0 ? '+' : '-'}${(Math.abs(x) / 1e6).toFixed(d)}`;
/** The terms of an option in hundredths of a MUSD, adjusted (the largest term takes the rounding) so that they sum to the displayed total exactly. Zero terms are dropped. */
export function termsShown(terms: DecTerm[], effectUSD: number): { total: number; terms: { key: string; label: string; cents: number; musd: number }[] } {
  const cents = terms.map((x) => Math.round(x.usd / 1e4)), total = Math.round(effectUSD / 1e4), diff = total - cents.reduce((a, x) => a + x, 0);
  if (diff !== 0 && cents.length > 0) { let k = 0; cents.forEach((x, i) => { if (Math.abs(x) > Math.abs(cents[k]!)) k = i; }); cents[k] = cents[k]! + diff; }
  return { total, terms: terms.map((x, i) => ({ key: x.key, label: t(`lv.CAREER.dec.term.${x.key}`), cents: cents[i]!, musd: cents[i]! / 100 })).filter((x) => x.cents !== 0) };
}
const sg2 = (cents: number): string => `${cents >= 0 ? '+' : '-'}${(Math.abs(cents) / 100).toFixed(2)}`;
/** The card for a yearly decision (pending, or answered and kept as the chosen state): every number from the engine's own forecast, and every option's MUSD shown as the terms that add up to it. */
export function decisionView(c: Career, d: YearDecision): Record<string, unknown> {
  const v: Record<string, number | string> = { ...d.vars, plantName: plantLabel(d.plant).toLowerCase(), disc: Math.round(DEC_CONTRACT_DISCOUNT * 100) };
  const key = `lv.CAREER.dec.${d.kind}`;
  const shown = d.options.map((o) => termsShown(o.terms, o.effectUSD));
  // the comparison words come from the displayed numbers, never from a fixed sentence
  const cmpOf = (a: number, b: number): string => t(a > b ? 'lv.CAREER.dec.above' : a < b ? 'lv.CAREER.dec.below' : 'lv.CAREER.dec.level');
  if (d.kind === 'contract') v.cmp = cmpOf(Number(v.expSpot), Number(v.price));
  if (d.kind === 'hedge') v.cmp = cmpOf(Number(v.expGas), Number(v.price));
  const tv = (i: number): Record<string, string> => {
    const out: Record<string, string> = { eff: sg2(shown[i]!.total) };
    for (const x of d.options[i]!.terms) out[`t_${x.key}`] = '0.00';
    for (const x of shown[i]!.terms) out[`t_${x.key}`] = sg2(x.cents);
    return out;
  };
  if (d.kind === 'contract') {
    const tt = shown[0]!.terms, tp = tt.find((x) => x.key === 'price')?.cents ?? 0, td = tt.find((x) => x.key === 'depth')?.cents ?? 0;
    v.pricePart = t(tp >= 0 ? 'lv.CAREER.dec.contract.pp_pos' : 'lv.CAREER.dec.contract.pp_neg', { x: (Math.abs(tp) / 100).toFixed(2) });
    v.depthPart = t('lv.CAREER.dec.contract.dp', { x: (td / 100).toFixed(2) });
  }
  const opts = d.options.map((o, i) => {
    const ov = { ...v, ...o.vars, ...tv(i) };
    let text = t(`${key}.${o.id}`, ov);
    if (d.kind === 'debottleneck' && i === 0 && Number(v.fine) > 0) text += ` ${t(`${key}.fine`, v)}`;
    const list = shown[i]!.terms.map((x) => `${x.label} ${sg2(x.cents)}`).join('; ');
    const effectText = o.terms.length === 0 ? t('lv.CAREER.dec.effect_base') : t(d.kind === 'crew' ? 'lv.CAREER.dec.effect_crew' : 'lv.CAREER.dec.effect', { eff: sg2(shown[i]!.total), months: v.months, terms: list === '' ? sg2(0) : list });
    return { id: o.id, index: i, label: t(`lv.CAREER.dec.opt.${o.id}`), text, effectUSD: o.effectUSD, effMusd: shown[i]!.total / 100, terms: shown[i]!.terms.map((x) => ({ key: x.key, label: x.label, musd: x.musd })), costUSD: o.costUSD, effectText, chosen: d.choice === i };
  });
  const bs = shown[d.best]!, os = shown[d.best === 0 ? 1 : 0]!;
  const hint = t('lv.CAREER.dec.hint', { opt: d.options[d.best]!.id.toUpperCase(), eff: sg2(bs.total), other: sg2(os.total), months: v.months, why: t(`${key}.why${d.best}`, { ...v, ...d.options[0]!.vars, ...tv(0) }) });   // the reason always reads option A's terms: why it wins, or why it falls short
  return { kind: d.kind, year: d.year, month: d.m, pending: d.choice === -1, choice: d.choice, lapsed: d.lapsed, title: t(`${key}.title`, v), body: t(`${key}.body`, v), options: opts, best: d.best, hint, learner: c.mode === 'learner', blocks: t('lv.CAREER.dec.blocks') };
}
/** One line: what the NEXT DECISION key will stop at, with the dates that are already known. */
function nextNote(c: Career): string {
  if (pendingDecision(c) !== null) return t('lv.CAREER.next.pending');
  const toYear = 12 - (c.m % 12), due = PLANTS.filter((p) => c.plants[p].insp < INSPECT_EVERY - INSPECT_WARN).map((p) => ({ p, n: INSPECT_EVERY - INSPECT_WARN - c.plants[p].insp })).sort((a, b) => a.n - b.n)[0];
  return t('lv.CAREER.next.will', { max: SKIP_MAX, year: mo(toYear), insp: due !== undefined && due.n <= SKIP_MAX ? t('lv.CAREER.next.insp', { plant: plantLabel(due.p).toLowerCase(), when: inMonths(due.n) }) : t('lv.CAREER.next.noinsp') });
}
/** After a stop: why it stopped, in one line. Empty once the thing it stopped for is gone (handled, acknowledged, accepted or expired), so a stale banner never outlives its cause. */
function whyNote(c: Career): string {
  const w = c.why;
  if (w === null || w === undefined) return '';
  const plant = plantLabel(w.plant).toLowerCase(), base = { plant, n: w.n, mo: mo(w.n), max: SKIP_MAX, month: c.m };
  switch (w.kind) {
    case 'offer': {
      const o = c.offers.find((x) => x.id === w.n);
      if (o === undefined || o.tpm <= 0 || !(PLANTS as readonly string[]).includes(o.p)) return '';
      return t('lv.CAREER.why.offer', { plant: plantLabel(o.p).toLowerCase(), tpm: (Math.round(o.tpm / 100) / 10).toFixed(1), price: o.price, spot: Math.round(c.prices[o.p]), prem: Math.round((o.price / c.prices[o.p] - 1) * 100), term: mo(o.term) });
    }
    case 'insp': case 'cat': case 'foul':
      return openWarnings(c).some((k) => k.startsWith(`${w.kind}:${w.plant}:`)) ? t(`lv.CAREER.why.${w.kind}`, base) : '';
    case 'overdue': return overdue(c, w.plant as (typeof PLANTS)[number]) > 0 ? t('lv.CAREER.why.overdue', base) : '';
    case 'decision': return pendingDecision(c) !== null ? t('lv.CAREER.why.decision', base) : '';
    case 'critical': return t('lv.CAREER.why.critical', { ...base, s: c.strikes, flag: c.strikes === 1 ? t('lv.CAREER.warn.strike_flag') : '' });
    default: return t(`lv.CAREER.why.${w.kind}`, base);
  }
}
/** Strikes of a review year as sentences: each names its plant, month and cause. */
const strikeNotes = (c: Career, year1: number): string[] => c.log.filter((l) => (l.s !== undefined || (l.kind === 'fine' && l.code === 'inspection')) && (l.kind === 'fine' ? l.m / 12 : Math.floor(l.m / 12) + 1) === year1).map(logLabel);

export const careerOf = (s: S): Career | null => { const c = s.lv.c as Career | undefined; return c !== undefined && c.v === 1 ? c : null; };
const good = (c: Career): boolean => c.ending === 'chief' || c.ending === 'steady';

/** The reference run: the solver's decisions on this seed and mode (the 5-year margin of the engineer who maintains the Works). Pure; ~60 months. */
export function referenceCareer(seed: number, mode: string): Career {
  const c = initCareer(seed, mode);
  while (c.ending === '') {
    for (const d of solverDecisions(c)) { try { decide(c, d[0], ...d.slice(1)); } catch (e) { if (!(e instanceof CareerError)) throw e; } }
    advance(c, 1);
  }
  return c;
}
/** UNVERIFIED (GAME): the three-star threshold is the solver's 5-year margin less 3 %. */
export const starMargin = (seed: number, mode: string): number => score(referenceCareer(seed, mode)) / 1.03;

function measures(s: S): Measures {
  const c = careerOf(s);
  if (c === null) return { ok: false, v: Object.fromEntries(KEYS.map((k) => [k, 0])) };
  const emRatio = c.ytd.em / (emCap(c) * Math.max(1, c.m % 12 === 0 && c.m > 0 ? 12 : c.m % 12) / 12);
  return {
    ok: true,
    v: {
      months: c.m, year: Math.min(5, year(c) + 1), margin: score(c), cash: c.cash, gas: c.gas, criticals: c.criticals, strikes: c.strikes, end: END_CODE[c.ending], emRatio,
      minCat: Math.min(...PLANTS.map((p) => c.plants[p].cat)), minU: Math.min(...PLANTS.map((p) => c.plants[p].U)), overdue: Math.max(...PLANTS.map((p) => overdue(c, p))),
      contracts: c.contracts.length, revenue: c.total.revenue, cost: c.total.cost, penalty: c.total.penalty, ref: 0, inspWarn: Math.max(...PLANTS.map((p) => c.plants[p].insp)) >= INSPECT_EVERY - INSPECT_WARN ? 1 : 0,
    },
  };
}

function act(name: string, fn: (c: Career, ...a: unknown[]) => void): (s: EqState, ...a: unknown[]) => void {
  return (s, ...a) => {
    const c = careerOf(s);
    if (c === null) fail(t('lv.err.career_none'));
    try { fn(c!, ...a); } catch (e) { if (e instanceof CareerError) fail(t(`lv.err.career_${e.message}`, { name })); throw e; }
    if (c!.ending === 'sold' || c!.ending === 'shut') { s.status = 'lost'; s.statusReason = `lv.CAREER.end.${c!.ending}`; }
  };
}
const byName = (name: string) => act(name, (c, ...a) => decide(c, name, ...a));

export const CAREER: LevelSpec = {
  id: CAREER_ID, chapter: 10, index: 39, setter: 'manager', budgetUSD: START_CASH, units: CARRIER_UNITS, notes: 2, shiftLen: 0, maxTicks: 600,
  setup: (s) => { carrierSetup(s); s.lv.c = initCareer(s.seed, s.mode); },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'tenure', met: m.ok && m.v.end! >= 1 && m.v.end! <= 2, value: m.v.months, target: MONTHS },
      { key: 'regulator', met: m.ok && m.v.strikes! < STRIKES_MAX, value: m.v.strikes, target: STRIKES_MAX },
    ];
    if (s.mode === 'engineer') g.push({ key: 'clean', met: m.ok && m.v.criticals === 0, value: m.v.criticals, target: 0 });
    return g;
  },
  won: (_s, m, g) => m.ok && g.every((x) => x.met),
  extraStars: (s, m) => {
    const c = careerOf(s);
    if (c === null || !good(c)) return [false, false];
    return [c.ending === 'chief', c.criticals === 0 && score(c) >= starMargin(s.seed, s.mode)];
  },
  callIt: null,
  hero: (_s, m) => ({ key: 'margin', unit: 'MUSD', value: (m.v.margin ?? 0) / 1e6, lo: 0, hi: (CHIEF_MARGIN / 1e6) * 1.5 }),
  secondary: (_s, m) => ({ key: 'strikes', unit: '', value: m.v.strikes ?? 0, limit: STRIKES_MAX }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'critical', legend: t('lv.CAREER.ann.critical'), state: lit(m.ok, m.v.criticals === 0, 'critical') },
    { key: 'inspection', legend: t('lv.CAREER.ann.inspection'), state: !m.ok ? 'off' : m.v.overdue! > 6 ? 'critical' : m.v.overdue! > 0 || m.v.inspWarn! > 0 ? 'high' : 'normal' },
    { key: 'catalyst', legend: t('lv.CAREER.ann.catalyst'), state: lit(m.ok, m.v.minCat! >= 0.7) },
    { key: 'fouling', legend: t('lv.CAREER.ann.fouling'), state: lit(m.ok, m.v.minU! >= 0.75) },
    { key: 'emissions', legend: t('lv.CAREER.ann.emissions'), state: lit(m.ok, m.v.emRatio! <= 1) },
    { key: 'cash', legend: t('lv.CAREER.ann.cash'), state: !m.ok ? 'off' : m.v.cash! < 0 ? 'critical' : m.v.cash! < 1e7 ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.CAREER.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'offers', role: 'manager', done: (s) => (careerOf(s)?.contracts.length ?? 0) > 0 || (careerOf(s)?.m ?? 0) > 0 },
    { id: 'maintain', role: 'safety', done: (s) => { const c = careerOf(s); return c !== null && (c.m > 3 || c.invest.heat + c.invest.abate + c.invest.safety > 0 || PLANTS.some((p) => c.plants[p].ta >= 0)); } },
    { id: 'advance', role: 'manager', done: (s) => (careerOf(s)?.m ?? 0) >= 12 },
    { id: 'review', role: 'manager', done: LATE(['review']) },
  ],
  verdict: (s, m) => {
    const c = careerOf(s);
    if (c === null || c.ending === '') return { key: 'not_run', cause: null };
    if (good(c)) return { key: c.ending, cause: null };
    return { key: c.ending, cause: t(`lv.CAREER.cause.${c.ending}`, { months: c.m, strikes: c.strikes, criticals: c.criticals, cash: f(s, M(c.cash)), margin: f(s, M(score(c))) }) };
  },
  equation: (s, m) => {
    // operating margin = revenue less operating cost (all cost but investments, fines included) and penalties: the same figure as the ledger, the strip and the histogram
    const r = M(m.v.revenue ?? 0), p = M(m.v.penalty ?? 0), op = M(m.v.margin ?? 0), co = r - p - op;
    return `${f(s, r)} − ${f(s, co)} − ${f(s, p)} = ${f(s, op)} MUSD of operating margin`;
  },
  lessonVars: (s, m) => ({ margin: f(s, M(m.v.margin ?? 0)), criticals: f(s, m.v.criticals ?? 0), strikes: f(s, m.v.strikes ?? 0), months: f(s, m.v.months ?? 0), cash: f(s, M(m.v.cash ?? 0)), inspect: INSPECT_EVERY }),
  metrics: (_s, m) => [
    { key: 'margin', unit: 'MUSD', value: (m.v.margin ?? 0) / 1e6 },
    { key: 'criticals', unit: '', value: m.v.criticals ?? 0 },
    { key: 'cash', unit: 'MUSD', value: (m.v.cash ?? 0) / 1e6 },
  ],
  histogram: { metric: 'margin', best: (s) => starMargin(s.seed, s.mode) * 1.03 / 1e6, spread: 0.6, lowerIsBetter: false },
  actions: {
    accept: byName('accept'), decline: byName('decline'), setRate: byName('setRate'), inspect: byName('inspect'), buyCatalyst: byName('buyCatalyst'), ackWarning: byName('ackWarning'),
    turnaround: byName('turnaround'), cancelTurnaround: byName('cancelTurnaround'), hireCrew: byName('hireCrew'), invest: byName('invest'), advance: byName('advance'), advanceToDecision: byName('advanceToDecision'), answer: byName('answer'),
  },
  view: (s) => {
    const c = careerOf(s);
    if (c === null) return { kind: 'career' };
    const spot = (p: (typeof PLANTS)[number]): number => c.prices[p];
    return {
      kind: 'career',
      dashboard: { decision: ((): Record<string, unknown> | null => { const ds = c.decisions ?? [], d = pendingDecision(c) ?? ds[ds.length - 1]; return d !== undefined ? decisionView(c, d) : null; })(), decisionsDone: (c.decisions ?? []).filter((d) => d.choice >= 0).length, nextNote: nextNote(c), whyNote: whyNote(c), skipMax: SKIP_MAX, hasWorthyOffer: worthyOffer(c) !== null, month: c.m, /** The month now in progress, 1-based (month = months already run; highlight monthNow, not month). */ monthNow: Math.min(MONTHS, c.m + 1), monthOfYear: (c.m % 12) + 1, months: MONTHS, year: Math.min(5, year(c) + 1), cashUSD: c.cash, marginTotalUSD: c.total.margin, marginYtdUSD: c.ytd.margin, opMarginTotalUSD: score(c), paceUSD: pace(c), attentionNotes: attention(c).filter((k) => { const [kd, p] = k.split(':') as [string, (typeof PLANTS)[number]]; return !warnHandled(c, kd, p); }).map((k) => attentionNote(c, k)), alerts: alerts(c).map((a) => { const h = warnHandled(c, a.kind, a.plant), x = c.plants[a.plant]; return { ...a, label: plantLabel(a.plant), handled: h, text: attentionNote(c, `${a.kind}:${a.plant}`) + (h ? ` ${t('lv.CAREER.attn.handled', { month: x.ta + 1 })}` : '') }; }), strikeRule: t('lv.CAREER.rule.strike', { over: INSPECT_STRIKE_OVER }), strikeWarn: strikeAhead(c).map((a) => t('lv.CAREER.warn.strike_ahead', { plant: plantLabel(a.plant).toLowerCase(), due: a.dueMonth, n: a.over, check: a.checkMonth, over: INSPECT_STRIKE_OVER, no: a.strikeNo, max: STRIKES_MAX, flag: c.strikes === 0 && c.criticals === 0 ? t('lv.CAREER.warn.strike_flag') : '' })), needsAck: openWarnings(c).length > 0, stoppedNotes: openWarnings(c).map((k) => attentionNote(c, k)), opMarginYtdUSD: c.ytd.margin + (c.ytd.inv ?? 0), investmentsTotalUSD: c.total.inv ?? 0, investmentsYtdUSD: c.ytd.inv ?? 0, lastMonthUSD: c.last.margin, gasUSDPerGJ: c.gas, criticals: c.criticals, strikes: c.strikes, strikesMax: STRIKES_MAX, ending: c.ending, over: c.ending !== '', lastEvent: c.last.ev, lastEventPlant: c.last.evPlant, lastEventLabel: c.last.ev === '' ? '' : t(`event.${c.last.ev}.title`), lastEventPlantLabel: plantLabel(c.last.evPlant), emissionsYtdT: c.ytd.em, emissionsCapT: emCap(c), emCapStep: EM_CAP_STEP, chiefMarginUSD: CHIEF_MARGIN, startCashUSD: START_CASH },
      prices: PLANTS.map((p) => ({ plant: p, label: t(`lv.CAREER.plant.${p}`), spotUSDPerT: spot(p) })),
      plants: PLANTS.map((p) => {
        const x = c.plants[p];
        return { id: p, label: t(`lv.CAREER.plant.${p}`), capT: DEFS[p].cap, rate: x.rate, rateMin: RATE_MIN, rateMax: RATE_MAX, catalyst: x.cat, exchangerU: x.U, compressorWear: x.wear, monthsSinceInspection: x.insp, inspectionOverdue: overdue(c, p), lastInspectionMonth: x.insp >= c.m ? 0 : c.m - x.insp + 1, inspectionDueMonth: c.m + Math.max(0, INSPECT_EVERY - x.insp) + 1, inspectionDueIn: INSPECT_EVERY - x.insp, inspectionWarn: x.insp >= INSPECT_EVERY - INSPECT_WARN, inspectionNote: inspNote(c, p), inspectionState: inspState(c, p).kind, inspectionStrikeIn: inspState(c, p).strikeIn, taWeighNote: Array.from({ length: MONTHS }, (_, i) => (i < c.m ? '' : weighNote(c, p, i))), downNote: x.down > 0 ? t('lv.CAREER.down.explain', { d: Math.round(x.down) }) : '', taShort: Array.from({ length: MONTHS }, (_, i) => (i < c.m ? { days: 0, shortT: 0, penaltyUSD: 0 } : taShort(c, p, i, x.taCrane, x.taCrew))).map((r) => ({ days: r.days, shortT: Math.round(r.shortT), penaltyUSD: Math.round(r.penaltyUSD) })), taShortNote: Array.from({ length: MONTHS }, (_, i) => { if (i < c.m) return ''; const r = taShort(c, p, i, x.taCrane, x.taCrew); return r.shortT > 1 ? t('lv.CAREER.warn.short', { days: r.days, t: Math.round(r.shortT), usd: (r.penaltyUSD / 1e6).toFixed(2) }) : ''; }), catalystStock: x.stock, downDays: x.down, turnaroundMonth: x.ta, turnaroundCrane: x.taCrane, turnaroundCrew: x.taCrew, outputT: x.out > 0 ? x.out : outputOf(c, p), nominalT: outputOf(c, p), risk: riskOf(c, p), gasFactor: gasMul(c, p), contractedT: contracted(c, p), lastMarginUSD: x.margin, catalystPriceUSD: catPrice(c, p), taDaysWithCatalyst: taDays(true, x.taCrane, x.taCrew), taDaysWithout: taDays(false, x.taCrane, x.taCrew) };
      }),
      contracts: c.contracts.map((k) => ({ id: k.id, plant: k.p, tpm: k.tpm, priceUSD: k.price, monthsLeft: k.left, penaltyUSDPerT: k.pen, spotUSD: spot(k.p) })),
      offers: c.offers.map((o) => ({ id: o.id, plant: o.p, tpm: o.tpm, priceUSD: o.price, term: o.term, penaltyUSDPerT: o.pen, spotUSD: spot(o.p), premium: o.price / spot(o.p) - 1, shareOfCap: o.tpm / DEFS[o.p].cap, shareOfNominal: o.tpm / outputOf(c, o.p), nominalT: Math.round(outputOf(c, o.p)), exposureNote: exposureNote(c, o), taNote: ((): string => { const r = offerTaShort(c, o); return r === null ? '' : t('lv.CAREER.warn.offer_ta', { plant: plantLabel(o.p).toLowerCase(), month: r.month + 1, days: r.days, t: Math.round(r.shortT), usd: (r.penaltyUSD / 1e6).toFixed(2) }); })(), taPenaltyUSD: Math.round(offerTaShort(c, o)?.penaltyUSD ?? 0), overCapacity: exposure(c, o.p, o.tpm, o.pen).shortT > 0 })),
      calendar: PLANTS.map((p) => ({ plant: p, inspectionDueMonth: c.m + Math.max(0, INSPECT_EVERY - c.plants[p].insp), turnaroundMonth: c.plants[p].ta })),
      options: { invest: Object.fromEntries(Object.entries(INVEST_PRICE).map(([k, v]) => [k, { level: c.invest[k as 'heat'], max: 3, nextUSD: investCost(c, k as 'heat'), prices: v.slice(), preview: investText(c, k as 'heat'), realised: realisedText(c, k as 'heat') }])), crews: { hired: c.crews, max: 3, limit: crewLimit(c), base: CREW_BASE }, craneHireUSD: TA_CRANE_HIRE_USD, crewHireUSD: TA_CREW_HIRE_USD },
      review: c.years.map((y, i) => ({ ...y, opMarginUSD: y.opMargin, investmentsUSD: y.inv, netUSD: y.margin, victorNote: victorText(y), noorNote: y.noor, maraNote: maraText(y), driverNote: driverNote(y), revenueNote: revenueNote(y, c.years[i - 1]), capNote: capText(y), strikeNotes: strikeNotes(c, y.year), outlookNote: y.outlook !== undefined ? outlookNote(y.outlook) : '' })),
      endings: endingsView(c),
      history: c.hist.map((h) => ({ m: h.m, marginUSD: h.margin, cashUSD: h.cash, gas: h.gas })),
      log: c.log.slice(-40).map((l) => ({ ...l, t: l.m, stamp: `Y${Math.floor(l.m / 12) + 1} M${String((l.m % 12) + 1).padStart(2, '0')}`, label: logLabel(l) })),
    };
  },
  solver: (() => scripted(solverDecisions)) as PersonaFactory<EqState>,
  naive: (() => scripted(naiveDecisions)) as PersonaFactory<EqState>,
};

/** A persona that plays one month per turn: its decisions, then `advance 1`. */
function scripted(policy: (c: Career) => Decision[]) {
  return (s: S): Action[] => {
    const c = careerOf(s);
    if (c === null || c.ending !== '' || s.status !== 'playing') return [];
    return [...policy(c).map((d): Action => ({ name: 'levelAct', args: [d[0], ...d.slice(1)] })), { name: 'levelAct', args: ['advance', 1] }];
  };
}
