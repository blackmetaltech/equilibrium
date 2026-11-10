// The EQUILIBRIUM game definition the core engine runs (DESIGN §8). M1.12 glue: design / run / meta actions, the plant queries, the compact
// snapshot, generic metrics, legal actions and the game invariants. M1.11 adds the shift actions and systems; levels arrive with M2.
import { baseState, log, type GameDef } from '@core/kit';
import { t } from './i18n';
import { LEVELS } from './levels';
import { PERSONAS } from './personas';
import { REGIONS } from './regions';
import { MAX_SPECIES, MAX_UNITS, PHASES, THERMO_DETAILS, DEFAULT_PLOT, emptyFlowsheet, emptyProgress, type EqState } from './state';
import { designActions } from './engine/actions/design';
import { metaActions } from './engine/actions/meta';
import { runActions } from './engine/actions/run';
import { shiftActions, shiftSystems } from './engine/actions/shift';
import { legalActions } from './engine/legal';
import { plantQueries } from './engine/queries/plant';
import { plotQueries } from './engine/queries/plots';
import { instrumentQueries } from './engine/queries/instruments';
import { streamQueries } from './engine/queries/stream';
import { unitQueries } from './engine/queries/unit';
import { explainQueries } from './engine/queries/explain';
import { levelActions, levelQueries, levelTickSystem } from './engine/queries/level';
import { snapshotOf } from './engine/snapshot';
import { ledgerOf } from './engine/solved';
import { en } from './locales/en';

export const GAME_ID = 'equilibrium';

/** Works name of the state's region pack (a regional string; a pack that lacks it is a bug caught by validateEqPackStrings). */
function worksName(region: string): string {
  const p = REGIONS.get(region);
  return p.strings[p.data.setting.worksName] ?? '';
}

/** Every number anywhere inside a JSON-like value is finite (path of the first offender, or null). */
function firstNonFinite(v: unknown, path = '', depth = 0): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (depth > 12 || v === null || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const r = firstNonFinite(x, path ? `${path}.${k}` : k, depth + 1);
    if (r !== null) return r;
  }
  return null;
}

/** Keys every level may choose its three from; all finite. */
export function metricsOf(s: Readonly<EqState>): Record<string, number> {
  const k = s.solved?.ok ? s.solved.kpis : null;
  const g = (key: string): number => (k && Number.isFinite(k[key]) ? k[key]! : 1e9);
  const z = (key: string): number => (k && Number.isFinite(k[key]) ? k[key]! : 0);
  return {
    cost_usd_per_t: g('cost_usd_per_t'), energy_gj_per_t: g('energy_gj_per_t'), co2e_t_per_t: g('co2e_t_per_t'), capex_usd: z('capex_usd'),
    opex_usd_per_h: z('opex_usd_per_h'), product_t_per_h: z('product_t_per_h'), electric_kw: z('electric_kw'), steam_raised_t_per_h: z('steam_raised_t_per_h'),
    actions_used: s.levelActions?.length ?? 0,
  };
}

