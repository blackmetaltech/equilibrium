// P21 (DESIGN 9.3, 8.8): the shift is partition-invariant. tick(a); tick(b) is bit-identical to tick(a + b), so results do not depend on the time scale
// the front-end chooses (x1 / x4 / x16, cruise / watch / real) and solution codes may merge ticks. Random action scripts (set points, speed, acks, trips, resets)
// on the ammonia loop with events, interlock and Learner/Engineer modes run under the partitions {1}, {12}, {192} and a random one: the state hash after every
// block of ticks and the final metrics must be identical. CI runs 1000 seeded scripts (P21_SCRIPTS=1000); the default is a quick 40.
import { Rng, hashOf } from '@core/kit';
import { describe, expect, it } from 'vitest';
import { GAME, metricsOf } from '../game';
import { loopShift } from '../sim/dynamics/testplants';
import type { EqState } from '../state';

type Act = [string, unknown[]];
interface Block { acts: Act[]; ticks: number }
const N = Number(process.env.P21_SCRIPTS ?? 40);

/** A random script for the loop plant: blocks of (0-3 actions, a run of ticks). */
function scriptOf(seed: number, ids: Record<string, string>, il: string): Block[] {
  const r = new Rng(seed * 7919 + 13);
  const unit = [ids.comp!, ids.feed!, il, ids.mix!, ids.cool!];
  const one = (): Act => {
    switch (r.int(0, 9)) {
      case 0: return ['setpoint', [ids.comp, 'P', r.range(9e6, 1.4e7)]];
      case 1: return ['setpoint', [ids.feed, 'flow', r.range(0.4, 1.6)]];
      case 2: return ['setpoint', [ids.split, 'frac', r.range(0.02, 0.1)]];
      case 3: return ['setpoint', [ids.cool, 'T', r.range(310, 345)]];
      case 4: return ['setpoint', [il, 'setpoint', r.chance(0.3) ? 0 : r.range(330, 420)]];
      case 5: return ['setSpeed', [r.pick([0, 1, 4, 16, 3])]];
      case 6: return ['ack', [r.pick(['all', ids.comp + '.P', ids.sep + '.P', 'bogus'])]];
      case 7: return ['trip', [r.pick(unit)]];
      case 8: return ['resetTrip', [r.pick(unit)]];
      default: return ['setpoint', [ids.valve, 'P', r.range(1.5e6, 2.5e6)]];
    }
  };
  const blocks: Block[] = [];
  const n = r.int(6, 10);
  for (let i = 0; i < n; i++) blocks.push({ acts: Array.from({ length: r.int(0, 3) }, one), ticks: r.pick([1, 2, 5, 11, 12, 13, 30, 47, 100, 193]) });
  return blocks;
}

/** Run a script with ticks cut into pieces by `chunk(remaining)`; returns the state hash after every block and the final metrics. */
function runScript(seed: number, chunk: (left: number) => number): { hashes: string[]; metrics: Record<string, number>; solves: number; trips: number; events: number } {
  const { e, L, S, il } = loopShift({ seed, mode: seed % 2 === 0 ? 'learner' : 'engineer', events: true, ilk: 340 });
  // events of an 8-hour shift would never fire in a few hundred seconds: compress their schedule (the same for every partition)
  for (const ev of S().shift!.q) ev.at = 1 + Math.floor((ev.at * 600) / 28800);
  S().shift!.q.sort((a, b) => a.at - b.at);
  const blocks = scriptOf(seed, L.ids, il);
  const hashes: string[] = [];
  for (const b of blocks) {
    for (const [name, args] of b.acts) e.act(name, args);
    let left = b.ticks;
    while (left > 0) { const k = Math.max(1, Math.min(left, chunk(left))); e.act('tick', [k]); left -= k; }
    hashes.push(hashOf(e.state));
  }
  const s: EqState = S();
  return { hashes, metrics: GAME.metrics!(s), solves: s.shift!.stat.solves, trips: s.shift!.stat.tripN, events: s.shift!.stat.events };
}

describe('P21: tick partitions never change the shift', () => {
  it(`${N} seeded scripts: partitions {1}, {12}, {192} and random give the same hashes and metrics`, () => {
    let solves = 0, trips = 0, events = 0;
    for (let seed = 1; seed <= N; seed++) {
      const rr = new Rng(seed ^ 0x5bd1e995);
      const ref = runScript(seed, () => 1);
      for (const [name, chunk] of [['12', () => 12], ['192', () => 192], ['random', (left: number) => rr.int(1, left)]] as const) {
        const got = runScript(seed, chunk);
        expect(got.hashes, `seed ${seed} partition ${name}`).toEqual(ref.hashes);
        expect(got.metrics, `seed ${seed} partition ${name}`).toEqual(ref.metrics);
      }
      solves += ref.solves; trips += ref.trips; events += ref.events;
    }
    // the scripts must actually exercise the machinery they are about
    expect(solves).toBeGreaterThan(N); expect(events).toBeGreaterThan(N); expect(trips).toBeGreaterThan(0);
  });
  it('one long tick equals many short ones over a full event-laden stretch (and the metrics are finite)', () => {
    const run = (chunk: number): string => {
      const { e, S } = loopShift({ seed: 21, events: true, ilk: 340 });
      for (const ev of S().shift!.q) ev.at = 1 + Math.floor((ev.at * 3000) / 28800);
      S().shift!.q.sort((a, b) => a.at - b.at);
      for (let left = 3000; left > 0; left -= chunk) e.act('tick', [Math.min(chunk, left)]);
      for (const v of Object.values(metricsOf(S()))) expect(Number.isFinite(v)).toBe(true);
      return hashOf(S());
    };
    expect(run(3000)).toBe(run(7));
    expect(run(192)).toBe(run(1000));
  });
});
