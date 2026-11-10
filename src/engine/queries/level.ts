// The level layer the front-end reads: `levelInfo` (the notebook page, the console: goals, stars, hero readout, annunciators, coach, lesson) and `resultCard`
// (the printout), plus the two actions only levels have: `callIt` (the optional prediction) and `setBank` (a cylinder bank metered in kg/h, DEPTH).
// Pure: queries never mutate; every sentence is a key `lv.*` filled with the player's own numbers; every number is finite.
import { Rng, encodeSolution, fail, need, seedState } from '@core/kit';
import type { ActionFn, QueryFn } from '@core/kit';
import { SPECIES } from '../../data/species';
import { t } from '../../i18n';
import { FIRSTRUN_S } from '../../data/events';
import { SPEC_BY_ID, firstRunT, madeKg, specOf } from '../../levels/registry';
import type { GoalEval, LevelSpec, Measures } from '../../levels/spec';
import { commissions, fromKgH, predictionOf, relErr, spentOf, toKgH, toKmolH, type Prediction } from '../../levels/util';
import { REGIONS } from '../../regions';
import type { EqState } from '../../state';
import { designActions, unitOf } from '../actions/design';
import { en } from '../../locales/en';
import { fmtNumber, messageOf } from '../solved';

type S = Readonly<EqState>;
const fin = (x: number): number => (Number.isFinite(x) ? x : 0);

// ------------------------------------------------------------------------------------------------ grading
export interface CallItGrade { answered: boolean; value?: number; truth?: number; ok?: boolean; named?: string; namedOk?: boolean; truthNamed?: string }

/** Grade the stored prediction against the level's oracle (or the engine's number at the player's design). Ungraded until there is a truth. */
export function gradeCallIt(s: S, spec: LevelSpec, m: Measures): CallItGrade {
  const c = spec.callIt;
  if (!c) return { answered: false };
  const p = predictionOf(s, c.key);
  if (p === null) return { answered: false };
  const g: CallItGrade = { answered: true, value: p.value };
  const truth = c.truth(s, m);
  if (truth !== null) { g.truth = truth; g.ok = c.tol === 0 ? p.value === truth : relErr(p.value, truth) <= c.tol; }
  if (c.named) {
    g.truthNamed = c.named(s);
    if (p.named !== undefined) { g.named = p.named; g.namedOk = p.named === g.truthNamed; }
  }
  return g;
}

/** Stars earned on this state: [goal, the level's second condition, the third (Call it or a metric)]. Each needs the goal. */
export function starsOf(s: S, spec: LevelSpec, m: Measures, g: GoalEval[]): { have: number; earned: [boolean, boolean, boolean] } {
  const won = s.status === 'won' || (s.status === 'playing' && (spec.won ? spec.won(s, m, g) : m.ok && g.every((x) => x.met)));
  const [b, c] = spec.extraStars(s, m, g);
  const earned: [boolean, boolean, boolean] = [won, won && b, won && c];
  return { have: earned.filter(Boolean).length, earned };
}

// ------------------------------------------------------------------------------------------------ helpers
const regionOf = (s: S) => REGIONS.get(s.region);
const fmt = (s: S, x: number): string => fmtNumber(x, s.region);
const money = (s: S, x: number): string => `${fmt(s, x)} ${regionOf(s).currency.code}`;
const fnv = (str: string): number => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

function goalText(s: S, spec: LevelSpec, g: GoalEval): string {
  const vars: Record<string, string | number> = {
    target: g.target !== undefined ? fmt(s, g.target) : '-', value: g.value !== undefined ? fmt(s, g.value) : '-',
    budget: g.target !== undefined ? money(s, g.target) : '-', spent: g.value !== undefined ? money(s, g.value) : '-',
  };
  return t(g.key === 'budget' ? 'lv.goal.budget' : `lv.${spec.id}.goal.${g.key}`, vars);
}

