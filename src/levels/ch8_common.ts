// Shared by the chapter-8 levels (The Control Room). Each level is a dynamic RIG (src/sim/control/rigs.ts, cstr.ts): a pure function of the player's controller dials,
// replayed whenever the level is read. The dials are level-local plain JSON in `s.lv` and are edited through the `levelAct` action (`setDial`).
import type { Action } from '@core/kit';
import type { EqState } from '../state';
import { need } from '@core/kit';
import { invalidate, needEditable } from '../engine/actions/design';
import { t } from '../i18n';
import type { Annunciator, GoalEval, LevelSpec, Measures } from './spec';
import { baseSetup, link, put, putFeed, sealSetup, solvedOk } from './util';

type S = Readonly<EqState>;
/** Plain-JSON state of the rig lives in `s.lv.dials` (numbers, in the order of the level's dial list) and is edited by the level action `setDial` (engine action `levelAct`). */
export const DIAL_TYPE = 'dial';
export const RIG_SPECIES = ['N2', 'H2'];

export interface DialSpec { key: string; def: { learner: number; engineer: number } }

/** Place the carrier plant (feed -> product, so the key, the solver and the phase machine behave as in chapter 1) and store the dials at the mode's starting values. */
export function rigSetup(s: EqState, units: Record<string, { max: number; price: number }>, dials: DialSpec[]): void {
  baseSetup(s, RIG_SPECIES, units, {});
  const f = putFeed(s, 0, 0, { N2: 0.25, H2: 0.75 }, 10, 300, 3e5);
  const p = put(s, 'product', 6, 0);
  link(s, f, 'out', p, 'in');
  s.lv.dialKeys = dials.map((d) => d.key);
  s.lv.dials = dials.map((d) => (s.mode === 'learner' ? d.def.learner : d.def.engineer));
  sealSetup(s);
}

/** The dial values in order; a missing entry reads as NaN and the level is not ok. */
export function dialValues(s: S, n: number): number[] {
  const d = s.lv.dials as number[] | undefined, out: number[] = [];
  for (let i = 0; i < n; i++) { const v = d?.[i]; out.push(typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN); }
  return out;
}
export const dialsOk = (d: number[]): boolean => d.every((x) => Number.isFinite(x));

/** The level action `setDial(keyOrIndex, value)`: edits one controller dial; like a design edit it makes the last run stale. */
export const dialActions: NonNullable<LevelSpec['actions']> = {
  setDial: (s, key: unknown, value: unknown) => {
    needEditable(s);
    const keys = (s.lv.dialKeys as string[] | undefined) ?? [];
    const i = typeof key === 'number' ? key : keys.indexOf(String(key));
    need(i >= 0 && i < keys.length, t('lv.err.dial_unknown', { key: String(key), keys: keys.join(', ') }));
    need(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e6, t('lv.err.dial_value', { key: keys[i]!, value: String(value) }));
    const d = (s.lv.dials as number[]).slice();
    d[i] = value as number;
    s.lv.dials = d;
    invalidate(s);
  },
};

/** Measures shell: ok only when the carrier plant commissioned on the current dials. */
export const rigOk = (s: S, d: number[]): boolean => solvedOk(s) && dialsOk(d);
export const zeros = (keys: string[]): Record<string, number> => Object.fromEntries(keys.map((k) => [k, 0]));
export const none = (keys: string[]): Measures => ({ ok: false, v: zeros(keys) });

/** The persona that sets every dial (in order) and then turns the key; optional Call-it first. */
export function dialScript(values: number[], callIt?: { v: number }, commission = true) {
  return () => {
    let done = false;
    return (_s: S): Action[] => {
      if (done) return [];
      done = true;
      const a: Action[] = [];
      if (callIt) a.push({ name: 'callIt', args: [callIt.v] });
      values.forEach((v, i) => a.push({ name: 'levelAct', args: ['setDial', i, v] }));
      if (commission) a.push({ name: 'commission' });
      return a;
    };
  };
}

export const lit = (ok: boolean, met: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!ok ? 'off' : met ? 'normal' : bad);
export const goalLamp = (ok: boolean, g: GoalEval[]): Annunciator['state'] => (ok && g.every((x) => x.met) ? 'normal' : 'off');

export const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
