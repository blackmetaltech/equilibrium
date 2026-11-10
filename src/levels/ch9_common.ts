// Shared by the chapter-9 levels (Turnaround: HAZOP, SOP, permit, reconciliation, planning). Each level is a worksheet rig: the player's work (rows, card order, meter flags, schedule)
// is plain JSON in `s.lv`, edited by level actions (engine action `levelAct`), and graded by pure functions of src/sim/ops. A tiny carrier plant (feed -> product) is commissioned so the
// key, the solver and the phase machine behave as in chapter 1; the level is read from `s.lv` whenever it is asked.
import { need } from '@core/kit';
import type { Action, PersonaFactory } from '@core/kit';
import { t } from '../i18n';
import { invalidate, needEditable } from '../engine/actions/design';
import type { EqState } from '../state';
import type { Annunciator, GoalEval, Measures } from './spec';
import { baseSetup, link, put, putFeed, sealSetup } from './util';

type S = Readonly<EqState>;
export const CARRIER_UNITS: Record<string, { max: number; price: number }> = { feed: { max: 1, price: 0 }, product: { max: 1, price: 0 } };
export function carrierSetup(s: EqState): void {
  baseSetup(s, ['N2', 'H2'], CARRIER_UNITS, {});
  const f = putFeed(s, 0, 0, { N2: 0.25, H2: 0.75 }, 10, 300, 3e5);
  const p = put(s, 'product', 6, 0);
  link(s, f, 'out', p, 'in');
  sealSetup(s);
}
/** A worksheet edit: only while designing; makes the last run stale. */
export function edit(s: EqState, body: () => void): void { needEditable(s); body(); invalidate(s); }
export const listOf = <T>(s: S, key: string): T[] => (Array.isArray(s.lv[key]) ? (s.lv[key] as T[]) : []);
export const zeros = (keys: string[]): Record<string, number> => Object.fromEntries(keys.map((k) => [k, 0]));
export const lit = (ok: boolean, met: boolean, bad: 'high' | 'critical' = 'high'): Annunciator['state'] => (!ok ? 'off' : met ? 'normal' : bad);
export const goalLamp = (ok: boolean, g: GoalEval[]): Annunciator['state'] => (ok && g.every((x) => x.met) ? 'normal' : 'off');
export const LATE = (ids: string[]) => (s: S): boolean => ids.includes(s.ui.coachStep ?? '');
export const act = (name: string, ...args: unknown[]): Action => ({ name: 'levelAct', args: [name, ...args] });
export const mNone = (keys: string[], extra: Record<string, number> = {}): Measures => ({ ok: false, v: { ...zeros(keys), ...extra } });

/** A persona that plays its actions once (computed from the state when it first moves), then turns the key. */
export function playOnce(build: (s: S) => Action[], opts: { callIt?: (s: S) => number | null; commission?: boolean } = {}): PersonaFactory<EqState> {
  return () => {
    let done = false;
    return (s: S): Action[] => {
      if (done) return [];
      done = true;
      const a: Action[] = [];
      const c = opts.callIt?.(s);
      if (c !== undefined && c !== null) a.push({ name: 'callIt', args: [c] });
      a.push(...build(s));
      if (opts.commission !== false) a.push({ name: 'commission' });
      return a;
    };
  };
}
/** Plain ordered-list actions of a card/step sequence (`key` in s.lv): add(id), remove(index), move(from, to), clear. */
export function listActions(key: string, ids: string[], max: number): NonNullable<import('./spec').LevelSpec['actions']> {
  return {
    add: (s, id: unknown) => edit(s, () => { need(typeof id === 'string' && ids.includes(id), t('lv.err.ch9_item', { id: String(id) })); const l = listOf<string>(s, key).slice(); need(l.length < max, t('lv.err.ch9_full', { max })); l.push(id as string); s.lv[key] = l; }),
    remove: (s, i: unknown) => edit(s, () => { const l = listOf<string>(s, key).slice(); need(typeof i === 'number' && i >= 0 && i < l.length, t('lv.err.ch9_index')); l.splice(i as number, 1); s.lv[key] = l; }),
    move: (s, from: unknown, to: unknown) => edit(s, () => { const l = listOf<string>(s, key).slice(); need(typeof from === 'number' && typeof to === 'number' && from >= 0 && from < l.length && to >= 0 && to < l.length, t('lv.err.ch9_index')); const [x] = l.splice(from as number, 1); l.splice(to as number, 0, x!); s.lv[key] = l; }),
    clear: (s) => edit(s, () => { s.lv[key] = []; }),
  };
}
