// The EQUILIBRIUM game definition the core engine runs (DESIGN §8). M0.2 is the skeleton: an empty plant, the region seam, strings
// and the plant query. Actions, systems, levels and metrics arrive with M1 (tasks 1.9 to 1.13) and M2.
import { baseState, log, type GameDef } from '@core/kit';
import { t } from './i18n';
import { LEVELS } from './levels';
import { PERSONAS } from './personas';
import { REGIONS } from './regions';
import { MAX_SPECIES, PHASES, THERMO_DETAILS, emptyFlowsheet, emptyProgress, type EqState } from './state';

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
  /** The three histogram metrics of each level (DESIGN §8.8); filled in M1.12. */
  metrics: () => ({}),
  newGame: (seed, mode, ctx) => {
    const s: EqState = {
      ...baseState(GAME_ID, seed, mode, ctx.region.id),
      phase: 'design', thermoDetail: 'rigorous', species: [], flowsheet: emptyFlowsheet(), feeds: {}, solved: null, shift: null,
      trends: {}, replay: [], runs: [], prediction: null, progress: emptyProgress(), ui: { pinned: [], coachStep: null },
    };
    log(s, t('log.start', { works: ctx.region.strings[ctx.region.data.setting.worksName] ?? '' }));
    return s;
  },
  /** Campaign meta state only; nothing a level's rules read (codes are verified without it). */
  carryOver: (prev) => ({ progress: structuredClone(prev.progress) }),
  actions: {},
  queries: {
    /** The plant as the Plant screen draws it: placed units, pipes, phase and the active species. */
    plant: (s) => ({ phase: s.phase, thermoDetail: s.thermoDetail, species: s.species, units: s.flowsheet.units, streams: s.flowsheet.streams }),
  },
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
    const bad = firstNonFinite(s.flowsheet) ?? firstNonFinite(s.feeds) ?? firstNonFinite(s.solved) ?? firstNonFinite(s.progress);
    if (bad !== null) v.push({ rule: 'numbers are finite', detail: bad });
    if (!PHASES.includes(s.phase)) v.push({ rule: 'phase is valid', detail: String(s.phase) });
    if (!THERMO_DETAILS.includes(s.thermoDetail)) v.push({ rule: 'thermo detail is valid', detail: String(s.thermoDetail) });
    if (s.species.length > MAX_SPECIES) v.push({ rule: 'at most 12 active species', detail: String(s.species.length) });
    const ids = s.flowsheet.units.map((u) => u.id);
    if (new Set(ids).size !== ids.length) v.push({ rule: 'unit ids are unique', detail: ids.join(',') });
    if (!Number.isInteger(s.flowsheet.nextId) || s.flowsheet.nextId < 1) v.push({ rule: 'next id is a positive integer', detail: String(s.flowsheet.nextId) });
    return v;
  },
  saveLabel: (s) => t('save.label', { works: worksName(s.region), phase: t(`phase.${s.phase}`), units: s.flowsheet.units.length, tick: s.tick }),
  describe: (s) => t('describe.plant', { tick: s.tick, works: worksName(s.region), phase: t(`phase.${s.phase}`), units: s.flowsheet.units.length, streams: s.flowsheet.streams.length, species: s.species.length, thermo: t(`thermo.${s.thermoDetail}`) }),
};
