// P1 / P2 / P3 on whole random flowsheets of real units (DESIGN 9.3): <= 12 units, random chains of heater / cooler / compressor / valve /
// equilibrium converter (Haber R1) / NH3 separator between a feed-mixer and a purge splitter, with a recycle through a valve (a loop in
// 4 of 5 cases). Random species compositions, T, P, purge. Assertions on every solved flowsheet:
//   P1 atoms: sum of every element into the feed(s) equals the element sum leaving through vent and product, 1e-9 relative;
//   P2 mass: same for kg/s (1e-9);
//   P3 energy: sum H_feed + sum duties + sum shaft work = sum H_out within 1e-6 of the largest term, for plants without phase change
//      (a plant with the NH3 separator is excluded here: its duty is measured on liquid enthalpies the mixture enthalpy does not know).
// Unsolved cases must carry a code (never NUMERIC_GUARD) and must be a minority-but-not-vanishing share, so the properties are really tested.
import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { SPECIES } from '../data/species';
import { bindRegistry, phaseHook } from '../engine/registry';
import { ctxOf } from '../engine/solved';
import { solveFlowsheet } from '../sim/flowsheet';
import { enthalpyFlow, makeMixture, massFlow } from '../sim/thermo';
import type { Pipe, StreamState, UnitInst } from '../sim/types';
import { FUZZ_N, fuzzTimeout } from './fuzz';

const SP = ['N2', 'H2', 'NH3', 'Ar'];
const mx = makeMixture(SP);
const U = (id: string, type: string, params: Record<string, number | string> = {}): UnitInst => ({ id, type, pos: { x: 0, y: 0 }, rot: 0, params });
const PP = (id: string, a: string, b: string): Pipe => {
  const [fu, fp] = a.split('.'), [tu, tp] = b.split('.');
  return { id, from: { unit: fu!, port: fp! }, to: { unit: tu!, port: tp! } };
};
const atoms = (n: number[]): Record<string, number> => {
  const o: Record<string, number> = {};
  SP.forEach((id, i) => { for (const [e, c] of Object.entries(SPECIES[id]!.elements)) o[e] = (o[e] ?? 0) + c * n[i]!; });
  return o;
};

function randomPlant(r: Rng) {
  const units: UnitInst[] = [], pipes: Pipe[] = [];
  const Pf = 1e5 * r.range(5, 80), loop = r.chance(0.8), pr = Pf * r.range(0.5, 1);
  const w = SP.map((_, i) => (i === 2 ? (r.chance(0.7) ? 0 : r.range(0, 0.1)) : r.range(0.02, 1)));
  const s = w.reduce((a, b) => a + b, 0);
  const fp: Record<string, number | string> = { flow: r.range(0.1, 5), T: r.range(270, 330), P: Pf };
  SP.forEach((id, i) => { fp['y_' + id] = w[i]! / s; });
  units.push(U('F', 'feed', fp), U('M', 'mixer'));
  pipes.push(PP('p0', 'F.out', 'M.in1'));
  let prev = 'M.out', p = loop ? pr : Pf, k = 0, sep = false, reactor = false;
  const add = (u: UnitInst, inPort = 'in', outPort = 'out'): void => { units.push(u); pipes.push(PP('p' + ++k, prev, u.id + '.' + inPort)); prev = u.id + '.' + outPort; };
  const stages = r.int(2, 5);
  for (let i = 0; i < stages; i++) {
    const kind = r.pick(['heater', 'cooler', 'compressor', 'valve', 'reactor', 'sep']);
    const id = 'S' + i;
    if (kind === 'heater') add(U(id, 'heater', { T: r.range(300, 900) }));
    else if (kind === 'cooler') add(U(id, 'cooler', { T: r.range(280, 400), dP: r.range(0, 0.02) * p }));
    else if (kind === 'compressor') { p = Math.min(p * r.range(1.1, 3), 4e7); add(U(id, 'compressor', { P: p, stages: r.int(2, 4) })); }
    else if (kind === 'valve') { p *= r.range(0.4, 1); add(U(id, 'valve', { P: p })); }
    else if (kind === 'reactor' && !reactor) { reactor = true; add(U(id, 'eq_reactor', { reactions: 'R1', T: r.range(650, 850) })); }
    else if (kind === 'sep' && !sep) {
      sep = true; units.push(U('L', 'product'));
      add(U(id, 'nh3_sep', { T: r.range(242, 300) }), 'in', 'vap'); pipes.push(PP('pl', id + '.liq', 'L.in'));
    }
  }
  units.push(U('S', 'splitter', { frac: r.range(0.01, 0.5) }), U('X', 'vent'));
  pipes.push(PP('ps', prev, 'S.in'), PP('pv', 'S.purge', 'X.in'));
  if (loop) {
    // the recycle valve target (= the mixer pressure) never exceeds the pressure at the splitter
    units.push(U('V', 'valve', { P: Math.min(pr, p) }));
    pipes.push(PP('pr1', 'S.out', 'V.in'), PP('pr2', 'V.out', 'M.in2'));
  } else {
    const f2 = { ...fp, flow: r.range(0.05, 1) };
    units.push(U('F2', 'feed', f2), U('PR', 'product'));
    pipes.push(PP('pr', 'S.out', 'PR.in'), PP('pf2', 'F2.out', 'M.in2'));
  }
  return { units, pipes, sep, species: SP };
}

