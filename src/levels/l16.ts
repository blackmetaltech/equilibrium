// L16 · Light-off (DESIGN 2.6 Chapter 4). First contact bed of the acid plant: SO2 / O2 / N2 over V2O5-K2SO4 (K2 Eklund), adiabatic, 1.5 bar. The catalyst is asleep
// below about 400 C (an Arrhenius cliff) and damaged above 620-630 C. The player pipes feed -> feed-effluent exchanger -> start-up heater -> bed -> exchanger -> tank:
// you need heat to make heat. Goal: bed conversion >= 60 % with the bed's hottest point <= 620 C. A shift (feed_surge raising SO2, catalyst_age) is available
// after the commission (data/events.ts L16 table): richer gas raises the outlet temperature, so the inlet has to come down.
import type { Action } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import type { EqState } from '../state';
import { readUnit, convOf, toC, C0, type BedRead } from './ch4_common';
import type { Annunciator, CoachStep, LevelSpec, Measures } from './spec';
import { baseSetup, commissions, putFeed, put, sealSetup, shown, spentOf, unitsOfType } from './util';

type S = Readonly<EqState>;
export const L16_SPECIES = ['SO2', 'O2', 'SO3', 'N2'];
export const L16_FEED_X = { SO2: 0.1, O2: 0.11, N2: 0.79 };
export const L16_FEED_KMOL_H = 100;
export const L16_P = 1.5 * 101325, L16_T_FEED = 298.15;
/** Catalyst per mol/s of feed, kg: the light-off cliff of the research fixture sits just under 400 C for this load (src/oracle K2 check: 20 kg per mol/s gives the DESIGN 626 C bed). */
export const L16_W_PER_MOLS = 12;
export const L16_W_KG = L16_W_PER_MOLS * ((L16_FEED_KMOL_H * 1000) / 3600);
export const L16_CONV = 0.6;
export const L16_TMAX_C = 620, L16_DAMAGE_C = 630, L16_LIGHTOFF_C = 400;
export const L16_UNITS: LevelSpec['units'] = {
  feed: { max: 1, price: 6000 }, hx: { max: 1, price: 30000 }, heater: { max: 1, price: 20000 }, packed_bed: { max: 1, price: 60000 }, product: { max: 1, price: 5000 },
};
export const L16_BUDGET = 150000;
const PRESETS = { heater: { utility: 'fired', T: 683.15 }, hx: { area: 10 } };
/** Reference build: 410 C bed inlet, a 50 m2 exchanger that carries almost all of the preheat (the fired heater only trims; a bigger exchanger leaves the fired
 *  heater nothing to do but cool, and the solve says so: UTILITY_CANNOT_REACH). */
export const L16_REF_T_C = 410, L16_REF_AREA = 50;
/** DESIGN star 2 is "start-up heater off after commission". The sequential solver cannot start a heat-integrated bed cold (TEMPERATURE_CROSS with no heater), so it is
 *  scored as the heater trimming at most this much fuel, kW (about 5 % of the 190 kW the bed releases). GAME. */
export const L16_TRIM_KW = 10;
export const L16_NAIVE_T_C = 350;

export function lightMeasures(s: S): Measures {
  const bed = unitsOfType(s, 'packed_bed')[0], heater = unitsOfType(s, 'heater')[0], hx = unitsOfType(s, 'hx')[0];
  const v: Record<string, number> = {
    w: bed && typeof bed.params.W === 'number' ? (bed.params.W as number) : 0, w0: L16_W_KG, load_ok: bed && Math.abs((bed.params.W as number) - L16_W_KG) < 1e-6 ? 1 : 0,
    set_c: heater && typeof heater.params.T === 'number' ? toC(heater.params.T as number) : 0, has_heater: heater ? 1 : 0, area: hx && typeof hx.params.area === 'number' ? (hx.params.area as number) : 0,
    in_c: 0, out_c: 0, tmax_c: 0, conv: 0, xeq: 0, eta: 0, heater_kw: 0, cost_per_t: 0, so3_pct: 0, hx_out_c: 0, lit: 0,
  };
  const rd: BedRead | undefined = readUnit(s, 'packed_bed');
  if (!rd || !rd.outlet || !rd.inlet) return { ok: false, v };
  v.in_c = toC(rd.inlet.T); v.out_c = toC(rd.outlet.T); v.tmax_c = toC(rd.info.Tmax ?? rd.outlet.T);
  v.conv = convOf(s, rd, 'SO2'); v.xeq = rd.info.Xeq ?? 0; v.eta = rd.info.eta ?? 0;
  const tot = rd.outlet.n.reduce((a, b) => a + b, 0), i3 = s.species.indexOf('SO3');
  v.so3_pct = tot > 0 ? (rd.outlet.n[i3]! / tot) * 100 : 0;
  v.heater_kw = s.solved?.kpis.fired_duty_kw ?? 0;
  const c = s.solved?.kpis.cost_usd_per_t ?? 0; v.cost_per_t = c >= 1e8 ? 0 : c;
  v.lit = v.conv >= 0.3 ? 1 : 0;
  return { ok: true, v };
}