export const GAME: GameDef<EqState> = {
  id: GAME_ID,
  title: 'EQUILIBRIUM',
  saveVersion: 1,
  /** Game-wide rules version: part of every solution code's ruleset id. Bump when a rule change can change a level score. */
  rulesetVersion: 1,
  /** Consecutive tick(n) entries merge in solution codes (valid: shift results are partition-invariant, property P21). */
  mergeTicks: true,
  regions: REGIONS,
  modes: ['learner', 'engineer', 'sandbox'],
  /** Generic level scores (snake_case with units, always finite; 1e9 = no product / not commissioned). M2.1 selects the three of each level. */
  metrics: (s) => metricsOf(s),
  newGame: (seed, mode, ctx) => {
    const s: EqState = {
      ...baseState(GAME_ID, seed, mode, ctx.region.id),
      phase: 'design', thermoDetail: 'rigorous', species: [], flowsheet: emptyFlowsheet(), feeds: {}, solved: null, shift: null,
      trends: {}, replay: [], runs: [], prediction: null, progress: emptyProgress(), ui: { pinned: [], coachStep: null }, lv: {},
      warm: null, palette: null, limits: {}, presets: {}, plot: { ...DEFAULT_PLOT }, undo: { past: [], future: [] },
    };
    log(s, t('log.start', { works: ctx.region.strings[ctx.region.data.setting.worksName] ?? '' }));
    return s;
  },
  /** Campaign meta state only; nothing a level's rules read (codes are verified without it). */
  carryOver: (prev) => ({ progress: structuredClone(prev.progress) }),
  actions: { ...designActions, ...runActions, ...shiftActions, ...metaActions, ...levelActions },
  /** The shift pipeline (DESIGN 8.5): a no-op outside a shift. */
  systems: [...shiftSystems, levelTickSystem],
  queries: { ...plantQueries, ...unitQueries, ...streamQueries, ...plotQueries, ...instrumentQueries, ...explainQueries, ...levelQueries },
  legalActions,
  snapshot: snapshotOf,
  concepts: [
    { id: 'extent', name: t('concept.extent.name'), icon: 'ξ', what: t('concept.extent.what'), why: t('concept.extent.why'),
      equation: 'n_i = n_i,0 + ν_i · ξ', simplification: t('concept.extent.simplification'), source: 'Felder & Rousseau, Elementary Principles of Chemical Processes, ch 4' },
    { id: 'equilibrium', name: t('concept.equilibrium.name'), icon: '⇌', what: t('concept.equilibrium.what'), why: t('concept.equilibrium.why'),
      equation: 'ΔG° = −R T ln K', simplification: t('concept.equilibrium.simplification'), source: 'Atkins, Physical Chemistry, ch 6' },
  ],
  levels: LEVELS,
  personas: PERSONAS,
  invariants: (s) => {
    const v: { rule: string; detail: string }[] = [];
    const bad = firstNonFinite(s.flowsheet) ?? firstNonFinite(s.feeds) ?? firstNonFinite(s.solved) ?? firstNonFinite(s.progress) ?? firstNonFinite(s.warm) ?? firstNonFinite(s.runs);
    if (bad !== null) v.push({ rule: 'numbers are finite', detail: bad });
    if (!PHASES.includes(s.phase)) v.push({ rule: 'phase is valid', detail: String(s.phase) });
    if (!THERMO_DETAILS.includes(s.thermoDetail)) v.push({ rule: 'thermo detail is valid', detail: String(s.thermoDetail) });
    if (s.species.length > MAX_SPECIES) v.push({ rule: 'at most 12 active species', detail: String(s.species.length) });
    const ids = s.flowsheet.units.map((u) => u.id);
    if (new Set(ids).size !== ids.length) v.push({ rule: 'unit ids are unique', detail: ids.join(',') });
    if (!Number.isInteger(s.flowsheet.nextId) || s.flowsheet.nextId < 1) v.push({ rule: 'next id is a positive integer', detail: String(s.flowsheet.nextId) });
    if (s.flowsheet.units.length > MAX_UNITS) v.push({ rule: 'at most 32 units', detail: String(s.flowsheet.units.length) });
    const sol = s.solved;
    if (sol?.ok) {
      for (const [id, st] of Object.entries(sol.streams)) {
        if (st.n.length !== s.species.length || st.n.some((x) => !(x >= 0))) v.push({ rule: 'no negative flows', detail: id });
        if (!(st.T >= 50 && st.T <= 3000)) v.push({ rule: 'T in 50..3000 K', detail: `${id}: ${st.T}` });
        if (!(st.P > 0 && st.P <= 1e8)) v.push({ rule: 'P in (0, 1000 bar]', detail: `${id}: ${st.P}` });
      }
      const led = ledgerOf(s, false);
      if (led && !(led.atomRel <= 1e-9)) v.push({ rule: 'atom balance closes to 1e-9', detail: String(led.atomRel) });
      if (led && led.energy.closure !== null && !(led.energy.closure <= 1e-6)) v.push({ rule: 'energy balance closes to 1e-6', detail: String(led.energy.closure) });
    }
    for (const d of sol?.diag ?? []) if (!(`fail.${d.code}` in en) && !(`info.${d.code}` in en)) v.push({ rule: 'every diagnostic has a message key', detail: d.code });
    if (sol && !sol.ok && !(sol.failure && `fail.${sol.failure.code}` in en)) v.push({ rule: 'every failure has a message key', detail: sol.failure?.code ?? 'none' });
    return v;
  },
  saveLabel: (s) => t('save.label', { works: worksName(s.region), phase: t(`phase.${s.phase}`), units: s.flowsheet.units.length, tick: s.tick }),
  describe: (s) => t('describe.plant', { tick: s.tick, works: worksName(s.region), phase: t(`phase.${s.phase}`), units: s.flowsheet.units.length, streams: s.flowsheet.streams.length, species: s.species.length, thermo: t(`thermo.${s.thermoDetail}`) }),
};
