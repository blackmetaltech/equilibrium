// The chapter-1 levels as specs, in play order, and the core `Level` each becomes. Strings: src/locales/en/levels.ts (`lv.<ID>.…`).
import type { Level, PersonaFactory } from '@core/kit';
import { FIRSTRUN_S } from '../data/events';
import { t } from '../i18n';
import type { EqState } from '../state';
import { L00 } from './l00';
import { L01 } from './l01';
import { L02 } from './l02';
import { L03 } from './l03';
import { L04 } from './l04';
import type { LevelSpec } from './spec';
import { CH2_SPECS } from './ch2';
import { CH3_SPECS } from './ch3';
import { CH4_SPECS } from './ch4';
import { CH5_SPECS } from './ch5';
import { CH6_SPECS } from './ch6';
import { CH8_SPECS } from './ch8';
import { CH9_SPECS } from './ch9';
import { CH10_SPECS } from './ch10';
import { CAREER } from './career';
import { CAREER_FIX_NH3_INERTS } from './career_fix';

export const SPECS: LevelSpec[] = [L00, L01, L02, L03, L04, ...CH2_SPECS, ...CH3_SPECS, ...CH4_SPECS, ...CH5_SPECS, ...CH6_SPECS, ...CH8_SPECS, ...CH9_SPECS, ...CH10_SPECS, CAREER, CAREER_FIX_NH3_INERTS];
export const SPEC_BY_ID: Readonly<Record<string, LevelSpec>> = Object.fromEntries(SPECS.map((x) => [x.id, x]));
/** The spec of the level a state is playing (undefined in free play or for a level this file does not own). */
export const specOf = (s: { level: string | null }): LevelSpec | undefined => (s.level === null ? undefined : SPEC_BY_ID[s.level]);

/** Every goal met on a commissioned plant (the default of a spec). */
export const isWon = (spec: LevelSpec, s: Readonly<EqState>): boolean => {
  const m = spec.measures(s), g = spec.goals(s, m);
  return spec.won ? spec.won(s, m, g) : m.ok && g.every((x) => x.met);
};

/** The plant is in its first run: the phase says so, or (round 7) a run was started on a job that has no shift (the key's second turn used to do that: GOAL MET lit for minutes and no printout), which counts as the first run too. */
export const inFirstRun = (s: Readonly<EqState>): boolean => s.phase === 'firstrun' || (s.phase === 'shift' && specOf(s)?.shiftLen === 0 && specOf(s)?.firstRun === true);
/** Plant seconds since the commission that started the first run (one tick = one plant second); 0 outside it. */
export function firstRunT(s: Readonly<EqState>): number {
  if (!inFirstRun(s) || s.runs.length === 0) return 0;
  return Math.max(0, Math.min(FIRSTRUN_S, s.tick - s.runs[s.runs.length - 1]!.tick));
}
/** The first run has rolled its full length. */
export const firstRunDone = (s: Readonly<EqState>): boolean => inFirstRun(s) && s.runs.length > 0 && firstRunT(s) >= FIRSTRUN_S;
/** Should a commission that just succeeded enter the first run? Only for levels that have one and when every goal is met. */
export const entersFirstRun = (spec: LevelSpec, s: Readonly<EqState>): boolean => spec.firstRun === true && isWon(spec, s);

/** Product made so far in a first run, kg: the product rate (else the steam raised) of the solved plant times the plant seconds. */
export function madeKg(s: Readonly<EqState>, spec: LevelSpec): number {
  const k = s.solved !== null && s.solved.ok ? s.solved.kpis : {};
  const tph = Number.isFinite(k.product_t_per_h) && k.product_t_per_h! > 0 && k.product_t_per_h! < 1e8 ? k.product_t_per_h! : Number.isFinite(k.steam_raised_t_per_h) && k.steam_raised_t_per_h! < 1e8 ? k.steam_raised_t_per_h! : 0;
  const rate = spec.madeKgH ? spec.madeKgH(s, spec.measures(s)) : tph * 1000;
  return (Math.max(0, rate) / 3600) * firstRunT(s);
}

export function levelOf(spec: LevelSpec): Level<EqState> {
  const lv: Level<EqState> = {
    id: spec.id, title: t(`lv.${spec.id}.title`), brief: t(`lv.${spec.id}.note.1`),
    concepts: spec.id === 'L00' ? [] : ['extent'],
    setup: (s) => { s.lv = {}; spec.setup(s); },
    goal: (s) => isWon(spec, s) && (spec.firstRun !== true || firstRunDone(s)),
    solver: spec.solver,
    /** A scripted shift that ended with its goals unmet is over now, with the reason (not silent until maxTicks). */
    fail: (s) => {
      const own = spec.lost?.(s, spec.measures(s)) ?? null;
      if (own !== null && !isWon(spec, s)) return t(own, { id: spec.id });
      return spec.shiftLen > 0 && s.shift !== null && s.shift.ended !== '' && !isWon(spec, s) ? t(s.shift.ended === 'loss' ? 'lv.shift_lost' : 'lv.shift_unmet', { id: spec.id }) : null;
    },
  };
  if (spec.maxTicks !== undefined) lv.maxTicks = spec.maxTicks;
  return lv;
}

/** Scripted novices that must fail each level the way DESIGN says (tests; the persona registry in src/personas.ts is another lane's). */
export const NAIVE: Record<string, PersonaFactory<EqState>> = Object.fromEntries(SPECS.map((x) => [x.id, x.naive]));