function phaseOf(s: S): 'design' | 'commissioned' | 'firstrun' | 'shift' | 'won' | 'lost' {
  if (s.status === 'won') return 'won';
  if (s.status === 'lost') return 'lost';
  if (s.phase === 'firstrun') return 'firstrun';
  return s.phase === 'design' ? 'design' : s.phase === 'commissioned' ? 'commissioned' : s.phase === 'report' ? 'won' : 'shift';
}

/** The coach line: the first step whose predicate is false; null when done, when the level is over or the mode does not coach (DESIGN 7.6: Learner coaches L01-L04, every non-sandbox mode gets L00's two lines). */
function coachOf(s: S, spec: LevelSpec): { step: number; total: number; speaker: string; text: string; why: string; focus: { unit?: string; rack?: string; key?: boolean } | null } | null {
  if (s.status !== 'playing' || s.mode === 'sandbox' || (spec.id !== 'L00' && s.mode !== 'learner')) return null;
  const i = spec.coach.findIndex((c) => !c.done(s));
  if (i < 0) return null;
  const c = spec.coach[i]!;
  let focus: { unit?: string; rack?: string; key?: boolean } | null = null;
  if (c.focus === 'key') focus = { key: true };
  else if (c.focus) { const u = s.flowsheet.units.find((x) => x.type === c.focus); focus = u ? { unit: u.id } : { rack: c.focus }; }
  return { step: i + 1, total: spec.coach.length, speaker: regionOf(s).data.cast[c.role], text: t(`lv.${spec.id}.coach.${c.id}.text`), why: t(`lv.${spec.id}.coach.${c.id}.why`), focus };
}

/** The offline "simulated engineers" sample of DESIGN 9.6, deterministic per (level, metric): 200 values around the reference, 12 bins. */
export function simulatedHistogram(levelId: string, metric: string, best: number, spread: number, lowerIsBetter: boolean, you: number): { metric: string; bins: number[]; edges: number[]; you: number } {
  const rng = new Rng(seedState(fnv(levelId + ':' + metric)));
  const xs: number[] = [];
  for (let i = 0; i < 200; i++) {
    const d = Math.abs(rng.normal(0, 1)) * spread;
    xs.push(lowerIsBetter ? best * (1 + d) : best * Math.max(0.02, 1 - d / (1 + d)));
  }
  const all = [...xs, you];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const n = 12, w = (hi - lo) / n;
  const bins = new Array<number>(n).fill(0);
  for (const x of xs) bins[Math.min(n - 1, Math.floor((x - lo) / w))]!++;
  return { metric, bins, edges: Array.from({ length: n + 1 }, (_, k) => lo + k * w), you };
}

