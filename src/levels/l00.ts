// L00 · Night Shift (DESIGN 2.6 prologue). A running ammonia loop at its reference solution: feed -> mixer -> recycle compressor -> preheater -> inlet-trim cooler
// (cooling water) -> adiabatic converter -> ammonia separator -> purge splitter (flare) and recycle valve. One scripted `cw_pump_trip` at 20 s (data/events.ts,
// pinned seed): the cooler loses 70 % of its duty, the converter inlet and shell warm. The player turns one dial (the cooler's outlet temperature) and the
// beam levels. If nothing is done a player-placed-style interlock on the converter outlet temperature trips the feed about 45 s after the event: the plant
// goes down ("That is how she went down last time"). D-B2 (phase B): that is now a loss with a retry; the cooler moves at 13.5 K/s, so a late turn trips too.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { runActions } from '../engine/actions/run';
import { shiftActions } from '../engine/actions/shift';
import { t } from '../i18n';
import type { EqState } from '../state';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, link, put, putFeed, sealSetup, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L00_SPECIES = ['N2', 'H2', 'Ar', 'NH3'];
export const L00_LEN_S = 600;
export const L00_EVENT_AT = 20;
export const L00_DECIDED_S = L00_EVENT_AT + 75;
/** Pins above the converter outlet temperature at shift start (K): High, Critical, and the interlock set point. Learner events are gentler (x 0.6 of the
 *  deviation, data/events.ts), so the set points sit lower there; both put the trip 40-55 s after the pump trip when nothing is done (a test asserts it). GAME numbers. */
export const PIN_HI = 12;
export const PINS = { learner: { crit: 25, ilk: 33 }, full: { crit: 40, ilk: 61 } };
/** D-B5 (Anjali, phase B): the iron catalyst lights off at 643 K (370 C); below it the converter goes out. The expert saves the night at 650 K, never below. */
export const L00_LIGHTOFF = 643;
const T_HEAT = 900, T_COOL = 700, T_DIAL = 650;
/** D-B2 (phase B): the cooler's temperature controller is slow on this loop, 1 % of its 150-1500 K range per plant second = 13.5 K/s (the palette default is 5 %, 67.5 K/s). Calibrated so a
 *  turn within ~2 s of the alarm keeps the converter out of Critical, a turn by ~30 s after it saves the night with time at Critical, and a later turn
 *  trips (learner from 58 s, engineer from 50 s of plant time; a test pins these). GAME numbers. */
export const L00_COOLER_ACT = 0.01;
/** Star: the dial turned within this many plant seconds of the pump trip. */
export const L00_QUICK_S = 10;
const PRESETS = { eq_reactor: { reactions: 'R1', mode: 'adiabatic' } };
const UNITS: LevelSpec['units'] = {};

const C = (K: number): number => K - 273.15;
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);

/** Ids by role: the build order below fixes them (F-101 ... I-112); the cooler and the converter are found by type. */
function build(s: EqState): void {
  const feed = putFeed(s, 0, 0, { N2: 0.2475, H2: 0.7425, Ar: 0.01 }, 250, 300, 2e6);
  const mix = put(s, 'mixer', 3, 0), comp = put(s, 'compressor', 6, 0, { P: 1.5e7, stages: 3 });
  const heat = put(s, 'heater', 11, 0, { T: T_HEAT, utility: 'fired' }), cool = put(s, 'cooler', 14, 0, { T: T_COOL, utility: 'cw', act_T: L00_COOLER_ACT });
  const rx = put(s, 'eq_reactor', 17, 0, { Tmin: L00_LIGHTOFF }), sep = put(s, 'nh3_sep', 22, 0), split = put(s, 'splitter', 22, 4, { frac: 0.02 });
  const valve = put(s, 'valve', 17, 8, { P: 2e6 }), flare = put(s, 'flare', 20, 10), prod = put(s, 'product', 22, 12), ilk = put(s, 'interlock', 2, 8);
  link(s, feed, 'out', mix, 'in1'); link(s, mix, 'out', comp, 'in'); link(s, comp, 'out', heat, 'in'); link(s, heat, 'out', cool, 'in'); link(s, cool, 'out', rx, 'in');
  link(s, rx, 'out', sep, 'in'); link(s, sep, 'vap', split, 'in'); link(s, sep, 'liq', prod, 'in'); link(s, split, 'purge', flare, 'in');
  link(s, split, 'out', valve, 'in'); link(s, valve, 'out', mix, 'in2');
  const r = runActions.commission!(s) as { ok: boolean; commissioned?: boolean; message: string };
  if (!r.ok || r.commissioned !== true) throw new Error('level setup: L00 loop did not commission: ' + r.message);
  // the thresholds sit above the temperature the converter outlet has at shift start
  const outPipe = s.flowsheet.streams.find((p) => p.from.unit === rx)!.id;
  const T0 = s.solved!.streams[outPipe]!.T;
  const rxU = s.flowsheet.units.find((u) => u.id === rx)!, ilkU = s.flowsheet.units.find((u) => u.id === ilk)!;
  const pins = s.mode === 'learner' ? PINS.learner : PINS.full;
  rxU.params.T_hi = T0 + PIN_HI; rxU.params.T_crit = T0 + pins.crit;
  Object.assign(ilkU.params, { variable: 'T', action: 'cut_feed', watch: rx, setpoint: T0 + pins.ilk });
  s.ui.pinned = ['T:' + rx];   // the recorder keeps the converter outlet trend: the printout's peak reads it
}

