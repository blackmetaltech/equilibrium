// The level layer the front-end reads: `levelInfo` (the notebook page, the console: goals, stars, hero readout, annunciators, coach, lesson) and `resultCard`
// (the printout), plus the two actions only levels have: `callIt` (the optional prediction) and `setBank` (a cylinder bank metered in kg/h, DEPTH).
// Pure: queries never mutate; every sentence is a key `lv.*` filled with the player's own numbers; every number is finite.
import { formatNumber } from '@core/regions';
import { Rng, encodeSolution, fail, need, seedState } from '@core/kit';
import type { ActionFn, QueryFn, System } from '@core/kit';
import { SPECIES } from '../../data/species';
import { i18n, t } from '../../i18n';
import { FIRSTRUN_S } from '../../data/events';
import { buildGuideOf } from '../../levels/build_guide';
import { SPEC_BY_ID, entersFirstRun, firstRunT, madeKg, specOf } from '../../levels/registry';
import { recommendedSpeed } from '../../levels/wallclock';
import type { GoalEval, LevelSpec, Measures } from '../../levels/spec';
import { burns, commissions, fromKgH, predictionOf, relErr, spentOf, toKgH, toKmolH, unitsOfType, type Prediction } from '../../levels/util';
import { REGIONS } from '../../regions';
import type { EqState } from '../../state';
import { designActions, unitOf } from '../actions/design';
import { en } from '../../locales/en';
import { fmtNumber, messageOf } from '../solved';

type S = Readonly<EqState>;
const fin = (x: number): number => (Number.isFinite(x) ? x : 0);

// ------------------------------------------------------------------------------------------------ grading
export interface CallItGrade { answered: boolean; value?: number; truth?: number; ok?: boolean; named?: string; namedOk?: boolean; truthNamed?: string; tol?: string }
/** The tolerance of a call as the player reads it: "within ±2 %" (relative, as graded) or "exactly". */
export const tolText = (tol: number): string => (tol === 0 ? t('lv.call.tol_exact') : t('lv.call.tol', { tol: String(Math.round(tol * 1e4) / 100) }));

/** The answer made for `key` (before the first commission): the last `callIt(value[, key])` / `predict(key, value)` in the solution log, else the stored prediction. Several answers per level do not overwrite each other. */
export function answerOf(s: S, spec: LevelSpec, key: string): Prediction | null {
  const main = spec.callIt?.key;
  let found: Prediction | null = null;
  for (const [name, args] of s.levelActions ?? []) {
    if (name === 'commission') break;
    if (name === 'callIt' && typeof args[0] === 'number') {
      const a1 = args[1];
      const k = typeof a1 === 'string' && spec.callIts?.some((c) => c.key === a1) ? a1 : main;
      if (k === key) { found = { quantity: key, value: args[0] }; if (typeof a1 === 'string' && k === main && s.species.includes(a1)) found.named = a1; }
    } else if (name === 'predict' && args[0] === key && typeof args[1] === 'number') found = { quantity: key, value: args[1] };
  }
  return found ?? predictionOf(s, key);
}

/** Grade the stored prediction against the level's oracle (or the engine's number at the player's design). Ungraded until there is a truth. */
/** The data the Call-it needs, written for the player ("What you have: ..."): `lv.<ID>.callit.<key>.given` when the item has its own line, else the level's `lv.<ID>.callit.given`. Never the answer. */
export function givenOf(s: S, spec: LevelSpec, key: string): { given?: string } {
  const own = `lv.${spec.id}.callit.${key}.given`, lvl = `lv.${spec.id}.callit.given`;
  const k = i18n.has(own) ? own : i18n.has(lvl) ? lvl : '';
  return k === '' ? {} : { given: t(k, spec.textVars ? spec.textVars(s) : {}) };
}

