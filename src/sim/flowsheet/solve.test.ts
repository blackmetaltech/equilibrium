import { describe, expect, it } from 'vitest';
import { solveFlowsheet, type SolveOptions } from './index';
import type { Registry } from './graph';
import {
  PP, U, ammoniaLoop, consistency, coupledLoops, ctxOf, massImbalance, purgeLoop, registryFor, type Sheet,
} from './testunits';
import type { StreamState } from '../types';

const run = (s: Sheet, options: SolveOptions = {}, extra: Record<string, unknown> = {}, reg?: Registry) =>
  solveFlowsheet({ species: s.species, units: s.units, pipes: s.pipes, registry: reg ?? registryFor(s.species), ctx: ctxOf(s.species), options, ...extra });
const okv = (r: ReturnType<typeof run>) => { if (!r.ok) throw new Error('solve failed ' + r.code + ' ' + JSON.stringify(r.data)); return r.value; };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const H = 3600;

describe('textbook oracles (loop closed forms)', () => {
  it('EQ-CE-005: methanol loop with N2 inert, 10 % purge', () => {
    const sh = purgeLoop(['CO', 'H2', 'CH3OH', 'N2'], [-1, -2, 1, 0], [33 / H, 66 / H, 0, 1 / H], 'CO', 0.2, 0.1, [0, 0, 1, 0], [28, 2, 32, 28]);
    const v = okv(run(sh));
    const feed = v.streams.s2!.n.map((x) => x * H), purge = v.streams.s7!.n.map((x) => x * H), meoh = v.streams.s6!.n[2]! * H;
    // oracle values (docs/research/oracles_cheme.py, tolerance 0.2 %)
    expect(rel(feed[0]!, 117.86)).toBeLessThan(2e-3);
    expect(rel(feed[1]!, 235.71)).toBeLessThan(2e-3);
    expect(rel(meoh, 23.571)).toBeLessThan(2e-3);
    expect(rel(purge[0]!, 9.4286)).toBeLessThan(2e-3);
    expect(rel(purge[1]!, 18.857)).toBeLessThan(2e-3);
    expect(rel(feed[3]!, 10)).toBeLessThan(1e-9); // N2 in = fresh / purge fraction
    expect(rel(purge[3]!, 1)).toBeLessThan(1e-9);
    const yN2 = feed[3]! / feed.reduce((a, b) => a + b, 0);
    expect(yN2).toBeGreaterThan(0);
    expect(1 - purge[0]! / 33).toBeCloseTo(1 - 0.28571, 3); // overall CO conversion 0.9714
  });

  it('EQ-CE-006: ammonia loop with Ar inert, 5 % purge (fresh 24.9 / 74.8 / 0.3)', () => {
    const sh = purgeLoop(['N2', 'H2', 'NH3', 'Ar'], [-1, -3, 2, 0], [24.9 / H, 74.8 / H, 0, 0.3 / H], 'N2', 0.25, 0.05, [0, 0, 1, 0], [28, 2, 17, 40]);
    const v = okv(run(sh));
    const feed = v.streams.s2!.n.map((x) => x * H), purge = v.streams.s7!.n.map((x) => x * H);
    expect(rel(feed[0]!, 86.609)).toBeLessThan(2e-3);
    expect(rel(feed[1]!, 261.83)).toBeLessThan(2e-3);
    expect(rel(v.streams.s6!.n[2]! * H, 43.304)).toBeLessThan(2e-3);
    expect(rel(purge[0]!, 3.2478)).toBeLessThan(2e-3);
    expect(rel(purge[1]!, 9.8435)).toBeLessThan(2e-3);
    expect(rel(purge[3]!, 0.3)).toBeLessThan(1e-9);
    expect(rel(purge[3]! / purge.reduce((a, b) => a + b, 0), 0.022403)).toBeLessThan(2e-3);
    expect(rel(feed[3]!, 6)).toBeLessThan(1e-9); // Ar_in = 0.3 / 0.05
  });

  it('L20 Part A: 249 / 748 / 3 kmol/h, 25 %, 5 % purge gives Ar 1.69 % at the reactor inlet', () => {
    const v = okv(run(ammoniaLoop(0.05)));
    const f = v.streams.s2!.n;
    const y = f[3]! / f.reduce((a, b) => a + b, 0);
    expect(Math.abs(y - 0.0169)).toBeLessThan(0.0005);
    expect(rel(y, 6 / (86.609 + 261.83 + 6))).toBeLessThan(2e-3);
  });

  it('EQ-CE-032: A -> B, 60 % per pass, 10 % purge: feed 156.25, recycle 56.25, purge 6.25, B 93.75', () => {
    const sh = purgeLoop(['A', 'B'], [-1, 1], [100, 0], 'A', 0.6, 0.1, [0, 1], [20, 20]);
    const v = okv(run(sh));
    expect(rel(v.streams.s2!.n[0]!, 156.25)).toBeLessThan(1e-9);
    expect(rel(v.streams.s5!.n[0]!, 56.25)).toBeLessThan(1e-9);
    expect(rel(v.streams.s7!.n[0]!, 6.25)).toBeLessThan(1e-9);
    expect(rel(v.streams.s6!.n[1]!, 93.75)).toBeLessThan(1e-9);
    expect(rel(1 - v.streams.s7!.n[0]! / 100, 0.9375)).toBeLessThan(1e-9);
  });
});

