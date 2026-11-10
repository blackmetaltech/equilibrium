// P21 determinism (DESIGN 9.3): random action scripts (design edits, commission, start shift, ticks, set points, trips, speed) replayed on a
// second engine give the same state hash after every step and the same accept / reject message; and the shift is partition-invariant: the same
// plant-seconds run as 1-tick, 4-tick and 16-tick chunks (what the x1 / x4 / x16 fast-forward speeds issue) end on the same hash.
import { describe, expect, it } from 'vitest';
import { hashOf } from '@core/kit';
import type { Engine } from '@core/kit';
import { Rng } from '@core/kit/rng';
import { GAME } from '../game';
import type { EqState } from '../state';
import { fromBase, makeBases } from './bases';
import { FUZZ_N, fuzzTimeout } from './fuzz';

type E = Engine<EqState>;
const bases = makeBases();

function step(e: E, r: Rng): { name: string; args: unknown[] } {
  const s = e.state, units = s.flowsheet.units;
  const x = r.next();
  if (x < 0.35) {
    const legal = GAME.legalActions!(s, false).filter((a) => a.name !== 'tick');
    const a = legal.length ? r.pick(legal) : { name: 'commission', args: [] };
    return { name: a.name, args: (a.args ?? []) as unknown[] };
  }
  if (x < 0.5) return { name: 'commission', args: [] };
  if (x < 0.62) return { name: 'startShift', args: [r.chance(0.5) ? 'shift' : 'firstrun', r.chance(0.5)] };
  if (x < 0.85) return { name: 'tick', args: [r.int(1, 20)] };
  if (x < 0.9) return { name: 'setSpeed', args: [r.pick([0, 1, 4, 16, 3])] };
  if (units.length && x < 0.96) {
    const u = r.pick(units);
    return { name: 'setpoint', args: [u.id, r.pick(['T', 'P', 'frac', 'flow']), r.range(0.01, 2e6)] };
  }
  return units.length ? { name: 'trip', args: [r.pick(units).id] } : { name: 'tick', args: [1] };
}

describe('P21 determinism', () => {
  it(`random action scripts replay to identical hashes and messages (${FUZZ_N} scripts)`, () => {
    const r = new Rng(2101);
    let steps = 0, shifted = 0;
    for (let c = 0; c < FUZZ_N; c++) {
      const b = bases[c % bases.length]!;
      const A = fromBase(b), B = fromBase(b);
      expect(hashOf(A.state)).toBe(hashOf(B.state));
      const n = r.int(3, 8);
      for (let k = 0; k < n; k++) {
        const a = step(A, r);
        const ra = A.act(a.name, a.args), rb = B.act(a.name, a.args);
        steps++;
        expect(rb.ok, `case ${c} step ${k} ${a.name}`).toBe(ra.ok);
        expect(rb.message, `case ${c} step ${k} ${a.name}`).toBe(ra.message);
        expect(hashOf(B.state), `case ${c} step ${k} ${a.name}(${JSON.stringify(a.args)})`).toBe(hashOf(A.state));
      }
      if (A.state.shift) shifted++;
    }
    console.log(`P21 replay: ${steps} steps over ${FUZZ_N} scripts, ${shifted} scripts reached a shift`);
    expect(shifted).toBeGreaterThan(FUZZ_N * 0.05);
  }, fuzzTimeout(8));

  it(`one shift run as 1-, 4- and 16-tick chunks ends on the same hash (${FUZZ_N} runs)`, () => {
    const r = new Rng(2102);
    for (let c = 0; c < FUZZ_N; c++) {
      const b = bases[c % 2]!; // the two commissioned plants
      const mods: [string, unknown[]][] = [];
      if (r.chance(0.7)) { const u = r.pick(fromBase(b).state.flowsheet.units); mods.push(['trip', [u.id]]); }
      const kind = r.pick(['shift', 'firstrun']);
      const total = 16 * r.int(1, 3);
      const hashes: string[] = [];
      for (const chunk of [1, 4, 16]) {
        const e = fromBase(b);
        expect(e.act('startShift', [kind, true]).ok).toBe(true);
        for (const m of mods) e.act(m[0], m[1]);
        for (let t = 0; t < total; t += chunk) expect(e.act('tick', [chunk]).ok).toBe(true);
        hashes.push(hashOf(e.state));
      }
      expect(hashes[1], `run ${c} x4 vs x1`).toBe(hashes[0]);
      expect(hashes[2], `run ${c} x16 vs x1`).toBe(hashes[0]);
    }
  }, fuzzTimeout(16));
});