export function gradeCallIt(s: S, spec: LevelSpec, m: Measures): CallItGrade {
  const c = spec.callIt;
  if (!c) return { answered: false };
  const p = answerOf(s, spec, c.key);
  if (p === null) return { answered: false };
  const g: CallItGrade = { answered: true, value: p.value, tol: tolText(c.tol) };
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
/** Sane entry bounds of a call-it (spec override, else by unit): a temperature in °C is 0-2000, a percentage 0-100. */
export function callBounds(c: { unit: string; min?: number; max?: number }): { min: number; max: number } {
  const byUnit: Record<string, number> = { '°C': 2000, C: 1e3, K: 5000, '%': 100, MW: 1e5, bar: 1e5, 'mol/mol': 1e3 };
  return { min: c.min ?? 0, max: c.max ?? byUnit[c.unit] ?? 1e12 };
}
const regionOf = (s: S) => REGIONS.get(s.region);
const fmt = (s: S, x: number): string => fmtNumber(x, s.region);
const money = (s: S, x: number): string => `${fmt(s, x)} ${regionOf(s).currency.code}`;
const fnv = (str: string): number => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

function goalText(s: S, spec: LevelSpec, g: GoalEval): string {
  const vars: Record<string, string | number> = {
    target: g.target !== undefined ? fmt(s, g.target) : '-', value: g.value !== undefined ? fmt(s, g.value) : t('lv.goal.pending'),
    budget: g.target !== undefined ? money(s, g.target) : '-', spent: money(s, g.key === 'budget' ? spentOf(s, spec.units) : g.value ?? 0),   // one rule: the goal text and the notebook both say what the player has bought (the goal's value stays hidden until a solve)
  };
  const pendingKey = `lv.${spec.id}.goal.${g.key}.pending`;
  if (g.value === undefined && pendingKey in en) return t(pendingKey, vars);
  return t(g.key === 'budget' ? 'lv.goal.budget' : `lv.${spec.id}.goal.${g.key}`, vars);
}

function phaseOf(s: S): 'design' | 'commissioned' | 'firstrun' | 'shift' | 'won' | 'lost' {
  if (s.status === 'won') return 'won';
  if (s.status === 'lost') return 'lost';
  if (s.phase === 'firstrun') return 'firstrun';
  return s.phase === 'design' ? 'design' : s.phase === 'commissioned' ? 'commissioned' : s.phase === 'report' ? 'won' : 'shift';
}

/** Which intercom line a running plant gets: product (first run of a product level), control (chapter 8 loops), rerun (a later run of the same design). */
function runLineKey(s: S, spec: LevelSpec): string {
  if (spec.chapter >= 8) return 'lv.run.control';
  return commissions(s) > 1 ? 'lv.run.rerun' : 'lv.run.product';
}

/** The coach line: the first step whose predicate is false; null when done, when the level is over or the mode does not coach (DESIGN 7.6: Learner coaches L01-L04, every non-sandbox mode gets L00's two lines). */
function coachOf(s: S, spec: LevelSpec): { step: number; total: number; speaker: string; text: string; why: string; focus: { unit?: string; rack?: string; key?: boolean; knob?: string } | null } | null {
  if (s.status !== 'playing' || s.mode === 'sandbox' || (spec.id !== 'L00' && s.mode !== 'learner')) return null;
  const i = spec.coach.findIndex((c) => !c.done(s));
  if (i < 0) return null;
  const c = spec.coach[i]!;
  let focus: { unit?: string; rack?: string; key?: boolean; knob?: string } | null = null;
  if (c.focus === 'key') focus = { key: true };
  else if (c.focus) {
    const [type, knob] = c.focus.split(':');
    const u = s.flowsheet.units.find((x) => x.type === type);
    focus = u ? { unit: u.id, ...(knob ? { knob } : {}) } : { rack: type! };
  }
  return { step: i + 1, total: spec.coach.length, speaker: regionOf(s).data.cast[c.role], text: t(`lv.${spec.id}.coach.${c.id}.text`, { ...(spec.textVars ? spec.textVars(s) : {}), unit: focus?.unit ?? '' }), why: t(`lv.${spec.id}.coach.${c.id}.why`, { ...(spec.textVars ? spec.textVars(s) : {}), unit: focus?.unit ?? '' }), focus };
}

/** The offline "simulated engineers" sample of DESIGN 9.6, deterministic per (level, metric): 200 values around the reference, 12 bins. */
export function simulatedHistogram(levelId: string, metric: string, best: number, spread: number, lowerIsBetter: boolean, you: number): { metric: string; bins: number[]; edges: number[]; you: number; youBin: number } {
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
  /** `you` is the player's own value (not a bin edge); `youBin` is the bin it falls in. */
  return { metric, bins, edges: Array.from({ length: n + 1 }, (_, k) => lo + k * w), you, youBin: Math.max(0, Math.min(n - 1, Math.floor((you - lo) / w))) };
}

/** Unit types the level cannot be read without: the spec's `requires`, else the unit-focus coach steps before the commission step. */
export function requiredUnits(spec: LevelSpec): string[] {
  if (spec.requires) return spec.requires;
  const out: string[] = [];
  for (const c of spec.coach) {
    if (c.focus === 'key') break;
    const ty = c.focus?.split(':')[0];
    if (ty && ty !== 'feed' && ty in spec.units && !out.includes(ty)) out.push(ty);
  }
  return out;
}

/** The first required unit type that is not placed (null when none is missing). */
export function missingUnit(s: S, spec: LevelSpec): string | null {
  for (const type of requiredUnits(spec)) if (unitsOfType(s, type).length === 0) return type;
  return null;
}

/** Before the plant is commissioned and read, no goal is met, none has a value, no annunciator is lit (honest board: "—", all off). */
function honestGoals(goals: GoalEval[], m: Measures): GoalEval[] {
  if (m.ok) return goals;
  return goals.map((g) => { if (g.keep) return { ...g, met: false }; const { value: _v, ...rest } = g; return { ...rest, met: false }; });
}

/** Histogram edge labels with just enough decimals that no two neighbours read alike (never 9, 9, 10, 10). */
export function edgeLabels(edges: number[], region: string): string[] {
  const pack = REGIONS.get(region);
  for (let d = 0; d <= 6; d++) {
    const out = edges.map((x) => formatNumber(x, pack, d));
    if (d === 6 || new Set(out).size === out.length) return out;
  }
  return edges.map(String);
}

/** "Hold the plant through the shift" is only held if the other goals hold at the end: an off-spec run must not print PASS beside it. */
function heldGoals(goals: GoalEval[]): GoalEval[] {
  const others = goals.filter((g) => g.key !== 'shift').every((g) => g.met);
  return goals.map((g) => (g.key === 'shift' && g.met && !others ? { ...g, met: false } : g));
}

/** The shift clock: plant seconds run and total, the wall seconds left at the current speed (null when paused or no shift). */
function shiftClockOf(s: S, spec: LevelSpec): { t: number; total: number; speed: number; etaWallS: number | null; running: boolean; ended: boolean } | null {
  if (spec.shiftLen <= 0) return null;
  const sh = s.shift;
  if (sh === null) return { t: 0, total: spec.shiftLen, speed: 1, etaWallS: null, running: false, ended: false };
  const left = Math.max(0, sh.len - sh.t), running = sh.ended === '';
  return { t: fin(sh.t), total: fin(sh.len), speed: sh.speed, etaWallS: running && sh.speed > 0 ? Math.ceil(left / sh.speed) : running ? null : 0, running, ended: !running };
}

// ------------------------------------------------------------------------------------------------ queries
const levelInfo: QueryFn<EqState> = (s) => {
  const spec = specOf(s);
  if (!spec) return null;
  const m = spec.measures(s), goals = heldGoals(honestGoals(spec.goals(s, m), m));
  const lack = !m.ok && s.solved !== null && s.solved.ok ? missingUnit(s, spec) : null;
  const notice = lack === null ? null : { code: 'NEEDS_UNIT', unit: lack, text: t('lv.needs_unit', { unit: t(`label.unit.${lack}`) }) };
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
    note: Array.from({ length: spec.notes }, (_, i) => t(`lv.${spec.id}.note.${i + 1}`, spec.textVars ? spec.textVars(s) : {}) + (spec.callIt && i === spec.notes - 1 ? ' ' + t(spec.callIt.lateOk ? 'lv.note.predict_late' : 'lv.note.predict') : '')),
    /** The prediction rule of a call-it level, also on its own for the notebook's Call it box. */
    predictNote: spec.callIt ? t(spec.callIt.lateOk ? 'lv.note.predict_late' : 'lv.note.predict') : null,
    notice,
    /** The speed (1, 4 or 16) the speed dial opens at when a run of this level starts. */
    recommendedSpeed: recommendedSpeed(spec.id),
    goals: goals.map((g) => ({ key: g.key, text: goalText(s, spec, g), met: g.met, pending: g.value === undefined, ...(lack !== null && g.value === undefined ? { readout: t('lv.goal.needs_unit', { unit: t(`label.unit.${lack}`) }) } : {}), ...(g.range !== undefined && g.value !== undefined ? { readout: t('lv.goal.readout_range', { value: fmt(s, g.value), unit: g.unit ?? '', lo: fmt(s, g.range[0]), hi: fmt(s, g.range[1]) }) } : {}), ...(g.value !== undefined ? { value: fin(g.value) } : {}), ...(g.target !== undefined ? { target: fin(g.target) } : {}) })),
    budgetUSD: spec.budgetUSD, spentUSD: spent,
    stars: { have: st.have, earned: st.earned, rules: [1, 2, 3].map((k) => t(`lv.${spec.id}.star.${k}`, spec.textVars?.(s))) },
    callIt: call === null ? null : {
      key: call.key, prompt: t(`lv.${spec.id}.callit`), ...givenOf(s, spec, call.key), unit: call.unit, tol: tolText(call.tol), ...callBounds(call), answered: grade.answered, locked: grade.answered, ...(grade.value !== undefined ? { value: fin(grade.value) } : {}),
      ...(grade.ok !== undefined && (s.solved !== null || s.status !== 'playing') ? { ok: grade.ok, truth: fin(grade.truth ?? 0) } : {}),
      ...(call.named ? { named: grade.named ?? '', options: s.species.filter((x) => x === 'N2' || x === 'H2'), ...(grade.namedOk !== undefined && (s.solved !== null || s.status !== 'playing') ? { namedOk: grade.namedOk, truthNamed: grade.truthNamed } : {}) } : {}),
      ...(call.lateOk ? { late: true } : {}),
    },
    /** Several predictions (L09, L18): one row each; `ok` and `truth` only once the run is over. Empty when the level has just the one `callIt`. */
    callIts: (spec.callIts ?? []).map((c) => {
      const a = answerOf(s, spec, c.key), tr = c.truth(s, m), over = s.solved !== null || s.status !== 'playing';
      const ok = a !== null && tr !== null ? (c.tol === 0 ? a.value === tr : relErr(a.value, tr) <= c.tol) : undefined;
      return { key: c.key, prompt: t(`lv.${spec.id}.callit.${c.key}`, spec.textVars ? spec.textVars(s) : {}), ...givenOf(s, spec, c.key), unit: c.unit, tol: tolText(c.tol), ...callBounds(c), answered: a !== null, locked: a !== null, ...(a !== null ? { value: fin(a.value) } : {}), ...(over && ok !== undefined ? { ok, truth: fin(tr ?? 0) } : {}) };
    }),
    allowedUnits: Object.entries(spec.units).filter(([type]) => s.palette === null || s.palette.includes(type)).map(([type, u]) => ({ type, max: u.max, used: used(type), priceUSD: u.price })),
    hero: { key: hero.key, label: t(`lv.${spec.id}.hero`), unit: hero.unit, value: m.ok ? fin(hero.value) : fin(hero.lo), lo: fin(hero.lo), hi: fin(hero.hi), pending: !m.ok },
    secondary: sec === null ? null : { key: sec.key, label: t(`lv.${spec.id}.sec`), unit: sec.unit, value: m.ok ? fin(sec.value) : 0, limit: fin(sec.limit), pending: !m.ok },
    /** `lit` is the honest window: true only for an alarm (high / critical) or the GOAL window met; a healthy fault window ('normal') is dark glass and must not read as lit. */
    annunciators: (m.ok || (s.solved !== null && !s.solved.ok) ? spec.annunciators(s, m, goals) : spec.annunciators(s, m, goals).map((a) => (a.key === 'solve' || spec.designLamps?.includes(a.key) ? a : { ...a, state: 'off' as const })))
      .map((a) => ({ ...a, lit: a.state === 'high' || a.state === 'critical' || (a.state === 'normal' && a.key === 'goal') })),
    phase: phaseOf(s),
    /** The level first run (L01-L04): plant seconds rolled, its length, and the product made so far; null outside it. */
    firstRun: spec.firstRun === true && s.phase === 'firstrun' ? { t: firstRunT(s), len: FIRSTRUN_S, madeKg: spec.madeKgH !== undefined || spec.chapter < 8 ? fin(madeKg(s, spec)) : null } : null,
    coach: coachOf(s, spec),
    /** The build checklist (parts, pipes, settings, ticking from the plant); null on a level without one. */
    buildGuide: buildGuideOf(s, spec),
    /** What the intercom says while a first run rolls: the product line only for the very first run of a product level; control / board levels and later runs get their own line (null outside a first run). */
    runLine: spec.firstRun === true && s.phase === 'firstrun' ? t(runLineKey(s, spec)) : null,
    /** Withheld while a prediction is still open (nothing commissioned, none locked): the lesson quotes the numbers the Call-it asks for. */
    lesson: !m.ok && s.status === 'playing' && lack !== null ? t('lv.lesson.not_run') : (call !== null && !grade.answered && commissions(s) === 0 && s.status === 'playing') ? '' : t(`lv.${spec.id}.lesson`, spec.lessonVars(s, m)),
    mode: s.mode,
    ...(spec.carriesBurns ? { burns: burns(s) } : {}),
    /** Extras: the cylinder banks (kg/h and kmol/h side by side), feed units whose composition no card may show, the shift length. */
    banks, bankSpecies: spec.bankSpecies ?? [], masked: spec.masked ? spec.masked(s) : [], shiftLen: spec.shiftLen,
    /** {t, total} plant seconds, speed, etaWallS (wall seconds left at this speed): the shift clock for the console; null on a level without a shift. */
    shiftClock: shiftClockOf(s, spec),
  };
};