// ------------------------------------------------------------------------------------------------ queries
const levelInfo: QueryFn<EqState> = (s) => {
  const spec = specOf(s);
  if (!spec) return null;
  const m = spec.measures(s), goals = spec.goals(s, m);
  const pack = regionOf(s), cast = pack.data.cast[spec.setter];
  const spent = spentOf(s, spec.units);
  const used = (type: string): number => s.flowsheet.units.filter((u) => u.type === type).length;
  const hero = spec.hero(s, m), sec = spec.secondary(s, m), grade = gradeCallIt(s, spec, m), st = starsOf(s, spec, m, goals);
  const call = spec.callIt;
  const banks = s.flowsheet.units.filter((u) => u.type === 'feed' && s.feeds[u.id]).map((u) => {
    const f = s.feeds[u.id]!;
    const kmol = f.x.map((x, i) => toKmolH(f.flow * x)), kg = f.x.map((x, i) => toKgH(f.flow * x, s.species[i]!));
    const top = kmol.reduce((b, x, i) => (x > kmol[b]! ? i : b), 0);
    return { unit: u.id, species: s.species[top] ?? '', kmolPerH: fin(kmol.reduce((a, b) => a + b, 0)), kgPerH: fin(kg.reduce((a, b) => a + b, 0)) };
  });
  return {
    id: spec.id, chapter: spec.chapter, index: spec.index, title: t(`lv.${spec.id}.title`), setter: cast,
    setterName: pack.strings[`cast.${cast}.name`] ?? '', setterTitle: pack.strings[`cast.${cast}.title`] ?? '',
    place: t(`lv.${spec.id}.place`),
    note: Array.from({ length: spec.notes }, (_, i) => t(`lv.${spec.id}.note.${i + 1}`)),
    goals: goals.map((g) => ({ key: g.key, text: goalText(s, spec, g), met: g.met, ...(g.value !== undefined ? { value: fin(g.value) } : {}), ...(g.target !== undefined ? { target: fin(g.target) } : {}) })),
    budgetUSD: spec.budgetUSD, spentUSD: spent,
    stars: { have: st.have, rules: [1, 2, 3].map((k) => t(`lv.${spec.id}.star.${k}`)) },
    callIt: call === null ? null : {
      key: call.key, prompt: t(`lv.${spec.id}.callit`), unit: call.unit, answered: grade.answered, ...(grade.value !== undefined ? { value: fin(grade.value) } : {}),
      ...(grade.ok !== undefined && (s.solved !== null || s.status !== 'playing') ? { ok: grade.ok } : {}),
      ...(call.named ? { named: grade.named ?? '', options: s.species.filter((x) => x === 'N2' || x === 'H2') } : {}),
      ...(call.lateOk ? { late: true } : {}),
    },
    allowedUnits: Object.entries(spec.units).map(([type, u]) => ({ type, max: u.max, used: used(type), priceUSD: u.price })),
    hero: { key: hero.key, label: t(`lv.${spec.id}.hero`), unit: hero.unit, value: fin(hero.value), lo: fin(hero.lo), hi: fin(hero.hi) },
    secondary: sec === null ? null : { key: sec.key, label: t(`lv.${spec.id}.sec`), unit: sec.unit, value: fin(sec.value), limit: fin(sec.limit) },
    annunciators: spec.annunciators(s, m, goals),
    phase: phaseOf(s),
    /** The level first run (L01-L04): plant seconds rolled, its length, and the product made so far; null outside it. */
    firstRun: spec.firstRun === true && s.phase === 'firstrun' ? { t: firstRunT(s), len: FIRSTRUN_S, madeKg: fin(madeKg(s, spec)) } : null,
    coach: coachOf(s, spec),
    lesson: t(`lv.${spec.id}.lesson`, spec.lessonVars(s, m)),
    mode: s.mode,
    /** Extras: the cylinder banks (kg/h and kmol/h side by side), feed units whose composition no card may show, the shift length. */
    banks, bankSpecies: spec.bankSpecies ?? [], masked: spec.masked ? spec.masked(s) : [], shiftLen: spec.shiftLen,
  };
};

