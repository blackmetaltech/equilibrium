// The reference designs (refdesigns.ts) are re-captured from each level's solver run in every registered region: the physical parts must not
// drift, and the priced cost must equal what the engine itself reports for that run. Fails if a level, a unit model or a price changes under them.
import { describe, expect, it } from 'vitest';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { REGIONS } from '../regions';
import { economics, costFromParts } from '../engine/solved';
import type { EqState } from '../state';
import { SPEC_BY_ID } from './registry';
import { OPT_AREA, pinchBuild } from './l08';
import { REF_DESIGNS } from './refdesigns';
import { L19_REF } from './l19';
import { L20_REF } from './l20';
import { L21_REF } from './l21';
import { L22_REF } from './l22';
import { L23_REF } from './l23';
import { L26_REF } from './l26';

function start(id: string, region: string): Env<EqState> { const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode: 'learner', region } as any); return e; }
function solve(id: string, region: string): EqState {
  const env = start(id, region), agent = SPEC_BY_ID[id]!.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < 40 && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env.state;
}
function pinch(region: string): EqState { const e = start('L08', region); for (const a of pinchBuild(OPT_AREA, [{ name: 'commission' }])) e.step(a); return e.state; }
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b) / Math.max(Math.abs(b), 1e-12)).toBeLessThan(tol);
const flat = (p: any): number[] => [p.cbmUsd, p.productTph, p.steamBoughtTph, p.opex.electricW ?? 0, p.opex.firedDutyW ?? 0, p.opex.steamRaisedW ?? 0, p.opex.coolingW ?? 0,
  ...(p.opex.refrig ?? []).flatMap((r: any) => [r.dutyW, r.tColdK]), ...(p.opex.feeds ?? []).map((f: any) => f.kgPerS)];

describe('reference designs: re-captured in every region', () => {
  for (const region of REGIONS.ids()) {
    for (const id of ['L16', 'L17', 'L19', 'L20', 'L21', 'L22', 'L23', 'L25', 'L26']) {
      it(`${id} in ${region}: parts match the solver run and price to the engine's cost per tonne`, () => {
        const st = solve(id, region), ec = economics(st, st.solved!.streams, st.solved!.units);
        const ref = REF_DESIGNS[id]!, a = flat(ref), b = flat(ec.parts);
        expect(b.length).toBe(a.length);
        a.forEach((x, i) => near(b[i]!, x, 1e-6));
        near(costFromParts(st, ref).perT, ec.kpis.cost_usd_per_t!, 1e-6);
      });
    }
    it(`L08 in ${region}: parts match the optimum-area build and price to the engine's cost per hour`, () => {
      const st = pinch(region), ec = economics(st, st.solved!.streams, st.solved!.units), ref = REF_DESIGNS.L08!;
      flat(ref).forEach((x, i) => near(flat(ec.parts)[i]!, x, 1e-6));
      near(costFromParts(st, ref).perH, ec.kpis.annual_cost_usd! / 8000, 1e-6);
    });
  }
  it('the global reference costs are the documented constants (rounded in the level files)', () => {
    const g = { region: 'global' };
    const per = (id: string) => costFromParts(g, REF_DESIGNS[id]!).perT;
    near(per('L19'), L19_REF.cost, 1e-4); near(per('L20'), L20_REF.cost, 1e-4); near(per('L21'), L21_REF.cost, 1e-4);
    near(per('L22'), L22_REF.cost, 1e-4); near(per('L23'), L23_REF.cost, 1e-4); near(per('L26'), L26_REF.cost, 1e-4);
    near(per('L16') * 1.03, 14.9, 0.01); near(per('L17') * 1.03, 18.3, 0.01); near(per('L25') * 1.03, 4.09, 0.01);
    near(costFromParts(g, REF_DESIGNS.L08!).perH * 1.03, 78.27, 1e-3);
  });
});