const resultCard: QueryFn<EqState> = (s) => {
  const spec = specOf(s);
  if (!spec) return null;
  const ended = s.status !== 'playing';
  if (!ended && spec.firstRun === true && s.phase === 'firstrun') return null;   // the plant works first; the printout comes when the first run ends
  if (s.solved === null && !ended && !(spec.shiftLen > 0 && s.shift !== null && s.shift.ended !== '')) return null;
  const m = spec.measures(s), rawGoals = spec.goals(s, m), goals = heldGoals(rawGoals), st = starsOf(s, spec, m, rawGoals);
  const won = s.status === 'won';
  let verdictKey: string, cause: string | null;
  if (s.solved !== null && !s.solved.ok && s.solved.failure) {
    verdictKey = 'solve_fail';
    const fl = s.solved.failure;
    cause = messageOf({ code: fl.code, severity: 'fail', ...(fl.unitId !== undefined ? { unitId: fl.unitId } : {}), ...(fl.species !== undefined ? { species: fl.species } : {}), data: fl.data }, s.region);
  } else if (s.status === 'lost' && spec.shiftLen > 0 && s.shift?.ended !== 'time') { verdictKey = 'lost'; cause = s.statusReason in en ? t(s.statusReason, { unit: s.shift?.incident?.kind === 'loss' ? s.shift.incident.unit : s.shift?.mon.find((x) => x.tier >= 3)?.u ?? '' }).replace(/ {2,}/g, ' ') : s.statusReason; }
  else ({ key: verdictKey, cause } = spec.verdict(s, m, goals));
  const own = `lv.${spec.id}.verdict.${verdictKey}`;
  const verdictText = t(own in en ? own : `lv.verdict.${verdictKey}`);
  const metrics = spec.metrics(s, m).map((x) => ({ key: x.key, label: t(`lv.${spec.id}.metric.${x.key}`), value: fin(x.value), unit: x.unit }));
  const h = spec.histogram;
  const histogram = won && h && m.ok ? simulatedHistogram(spec.id, h.metric, fin(h.best(s, m)), h.spread, h.lowerIsBetter, fin(metrics.find((x) => x.key === h.metric)?.value ?? 0)) : null;
  const histMetric = metrics.find((x) => x.key === h?.metric);
  const histOut = histogram && histMetric ? { ...histogram, title: histMetric.label, unit: histMetric.unit, labels: edgeLabels(histogram.edges, s.region) } : histogram;
  const grade = gradeCallIt(s, spec, m);
  const shiftOver = !won && s.status === 'lost' && s.shift?.ended === 'time';   // the shift ran its full length, nothing lost: not an abort
  const notMet = !won && verdictKey !== 'solve_fail' && (s.status === 'playing' || shiftOver);
  const eq = m.ok || spec.shiftLen === 0 ? spec.equation(s, m) : null;
  return {
    won, verdictKey, verdictText, ...(cause !== null ? { cause } : {}), ...(eq !== null ? { equation: eq } : {}), metrics,
    stars: { have: st.have, earned: st.earned }, starRule3: t(`lv.${spec.id}.star.3`, spec.textVars?.(s)), histogram: histOut,
    goals: goals.map((g) => ({ key: g.key, text: goalText(s, spec, g), met: g.met })),
    /** True when the run did not end in a win; `abortText` is a whole sentence for the banner (never a fragment to wrap in parentheses). */
    aborted: !won, ...(!won ? { abortText: t(shiftOver ? 'lv.report.shift_over' : notMet ? 'lv.report.not_met' : 'lv.report.aborted', { cause: cause ?? verdictText }) } : {}),
    /** A run that missed its goals while the job is still open (a test burn, a first try): the printout says GOALS NOT MET, not RUN ABORTED. */
    notMet,
    ...(spec.callIt ? { callIt: grade } : {}),
    lesson: t(`lv.${spec.id}.lesson`, spec.lessonVars(s, m)),
    designCode: encodeSolution({ game: s.game, level: spec.id, ruleset: s.ruleset, seed: s.seed, mode: s.mode, actions: s.levelActions ?? [] }),
    ...(spec.card ? { card: spec.card(s, m) } : {}),
  };
};

