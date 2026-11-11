// L34 · HAZOP Node (DEPTH Ch 9): the acid plant's waste-heat cooler E-102. Guide words x parameters; the engine simulates each deviation on the node (src/sim/ops/hazop.ts) and derives the
// consequence class; the worksheet rows {node, param, guide, cause, consequence, safeguard} are graded against that and the safeguard catalogue. Engineer: the proposed safeguards have a budget.
import { need } from '@core/kit';
import { fmtNumber } from '../engine/solved';
import { t } from '../i18n';
import { en } from '../locales/en';
import { CAUSES, CLASSES, DEVS, GUIDES, NODE, PARAMS, SAFEGUARDS, SIGNIFICANT, callItTout, devOf, gradeRows, minProposalUsd, simOf, tSat, type Row } from '../sim/ops/hazop';
import { dmath } from '@core/numerics';
import type { EqState } from '../state';
import { CARRIER_UNITS, LATE, act, carrierSetup, edit, goalLamp, listOf, lit, mNone, playOnce } from './ch9_common';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { commissions, predictionOf, relErr, shown, solvedOk } from './util';

type S = Readonly<EqState>;
export const L34_BUDGET = 90000;
export const L34_CALL_TOL = 0.03;
const MIN = minProposalUsd();
export const L34_MIN_USD = MIN.usd;
export const L34_USD_STAR = MIN.usd * 1.03;
const KEYS = ['needed', 'covered', 'wrongClass', 'wrongSafe', 'wrongCause', 'rows', 'usd', 'minUsd', 'cov', 'tout', 'ts', 'tin', 'k', 'sim', 'unsafe', 'firstGap'];
const f = (s: { region: string }, x: number): string => fmtNumber(x, s.region);
/** A readable label for a worksheet id; the id itself only if no label exists. */
const lab = (group: string, id: string): string => (`lv.L34.${group}.${id}` in en ? t(`lv.L34.${group}.${id}`) : id === 'none' ? t('lv.L34.sg.none') : id);
const rowsOf = (s: S): Row[] => listOf<Row>(s, 'rows');
/** A deviation counts as covered only by a row with the right consequence class: a wrong-consequence row is a gap, not coverage. */
const coveredOf = (rows: Row[]): number => SIGNIFICANT.filter((x) => rows.some((r) => r.param === x.param && r.guide === x.guide && r.cons === simOf(r.param, r.guide)?.cls)).length;
/** The first significant deviation (in worksheet order) that has no row yet, as an index into SIGNIFICANT; -1 if none. */
const firstGap = (rows: Row[]): number => SIGNIFICANT.findIndex((x) => !rows.some((r) => r.param === x.param && r.guide === x.guide && r.cons === simOf(r.param, r.guide)?.cls));

function measures(s: S): Measures {
  const rows = rowsOf(s), g = gradeRows(rows);
  const ts = tSat(NODE.pDrum), k = dmath.exp(-NODE.ntu0);
  const base = { tout: callItTout(), ts, tin: NODE.tIn, k, minUsd: MIN.usd, needed: g.needed };
  if (!solvedOk(s)) return mNone(KEYS, base);
  const gap = firstGap(rows);
  return { ok: true, v: { ...base, covered: coveredOf(rows), wrongClass: g.wrongClass, wrongSafe: g.wrongSafe, wrongCause: g.wrongCause, rows: rows.length, usd: g.proposalUsd, cov: (100 * coveredOf(rows)) / g.needed, sim: listOf<string>(s, 'simmed').length, unsafe: g.wrongSafe, firstGap: gap } };
}

