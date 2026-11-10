// The chapter-1 levels as specs, in play order, and the core `Level` each becomes. Strings: src/locales/en/levels.ts (`lv.<ID>.…`).
import type { Level, PersonaFactory } from '@core/kit';
import { t } from '../i18n';
import type { EqState } from '../state';
import { L00 } from './l00';
import { L01 } from './l01';
import { L02 } from './l02';
import { L03 } from './l03';
import { L04 } from './l04';
import type { LevelSpec } from './spec';

export const SPECS: LevelSpec[] = [L00, L01, L02, L03, L04];
export const SPEC_BY_ID: Readonly<Record<string, LevelSpec>> = Object.fromEntries(SPECS.map((x) => [x.id, x]));
/** The spec of the level a state is playing (undefined in free play or for a level this file does not own). */
export const specOf = (s: { level: string | null }): LevelSpec | undefined => (s.level === null ? undefined : SPEC_BY_ID[s.level]);

/** Every goal met on a commissioned plant (the default of a spec). */
export const isWon = (spec: LevelSpec, s: Readonly<EqState>): boolean => {
  const m = spec.measures(s), g = spec.goals(s, m);
  return spec.won ? spec.won(s, m, g) : m.ok && g.every((x) => x.met);
};

export function levelOf(spec: LevelSpec): Level<EqState> {
  const lv: Level<EqState> = {
    id: spec.id, title: t(`lv.${spec.id}.title`), brief: t(`lv.${spec.id}.note.1`),
    concepts: spec.id === 'L00' ? [] : ['extent'],
    setup: (s) => spec.setup(s),
    goal: (s) => isWon(spec, s),
    solver: spec.solver,
  };
  if (spec.maxTicks !== undefined) lv.maxTicks = spec.maxTicks;
  return lv;
}

/** Scripted novices that must fail each level the way DESIGN says (tests; the persona registry in src/personas.ts is another lane's). */
export const NAIVE: Record<string, PersonaFactory<EqState>> = Object.fromEntries(SPECS.map((x) => [x.id, x.naive]));