/** levelView(): the current level's level-local view (null when the level has none). */
const levelView: QueryFn<EqState> = (s) => { const spec = specOf(s); return spec?.view ? spec.view(s) : null; };

export const levelQueries: Record<string, QueryFn<EqState>> = { levelInfo, resultCard, levelView };

// ------------------------------------------------------------------------------------------------ actions
type Fn = ActionFn<EqState>;

/** callIt(value, namedOrKey?): the optional prediction (a second argument naming one of the level's `callIts` answers that item) of the level, before the run (DESIGN 7.4). One per attempt; L03 allows it after a test burn. */
const callIt: Fn = (s, value: unknown, named?: unknown) => {
  const spec = specOf(s);
  need(spec !== undefined && spec.callIt !== null, t('lv.err.callit_level'));
  const c = spec!.callIt!;
  need(c.lateOk === true || commissions(s) === 0, t('lv.err.callit_late'));
  need(s.phase === 'design' || (c.lateOk === true && s.phase === 'commissioned'), t('lv.err.callit_phase'));
  need(typeof value === 'number' && Number.isFinite(value) && value >= 0, t('lv.err.callit_value', { value: String(value) }));
  const extra = typeof named === 'string' ? spec!.callIts?.find((x) => x.key === named && x.key !== c.key) : undefined;
  const item = extra ?? c, b = callBounds(item);
  need(value >= b.min && value <= b.max, t('lv.err.callit_range', { value: String(value), min: fmt(s, b.min), max: fmt(s, b.max), unit: item.unit }));
  const prior = answerOf(s, spec!, item.key);
  need(prior === null, t('lv.err.callit_once', { value: fmt(s, prior?.value ?? 0) }));
  if (extra) return;   // another item of the same level: recorded in the solution log (`answerOf` reads it), the main prediction stays
  const p: Prediction = { quantity: c.key, value };
  if (c.named && typeof named === 'string' && s.species.includes(named)) p.named = named;
  s.prediction = p;
};

