// L24 · Runaway (DESIGN 2.6 chapter 6). The propylene glycol reactor: a jacketed liquid CSTR (K7, V 0.10 m3, 5 m3/h, U A 10 MJ/(h K)) with three steady
// states at 25 C coolant (27.6 / 63.1 / 117.0 C: lazy, unstable, productive), a relief valve (temperature-equivalent set point 140 C) and a trip interlock.
// The plant is pre-built (feed -> reactor -> splitter -> tank, relief on the splitter's purge line, interlock on the reactor); the player sets the relief
// orifice and the interlock set point, commissions, starts the 3600 s shift and flies the coolant temperature: warm the jacket above the ignition
// temperature (47.4 C) to light the reactor, bring it back to 25 C and the reactor stays lit (hysteresis), then survive the guaranteed cooling-water
// pump trip (U A x 0.3: the upper state moves to about 152 C, +20 K in 49 s).
// Goal numbers are GAME (UNVERIFIED): the PG target and the 1.03 star margin are calibrated against the solver persona below (ch6.test.ts pins them).
import { fail, need } from '@core/kit';
import type { Action } from '@core/kit';
import { tripCleared } from '../sim/dynamics/shift';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { cstrCritical, cstrSteadyStates, k7Game, K7_GAME } from '../sim/units/rx_cstr';
import { CSTR_RELIEF_K } from '../data/events';
import { SPECIES } from '../data/species';
import { ORIFICE_MM2 } from '../data/vle';
import type { EqState } from '../state';
import type { Annunciator, BuildStep, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, link, none, predictionOf, put, putFeed, sealSetup, shown, spentOf, toKmolH, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L24_SPECIES = ['C3H6O', 'H2O(l)', 'C3H8O2'];
const K = 273.15;
const C = (x: number): number => x - K;
/** 5 m3/h of charge at 52 114 mol/m3 (2114 of propylene oxide, 50 000 of water). */
export const L24_FEED_MOL_S = (5 / 3600) * 52114;
/** 45 minutes of plant time: about 4.5 minutes of wall clock when the recipe runs at 4x until the reactor is lit and at 16x afterwards (see wallclock.ts). It was 3600 s (6+ min). */
export const L24_SHIFT_S = 2700;
/** Plant-seconds of a PG goal, GAME. The on-spec product is counted from the moment the reactor is lit. */
export const L24_PG_TARGET_KMOL = 3.5;   // F14: round 7 (d3) followed the checklist with slow hands, no trip, and made 3.87: the goal is safety first; the Chief Engineer line (star 3) keeps the production challenge
/** ★★★: the solver's best PG over the shift, divided by the 1.03 Chief-Engineer margin (GAME, UNVERIFIED; pinned by ch6.test.ts). */
export const L24_PG_STAR = 6.6;
/** The safety margin of the star: peak temperature at least this far below the 140 C relief point (DESIGN: 15 K). */
export const L24_MARGIN_K = 15;
export const L24_ORIFICE = 'T';
export const L24_TRIP_K = 125 + K;
/** The ignition temperature of the coolant (Call it): the engine's own number for the K7 reactor, the function the oracle EQ-CE-022 exercises. Tolerance 0.3 % of
 *  the Kelvin value (the oracle's), expressed against the Celsius answer. */
export const L24_TOL = 0.02;
export const L24_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 4000 }, cstr: { max: 1, price: 60000 }, splitter: { max: 1, price: 2000 }, relief: { max: 1, price: 9000 }, interlock: { max: 1, price: 12000 }, product: { max: 1, price: 4000 },
};
/** Budget with head-room: the pre-built plant costs 91 000 and the palette prices every unit again (the interlock is 12 000), so the card must not read as unaffordable. */
export const L24_BUDGET = 120000;
/** The interlock starts armed at a sensible trip, 130 C (the reference trips lower, at 125 C); 0 would be disarmed. */
export const L24_TRIP_DEFAULT_K = 130 + K;

