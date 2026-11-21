// F26: one currency per money number. A synthetic region identical to global except that EVERY price row (native ones included) and the
// capexFx are x K must give exactly K x the global value for every money-valued measure, star line and hero of every cost level. The pack is
// registered in this test process only (never shipped). The real 'in' pack is checked term by term in INR.
import { describe, expect, it } from 'vitest';
import { defineRegion } from '@core/regions';
import { Env, Rng, TICK } from '@core/kit';
import { GAME } from '../game';
import { REGIONS } from '.';
import { GLOBAL } from './global';
import { IN } from './in';
import { PRICE_KEYS, validateEqRegion, type EqRegionData } from './data';
import { crf } from '../sim/econ';
import { costFromParts, toLocal } from '../engine/solved';
import type { EqState } from '../state';
import { SPEC_BY_ID } from '../levels/registry';
import { OPT_AREA, costStar as l08Star, pinchBuild } from '../levels/l08';
import { L10_REF_PARTS, refCost as l10Ref } from '../levels/l10';
import { L11_REF_PARTS, L11_CONTRACTS } from '../levels/l11';
import { l12RefCost, shiftBuild, shiftMeasures } from '../levels/l12';
import { refAcidCost } from '../levels/l13';
import { netStar } from '../levels/l05';
import { L16_STAR3_COST } from '../levels/l16';
import { L17_STAR3_COST } from '../levels/l17';
import { L19_COST_MAX } from '../levels/l19';
import { L20_COST_MAX } from '../levels/l20';
import { L21_COST_MAX } from '../levels/l21';
import { L22_COST_MAX } from '../levels/l22';
import { L23_COST_MAX } from '../levels/l23';
import { L25_COST_STAR } from '../levels/l25';
import { L26_COST_MAX } from '../levels/l26';
import { REF_DESIGNS } from '../levels/refdesigns';

const K = 83;
const synth = defineRegion<EqRegionData>({
  ...GLOBAL, id: 'zk83', name: 'Synthetic x83 (test only)', status: 'draft',
  data: {
    ...GLOBAL.data,
    prices: Object.fromEntries(PRICE_KEYS.map((k) => [k, { ...GLOBAL.data.prices[k], value: GLOBAL.data.prices[k].value * K }])) as EqRegionData['prices'],
    capexFx: { value: K, src: 'test: every price row x K' },
    limits: { ...GLOBAL.data.limits, carbon_price: GLOBAL.data.limits.carbon_price * K },
  },
}, validateEqRegion);
REGIONS.register(synth);
const G = { region: 'global' }, Z = { region: 'zk83' };

const near = (a: number, b: number, what: string, tol = 1e-9) => expect(Math.abs(a - b) / Math.max(Math.abs(b), 1e-12), what).toBeLessThan(tol);
function start(id: string, region: string): Env<EqState> { const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode: 'learner', region } as any); return e; }
function solve(id: string, region: string): Env<EqState> {
  const env = start(id, region), agent = SPEC_BY_ID[id]!.solver(1003), rng = new Rng(1003);
  for (let t = 0; t < 40 && env.state.status === 'playing'; t++) {
    for (const a of agent(env.state, env.ctx(rng))) { env.step(a); if (env.state.status !== 'playing') break; }
    if (env.state.status === 'playing') env.step(TICK);
  }
  return env;
}
const meas = (id: string, region: string): Record<string, number> => SPEC_BY_ID[id]!.measures(solve(id, region).state).v;

/** Money-valued measures of the solver run, by level. */
const MEASURES: Record<string, string[]> = {
  L10: ['cost_usd_t'], L11: ['cost_usd_t', 'gas_usd_h'], L12: ['cost_usd_h', 'steam_usd_h', 'cat_usd_h'], L13: ['cost_usd_t'],
  L16: ['cost_per_t'], L17: ['cost_per_t'], L19: ['cost_per_t'], L20: ['cost_per_t'], L21: ['cost_per_t'], L22: ['cost_per_t'], L23: ['cost_per_t'],
  L25: ['cost'], L26: ['cost_per_t'], L28: ['cost_per_t'],
};
/** Star lines (region currency). */
const STARS: Record<string, (s: any) => number> = {
  L05: netStar, L08: l08Star, L10: (s) => l10Ref(s, L10_REF_PARTS) * 1.03, L11: (s) => l10Ref(s, L11_REF_PARTS, toLocal(s, L11_CONTRACTS[1].price * 1000)) * 1.03,
  L12: (s) => l12RefCost(s) * 1.03, L13: (s) => refAcidCost(s) * 1.03, L16: L16_STAR3_COST, L17: L17_STAR3_COST, L19: L19_COST_MAX, L20: L20_COST_MAX, L21: L21_COST_MAX,
  L22: L22_COST_MAX, L23: L23_COST_MAX, L25: L25_COST_STAR, L26: L26_COST_MAX,
};