// closed-form recycle composition of the ammonia loop (independent of the solver)
function closedForm(p: number, X: number, Nf: number, Hf: number, Af: number) {
  const q = 1 - p;
  const N = Nf / (1 - q * (1 - X));
  const Hh = (Hf - q * 3 * X * N) / (1 - q);
  const A = Af / p;
  return { feed: [N, Hh, 0, A], rec: [q * (1 - X) * N, q * (Hh - 3 * X * N), 0, q * A] };
}

describe('purge sweep (L20 Part A style): Wegstein vs direct substitution', () => {
  for (const pct of [0.5, 1, 2, 5, 10]) {
    it(`purge ${pct} %: matches the closed form, <= 30 passes`, () => {
      const p = pct / 100;
      const v = okv(run(ammoniaLoop(p)));
      const cf = closedForm(p, 0.25, 249 / H, 748 / H, 3 / H);
      cf.feed.forEach((x, i) => expect(Math.abs(v.streams.s2!.n[i]! - x)).toBeLessThan(1e-8 * Math.max(...cf.feed)));
      expect(v.passes).toBeLessThanOrEqual(30);
    });
  }
  it('direct substitution alone needs more than 1000 passes at 1 % purge', () => {
    const capped = run(ammoniaLoop(0.01), { method: 'direct', maxPasses: 1000 });
    expect(capped.ok).toBe(false);
    if (!capped.ok) { expect(capped.code).toBe('ACCUMULATION'); expect(Number(capped.data.passes)).toBeLessThanOrEqual(1000); }
    const long = okv(run(ammoniaLoop(0.01), { method: 'direct', maxPasses: 6000 }));
    expect(long.passes).toBeGreaterThan(1000);
    expect(long.method).toBe('direct');
  });
  it('bounded Wegstein alone (q in [-5, 0]) is slow at 1 % purge; with a wider bound it is fast', () => {
    const wide = okv(run(ammoniaLoop(0.01), { method: 'wegstein', qMin: -500 }));
    expect(wide.method).toBe('wegstein');
    expect(wide.passes).toBeLessThanOrEqual(30);
    const bounded = run(ammoniaLoop(0.01), { method: 'wegstein', maxPasses: 2000 });
    expect(bounded.ok).toBe(true);
    if (bounded.ok) expect(bounded.value.passes).toBeGreaterThan(30); // documents the DESIGN 3.6 bound versus its 30-pass claim
  });
});

describe('cold start, warm start and Broyden agree', () => {
  it('to 1e-8 on a 2 % purge loop', () => {
    const sh = ammoniaLoop(0.02);
    const cold = okv(run(sh));
    const warm = okv(run(sh, {}, { warm: cold.warm }));
    const bro = okv(run(sh, { method: 'broyden' }));
    expect(warm.warmed).toBe(true);
    expect(warm.passes).toBeLessThanOrEqual(3);
    expect(bro.method).toBe('broyden');
    for (const id of Object.keys(cold.streams)) {
      const a = cold.streams[id]!;
      for (const b of [warm.streams[id]!, bro.streams[id]!]) {
        a.n.forEach((x, i) => expect(Math.abs(x - b.n[i]!)).toBeLessThan(1e-8 * Math.max(...a.n, 1e-9)));
        expect(Math.abs(a.T - b.T)).toBeLessThan(1e-6);
        expect(Math.abs(a.P - b.P)).toBeLessThan(1e-3);
      }
    }
  });
  it('a warm start from another topology is ignored', () => {
    const cold = okv(run(ammoniaLoop(0.02)));
    const other = purgeLoop(['A', 'B'], [-1, 1], [1, 0], 'A', 0.5, 0.2, [0, 1], [20, 20]);
    const v = okv(run(other, {}, { warm: cold.warm }));
    expect(v.warmed).toBe(false);
  });
});