/** The three steady states of the reactor at the design coolant (the card of the unit). */
export function l24States(): { T: number; X: number; stable: boolean }[] {
  const g = k7Game();
  return cstrSteadyStates(g.model, g.inputs).states.map((x) => ({ T: x.T, X: x.X, stable: x.stable }));
}
/** Adiabatic temperature rise of the whole charge reacting, K: the number of the printout equation (kJ/mol x mol/m3 / kJ/(m3 K)), a fact of the charge and not of this run. */
export const l24DtadFull = (): number => (-K7_GAME.dH / 1000 * K7_GAME.CA0) / (K7_GAME.rhoCp / 1000);
export const l24HotK = (): number => l24States()[2]!.T;
/** The engine's steady states and ignition coolant for a charge of `frac` of the design feed (the reactor's concentrations scale with the feed, the flow Q is fixed). */
export function l24AtFeed(frac: number): { states: { T: number; stable: boolean }[]; ignitionC: number } {
  const g = k7Game(), inp = { ...g.inputs, C0: g.inputs.C0.map((c) => c * frac) };
  return { states: cstrSteadyStates(g.model, inp).states.map((x) => ({ T: x.T, stable: x.stable })), ignitionC: C(cstrCritical(g.model, inp, 'Tc').find((x) => x.kind === 'ignition')!.Tc) };
}
/** Fraction of the design charge the recipe's full feed and its starved start-up feed carry. */
export const l24FullFrac = (): number => L24_RECIPE.fullKmolH / toKmolH(L24_FEED_MOL_S);
export const l24StartFrac = (): number => L24_RECIPE.feedKmolH / toKmolH(L24_FEED_MOL_S);
/** THE steady-state temperature of the lit reactor (deg C): the productive state at the recipe's feed and 25 C coolant. Notebook, coach, intercom, debrief and the Semenov plot all read this. */
export const l24RunC = (): number => C(l24AtFeed(l24FullFrac()).states.filter((x) => x.stable).slice(-1)[0]!.T);
const r1 = (x: number): number => Math.round(x * 10) / 10;
export function l24IgnitionC(): number {
  const g = k7Game();
  return C(cstrCritical(g.model, g.inputs, 'Tc').find((x) => x.kind === 'ignition')!.Tc);
}
/** Mass fraction of PG in the product at the hot state, for the PG estimate. */
const hotPgMassFrac = (): number => {
  const g = k7Game(), X = l24States()[2]!.X;
  const mPO = SPECIES.C3H6O!.M, mW = SPECIES['H2O(l)']!.M, mPG = SPECIES.C3H8O2!.M;
  const n = [g.inputs.C0[0]! * (1 - X), g.inputs.C0[1]! - g.inputs.C0[0]! * X, g.inputs.C0[0]! * X];
  return (n[2]! * mPG) / (n[0]! * mPO + n[1]! * mW + n[2]! * mPG);
};

const PRESETS = (): Record<string, Record<string, number | string>> => ({ cstr: { law: 'K7', Q: K7_GAME.Q, Tnom: l24HotK() } });
const ids = { feed: 'F-101', split: 'X-102', cstr: 'R-103', relief: 'R-104', prod: 'T-105', ilk: 'I-106' };

/** feed -> splitter (no flow to the purge: the relief line is a closed dead leg) -> reactor -> tank; the relief sits on the dead leg beside the reactor, the interlock
 *  watches the reactor. The tank sits on the reactor's own outlet because the dynamic reactor state lives on that pipe. */
function build(s: EqState): void {
  const f = putFeed(s, 0, 4, { C3H6O: 2114 / 52114, 'H2O(l)': 50000 / 52114 }, toKmolH(L24_FEED_MOL_S), 25 + K, 7e5);
  const x = put(s, 'splitter', 4, 4, { frac: 0 });
  const r = put(s, 'cstr', 8, 2);
  const rv = put(s, 'relief', 8, 7, { orifice: 'D' });
  const p = put(s, 'product', 14, 4, { spec: 'C3H8O2', specMin: 0.03 });
  const il = put(s, 'interlock', 13, 8, { watch: r, variable: 'T', action: 'cut_feed', setpoint: L24_TRIP_DEFAULT_K });
  if (f !== ids.feed || x !== ids.split || r !== ids.cstr || rv !== ids.relief || p !== ids.prod || il !== ids.ilk) throw new Error('level setup: L24 ids moved ' + [f, x, r, rv, p, il].join(','));
  link(s, f, 'out', x, 'in'); link(s, x, 'out', r, 'in'); link(s, r, 'out', p, 'in'); link(s, x, 'purge', rv, 'in');
}