/** The first cooler set point of the night came within L00_QUICK_S plant seconds of the pump trip. */
export function quickTurn(s: S): boolean {
  const cool = s.flowsheet.units.find((u) => u.type === 'cooler');
  const at = cool ? s.shift?.firstEdits?.[cool.id + '.T'] : undefined;
  return at !== undefined && at <= L00_EVENT_AT + L00_QUICK_S;
}

/** D-B5 star: the cooler was not set below the catalyst's light-off (overcooling puts the converter out: the honest cost of the dial). */
export function catalystLit(s: S): boolean {
  const cool = s.flowsheet.units.find((u) => u.type === 'cooler');
  if (cool === undefined || typeof cool.params.T !== 'number') return false;
  const low = s.shift?.lowSet?.[cool.id + '.T'];   // Mateo: the lowest set point asked all night, not the last one
  return (cool.params.T as number) >= L00_LIGHTOFF && (low === undefined || low >= L00_LIGHTOFF);
}

export function loopMeasures(s: S): Measures {
  const sh = s.shift;
  const v: Record<string, number> = { t: 0, len: L00_LEN_S, conv_K: 0, nom_K: 0, tier: 0, cw_trip: 0, tripped: 0, high_s: 0, crit_s: 0, ended: 0, peak_K: 0, prod_kg: 0, dial_K: 0 };
  if (!sh) return { ok: false, v };
  const rx = unitsOfType(s, 'eq_reactor')[0], cool = unitsOfType(s, 'cooler')[0];
  const mon = sh.mon.find((m) => rx !== undefined && m.u === rx.id && m.v === 'T');
  const out = rx === undefined ? undefined : s.flowsheet.streams.find((p) => p.from.unit === rx.id);
  v.t = sh.t; v.len = sh.len;
  v.conv_K = out !== undefined ? sh.disp[out.id]?.T ?? 0 : 0;
  v.nom_K = mon?.nom ?? 0; v.tier = mon?.tier ?? 0;
  v.cw_trip = sh.act.some((e) => e.type === 'cw_pump_trip') ? 1 : 0;
  v.tripped = Object.keys(sh.trips).length > 0 ? 1 : 0;
  v.high_s = sh.stat.highS; v.crit_s = sh.stat.critS;
  // DESIGN: the cold open lasts <= 2 minutes. The story is decided 75 s after the pump trips (saved by the dial, or tripped by the
  // interlock ~45 s after the event); the night is "over" then, so the payoff card comes at ~95 s instead of after the 600 s shift.
  v.ended = sh.ended === 'time' || (v.cw_trip === 1 && sh.t >= L00_DECIDED_S) ? 1 : 0;
  v.len = Math.min(sh.len, L00_DECIDED_S);
  v.peak_K = Math.max(...(rx !== undefined ? s.trends['T:' + rx.id] ?? [0] : [0]), v.conv_K);
  v.prod_kg = sh.acc.prodKg;
  v.dial_K = cool !== undefined && typeof cool.params.T === 'number' ? cool.params.T : 0;
  return { ok: true, v };
}