describe('structural diagnosis', () => {
  it('NO_EXIT for an argon loop without purge, with zero loop iterations', () => {
    const sh = ammoniaLoop(0);
    const calls: Record<string, number> = {};
    const reg = registryFor(sh.species);
    for (const t of Object.keys(reg)) { const fn = reg[t]!.fn; reg[t] = { ...reg[t]!, fn: (a, b, c) => { calls[b.id] = (calls[b.id] ?? 0) + 1; return fn(a, b, c); } }; }
    const r = run(sh, {}, {}, reg);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NO_EXIT');
    expect(r.species).toBe('Ar');
    expect(r.data.species).toBe('Ar');
    expect(rel(Number(r.data.inflow), 3 / H)).toBeLessThan(1e-12);
    expect(String(r.data.scc).split(',').sort()).toEqual(['M', 'R', 'S', 'X']);
    expect(calls.M).toBeUndefined(); expect(calls.R).toBeUndefined(); expect(calls.X).toBeUndefined();
    expect(calls.F).toBe(1);
  });
  it('a loop whose species are all consumed or removed needs no purge (L19 style)', () => {
    const sp = ['N2', 'H2', 'NH3'];
    const sh = purgeLoop(sp, [-1, -3, 2], [249 / H, 747 / H, 0], 'N2', 0.25, 0.0, [0, 0, 1], [28, 2, 17]);
    const v = okv(run(sh));
    expect(rel(v.streams.s6!.n[2]!, 498 / H)).toBeLessThan(1e-7); // all N2 -> NH3: overall conversion 100 %
    expect(v.streams.s7!.n.every((x) => x === 0)).toBe(true);
  });
  it('LOOP_GAIN_GE_1 for a 100 % recycle splitter that claims an exit', () => {
    const sp = ['A', 'B'];
    const sh: Sheet = {
      species: sp, M: [1, 1],
      units: [U('F', 'feed', { n_A: 1, n_B: 0.5 }), U('M', 'mix2'), U('P', 'pass'), U('X', 'splitS', { frac: 0 }), U('G', 'product')],
      pipes: [PP('a', 'F.out', 'M.in1'), PP('b', 'M.out', 'P.in'), PP('c', 'P.out', 'X.in'), PP('d', 'X.rec', 'M.in2'), PP('e', 'X.purge', 'G.in')],
    };
    const r = run(sh);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('LOOP_GAIN_GE_1'); expect(Number(r.data.passes)).toBeLessThanOrEqual(300); }
  });
  it('ACCUMULATION with a geometric extrapolation of the steady state', () => {
    const r = run(ammoniaLoop(0.01), { method: 'direct', maxPasses: 300 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('ACCUMULATION');
    expect(r.species).toBe('Ar');
    expect(Math.abs(Number(r.data.gain) - 0.99)).toBeLessThan(0.01);
    const cf = closedForm(0.01, 0.25, 249 / H, 748 / H, 3 / H);
    const tot = cf.rec.reduce((a, b) => a + b, 0);
    expect(rel(Number(r.data.extrapolated), cf.rec[3]! / tot)).toBeLessThan(0.03);
  });
});

describe('multi-tear and nested loops', () => {
  for (const k of [2, 3]) {
    it(`${k} coupled loops need ${k} tears and converge`, () => {
      const sh = coupledLoops(k);
      const reg = registryFor(sh.species);
      const v = okv(run(sh));
      expect(v.tears.length).toBe(k);
      expect(consistency(sh, reg, v.streams)).toBeLessThan(1e-8);
      expect(massImbalance(sh.M, sh.units, sh.pipes, v.streams)).toBeLessThan(1e-9);
      const bro = okv(run(sh, { method: 'broyden' }));
      for (const id of Object.keys(v.streams)) v.streams[id]!.n.forEach((x, i) => expect(Math.abs(x - bro.streams[id]!.n[i]!)).toBeLessThan(1e-8 * 10));
    });
  }
  it('a loop inside a loop converges', () => {
    const sp = ['A', 'B', 'C', 'I'];
    const nu = (a: string, b: string) => Object.fromEntries(sp.map((s) => ['nu_' + s, s === a ? -1 : s === b ? 1 : 0]));
    const sh: Sheet = {
      species: sp, M: [20, 20, 20, 4],
      units: [
        U('F', 'feed', { n_A: 2, n_B: 0, n_C: 0, n_I: 0.02 }), U('M1', 'mix2'), U('R1', 'reactor', { X: 0.6, key: 'A', ...nu('A', 'B') }),
        U('M2', 'mix2'), U('R2', 'reactor', { X: 0.7, key: 'B', ...nu('B', 'C') }), U('SP', 'split3', { pf: 0.02, rf: 0.5 }),
        U('SX', 'sep', { liq_C: 0.9 }), U('SP2', 'split', { frac: 0.1 }), U('G1', 'product'), U('G2', 'product'), U('LQ', 'product'),
      ],
      pipes: [
        PP('p1', 'F.out', 'M1.in1'), PP('p2', 'M1.out', 'R1.in'), PP('p3', 'R1.out', 'M2.in1'), PP('p4', 'M2.out', 'R2.in'),
        PP('p5', 'R2.out', 'SP.in'), PP('p6', 'SP.rec', 'M2.in2'), PP('p7', 'SP.purge', 'G1.in'), PP('p8', 'SP.fwd', 'SX.in'),
        PP('p9', 'SX.vap', 'SP2.in'), PP('p10', 'SP2.rec', 'M1.in2'), PP('p11', 'SP2.purge', 'G2.in'), PP('p12', 'SX.liq', 'LQ.in'),
      ],
    };
    const reg = registryFor(sp);
    const v = okv(run(sh));
    expect(consistency(sh, reg, v.streams)).toBeLessThan(1e-8);
    expect(massImbalance(sh.M, sh.units, sh.pipes, v.streams)).toBeLessThan(1e-9);
    expect(v.passes).toBeLessThanOrEqual(300);
  });
});

describe('failures never hang and never escape', () => {
  const loopWith = (mid: string, params: Record<string, number | string> = {}): Sheet => ({
    species: ['A', 'B'], M: [1, 1],
    units: [U('F', 'feed', { n_A: 1, n_B: 0 }), U('M', 'mix2'), U('Z', mid, params), U('X', 'split', { frac: 0.5 }), U('G', 'product')],
    pipes: [PP('a', 'F.out', 'M.in1'), PP('b', 'M.out', 'Z.in'), PP('c', 'Z.out', 'X.in'), PP('d', 'X.rec', 'M.in2'), PP('e', 'X.purge', 'G.in')],
  });
  it('an oscillating unit inside a loop gives LOOP_OSCILLATING within the pass budget', () => {
    const r = run(loopWith('stepmap', { key: 'A', th: 3, hi: 10, lo: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('LOOP_OSCILLATING'); expect(Number(r.data.passes)).toBeLessThanOrEqual(300); }
  });
  it('a bistable S-curve unit converges or is diagnosed; never a hang', () => {
    for (const th of [1.6, 2.0, 2.4]) {
      const sh = loopWith('scurve', { key: 'A', lo: 0.5, hi: 9, scale: th, steep: 12 });
      const r = run(sh);
      if (r.ok) { expect(r.value.passes).toBeLessThanOrEqual(300); expect(consistency(sh, registryFor(sh.species), r.value.streams)).toBeLessThan(1e-7); }
      else expect(['LOOP_OSCILLATING', 'ACCUMULATION', 'LOOP_GAIN_GE_1']).toContain(r.code);
    }
  });
  it('a unit failing inside the loop reports its own code with inLoop = 1', () => {
    const sh = loopWith('reactorStrict', { key: 'A', X: 0.5, nu_A: -1, nu_B: 1 });
    // B-only feed: reactor never sees A
    sh.units[0] = U('F', 'feed', { n_A: 0, n_B: 1 });
    const r = run(sh);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('NO_REACTANT'); expect(r.unitId).toBe('Z'); expect(r.data.inLoop).toBe(1); }
  });
  it('a unit failing outside any loop has no inLoop flag', () => {
    const sh: Sheet = {
      species: ['A', 'B'], M: [1, 1],
      units: [U('F', 'feed', { n_A: 0, n_B: 1 }), U('Z', 'reactorStrict', { key: 'A', X: 0.5, nu_A: -1, nu_B: 1 }), U('G', 'product')],
      pipes: [PP('a', 'F.out', 'Z.in'), PP('b', 'Z.out', 'G.in')],
    };
    const r = run(sh);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('NO_REACTANT'); expect(r.data.inLoop).toBeUndefined(); expect(r.unitId).toBe('Z'); }
  });
  for (const type of ['nan', 'thrower']) {
    it(`${type} unit: NUMERIC_GUARD naming the unit (loop and chain)`, () => {
      const l = run(loopWith(type));
      expect(l.ok).toBe(false);
      if (!l.ok) { expect(l.code).toBe('NUMERIC_GUARD'); expect(l.unitId).toBe('Z'); }
      const sh: Sheet = { species: ['A', 'B'], M: [1, 1], units: [U('F', 'feed', { n_A: 1 }), U('Z', type), U('G', 'product')],
        pipes: [PP('a', 'F.out', 'Z.in'), PP('b', 'Z.out', 'G.in')] };
      const c = run(sh);
      expect(c.ok).toBe(false);
      if (!c.ok) { expect(c.code).toBe('NUMERIC_GUARD'); expect(c.unitId).toBe('Z'); }
    });
  }
});

describe('options, output contract and bookkeeping', () => {
  it('history holds at most 60 snapshots including the last pass; plain JSON', () => {
    const r = okv(run(ammoniaLoop(0.01), { method: 'direct', maxPasses: 6000 }));
    expect(r.history.length).toBeLessThanOrEqual(60);
    expect(r.history.length).toBeGreaterThan(10);
    expect(r.history[r.history.length - 1]!.pass).toBe(r.passes);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(r.history[0]!.tears[r.tears[0]!]!.n.length).toBe(4);
  });
  it('element balance callback: closes, or fails with ELEMENT_BALANCE', () => {
    const sh = ammoniaLoop(0.05);
    const M = sh.M;
    const cb = (inN: number[], outN: number[]) => {
      const a = inN.reduce((s, x, i) => s + x * M[i]!, 0), b = outN.reduce((s, x, i) => s + x * M[i]!, 0);
      return Math.abs(a - b) / a;
    };
    expect(run(sh, { elementBalance: cb }).ok).toBe(true);
    const bad = run(sh, { elementBalance: () => 1e-3 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('ELEMENT_BALANCE');
    expect(massImbalance(M, sh.units, sh.pipes, okv(run(sh)).streams)).toBeLessThan(1e-9);
  });
  it('a loop-free flowsheet needs no passes; sources and sinks may leave ports open as declared', () => {
    const sh: Sheet = { species: ['A'], M: [1], units: [U('F', 'feed', { n_A: 2 }), U('P', 'pass', { dP: 1000 }), U('G', 'product')],
      pipes: [PP('a', 'F.out', 'P.in'), PP('b', 'P.out', 'G.in')] };
    const v = okv(run(sh));
    expect(v.passes).toBe(0);
    expect(v.tears).toEqual([]);
    expect(v.streams.b!.P).toBe(99000);
    expect(v.streams.b!.n[0]).toBe(2);
    expect(v.units.P!.outlets.out!.n[0]).toBe(2);
  });
  it('topology failures come back as coded results', () => {
    const sh: Sheet = { species: ['A'], M: [1], units: [U('F', 'feed', { n_A: 2 }), U('P', 'pass')], pipes: [PP('a', 'F.out', 'P.in')] };
    const r = run(sh);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('TOPOLOGY_OPEN_PORT'); expect(r.unitId).toBe('P'); }
  });
  it('tear selection is deterministic and returned for reuse', () => {
    const a = okv(run(ammoniaLoop(0.05))), b = okv(run(ammoniaLoop(0.05)));
    expect(a.tears).toEqual(b.tears);
    expect(a.tears).toEqual(['s5']); // the splitter-to-mixer recycle stream
    expect(a.warm.tearSel).toEqual(['s5']);
    expect(a.warm.topologyHash).toBe(a.topologyHash);
    const r = run(ammoniaLoop(0.05), {}, { warm: { ...a.warm, tearSel: ['s2'] } });
    expect(okv(r).tears).toEqual(['s2']);
  });
});
void ({} as StreamState);