const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
const has = (s: S, type: string): boolean => unitsOfType(s, type).length >= 1;
const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
const COACH: CoachStep[] = [
  { id: 'place_hx', role: 'supervisor', focus: 'hx', done: (s) => has(s, 'hx') },
  { id: 'place_heater', role: 'supervisor', focus: 'heater', done: (s) => has(s, 'heater') },
  { id: 'pipe_up', role: 'supervisor', done: (s) => s.flowsheet.streams.length >= 5 },
  { id: 'commission', role: 'supervisor', focus: 'key', done: (s) => commissions(s) >= 1 },
  { id: 'read_bed', role: 'supervisor', focus: 'packed_bed', done: LATE(['read_bed', 'trim_heater', 'why']) },
  { id: 'trim_heater', role: 'supervisor', done: (s) => commissions(s) >= 2 || LATE(['why'])(s) },
  { id: 'why', role: 'supervisor', done: LATE(['why']) },
];

/** The scripted player: exchanger and heater, the line, the inlet temperature and the exchanger area. */
export const l16Player = (tC: number, area: number) => (_seed?: number) => {
  let stage = 0;
  return (s: S, _ctx?: unknown): Action[] => {
    const U = (type: string) => unitsOfType(s, type)[0]!;
    if (stage === 0) { stage = 1; return [{ name: 'placeUnit', args: ['hx', 6, 6, 0] }, { name: 'placeUnit', args: ['heater', 12, 6, 0] }]; }
    if (stage === 1) {
      stage = 2;
      const feed = U('feed'), hx = U('hx'), heat = U('heater'), bed = U('packed_bed'), prod = U('product');
      return [
        { name: 'setParam', args: [heat.id, 'T', tC + C0] }, { name: 'setParam', args: [hx.id, 'area', area] },
        { name: 'connect', args: [feed.id, 'out', hx.id, 'cold_in'] }, { name: 'connect', args: [hx.id, 'cold_out', heat.id, 'in'] }, { name: 'connect', args: [heat.id, 'out', bed.id, 'in'] },
        { name: 'connect', args: [bed.id, 'out', hx.id, 'hot_in'] },
        { name: 'connect', args: [hx.id, 'hot_out', prod.id, 'in'] },
        { name: 'commission' },
      ];
    }
    return [];
  };
};