const COACH: CoachStep[] = [
  { id: 'tap_converter', role: 'supervisor', focus: 'eq_reactor', done: (s) => s.ui.pinned.includes('eqwin') || s.ui.coachStep === 'tap_converter' || (s.shift?.t ?? 0) >= L00_EVENT_AT },
  { id: 'inlet_down', role: 'supervisor', focus: 'cooler', done: (s) => s.shift === null || s.shift.ended !== '' || Object.keys(s.shift.ramps).length > 0 || Math.abs((unitsOfType(s, 'cooler')[0]?.params.T as number) - T_COOL) > 1 },
];

const solver = () => {
  let acted = false;
  return (s: S): Action[] => {
    if (acted || !s.shift || s.shift.t < L00_EVENT_AT + 1) return [];   // D-B2: the expert turns the slow cooler within a second of the alarm
    acted = true;
    const cool = unitsOfType(s, 'cooler')[0]!;
    return [{ name: 'setpoint', args: [cool.id, 'T', T_DIAL] }];
  };
};

export const L00: LevelSpec = {
  id: 'L00', chapter: 0, index: 0, setter: 'supervisor', budgetUSD: 0, units: UNITS, notes: 2, shiftLen: L00_LEN_S, maxTicks: L00_LEN_S + 50,
  setup: (s) => {
    baseSetup(s, L00_SPECIES, UNITS, PRESETS);
    s.palette = null;   // open while the loop is built; the player gets no parts in this level
    s.level = 'L00';   // the event table is keyed by the level and `startLevel` sets it only after setup
    build(s);
    const r = shiftActions.startShift!(s, 'shift', true) as { ok: boolean; message: string };
    if (!r.ok) throw new Error('level setup: L00 shift did not start: ' + r.message);
    s.level = null;
    s.palette = [];
    s.undo = { past: [], future: [] };
  },
  measures: loopMeasures,
  goals: (_s, m) => [{ key: 'night', met: m.v.ended === 1, value: m.v.t, target: m.v.len, unit: 's' }],   // plant seconds into the night; the night is decided at v.len (95 s), not the 600 s the shift timer is set to
  won: (_s, m) => m.v.ended === 1 && m.v.tripped === 0,   // D-B2: a tripped night is a loss (it still plays the story card)
  lost: (_s, m) => (m.v.ended === 1 && m.v.tripped === 1 ? 'lv.L00.lost' : null),
  extraStars: (s) => [catalystLit(s), quickTurn(s)],
  callIt: null,
  hero: (_s, m) => ({ key: 'conv_c', unit: '°C', value: C(m.v.conv_K!), lo: C(m.v.nom_K!) - 15, hi: C(m.v.nom_K!) + PIN_HI }),
  secondary: (_s, m) => ({ key: 'shift_s', unit: 's', value: m.v.t!, limit: m.v.len! }),
  annunciators: (_s, m): Annunciator[] => [
    { key: 'cw', legend: t('lv.L00.ann.cw'), state: !m.ok ? 'off' : m.v.cw_trip ? 'critical' : 'normal' },
    { key: 'hi', legend: t('lv.L00.ann.hi'), state: !m.ok ? 'off' : m.v.tier! >= 2 ? 'high' : 'normal' },
    { key: 'hh', legend: t('lv.L00.ann.hh'), state: !m.ok ? 'off' : m.v.tier! >= 3 ? 'critical' : 'normal' },
    { key: 'ilk', legend: t('lv.L00.ann.ilk'), state: !m.ok ? 'off' : m.v.tripped ? 'critical' : 'normal' },
    { key: 'flare', legend: t('lv.L00.ann.flare'), state: !m.ok ? 'off' : m.v.tripped ? 'high' : 'off' },
  ],
  coach: COACH,
  verdict: (s, m) => (m.v.ended === 1 ? { key: m.v.tripped ? 'tripped' : 'saved', cause: null } : { key: 'not_run', cause: null }),
  equation: () => null,
  lessonVars: (s, m) => ({ peak: f(s, C(m.v.peak_K!)), nom: f(s, C(m.v.nom_K!)), dial: f(s, C(m.v.dial_K!)), t: f(s, m.v.t!) }),
  metrics: (_s, m) => [
    { key: 'peak_c', unit: '°C', value: C(m.v.peak_K!) },
    { key: 'alarm_s', unit: 's', value: m.v.high_s! },
    { key: 'critical_s', unit: 's', value: m.v.crit_s! },
  ],
  histogram: null,
  card: (_s, m): Record<string, string | number> => (m.v.ended === 1 ? { title_card: t('lv.L00.card') } : {}),
  solver,
  naive: () => () => [],
};