const BANK_PRICE: Record<string, string> = { H2: 'hydrogen', S: 'sulfur' };
/** setBank(feedUnit, species, kgPerH): the bank delivers one species at a mass flow; the card shows kmol/h beside it. */
/** Cylinder banks deliver through a regulator at 3 bar (abs): above NH3's vapour pressure at the separator's -20 °C (~1.9 bar), so the
 *  liquid product is physically honest (playtest: liquid NH3 at 1 bar and -20 °C is impossible; it boils at -33 °C at 1 atm). */
const BANK_P = 3e5;
const setBank: Fn = (s, unitId: unknown, species: unknown, kgPerH: unknown) => {
  const u = unitOf(s, unitId);
  need(u.type === 'feed', t('lv.err.bank_unit', { id: u.id }));
  need(typeof species === 'string' && s.species.includes(species) && SPECIES[species] !== undefined, t('lv.err.bank_species', { species: String(species), list: s.species.join(', ') }));
  need(typeof kgPerH === 'number' && Number.isFinite(kgPerH) && kgPerH >= 0 && kgPerH <= 1e6, t('lv.err.bank_kg', { value: String(kgPerH) }));
  const r = designActions.setFeed!(s, u.id, { x: s.species.map((x) => (x === species ? 1 : 0)), flow: fromKgH(kgPerH as number, species as string), P: BANK_P, priceKey: BANK_PRICE[species as string] ?? '' }) as { ok?: boolean; message?: string } | void;
  if (r && r.ok === false) fail(r.message ?? '');
};

