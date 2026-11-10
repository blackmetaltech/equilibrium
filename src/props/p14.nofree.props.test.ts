// P14 (DESIGN 9.3) no free energy: (a) flowsheets with no feed flow produce nothing (every stream is exactly zero, nothing non-finite);
// (b) a recycle loop of passive units (mixer, valve, heat exchanger, splitter, no work, no utility, no reaction) cannot push any stream
// above the hottest feed, below the coldest feed or above the highest feed pressure, and cannot make material (product <= feeds).
// Plant: F1 -> M -> HX(hot) -> S -> (purge -> vent | recycle -> valve -> M); F2 -> HX(cold) -> product. Random species, T, P, flows, area, split.
import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { bindRegistry, phaseHook } from '../engine/registry';
import { ctxOf } from '../engine/solved';
import { solveFlowsheet } from '../sim/flowsheet';
import type { Pipe, StreamState, UnitInst } from '../sim/types';
import { FUZZ_N, fuzzTimeout } from './fuzz';

const SP = ['N2', 'O2', 'Ar', 'CO2'];
const U = (id: string, type: string, params: Record<string, number | string> = {}): UnitInst => ({ id, type, pos: { x: 0, y: 0 }, rot: 0, params });
const PP = (id: string, a: string, b: string): Pipe => {
  const [fu, fp] = a.split('.'), [tu, tp] = b.split('.');
  return { id, from: { unit: fu!, port: fp! }, to: { unit: tu!, port: tp! } };
};
const feedParams = (r: Rng, flow: number, T: number, P: number): Record<string, number | string> => {
  const w = SP.map(() => (r.chance(0.3) ? 0 : r.range(0.05, 1)));
  w[0] = Math.max(w[0]!, 0.1);
  const s = w.reduce((a, b) => a + b, 0);
  const p: Record<string, number | string> = { flow, T, P };
  SP.forEach((id, i) => { p['y_' + id] = w[i]! / s; });
  return p;
};
const total = (s: StreamState): number => s.n.reduce((a, b) => a + b, 0);

function plant(r: Rng, noFeed: boolean) {
  const T1 = r.range(330, 900), T2 = r.range(260, T1 - 60), P1 = 1e5 * r.range(2, 60), P2 = P1 * r.range(0.3, 1);
  const f1 = noFeed ? 0 : r.range(0.05, 5), f2 = noFeed ? 0 : r.range(0.05, 5);
  const units = [
    U('F1', 'feed', feedParams(r, f1, T1, P1)), U('F2', 'feed', feedParams(r, f2, T2, P2)),
    U('M', 'mixer'), U('H', 'hx', { area: r.range(0.5, 400) }), U('S', 'splitter', { frac: r.range(0.02, 0.6) }),
    U('V', 'valve', { P: r.range(0.2, 1) * Math.min(P1, P2) * 0.9 }), U('X', 'vent'), U('PR', 'product'),
  ];
  const pipes = [
    PP('a', 'F1.out', 'M.in1'), PP('b', 'M.out', 'H.hot_in'), PP('c', 'H.hot_out', 'S.in'), PP('d', 'S.purge', 'X.in'), PP('e', 'S.out', 'V.in'),
    PP('f', 'V.out', 'M.in2'), PP('g', 'F2.out', 'H.cold_in'), PP('h', 'H.cold_out', 'PR.in'),
  ];
  return { units, pipes, T1, T2, P1, P2, f1, f2 };
}

describe('P14 no free energy', () => {
  const reg = bindRegistry(SP);
  const ctx = ctxOf({ species: SP, thermoDetail: 'rigorous' });
  const solve = (p: ReturnType<typeof plant>) => solveFlowsheet({ species: SP, units: p.units, pipes: p.pipes, registry: reg, ctx, options: { phaseOk: phaseHook } });

  it(`no feed flow: nothing appears anywhere (${FUZZ_N} cases)`, () => {
    const r = new Rng(1401);
    let solved = 0;
    for (let k = 0; k < FUZZ_N; k++) {
      const res = solve(plant(r, true));
      if (!res.ok) { expect(res.code, `case ${k}`).not.toBe('NUMERIC_GUARD'); continue; }
      solved++;
      for (const [id, s] of Object.entries(res.value.streams)) {
        expect(total(s), `case ${k} stream ${id}`).toBe(0);
        expect(s.n.every((x) => Number.isFinite(x) && x === 0) && Number.isFinite(s.T) && Number.isFinite(s.P)).toBe(true);
      }
    }
    console.log(`P14 no-feed: ${solved}/${FUZZ_N} solved`);
    expect(solved).toBeGreaterThan(FUZZ_N * 0.5);
  }, fuzzTimeout(0.5));

  it(`passive recycle loop: no stream hotter than the hottest feed or colder than the coldest, none above the top feed pressure, no material made (${FUZZ_N} cases)`, () => {
    const r = new Rng(1402);
    let solved = 0;
    const codes: Record<string, number> = {};
    for (let k = 0; k < FUZZ_N; k++) {
      const p = plant(r, false);
      const res = solve(p);
      if (!res.ok) { expect(res.code, `case ${k}`).not.toBe('NUMERIC_GUARD'); codes[res.code] = (codes[res.code] ?? 0) + 1; continue; }
      solved++;
      const Tmax = Math.max(p.T1, p.T2), Tmin = Math.min(p.T1, p.T2), Pmax = Math.max(p.P1, p.P2);
      for (const [id, s] of Object.entries(res.value.streams)) {
        if (!(total(s) > 0)) continue;
        expect(s.T, `case ${k} ${id} T high`).toBeLessThanOrEqual(Tmax + 1e-6);
        expect(s.T, `case ${k} ${id} T low`).toBeGreaterThanOrEqual(Tmin - 1e-6);
        expect(s.P, `case ${k} ${id} P`).toBeLessThanOrEqual(Pmax * (1 + 1e-12));
        expect(s.n.every((x) => x >= -1e-12 && Number.isFinite(x))).toBe(true);
      }
      const out = total(res.value.streams.d!) + total(res.value.streams.h!);
      const fed = p.f1 + p.f2;
      expect(out, `case ${k} products vs feeds`).toBeLessThanOrEqual(fed * (1 + 1e-9));
      expect(out, `case ${k} products vs feeds`).toBeGreaterThanOrEqual(fed * (1 - 1e-6));
    }
    console.log(`P14 passive loop: ${solved}/${FUZZ_N} solved, other outcomes ${JSON.stringify(codes)}`);
    expect(solved).toBeGreaterThan(FUZZ_N * 0.3);
  }, fuzzTimeout(1));
});