export const L16: LevelSpec = {
  id: 'L16', firstRun: true, chapter: 4, index: 16, setter: 'supervisor', budgetUSD: L16_BUDGET, units: L16_UNITS, notes: 2, shiftLen: 0,
  setup: (s) => {
    baseSetup(s, L16_SPECIES, L16_UNITS, PRESETS);
    putFeed(s, 0, 6, L16_FEED_X, L16_FEED_KMOL_H, L16_T_FEED, L16_P);
    const bed = put(s, 'packed_bed', 18, 2, { W: L16_W_KG, mode: 'adiabatic' });
    s.flowsheet.units.find((u) => u.id === bed)!.catalystId = 'v2o5';
    put(s, 'product', 22, 8);
    sealSetup(s);
  },
  measures: lightMeasures,
  goals: (s, m) => {
    const g: ReturnType<LevelSpec['goals']> = [
      { key: 'conv', met: m.ok && m.v.conv! >= L16_CONV, ...(m.ok ? { value: m.v.conv! * 100 } : {}), target: L16_CONV * 100 },
      { key: 'tmax', met: m.ok && m.v.tmax_c! <= L16_TMAX_C, ...(m.ok ? { value: m.v.tmax_c } : {}), target: L16_TMAX_C },
      { key: 'load', met: m.v.load_ok === 1, value: m.v.w!, target: L16_W_KG },
    ];
    if (s.mode === 'engineer') { const sp = spentOf(s, L16_UNITS); g.push({ key: 'budget', met: sp <= L16_BUDGET, value: sp, target: L16_BUDGET }); }
    return g;
  },
  extraStars: (_s, m) => [m.ok && m.v.heater_kw! <= L16_TRIM_KW, m.ok && m.v.cost_per_t! > 0 && m.v.cost_per_t! <= L16_STAR3_COST],
  callIt: null,
  hero: (_s, m) => ({ key: 'conv_pct', unit: '%', value: m.v.conv! * 100, lo: L16_CONV * 100, hi: 72 }),
  secondary: (_s, m) => ({ key: 'tmax_c', unit: '°C', value: m.v.tmax_c!, limit: L16_TMAX_C }),
  annunciators: (s, m, g): Annunciator[] => {
    const failed = s.solved !== null && !s.solved.ok;
    return [
      { key: 'light', legend: t('lv.L16.ann.light'), state: !m.ok ? 'off' : m.v.in_c! < L16_LIGHTOFF_C ? 'high' : 'normal' },
      { key: 'asleep', legend: t('lv.L16.ann.asleep'), state: !m.ok ? 'off' : m.v.conv! < L16_CONV ? 'high' : 'normal' },
      { key: 'bedhi', legend: t('lv.L16.ann.bedhi'), state: !m.ok ? 'off' : m.v.tmax_c! > L16_DAMAGE_C ? 'critical' : m.v.tmax_c! > L16_TMAX_C ? 'high' : 'normal' },
      { key: 'fire', legend: t('lv.L16.ann.fire'), state: !m.ok ? 'off' : m.v.heater_kw! > 1e-3 ? 'high' : 'normal' },
      { key: 'load', legend: t('lv.L16.ann.load'), state: m.v.load_ok === 1 ? 'off' : 'critical' },
      { key: 'solve', legend: t('lv.L16.ann.solve'), state: failed ? 'critical' : 'off' },
      { key: 'goal', legend: t('lv.L16.ann.goal'), state: m.ok && g.every((x) => x.met) ? 'normal' : 'off' },
    ];
  },
  coach: COACH,
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const vars = { tin: f(s, m.v.in_c!), tout: f(s, m.v.out_c!), tmax: f(s, m.v.tmax_c!), x: f(s, m.v.conv! * 100), want: f(s, L16_CONV * 100), lim: f(s, L16_TMAX_C), off: f(s, L16_LIGHTOFF_C), w: f(s, m.v.w!), w0: f(s, L16_W_KG) };
    if (m.v.load_ok !== 1) return { key: 'load', cause: t('lv.L16.cause.load', vars) };
    if (m.v.conv! < L16_CONV) return { key: 'asleep', cause: t('lv.L16.cause.asleep', vars) };
    return { key: 'hot', cause: t('lv.L16.cause.hot', vars) };
  },
  equation: (s, m) => (m.ok && m.v.xeq! > 0 ? `${f(s, shown(m.v.conv!))} ÷ ${f(s, shown(m.v.xeq!))} = ${f(s, shown(shown(m.v.conv!) / shown(m.v.xeq!)))}` : null),
  lessonVars: (s, m) => ({ tin: f(s, m.v.in_c!), tout: f(s, m.v.out_c!), x: f(s, m.v.conv! * 100), xeq: f(s, m.v.xeq! * 100), kw: f(s, m.v.heater_kw!), runs: commissions(s) }),
  metrics: (_s, m) => [
    { key: 'conv_pct', unit: '%', value: m.v.conv! * 100 },
    { key: 'tmax_c', unit: '°C', value: m.v.tmax_c! },
    { key: 'heater_kw', unit: 'kW', value: m.v.heater_kw! },
  ],
  histogram: { metric: 'conv_pct', best: () => 71.9, spread: 0.08, lowerIsBetter: false },
  solver: l16Player(L16_REF_T_C, L16_REF_AREA),
  naive: l16Player(L16_NAIVE_T_C, L16_REF_AREA),
};
/** GAME: $/t of stream at the reference build x 1.03 (14.45 -> 14.9). UNVERIFIED. */
export const L16_STAR3_COST = 14.9;