/** levelAct(name, ...args): a level-local action of the current level's spec (Ch8 controller tuning, Ch9 worksheets/cards/schedules). */
const levelAct: Fn = (s, name: unknown, ...args: unknown[]) => {
  const spec = specOf(s);
  const f = spec?.actions && typeof name === 'string' ? spec.actions[name] : undefined;
  need(f !== undefined, t('lv.err.level_act', { name: String(name) }));
  f!(s, ...args);
};

/** carryBurns(n): a Retry / stop-and-edit restarts the level; the front end hands the test burns of the attempt it replaces to the fresh one, so the job's count is not lost (L03's "at most 3"). Before the first commission, once. */
const carryBurns: Fn = (s, n: unknown) => {
  need(typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 50, t('lv.err.carry_burns'));
  need(commissions(s) === 0 && !(s.levelActions ?? []).some((a) => a[0] === 'carryBurns'), t('lv.err.carry_burns'));
};

export const levelActions: Record<string, Fn> = { callIt, setBank, levelAct, carryBurns };

/** Runs the current level's `tick` while the plant runs (shift / first run). */
export const levelTickSystem: System<EqState> = {
  id: 'level_tick',
  run: (s) => {
    const spec = specOf(s);
    // a commissioned plant whose goals are all met always rolls its first run (a goal that became true after the commission, e.g. through a level action, is not left waiting for a key turn that never comes)
    if (spec?.firstRun === true && s.phase === 'commissioned' && s.status === 'playing' && s.shift === null && s.solved?.ok === true && s.runs.length > 0 && entersFirstRun(spec, s)) { s.phase = 'firstrun'; s.runs[s.runs.length - 1]!.tick = s.tick; }
    if (spec?.tick && (s.phase === 'shift' || s.phase === 'firstrun') && s.shift !== null && s.shift.ended === '') spec.tick(s);
  },
};