describe('P1 / P2 / P3 on random flowsheets of real units', () => {
  const reg = bindRegistry(SP);
  const ctx = ctxOf({ species: SP, thermoDetail: 'rigorous' });
  it(`atoms and mass close to 1e-9 and energy to 1e-6 on every solved flowsheet (${FUZZ_N} cases)`, () => {
    const r = new Rng(10203);
    let solved = 0, energyChecked = 0, loops = 0, worstA = 0, worstM = 0, worstE = 0, maxUnits = 0;
    const codes: Record<string, number> = {};
    for (let c = 0; c < FUZZ_N; c++) {
      const pl = randomPlant(r);
      maxUnits = Math.max(maxUnits, pl.units.length);
      expect(pl.units.length).toBeLessThanOrEqual(12);
      const res = solveFlowsheet({ species: SP, units: pl.units, pipes: pl.pipes, registry: reg, ctx, options: { phaseOk: phaseHook } });
      if (!res.ok) { expect(res.code, `case ${c}`).not.toBe('NUMERIC_GUARD'); codes[res.code] = (codes[res.code] ?? 0) + 1; continue; }
      solved++;
      if (res.value.tears.length > 0) loops++;
      const st = res.value.streams;
      const into: StreamState[] = [], out: StreamState[] = [];
      for (const u of pl.units) {
        if (u.type === 'feed') into.push(st[pl.pipes.find((q) => q.from.unit === u.id)!.id]!);
        if (u.type === 'vent' || u.type === 'product') out.push(st[pl.pipes.find((q) => q.to.unit === u.id)!.id]!);
      }
      const sum = (ss: StreamState[]): number[] => SP.map((_, i) => ss.reduce((a, s) => a + s.n[i]!, 0));
      const a0 = atoms(sum(into)), a1 = atoms(sum(out));
      for (const e of Object.keys(a0)) {
        const rel = Math.abs(a0[e]! - a1[e]!) / Math.max(a0[e]!, 1e-12);
        worstA = Math.max(worstA, rel);
        expect(rel, `case ${c} atoms ${e}`).toBeLessThan(1e-9);
      }
      const m0 = into.reduce((a, s) => a + massFlow(mx, s.n), 0), m1 = out.reduce((a, s) => a + massFlow(mx, s.n), 0);
      worstM = Math.max(worstM, Math.abs(m0 - m1) / m0);
      expect(Math.abs(m0 - m1) / m0, `case ${c} mass`).toBeLessThan(1e-9);
      if (!pl.sep) {
        energyChecked++;
        let duty = 0, work = 0;
        for (const u of pl.units) { const ur = res.value.units[u.id]; duty += ur?.duty ?? 0; work += ur?.work ?? 0; }
        const Hin = into.reduce((a, s) => a + enthalpyFlow(mx, s), 0), Hout = out.reduce((a, s) => a + enthalpyFlow(mx, s), 0);
        const big = Math.max(Math.abs(Hin), Math.abs(Hout), Math.abs(duty), Math.abs(work), 1e-30);
        const e = Math.abs(Hin + duty + work - Hout) / big;
        worstE = Math.max(worstE, e);
        expect(e, `case ${c} energy`).toBeLessThan(1e-6);
      }
    }
    console.log(`P1-P3 flowsheets: ${solved}/${FUZZ_N} solved (${loops} with a tear), energy checked on ${energyChecked}, worst atom ${worstA.toExponential(2)}, mass ${worstM.toExponential(2)}, energy ${worstE.toExponential(2)}, max units ${maxUnits}, unsolved ${JSON.stringify(codes)}`);
    expect(solved).toBeGreaterThan(FUZZ_N * 0.3);
    expect(energyChecked).toBeGreaterThan(FUZZ_N * 0.1);
    expect(loops).toBeGreaterThan(FUZZ_N * 0.1);
  }, fuzzTimeout(3));
});