describe('F26 synthetic region: every money number is exactly K x global', () => {
  it('the synthetic pack validates and is not shipped (draft, not in the real registry of the game build)', () => {
    expect(validateEqRegion(synth.data)).toEqual([]);
    expect(synth.status).toBe('draft');
  });
  for (const [id, keys] of Object.entries(MEASURES)) {
    it(`${id}: measures ${keys.join(', ')} scale by K`, () => {
      const g = meas(id, 'global'), z = meas(id, 'zk83');
      for (const k of keys) { expect(g[k], `${id}.${k} global`).toBeGreaterThan(0); near(z[k]!, g[k]! * K, `${id}.${k}`); }
    });
  }
  for (const [id, f] of Object.entries(STARS)) it(`${id}: the star line scales by K`, () => near(f(Z), f(G) * K, `${id} star`));
  it('L08: cost, star line, hero upper bound and the star verdict scale by K', () => {
    const run = (region: string) => { const e = start('L08', region); for (const a of pinchBuild(OPT_AREA, [{ name: 'commission' }])) e.step(a); return e; };
    const g = run('global'), z = run('zk83');
    const mg = SPEC_BY_ID.L08!.measures(g.state).v, mz = SPEC_BY_ID.L08!.measures(z.state).v;
    near(mz.cost_usd_h!, mg.cost_usd_h! * K, 'L08 cost'); near(mz.cost_ref_star!, mg.cost_ref_star! * K, 'L08 star');
    near((z.engine.q('levelInfo') as any).hero.hi, (g.engine.q('levelInfo') as any).hero.hi * K, 'L08 hero hi');
    near(mz.capex_usd!, mg.capex_usd!, 'capex_usd stays US$ (identical)');
  });
  it('L12 with a compressor: compressor capital (US$ x capexFx) plus its electricity scales by K', () => {
    const run = (region: string) => { const e = start('L12', region); for (const a of shiftBuild(200 + 273.15, 1.25, { P: 20e5, stages: 4 })) { const r: any = e.step(a); if (r.info?.ok === false) throw new Error(a.name + ': ' + r.info.message); } return shiftMeasures(e.state).v; };
    const g = run('global'), z = run('zk83');
    expect(g.comp_usd_h, 'compressor present').toBeGreaterThan(0);
    for (const k of ['comp_usd_h', 'cost_usd_h', 'cat_usd_h', 'steam_usd_h']) near(z[k]!, g[k]! * K, 'L12 ' + k);
  });
  it('L05: net value of the steam scales by K (prices only, no equipment)', () => near(netStar(Z as any), netStar(G as any) * K, 'L05'));
  it('level budgets stay US$: identical in every region', () => {
    for (const id of ['L02', 'L08', 'L12', 'L13', 'L25', 'L28']) {
      const g = (start(id, 'global').engine.q('levelInfo') as any).budgetUSD, z = (start(id, 'zk83').engine.q('levelInfo') as any).budgetUSD;
      expect(z, id).toBe(g);
    }
  });
});

describe('F26 real in pack: each cost is a sum of INR terms', () => {
  it('capexFx is the 83 of the converted rows, 1 for global', () => { expect(IN.data.capexFx.value).toBe(83); expect(GLOBAL.data.capexFx.value).toBe(1); });
  it('validateEqRegion rejects a missing, zero or unsourced capexFx', () => {
    const bad = (cf: unknown) => validateEqRegion({ ...IN.data, capexFx: cf } as any).filter((e) => e.startsWith('capexFx'));
    expect(bad(undefined).length).toBe(1); expect(bad({ value: 0, src: 'x' }).length).toBe(1); expect(bad({ value: 83, src: '' }).length).toBe(1); expect(bad({ value: 83, src: 'ok' })).toEqual([]);
  });
  it('L08: annual cost = capex(US$) x 83 x (CRF + 4 %) + opex hours x INR opex; the capex share in INR is 83 x the US$ share', () => {
    const run = (region: string) => { const e = start('L08', region); for (const a of pinchBuild(OPT_AREA, [{ name: 'commission' }])) e.step(a); return e.state.solved!.kpis; };
    const g = run('global'), i = run('in');
    near(i.capex_usd!, g.capex_usd!, 'capex_usd is US$ in both');
    const af = crf(0.1, 15) + 0.04;
    const capexShareG = g.capex_usd! * af / 8000, capexShareI = i.capex_usd! * 83 * af / 8000;
    near(capexShareI, capexShareG * 83, 'capex share x83');
    near(i.annual_cost_usd!, i.capex_usd! * 83 * af + i.opex_usd_per_h! * 8000, 'INR annual = INR capex + INR opex');
    near(g.annual_cost_usd!, g.capex_usd! * af + g.opex_usd_per_h! * 8000, 'USD annual');
    // the cost is never the old mix (US$ capex added to INR opex)
    expect(i.annual_cost_usd!).toBeGreaterThan(g.annual_cost_usd! * 40);
    near(costFromParts({ region: 'in' }, REF_DESIGNS.L08!).perH, i.annual_cost_usd! / 8000, 'ref parts in INR');
  });
  it('the in/global ratio of the money lines is now between the price ratio extremes (capex 83; fuel 83 (APM gas native) ; electricity 70)', () => {
    for (const [id, f] of Object.entries(STARS)) {
      const r = f({ region: 'in' }) / f(G);
      expect(r, id).toBeGreaterThan(40); expect(r, id).toBeLessThan(130);
    }
  });
});