export function runawayMeasures(s: S): Measures {
  const sh = s.shift;
  const v: Record<string, number> = {
    t: 0, len: L24_SHIFT_S, T_K: 0, peak_K: 0, branch: 0, pg_kmol: 0, prod_kg: 0, relief_n: 0, trips: 0, crit_s: 0, high_s: 0, ended: 0, lost: s.status === 'lost' && s.shift?.ended !== 'time' ? 1 : 0,
    cw_trip: 0, setpoint_K: 0, orifice_mm2: 0, tc_K: 0, ignition_C: l24IgnitionC(), lit: 0, tier: 0, cost: 0, margin_K: 0, hot_K: l24RunC() + K, ilk_K: 0, dtad: 0,
  };
  const rx = unitsOfType(s, 'cstr')[0], ilk = unitsOfType(s, 'interlock')[0], rv = unitsOfType(s, 'relief')[0];
  if (ilk) v.ilk_K = typeof ilk.params.setpoint === 'number' ? ilk.params.setpoint : 0;
  if (rv) v.orifice_mm2 = ORIFICE_MM2[String(rv.params.orifice ?? 'D')] ?? 0;
  if (!sh || !rx) return { ok: false, v };
  const dc = sh.dc[rx.id];
  const mon = sh.mon.find((m) => m.u === rx.id && m.v === 'T');
  const tmax = s.trends.tmax_K ?? [];
  v.t = sh.t; v.len = sh.len;
  v.T_K = dc ? dc.T : 0;
  v.tc_K = typeof rx.params.Tc === 'number' ? rx.params.Tc : K7_GAME.Tc;
  v.peak_K = Math.max(v.T_K, ...tmax, sh.incident ? sh.incident.T : 0);
  v.margin_K = CSTR_RELIEF_K - v.peak_K;
  v.branch = v.T_K > 80 + K ? 1 : 0;
  v.lit = v.branch;
  v.prod_kg = sh.acc.prodKg;
  const out = s.flowsheet.streams.find((p) => p.from.unit === rx.id);
  const st = out ? sh.disp[out.id] : undefined;
  let w = hotPgMassFrac();
  if (st) {
    const mm = st.n.map((n, i) => n * (SPECIES[s.species[i]!]?.M ?? 0));
    const tot = mm.reduce((a, b) => a + b, 0), xPg = st.n.reduce((a, b) => a + b, 0) > 0 ? st.n[2]! / st.n.reduce((a, b) => a + b, 0) : 0;
    if (tot > 0 && xPg >= 0.03) w = mm[2]! / tot;
  }
  v.pg_kmol = (sh.acc.prodKg * w) / SPECIES.C3H8O2!.M;
  v.relief_n = sh.stat.reliefN; v.trips = sh.stat.tripN; v.crit_s = sh.stat.critS; v.high_s = sh.stat.highS;
  v.ended = sh.ended === 'time' || sh.ended === 'loss' ? 1 : 0;
  v.cw_trip = sh.act.some((e) => e.type === 'cw_pump_trip') ? 1 : 0;
  v.tier = mon ? mon.tier : 0;
  v.cost = sh.acc.cost;
  const info = s.solved?.units[rx.id]?.info;
  v.dtad = info?.dTad ?? 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

// -------------------------------------------------------------------------------------------------------- the start-up checklist (levelInfo.buildGuide)
/** The value a dial is heading for (a setpoint ramps at the actuator's rate): the ramp target while it moves, the knob otherwise. */
const target = (s: S, id: string, key: string, now: number): number => s.shift?.ramps[`${id}.${key}`]?.to ?? now;
const feedKmolH = (s: S): number => (s.shift ? toKmolH(target(s, ids.feed, 'flow', s.feeds[ids.feed]?.flow ?? 0)) : 0);
const coolantC = (s: S): number => { const u = unitsOfType(s, 'cstr')[0]; return s.shift && u ? C(target(s, ids.cstr, 'Tc', typeof u.params.Tc === 'number' ? u.params.Tc : K7_GAME.Tc)) : -99; };
/** The reactor has been lit: the chart has passed the cue at some time of the shift (the peak trend keeps the fact after the chart has come back down). */
const litSeen = (s: S): boolean => s.shift !== null && Math.max(s.shift.dc[ids.cstr]?.T ?? 0, ...(s.trends.tmax_K ?? [])) > L24_RECIPE.coolAtC + K;
/** Plant seconds the plant has been left alone since the last of the two step-3 edits (coolant eased, feed raised), or null before both are in. The notebook's "steady for N s" row. */
export const l24SteadyS = (s: S): number | null => {
  const sh = s.shift;
  if (!sh || !litSeen(s) || coolantC(s) > L24_RECIPE.easeC + 0.5 || feedKmolH(s) < L24_RECIPE.easeKmolH - 1) return null;
  const e = sh.edits ?? {};
  return Math.max(0, sh.t - Math.max(e[`${ids.cstr}.Tc`] ?? 0, e[`${ids.feed}.flow`] ?? 0));
};
const settled = (s: S): boolean => {
  if (!litSeen(s)) return false;
  const w = l24SteadyS(s);
  return (w !== null && w >= L24_RECIPE.settleS) || coolantC(s) <= L24_RECIPE.holdC + 0.5 || feedKmolH(s) >= L24_RECIPE.fullKmolH - 1;   // a later edit overtakes the wait
};
/** The notebook's start-up as rows: each ticks from engine state (the dials' targets, the reactor chart), never from a click. A row stays ticked when a later setting overtakes it
 *  (feed 235 counts as 'feed raised to 215'), so the two edits of step 3 and of step 4 may be made in either order. */
export const L24_GUIDE: BuildStep[] = [
  { id: 'ilk', kind: 'set', slot: { type: 'interlock' }, done: (s) => unitsOfType(s, 'interlock').some((u) => typeof u.params.setpoint === 'number' && Math.abs((u.params.setpoint as number) - L24_TRIP_K) < 0.6) },
  { id: 'relief', kind: 'set', slot: { type: 'relief' }, done: (s) => unitsOfType(s, 'relief').some((u) => (ORIFICE_MM2[String(u.params.orifice ?? 'D')] ?? 0) >= (ORIFICE_MM2[L24_ORIFICE] ?? 0)) },
  { id: 'start', kind: 'set', done: (s) => s.shift !== null },
  { id: 'feed', kind: 'set', slot: { type: 'feed' }, done: (s) => s.shift !== null && (litSeen(s) || Math.abs(feedKmolH(s) - L24_RECIPE.feedKmolH) <= 1) },   // DOWN to 182: the full 260.6 charge must not tick it (round 7)
  { id: 'warm', kind: 'set', slot: { type: 'cstr' }, done: (s) => s.shift !== null && (litSeen(s) || coolantC(s) >= L24_RECIPE.warmC - 0.5) },
  { id: 'lit', kind: 'set', slot: { type: 'cstr' }, done: litSeen },
  { id: 'ease_c', kind: 'set', slot: { type: 'cstr' }, done: (s) => litSeen(s) && coolantC(s) <= L24_RECIPE.easeC + 0.5 },
  { id: 'ease_f', kind: 'set', slot: { type: 'feed' }, done: (s) => litSeen(s) && feedKmolH(s) >= L24_RECIPE.easeKmolH - 1 },
  { id: 'steady', kind: 'set', done: settled },
  { id: 'cooled', kind: 'set', slot: { type: 'cstr' }, done: (s) => litSeen(s) && coolantC(s) <= L24_RECIPE.holdC + 0.5 },
  { id: 'fed', kind: 'set', slot: { type: 'feed' }, done: (s) => litSeen(s) && feedKmolH(s) >= L24_RECIPE.fullKmolH - 1 },
];

export const L24: LevelSpec = {
  id: 'L24', firstRun: false, chapter: 6, index: 24, setter: 'safety', budgetUSD: L24_BUDGET, units: L24_UNITS, notes: 3, shiftLen: L24_SHIFT_S, maxTicks: L24_SHIFT_S + 600,
  textVars: (s) => {
    const nowT = s.shift ? Math.round(C(s.shift.dc[ids.cstr]?.T ?? 298.15)) : 25;
    const run = l24RunC(), lo = l24AtFeed(l24FullFrac()).states[0]!.T, ig70 = l24AtFeed(l24StartFrac()).ignitionC;
    const w = l24SteadyS(s), steady = w === null ? 0 : Math.min(L24_RECIPE.settleS, Math.floor(w));
    return { steady, nowT, tripDefault: C(L24_TRIP_DEFAULT_K), run: Math.round(run), lazy: Math.round(C(lo)), ign70: r1(ig70), warm: L24_RECIPE.warmC, gap: r1(L24_RECIPE.warmC - ig70), trip: C(L24_TRIP_K), relief: C(CSTR_RELIEF_K), tripGap: Math.round(C(L24_TRIP_K) - run), full: Math.round(C(l24HotK())), fullGap: Math.round(C(L24_TRIP_K) - C(l24HotK())), slowPeak: L24_RECIPE.slowPeakC, feedF: L24_RECIPE.feedKmolH, slowGap: C(L24_TRIP_K) - L24_RECIPE.slowPeakC, late: L24_RECIPE.lateS, ease: L24_RECIPE.easeC, easeF: L24_RECIPE.easeKmolH, gapS: L24_RECIPE.gapS, settle: L24_RECIPE.settleS, cue: L24_RECIPE.coolAtC, hold: L24_RECIPE.holdC, fullF: L24_RECIPE.fullKmolH };
  },
  setup: (s) => { baseSetup(s, L24_SPECIES, L24_UNITS, PRESETS()); build(s); sealSetup(s); },
  measures: runawayMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'pg', met: m.ok && m.v.lost === 0 && m.v.pg_kmol! >= L24_PG_TARGET_KMOL, ...(m.ok ? { value: m.v.pg_kmol } : {}), target: L24_PG_TARGET_KMOL },
      { key: 'vessel', met: m.ok && m.v.lost === 0 && m.v.peak_K! <= CSTR_RELIEF_K + 20, ...(m.ok ? { value: C(m.v.peak_K!) } : {}), target: C(CSTR_RELIEF_K) + 20 },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L24_UNITS); g.push({ key: 'budget', met: m.ok && sp > 0 && sp <= L24_BUDGET, value: sp, target: L24_BUDGET }); }
    return g;
  },
  /** The goal row shows what the tank holds as it fills; the level is won when the shift is over with every goal met. */
  won: (_s, m, g) => m.ok && m.v.ended === 1 && g.every((x) => x.met),
  extraStars: (_s, m) => [
    m.ok && m.v.relief_n === 0 && m.v.lost === 0,
    m.ok && m.v.margin_K! >= L24_MARGIN_K && m.v.pg_kmol! >= L24_PG_STAR && m.v.lost === 0,
  ],
  callIt: { key: 'ignition_c', unit: '°C', tol: L24_TOL, truth: () => l24IgnitionC() },
  hero: (_s, m) => ({ key: 'reactor_c', unit: '°C', value: C(m.v.T_K! || K7_GAME.Tc), lo: 20, hi: C(CSTR_RELIEF_K) - L24_MARGIN_K }),
  secondary: (_s, m) => ({ key: 'pg_kmol', unit: 'kmol', value: m.v.pg_kmol!, limit: L24_PG_TARGET_KMOL }),
  annunciators: (s, m, g): Annunciator[] => {
    const lit = (cond: boolean, st: Annunciator['state']): Annunciator['state'] => (!m.ok ? 'off' : cond ? st : 'normal');
    return [
      { key: 'cw', legend: t('lv.L24.ann.cw'), state: !m.ok ? 'off' : m.v.cw_trip ? 'critical' : 'normal' },
      { key: 'hi', legend: t('lv.L24.ann.hi'), state: lit(m.v.tier! >= 2, 'high') },
      { key: 'hh', legend: t('lv.L24.ann.hh'), state: lit(m.v.tier! >= 3, 'critical') },
      { key: 'relief', legend: t('lv.L24.ann.relief'), state: lit(m.v.relief_n! > 0, 'critical') },
      { key: 'ilk', legend: t('lv.L24.ann.ilk'), state: lit(m.v.trips! > 0, 'high') },
      { key: 'lazy', legend: t('lv.L24.ann.lazy'), state: !m.ok ? 'off' : m.v.branch === 0 && m.v.t! > 600 ? 'high' : 'normal' },
      { key: 'goal', legend: t('lv.L24.ann.goal'), state: m.ok && m.v.ended === 1 && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  buildGuide: L24_GUIDE,
  coach: [
    { id: 'set_ilk', role: 'safety', focus: 'interlock', done: (s) => unitsOfType(s, 'interlock').some((u) => (u.params.setpoint as number) > 0 && (u.params.setpoint as number) !== L24_TRIP_DEFAULT_K) },
    { id: 'size_relief', role: 'safety', focus: 'relief', done: (s) => unitsOfType(s, 'relief').some((u) => u.params.orifice !== 'D') },
    { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'start_shift', role: 'safety', done: (s) => s.shift !== null },
    { id: 'reset_ilk', role: 'safety', focus: 'interlock', done: (s) => s.shift === null || s.shift.trips[ids.ilk] === undefined },
    { id: 'set_coolant', role: 'safety', focus: 'cstr', done: (s) => s.shift === null || (s.shift.dc[ids.cstr]?.T ?? 0) > L24_SOLVE.litC + K || (typeof unitsOfType(s, 'cstr')[0]?.params.Tc === 'number' && (unitsOfType(s, 'cstr')[0]!.params.Tc as number) >= L24_SOLVE.warmK - 0.5) },
    { id: 'ignite', role: 'safety', focus: 'cstr', done: (s) => (s.shift?.dc[ids.cstr]?.T ?? 0) > 80 + K || s.shift === null },
    { id: 'cool_back', role: 'safety', focus: 'cstr', done: (s) => s.shift === null || (litSeen(s) && coolantC(s) <= L24_RECIPE.easeC + 0.5 && feedKmolH(s) >= L24_RECIPE.easeKmolH - 1) },
  ] as CoachStep[],
  verdict: (s, m) => {
    if (!m.ok || m.v.ended !== 1) return { key: 'not_run', cause: null };
    if (m.v.lost === 1) return { key: 'lost', cause: t('lv.L24.cause.lost', { peak: f(s, C(m.v.peak_K!)), run: Math.round(l24RunC()) }) };
    if (m.v.pg_kmol! < L24_PG_TARGET_KMOL) {
      return m.v.lit === 0 && m.v.peak_K! < K + 80
        ? { key: 'lazy', cause: t('lv.L24.cause.lazy', { T: f(s, C(m.v.T_K!)), ign: f(s, m.v.ignition_C!), tc: f(s, C(m.v.tc_K!)) }) }
        : { key: 'short', cause: t('lv.L24.cause.short', { pg: f(s, m.v.pg_kmol!), want: f(s, L24_PG_TARGET_KMOL), trips: m.v.trips! }) };
    }
    if (m.v.relief_n! > 0) return { key: 'relief', cause: t('lv.L24.cause.relief', { peak: f(s, C(m.v.peak_K!)), n: m.v.relief_n! }) };
    return { key: 'pass', cause: null };
  },
  equation: (s, m) => {
    if (!m.ok || !(m.v.dtad! > 0)) return null;
    const dH = -K7_GAME.dH / 1000, c0 = K7_GAME.CA0, rc = K7_GAME.rhoCp / 1000;
    return `${f(s, shown(dH))} × ${f(s, shown(c0))} ÷ ${f(s, shown(rc))} = ${f(s, shown((dH * c0) / rc))} K of adiabatic rise (kJ/mol × mol/m³ ÷ kJ/(m³·K))`;
  },
  // the ignition temperature is the Call-it: it is shown only once the prediction is in or the shift is over; the run numbers only once the shift is over
  lessonVars: (s, m) => {
    const over = m.ok && m.v.ended === 1, known = over || predictionOf(s, 'ignition_c') !== null;
    return {
      ign: known ? f(s, m.v.ignition_C!) : t('lv.L24.hidden'), hot: f(s, Math.round(C(m.v.hot_K!))), ign70: f(s, r1(l24AtFeed(l24StartFrac()).ignitionC)), warm: L24_RECIPE.warmC, dtad: f(s, shown(l24DtadFull())),
      result: over ? t('lv.L24.result', { peak: f(s, C(m.v.peak_K!)), pg: f(s, m.v.pg_kmol!) }) : t('lv.L24.result_wait'),
    };
  },
  metrics: (_s, m) => [
    { key: 'pg_kmol', unit: 'kmol', value: m.v.pg_kmol! },
    { key: 'peak_c', unit: '°C', value: C(m.v.peak_K! || K) },
    { key: 'trips', unit: '', value: m.v.trips! },
  ],
  histogram: { metric: 'pg_kmol', best: () => L24_PG_STAR * 1.03, spread: 0.5, lowerIsBetter: false },
  card: (s, m): Record<string, string | number> => (m.ok ? { states_c: l24AtFeed(l24FullFrac()).states.map((x) => Math.round(C(x.T) * 10) / 10).join(' / '), ignition_c: m.v.ignition_C! } : {}),
  beforeCommission: (s) => {
    const rx = unitsOfType(s, 'cstr')[0];
    if (rx && rx.params.Tc !== K7_GAME.Tc) rx.params.Tc = K7_GAME.Tc;
  },
  actions: {
    /** resetInterlock(): release the latched trip of I-106 once the reactor is back below the trip point (the Reset button of the interlock card). */
    resetInterlock: (s) => {
      const sh = s.shift;
      need(sh !== null && sh.ended === '', t('lv.L24.err.no_shift'));
      need(sh!.trips[ids.ilk] !== undefined, t('lv.L24.err.not_tripped'));
      if (!tripCleared(s, ids.ilk)) fail(t('lv.L24.err.still_hot'));
      delete sh!.trips[ids.ilk]; sh!.dirty = 1;
    },
  },
  solver: () => solver(),
  naive: () => () => [],
};
void none;

// -------------------------------------------------------------------------------------------------------- personas
/** The expert's start-up (found by sweeping the engine, see ch6.test.ts): the reactor ignites with a full charge of propylene oxide and overshoots to about
 *  160 C whatever the jacket does, so it is lit starved (feed x 0.7, coolant 72 C) and brought up to full feed and 25 C coolant once it has passed 70 C (the
 *  unstable state is at 63 C): the peak stays at the 117 C upper state. Later it cancels a feed surge with the feed dial, and answers a cooling-water
 *  pump trip (U A x 0.3, upper state about 152 C) with a colder jacket and a feed trimmed to 70 %. */
/** The player's start-up recipe, exactly as the notebook says it, in the dials' own units (feed knob in kmol/h, full charge 260.6; coolant in °C) at the 1x speed.
 *  f9b_l24.test.ts drives the level through nothing but these set points, a human reaction time after each chart reading, in BOTH orders and with delays between them.
 *  Step 2: feed to feedKmolH, coolant to warmC (lights the starved charge). Step 3, when the chart passes coolAtC (near the ignition peak, so the climb is almost over): ease the
 *  coolant to easeC and the feed up to easeKmolH, in either order, a hand up to lateS plant seconds (lateWallS wall seconds at 4x) late, a gap of up to gapS plant seconds between the
 *  two clicks. Both corners are safe: (182 kmol/h, 52 C) keeps the upper state (the lazy state at 25 C needs 210+ kmol/h to have an upper state), (215 kmol/h, 65 C) runs at 115 C.
 *  Step 4, once the chart has been steady for settleS: coolant to holdC (25 C) and feed to fullKmolH (235 kmol/h), again in either order, at 16x: (215, 25) is still bistable and lit,
 *  (235, 52) runs at 118 C. The speed is 4x from the start, 16x once step 3 is done. */
export const L24_RECIPE = { feedKmolH: 182, warmC: 65, coolAtC: 110, easeC: 52, easeKmolH: 215, holdC: 25, feedAtC: 100, fullKmolH: 235, speed: '16x', lateS: 240, gapS: 120, settleS: 120, lateWallS: 30, slowPeakC: 120 };
export const L24_SOLVE = { rampStep: 0.025, rampEvery: 12, starve: 0.7, warmK: 72 + K, holdK: 25 + K, litC: 70, coldK: 280, tripFeed: 0.7 };

function solver() {
  let phase = 0, frac = L24_SOLVE.starve, next = 0, lastFeed = -1, lastTc = -1, calm = 0, sig = '';
  const full = L24_FEED_MOL_S;
  return (s: S): Action[] => {
    const sh = s.shift;
    if (phase === 0) {
      phase = 1;
      return [
        { name: 'callIt', args: [l24IgnitionC()] },
        { name: 'setParam', args: [ids.ilk, 'setpoint', L24_TRIP_K] }, { name: 'setParam', args: [ids.relief, 'orifice', L24_ORIFICE] },
        { name: 'commission' }, { name: 'startShift', args: ['shift'] },
      ];
    }
    if (!sh || sh.ended !== '') return [];
    const dc = sh.dc[ids.cstr];
    const out: Action[] = [];
    const T = dc ? C(dc.T) : 0;
    const set = (key: 'flow' | 'Tc', v: number): void => {
      const last = key === 'flow' ? lastFeed : lastTc;
      if (Math.abs(last - v) < 1e-9) return;
      if (key === 'flow') { lastFeed = v; out.push({ name: 'setpoint', args: [ids.feed, 'flow', v] }); } else { lastTc = v; out.push({ name: 'setpoint', args: [ids.cstr, 'Tc', v] }); }
    };
    if (phase === 1) { set('flow', full * frac); set('Tc', L24_SOLVE.warmK); phase = 2; }
    else if (phase === 2 && T > L24_SOLVE.litC) { set('Tc', L24_SOLVE.holdK); phase = 3; next = sh.t; }
    else if (phase === 3) {
      if (sh.t >= next && frac < 1) { frac = Math.min(1, frac + L24_SOLVE.rampStep); next = sh.t + L24_SOLVE.rampEvery; }
      if (frac >= 1) {
        // a lost jacket (U A x w) is answered in proportion: feed 0.5 + 0.7 w (0.71 at the full trip, w = 0.3) and a coolant that much colder
        const w = Math.min(1, sh.mods.cwUa), sev = (1 - w) / 0.7;
        set('flow', (full * (L24_SOLVE.tripFeed + (1 - L24_SOLVE.tripFeed) * (1 - Math.min(1, sev)))) / sh.mods.feed);
        set('Tc', L24_SOLVE.holdK - sh.mods.cwdT - (L24_SOLVE.holdK - L24_SOLVE.coldK) * Math.min(1, sev));
      } else set('flow', full * frac);
    }
    const mods = `${sh.mods.feed}|${sh.mods.cwUa}|${sh.mods.cwdT}`;
    if (mods !== sig) { sig = mods; calm = sh.t + 60; }
    const due = sh.q.length > 0 ? sh.q[0]!.at - sh.t - 3 : 99;
    const busy = phase <= 2 || frac < 1 || due < 30 || sh.t < calm || sh.t < 5 || (phase === 3 && sh.t < next + 300);
    if (!busy) out.push({ name: 'tick', args: [Math.max(0, Math.min(29, due))] });
    return out;
  };
}