export const L34: LevelSpec = {
  id: 'L34', chapter: 9, index: 34, setter: 'safety', budgetUSD: L34_BUDGET, units: CARRIER_UNITS, notes: 3, shiftLen: 0,
  setup: (s) => { carrierSetup(s); s.lv.rows = []; s.lv.simmed = []; },
  measures,
  goals: (s, m) => {
    const g: GoalEval[] = [
      { key: 'cover', met: m.ok && m.v.covered === m.v.needed, ...(m.ok ? { value: m.v.covered } : {}), target: m.v.needed! },
      { key: 'accurate', met: m.ok && m.v.wrongClass! + m.v.wrongSafe! + m.v.wrongCause! === 0, ...(m.ok ? { value: m.v.wrongClass! + m.v.wrongSafe! + m.v.wrongCause! } : {}), target: 0 },
    ];
    if (s.mode === 'engineer') g.push({ key: 'budget', met: m.ok && m.v.usd! <= L34_BUDGET, value: m.ok ? m.v.usd! : 0, target: L34_BUDGET });
    return g;
  },
  extraStars: (s, m) => [
    predictionOf(s, 'tout_water_loss') !== null && relErr(predictionOf(s, 'tout_water_loss')!.value, callItTout()) <= L34_CALL_TOL,
    m.ok && m.v.usd! <= L34_USD_STAR,
  ],
  callIt: { key: 'tout_water_loss', unit: 'K', tol: L34_CALL_TOL, truth: () => callItTout() },
  hero: (_s, m) => ({ key: 'cov', unit: '%', value: m.v.cov ?? 0, lo: 0, hi: 100 }),
  secondary: (_s, m) => ({ key: 'usd', unit: 'USD', value: m.v.usd ?? 0, limit: L34_BUDGET }),
  annunciators: (_s, m, g): Annunciator[] => [
    { key: 'gaps', legend: t('lv.L34.ann.gaps'), state: lit(m.ok, m.v.covered === m.v.needed) },
    { key: 'class', legend: t('lv.L34.ann.class'), state: lit(m.ok, m.v.wrongClass === 0) },
    { key: 'guard', legend: t('lv.L34.ann.guard'), state: lit(m.ok, m.v.wrongSafe === 0) },
    { key: 'cause', legend: t('lv.L34.ann.cause'), state: lit(m.ok, m.v.wrongCause === 0) },
    { key: 'budget', legend: t('lv.L34.ann.budget'), state: !m.ok ? 'off' : m.v.usd! > L34_BUDGET ? 'high' : 'normal' },
    { key: 'goal', legend: t('lv.L34.ann.goal'), state: goalLamp(m.ok, g) },
  ],
  coach: [
    { id: 'simulate', role: 'safety', done: (s) => listOf(s, 'simmed').length > 0 },
    { id: 'row', role: 'safety', done: (s) => rowsOf(s).length > 0 },
    { id: 'cover', role: 'safety', done: (s) => coveredOf(rowsOf(s)) === SIGNIFICANT.length },
    { id: 'commission', role: 'safety', focus: 'key', done: (s) => commissions(s) >= 1 },
    { id: 'why', role: 'safety', done: LATE(['why']) },
  ],
  verdict: (s, m, g) => {
    if (!m.ok) return { key: 'not_run', cause: null };
    if (g.every((x) => x.met)) return { key: 'pass', cause: null };
    const gap = SIGNIFICANT[m.v.firstGap!];
    const gv = gap ? { dev: `${t(`lv.L34.param.${gap.param}`)} / ${t(`lv.L34.guide.${gap.guide}`)}`, cls: t(`lv.L34.cls.${gap.cls}`), tout: f(s, gap.tOut), tube: f(s, gap.tubeMetal), mins: f(s, Math.min(9999, gap.tUncoverMin)), n: f(s, m.v.needed! - m.v.covered!) } : { dev: '', cls: '', tout: '', tube: '', mins: '', n: '0' };
    if (m.v.covered! < m.v.needed!) return { key: 'gaps', cause: t(gap && gap.cls === 'release' ? 'lv.L34.cause.gaps_release' : 'lv.L34.cause.gaps', gv) };
    if (m.v.wrongClass! > 0) return { key: 'class', cause: t('lv.L34.cause.class', { n: f(s, m.v.wrongClass!) }) };
    if (m.v.wrongSafe! > 0) return { key: 'guard', cause: t('lv.L34.cause.guard', { n: f(s, m.v.wrongSafe!) }) };
    if (m.v.wrongCause! > 0) return { key: 'cause', cause: t('lv.L34.cause.cause', { n: f(s, m.v.wrongCause!) }) };
    return { key: 'budget', cause: t('lv.L34.cause.budget', { usd: f(s, m.v.usd!), budget: f(s, L34_BUDGET) }) };
  },
  equation: (s, m) => {
    const ts = shown(m.v.ts!), tin = m.v.tin!, k = shown(m.v.k!), out = shown(ts + (tin - ts) * k);
    return `${f(s, ts)} + (${f(s, tin)} − ${f(s, ts)}) × ${f(s, k)} = ${f(s, out)} K of gas outlet`;
  },
  lessonVars: (s, m) => ({ tout: f(s, m.v.tout!), ts: f(s, m.v.ts!), n: f(s, m.v.needed!), rows: f(s, m.v.rows ?? 0), usd: f(s, m.v.usd ?? 0), dew: f(s, NODE.tDew) }),
  metrics: (_s, m) => [
    { key: 'usd', unit: 'USD', value: m.v.usd ?? 0 },
    { key: 'cov', unit: '%', value: m.v.cov ?? 0 },
    { key: 'rows', unit: '', value: m.v.rows ?? 0 },
  ],
  histogram: { metric: 'usd', best: () => MIN.usd, spread: 0.8, lowerIsBetter: true },
  actions: {
    simulate: (s, param: unknown, guide: unknown) => {
      need(devOf(String(param), String(guide)) !== undefined, t('lv.err.ch9_item', { id: `${String(param)}/${String(guide)}` }));
      const l = listOf<string>(s, 'simmed'), id = `${String(param)}.${String(guide)}`;
      if (!l.includes(id)) s.lv.simmed = [...l, id];
    },
    addRow: (s, param: unknown, guide: unknown, cause: unknown, cons: unknown, safe: unknown) => edit(s, () => {
      need(devOf(String(param), String(guide)) !== undefined, t('lv.err.ch9_item', { id: `${String(param)}/${String(guide)}` }));
      need(typeof cause === 'string' && CAUSES.includes(cause), t('lv.err.ch9_item', { id: String(cause) }));
      need(typeof cons === 'string' && (CLASSES as readonly string[]).includes(cons), t('lv.err.ch9_item', { id: String(cons) }));
      need(typeof safe === 'string' && SAFEGUARDS.some((x) => x.id === safe), t('lv.err.ch9_item', { id: String(safe) }));
      const rows = rowsOf(s).filter((r) => !(r.param === param && r.guide === guide));
      rows.push({ param: param as string, guide: guide as string, cause: cause as string, cons: cons as string, safe: safe as string });
      s.lv.rows = rows;
    }),
    removeRow: (s, param: unknown, guide: unknown) => edit(s, () => { s.lv.rows = rowsOf(s).filter((r) => !(r.param === param && r.guide === guide)); }),
    clear: (s) => edit(s, () => { s.lv.rows = []; }),
  },
  view: (s) => {
    const rows = rowsOf(s), simmed = listOf<string>(s, 'simmed'), g = gradeRows(rows);
    return {
      kind: 'hazop',
      node: { id: NODE.id, label: t('lv.L34.node'), design: { tIn: NODE.tIn, tSat: tSat(NODE.pDrum), tDew: NODE.tDew, tAbsMax: NODE.tAbsMax, tTubeMax: NODE.tTubeMax, pDrum: NODE.pDrum, ntu: NODE.ntu0 } },
      params: PARAMS.map((id) => ({ id, label: t(`lv.L34.param.${id}`) })),
      guides: GUIDES.map((id) => ({ id, label: t(`lv.L34.guide.${id}`) })),
      causes: CAUSES.map((id) => ({ id, label: t(`lv.L34.cause_opt.${id}`) })),
      consequences: CLASSES.map((id, sev) => ({ id, sev, label: t(`lv.L34.cls.${id}`) })),
      safeguards: SAFEGUARDS.map((x) => ({ id: x.id, label: t(`lv.L34.sg.${x.id}`), priceUSD: x.price, installed: x.installed })),
      cells: PARAMS.flatMap((p) => GUIDES.map((gw) => {
        const dv = devOf(p, gw), sm = simOf(p, gw), shownSim = dv && sm && simmed.includes(`${p}.${gw}`);
        return {
          param: p, guide: gw, meaningful: dv !== undefined, simulated: shownSim === true, causes: dv ? dv.causes : [],
          sim: shownSim && sm ? { tOut: sm.tOut, dewMargin: sm.dewMargin, tubeMetal: sm.tubeMetal, tUncoverMin: Math.min(9999, sm.tUncoverMin), pSteam: sm.pSteam, carry: sm.carry ? 1 : 0, cls: sm.cls, sev: sm.sev } : null,
          row: rows.some((r) => r.param === p && r.guide === gw),
          rowState: ((): string => { const r = rows.find((x) => x.param === p && x.guide === gw); if (!r) return ''; if (!SIGNIFICANT.some((x) => x.param === p && x.guide === gw)) return 'extra'; return r.cons === sm?.cls ? 'covered' : 'wrong'; })(),
        };
      })),
      rows: rows.map((r) => {
        const dv = devOf(r.param, r.guide), sm = simOf(r.param, r.guide);
        return { ...r, paramLabel: lab('param', r.param), guideLabel: lab('guide', r.guide), causeLabel: lab('cause_opt', r.cause), consLabel: lab('cls', r.cons), safeLabel: lab('sg', r.safe), node: NODE.id, graded: solvedOk(s), consOk: !!sm && sm.cls === r.cons, causeOk: !!dv && dv.causes.includes(r.cause), safeOk: !!dv && (dv.safeguards.includes(r.safe) || (r.safe === 'none' && !!sm && sm.sev <= 1)) };
      }),
      coverage: { covered: coveredOf(rows), needed: g.needed }, proposalUSD: g.proposalUsd, budgetUSD: L34_BUDGET, minProposalUSD: MIN.usd,
    };
  },
  solver: playOnce((s) => {
    const have = new Set([...SAFEGUARDS.filter((x) => x.installed).map((x) => x.id), ...MIN.set]);
    return [...SIGNIFICANT.map((x) => {
      const dv = devOf(x.param, x.guide)!;
      return act('addRow', x.param, x.guide, dv.causes[0], x.cls, dv.safeguards.find((q) => have.has(q))!);
    })];
  }, { callIt: () => callItTout() }),
  naive: playOnce(() => [act('addRow', 'flow_gas', 'more', 'blower_speed', 'operability', 'tahh'), act('addRow', 'temp', 'more', 'converter_upset', 'operability', 'tahh'), act('addRow', 'pressure', 'more', 'valve_closed', 'operability', 'psv')]),
};
