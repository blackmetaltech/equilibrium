// P24 no NaN (DESIGN 9.3): a monkey (random legal actions mixed with hostile arguments: NaN, +-Infinity, negatives, 1e300, zero, strings,
// nulls, wrong ids) plays commission and shift on saved plants. After every action no non-finite number may exist anywhere in the game state,
// the UI snapshot, the plant query or any solved stream, and every rejected action must come back with a message (never a throw).
import { describe, expect, it } from 'vitest';
import type { Engine } from '@core/kit';
import { Rng } from '@core/kit/rng';
import { GAME } from '../game';
import type { EqState } from '../state';
import { fromBase, makeBases } from './bases';
import { FUZZ_N, fuzzTimeout } from './fuzz';

type E = Engine<EqState>;
const bases = makeBases();
const HOSTILE: unknown[] = [Number.NaN, Infinity, -Infinity, -1, 0, 1e300, -1e300, 1e-300, 'x', '', null, undefined, {}, [], true, 2.5, 1e9];

/** Path of the first non-finite number in a value, or null. */
export function firstNonFinite(v: unknown, path = '$', depth = 0): string | null {
  if (depth > 14) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${path}=${v}`;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const p = firstNonFinite(v[i], `${path}[${i}]`, depth + 1); if (p) return p; } return null; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { const p = firstNonFinite(x, `${path}.${k}`, depth + 1); if (p) return p; }
  return null;
}

function monkeyStep(e: E, r: Rng): { name: string; args: unknown[] } {
  const s = e.state, units = s.flowsheet.units;
  const x = r.next();
  const uid = (): unknown => (units.length && r.chance(0.9) ? r.pick(units).id : r.pick(HOSTILE));
  if (x < 0.3) {
    const legal = GAME.legalActions!(s, r.chance(0.3)).filter((a) => a.name !== 'tick');
    if (legal.length) { const a = r.pick(legal); return { name: a.name, args: (a.args ?? []) as unknown[] }; }
  }
  if (x < 0.5) {
    const u = units.length ? r.pick(units) : null;
    const key = u ? r.pick(Object.keys(u.params).concat(['T', 'P', 'frac', 'X', 'stages', 'area', 'dP'])) : 'T';
    return { name: 'setParam', args: [uid(), key, r.chance(0.6) ? r.pick(HOSTILE) : r.range(-10, 1e8)] };
  }
  if (x < 0.58) return { name: 'setFeed', args: [uid(), { x: [r.pick(HOSTILE), r.range(0, 1), r.range(0, 1), r.range(0, 1)], flow: r.pick(HOSTILE), T: r.pick(HOSTILE), P: r.pick(HOSTILE) }] };
  if (x < 0.7) return { name: 'commission', args: [] };
  if (x < 0.78) return { name: 'startShift', args: [r.pick(['shift', 'firstrun', 'x']), r.pick(HOSTILE)] };
  if (x < 0.88) return { name: 'tick', args: [r.pick([1, 2, 5, 10, 30, 60, r.pick(HOSTILE)])] };
  if (x < 0.94) return { name: 'setpoint', args: [uid(), r.pick(['T', 'P', 'frac', 'flow', 'X']), r.chance(0.5) ? r.pick(HOSTILE) : r.range(0, 1e7)] };
  if (x < 0.97) return { name: r.pick(['trip', 'resetTrip', 'ack', 'deleteUnit', 'rotateUnit', 'disconnect']), args: [uid()] };
  return { name: 'setThermoDetail', args: [r.pick(['rigorous', 'textbook', 'book', 'x', r.pick(HOSTILE)])] };
}

describe('P24 no NaN', () => {
  it(`monkey scripts never leak a non-finite number to state, snapshot, queries or streams (${FUZZ_N} scripts)`, () => {
    const r = new Rng(2401);
    let steps = 0, rejected = 0, solved = 0, shifted = 0;
    for (let c = 0; c < FUZZ_N; c++) {
      const e = fromBase(bases[c % bases.length]!);
      const n = r.int(3, 8);
      for (let k = 0; k < n; k++) {
        const a = monkeyStep(e, r);
        let res: { ok: boolean; message: string };
        try { res = e.act(a.name, a.args); } catch (err) { throw new Error(`case ${c} step ${k}: ${a.name}(${JSON.stringify(a.args)}) threw ${String(err)}`); }
        steps++;
        if (!res.ok) { rejected++; expect(res.message.length, `case ${c} ${a.name} rejected without a message`).toBeGreaterThan(0); }
        const where = `case ${c} step ${k} ${a.name}(${JSON.stringify(a.args)})`;
        expect(firstNonFinite(e.state), `${where}: state`).toBeNull();
        expect(firstNonFinite(e.snapshot()), `${where}: snapshot`).toBeNull();
        expect(firstNonFinite(e.q('plant')), `${where}: plant query`).toBeNull();
        if (e.state.solved?.ok) { solved++; expect(firstNonFinite(e.state.solved.streams), `${where}: streams`).toBeNull(); }
        const inv = GAME.invariants!(e.state, null);
        expect(inv, where).toEqual([]);
      }
      if (e.state.shift) shifted++;
    }
    console.log(`P24 monkey: ${steps} steps over ${FUZZ_N} scripts, ${rejected} rejected with a message, ${solved} states with a solved plant, ${shifted} scripts with a shift`);
    expect(rejected).toBeGreaterThan(steps * 0.05);
    expect(solved).toBeGreaterThan(steps * 0.1);
  }, fuzzTimeout(8));
});