const resultCard: QueryFn<EqState> = (s) => {
  const spec = specOf(s);
  if (!spec) return null;
  const ended = s.status !== 'playing';
  if (!ended && spec.firstRun === true && s.phase === 'firstrun') return null;   // the plant works first; the printout comes when the first run ends
  if (s.solved === null && !ended && !(spec.shiftLen > 0 && s.shift !== null && s.shift.ended !== '')) return null;
  const m = spec.measures(s), goals = spec.goals(s, m), st = starsOf(s, spec, m, goals);
  const won = s.status === 'won';
  let verdictKey: string, cause: string | null;
  if (s.solved !== null && !s.solved.ok && s.solved.failure) {
    verdictKey = 'solve_fail';
    const fl = s.solved.failure;
    cause = messageOf({ code: fl.code, severity: 'fail', ...(fl.unitId !== undefined ? { unitId: fl.unitId } : {}), ...(fl.species !== undefined ? { species: fl.species } : {}), data: fl.data }, s.region);
  } else if (s.status === 'lost' && spec.shiftLen > 0) { verdictKey = 'lost'; cause = t(s.statusReason, { unit: '' }); }
  else ({ key: verdictKey, cause } = spec.verdict(s, m, goals));
  const own = `lv.${spec.id}.verdict.${verdictKey}`;
  const verdictText = t(own in en ? own : `lv.verdict.${verdictKey}`);
  const metrics = spec.metrics(s, m).map((x) => ({ key: x.key, label: t(`lv.${spec.id}.metric.${x.key}`), value: fin(x.value), unit: x.unit }));
  const h = spec.histogram;
  const histogram = won && h && m.ok ? simulatedHistogram(spec.id, h.metric, fin(h.best(s, m)), h.spread, h.lowerIsBetter, fin(metrics.find((x) => x.key === h.metric)?.value ?? 0)) : null;
  const grade = gradeCallIt(s, spec, m);
  const eq = m.ok || spec.shiftLen === 0 ? spec.equation(s, m) : null;
  return {
    won, verdictKey, verdictText, ...(cause !== null ? { cause } : {}), ...(eq !== null ? { equation: eq } : {}), metrics,
    stars: { have: st.have, earned: st.earned }, histogram,
    ...(spec.callIt ? { callIt: grade } : {}),
    lesson: t(`lv.${spec.id}.lesson`, spec.lessonVars(s, m)),
    designCode: encodeSolution({ game: s.game, level: spec.id, ruleset: s.ruleset, seed: s.seed, mode: s.mode, actions: s.levelActions ?? [] }),
    ...(spec.card ? { card: spec.card(s, m) } : {}),
  };
};

export const levelQueries: Record<string, QueryFn<EqState>> = { levelInfo, resultCard };

// ------------------------------------------------------------------------------------------------ actions
type Fn = ActionFn<EqState>;

/** callIt(value, named?): the optional prediction of the level, before the run (DESIGN 7.4). One per attempt; L03 allows it after a test burn. */
const callIt: Fn = (s, value: unknown, named?: unknown) => {
  const spec = specOf(s);
  need(spec !== undefined && spec.callIt !== null, t('lv.err.callit_level'));
  const c = spec!.callIt!;
  need(c.lateOk === true || commissions(s) === 0, t('lv.err.callit_late'));
  need(s.phase === 'design' || (c.lateOk === true && s.phase === 'commissioned'), t('lv.err.callit_phase'));
  need(typeof value === 'number' && Number.isFinite(value) && value >= 0, t('lv.err.callit_value', { value: String(value) }));
  const p: Prediction = { quantity: c.key, value };
  if (c.named && typeof named === 'string' && s.species.includes(named)) p.named = named;
  s.prediction = p;
};

const BANK_PRICE: Record<string, string> = { H2: 'hydrogen', S: 'sulfur' };
/** setBank(feedUnit, species, kgPerH): the bank delivers one species at a mass flow; the card shows kmol/h beside it. */
const setBank: Fn = (s, unitId: unknown, species: unknown, kgPerH: unknown) => {
  const u = unitOf(s, unitId);
  need(u.type === 'feed', t('lv.err.bank_unit', { id: u.id }));
  need(typeof species === 'string' && s.species.includes(species) && SPECIES[species] !== undefined, t('lv.err.bank_species', { species: String(species), list: s.species.join(', ') }));
  need(typeof kgPerH === 'number' && Number.isFinite(kgPerH) && kgPerH >= 0 && kgPerH <= 1e6, t('lv.err.bank_kg', { value: String(kgPerH) }));
  const r = designActions.setFeed!(s, u.id, { x: s.species.map((x) => (x === species ? 1 : 0)), flow: fromKgH(kgPerH as number, species as string), priceKey: BANK_PRICE[species as string] ?? '' }) as { ok?: boolean; message?: string } | void;
  if (r && r.ok === false) fail(r.message ?? '');
};

export const levelActions: Record<string, Fn> = { callIt, setBank };
