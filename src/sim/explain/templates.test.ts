// One constructed RunRecord pair per template (DESIGN 9.8): exact sentences, before -> after numbers with units, direction words.
// Expected strings are written by hand from the numbers below, not copied from the output.
import { describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { changedSetpoints, explainRun, MAX_RESOLVES, predictGap, renderExplanation } from './index';
import type { ExplainRecord, ResolveFn, UnitFacts } from './index';

const rec = (p: Partial<ExplainRecord> & { setpoints: ExplainRecord['setpoints'] }): ExplainRecord => ({ kpis: { product_t_per_h: 10, electric_kw: 400 }, units: {}, diag: [], failure: null, events: [], ...p });
const reactor = (info: Record<string, number>, extra: Partial<UnitFacts> = {}): UnitFacts => ({ type: 'eq_reactor', params: {}, info, rx: { dnGas: -2, dHkJ: -92.4, eq: 'N2 + 3 H2 <=> 2 NH3' }, ...extra });
const plain = (type: string): UnitFacts => ({ type, params: {}, info: {} });
/** A resolver that answers `prev` when the knob is back at its old value and `cur` otherwise. */
const byKnob = (unit: string, key: string, oldV: number, prev: ExplainRecord, cur: ExplainRecord): ResolveFn => (sp) => (sp[unit]![key] === oldV ? prev : cur);
const say = (prev: ExplainRecord, cur: ExplainRecord, rs: ResolveFn, mode = 'engineer'): string[] => renderExplanation(explainRun(prev, cur, rs), mode);

describe('why templates', () => {
  it('T up, exothermic, equilibrium-limited', () => {
    const prev = rec({ setpoints: { r1: { T: 693.15 } }, kpis: { product_t_per_h: 10, electric_kw: 400 }, units: { r1: reactor({ K: 6.2e-5, Xeq: 0.27, X: 0.27, eta: 0.96 }) } });
    const cur = rec({ setpoints: { r1: { T: 793.15 } }, kpis: { product_t_per_h: 6.9, electric_kw: 400 }, units: { r1: reactor({ K: 4.5e-6, Xeq: 0.14, X: 0.14, eta: 1 }) } });
    const out = say(prev, cur, byKnob('r1', 'T', 693.15, prev, cur));
    expect(out).toEqual([
      'You raised the temperature at r1 from 420 °C to 520 °C.',
      'The reaction is exothermic (ΔH = −92.4 kJ/mol), so K fell from 6.2×10⁻⁵ to 4.5×10⁻⁶ and the ceiling on conversion fell from 27 % to 14 %.',
      'The bed was already at 96 % of equilibrium, so speed was not what limited it: production fell 31 %.',
    ]);
    // learner mode appends exactly one hint, engineer mode none
    const learner = say(prev, cur, byKnob('r1', 'T', 693.15, prev, cur), 'learner');
    expect(learner).toHaveLength(4); expect(learner[3]).toMatch(/^Hint: /);
  });
  it('T down on the same bed uses the same template with the opposite words', () => {
    const cur = rec({ setpoints: { r1: { T: 693.15 } }, units: { r1: reactor({ K: 6.2e-5, Xeq: 0.27, X: 0.27, eta: 1 }) } });
    const prev = rec({ setpoints: { r1: { T: 793.15 } }, kpis: { product_t_per_h: 6.9, electric_kw: 400 }, units: { r1: reactor({ K: 4.5e-6, Xeq: 0.14, X: 0.14, eta: 0.9 }) } });
    const out = say(prev, cur, byKnob('r1', 'T', 793.15, prev, cur));
    expect(out[0]).toBe('You lowered the temperature at r1 from 520 °C to 420 °C.');
    expect(out[1]).toContain('K rose from 4.5×10⁻⁶ to 6.2×10⁻⁵');
    expect(out[2]).toBe('The bed was already at 90 % of equilibrium, so speed was not what limited it: production rose 45 %.');
  });
  it('T up, kinetics-limited', () => {
    const prev = rec({ setpoints: { r1: { T: 623.15 } }, kpis: { product_t_per_h: 4, electric_kw: 400 }, units: { r1: reactor({ K: 1e-3, Xeq: 0.6, X: 0.2, eta: 0.5 }) } });
    const cur = rec({ setpoints: { r1: { T: 673.15 } }, kpis: { product_t_per_h: 7, electric_kw: 400 }, units: { r1: reactor({ K: 5e-4, Xeq: 0.6, X: 0.35, eta: 0.58 }) } });
    expect(say(prev, cur, byKnob('r1', 'T', 623.15, prev, cur))).toEqual([
      'You raised the temperature at r1 from 350 °C to 400 °C.',
      'The bed was only at 50 % of equilibrium, so it was limited by speed, not by the ceiling: conversion rose from 20 % to 35 % (the ceiling is 60 %).',
      'Production rose 75 %.',
    ]);
  });
  it('P up with a change of gas moles', () => {
    const prev = rec({ setpoints: { k1: { P: 2e6 } }, kpis: { product_t_per_h: 5, electric_kw: 400 }, units: { k1: plain('compressor'), r1: reactor({ K: 1e-3, Xeq: 0.2, X: 0.2, eta: 1 }) } });
    const cur = rec({ setpoints: { k1: { P: 4e6 } }, kpis: { product_t_per_h: 6.5, electric_kw: 1800 }, units: { k1: plain('compressor'), r1: reactor({ K: 1e-3, Xeq: 0.31, X: 0.31, eta: 1 }) } });
    expect(say(prev, cur, byKnob('k1', 'P', 2e6, prev, cur))).toEqual([
      'You raised the pressure at k1 from 20 bar to 40 bar.',
      'The reaction changes the gas moles by −2 per reaction, so the ceiling on conversion rose from 20 % to 31 %.',
      'Production rose 30 %, and the electric power rose by 1.4 MW.',
    ]);
  });
  it('P up with no change of gas moles', () => {
    const rx = { dnGas: 0, dHkJ: -41.2, eq: 'CO + H2O <=> CO2 + H2' };
    const prev = rec({ setpoints: { k1: { P: 1e6 } }, kpis: { product_t_per_h: 5, electric_kw: 400 }, units: { k1: plain('compressor'), r1: reactor({ K: 20, Xeq: 0.92, X: 0.92, eta: 1 }, { rx }) } });
    const cur = rec({ setpoints: { k1: { P: 2e6 } }, kpis: { product_t_per_h: 5, electric_kw: 1800 }, units: { k1: plain('compressor'), r1: reactor({ K: 20, Xeq: 0.92, X: 0.92, eta: 1 }, { rx }) } });
    expect(say(prev, cur, byKnob('k1', 'P', 1e6, prev, cur))).toEqual([
      'You raised the pressure at k1 from 10 bar to 20 bar.',
      'CO + H2O <=> CO2 + H2 has the same number of gas moles on both sides, so K and the ceiling on conversion did not change (still 92 %).',
      'The electric power rose by 1.4 MW for the same production.',
    ]);
  });
  it('inert up at constant pressure', () => {
    const prev = rec({ setpoints: { f1: { y_Ar: 0.01 } }, kpis: { product_t_per_h: 8, electric_kw: 400 }, units: { f1: plain('feed'), r1: reactor({ K: 1e-3, Xeq: 0.3, X: 0.3, eta: 1 }, { inert: { species: 'Ar', y: 0.01 } }) } });
    const cur = rec({ setpoints: { f1: { y_Ar: 0.05 } }, kpis: { product_t_per_h: 7.2, electric_kw: 400 }, units: { f1: plain('feed'), r1: reactor({ K: 1e-3, Xeq: 0.26, X: 0.26, eta: 1 }, { inert: { species: 'Ar', y: 0.05 } }) } });
    expect(say(prev, cur, byKnob('f1', 'y_Ar', 0.01, prev, cur))).toEqual([
      'You raised the Ar in the feed at f1 from 1 % to 5 %.',
      'At constant pressure the inert takes room the reactants had, so their partial pressures fall and the ceiling on conversion fell from 30 % to 26 %.',
      'Production fell 10 %.',
    ]);
  });
  it('purge down: inert accumulation', () => {
    const prev = rec({ setpoints: { s1: { frac: 0.05 } }, kpis: { product_t_per_h: 8, electric_kw: 400 }, units: { s1: plain('splitter'), r1: reactor({ K: 1e-3, Xeq: 0.3, X: 0.3, eta: 1 }, { inert: { species: 'Ar', y: 0.02 } }) } });
    const cur = rec({ setpoints: { s1: { frac: 0.01 } }, kpis: { product_t_per_h: 6.4, electric_kw: 400 }, units: { s1: plain('splitter'), r1: reactor({ K: 1e-3, Xeq: 0.2, X: 0.2, eta: 1 }, { inert: { species: 'Ar', y: 0.08 } }) } });
    expect(say(prev, cur, byKnob('s1', 'frac', 0.05, prev, cur))).toEqual([
      'You lowered the purge fraction at s1 from 5 % to 1 %.',
      'The purge is the only way Ar leaves the loop, so its share of the reactor feed moved from 2 % to 8 % and the reactants are diluted to match.',
      'Production fell 20 %.',
    ]);
  });
  it('inlet temperature below light-off', () => {
    const prev = rec({ setpoints: { r1: { T: 673.15 } }, units: { r1: reactor({ K: 1, Xeq: 0.3, X: 0.3, eta: 1 }) } });
    const cur = rec({ setpoints: { r1: { T: 573.15 } }, kpis: { product_t_per_h: 0, electric_kw: 400 }, units: { r1: reactor({ K: 1, Xeq: 0.3, X: 0, eta: 0 }) }, diag: [{ code: 'BELOW_LIGHTOFF', unitId: 'r1', data: { T: 573.15, Tmin: 623.15 } }] });
    expect(say(prev, cur, byKnob('r1', 'T', 673.15, prev, cur))).toEqual(['The catalyst at r1 needs 350 °C to start, but the inlet temperature is 300 °C, so the bed passes the feed through unreacted (conversion 0 %).']);
  });
  it('coolant loss runaway', () => {
    const prev = rec({ setpoints: { r1: { T: 390.15 } } });
    const cur = rec({ setpoints: { r1: { T: 390.15 } }, events: [{ code: 'RUNAWAY', unitId: 'r1', data: { t: 134, flowdrop: 0.7, T0: 390.15, dT: 20, dt: 49, Tpeak: 425.15, Trelief: 413.15 } }] });
    expect(say(prev, cur, () => null)).toEqual([
      'The cooling water flow fell 70 % at 02:14.',
      'The reactor was at 117 °C; with less cooling it made heat faster than it could lose it, and the temperature climbed 20 K in 49 s toward 152 °C, past the 140 °C relief point.',
    ]);
  });
  it('azeotrope limit', () => {
    const prev = rec({ setpoints: { d1: { N: 20 } } });
    const cur = rec({ setpoints: { d1: { N: 40 } }, diag: [{ code: 'AZEOTROPE_LIMIT', unitId: 'd1', data: { xspec: 0.99, xaz: 0.956, P: 101325 } }] });
    expect(say(prev, cur, () => prev)).toEqual(['The target purity at d1 is 99 %, but the mixture forms an azeotrope at 96 % at 1.01 bar, so no number of stages or reflux can pass it.']);
  });
  it('limiting reagent switched', () => {
    const lim = (species: string, other: string): UnitFacts['lim'] => ({ species, other, have: 189000 / 3600, need: 200000 / 3600, left: 11000 / 3600 });
    const prev = rec({ setpoints: { f1: { flow: 1 } }, units: { r1: reactor({ K: 1, Xeq: 1, X: 1, eta: 1 }, { lim: lim('S', 'O2') }) } });
    const cur = rec({ setpoints: { f1: { flow: 2 } }, units: { r1: reactor({ K: 1, Xeq: 1, X: 0.9, eta: 1 }, { lim: lim('O2', 'S') }) } });
    expect(say(prev, cur, () => prev)).toEqual([
      'After the change to the feed flow, O2 is the limiting reagent at r1: 189 kmol/h available, but using all the S takes 200 kmol/h.',
      '11 kmol/h of S is left unreacted.',
    ]);
  });
  it('a failed run is explained by its code (NO_EXIT: purge)', () => {
    const prev = rec({ setpoints: { s1: { frac: 0.05 } } });
    const cur = rec({ setpoints: { s1: { frac: 0 } }, failure: { code: 'NO_EXIT', species: 'Ar', data: { species: 'Ar', inflow: 300 / 3600, scc: 'a,b' } } });
    expect(say(prev, cur, () => null)).toEqual(['Ar enters at 0.3 kmol/h and nothing removes it, so every pass through the loop adds more.', 'A steady state only exists if something lets Ar out: add a purge.']);
  });
  it('a failure without its own template falls back to the generic failure text, with the code', () => {
    const cur = rec({ setpoints: {}, failure: { code: 'SOMETHING_ELSE', data: {} } });
    expect(say(rec({ setpoints: {} }), cur, () => null)).toEqual(['The run stopped with the failure SOMETHING_ELSE; the unit is marked on the plant.']);
  });
  it('a setpoint with no special physics gets the generic template', () => {
    const prev = rec({ setpoints: { c1: { T: 300 } }, kpis: { product_t_per_h: 10, electric_kw: 400 }, units: { c1: plain('cooler') } });
    const cur = rec({ setpoints: { c1: { T: 290 } }, kpis: { product_t_per_h: 10, electric_kw: 500 }, units: { c1: plain('cooler') } });
    expect(say(prev, cur, () => prev)).toEqual(['You lowered T at c1 from 300 to 290.', 'The electric_kw rose from 400 to 500.']);
  });
  it('nothing changed: no sentences', () => {
    const a = rec({ setpoints: { c1: { T: 300 } } });
    expect(say(a, a, () => a)).toEqual([]);
  });
  it('prediction gap (Cp(T) vs constant dH), and the plain form outside rigorous detail', () => {
    expect(renderExplanation(predictGap(100, 103.2, 'rigorous', 0.02)!, 'engineer')).toEqual(['You predicted 100 and the engine gets 103, 3.1 % apart.', 'You assumed a constant ΔH; the engine uses Cp(T).', 'Switch Thermo detail to Textbook to compare.']);
    expect(renderExplanation(predictGap(100, 103.2, 'textbook', 0.02)!, 'engineer')).toEqual(['You predicted 100 and the engine gets 103, 3.1 % apart.']);
    expect(predictGap(100, 101, 'rigorous', 0.02)).toBeNull();
  });
});

describe('blame tree', () => {
  it('ranks the changed setpoints by their own effect and re-solves at most 8 times', () => {
    const sp = (v: number): Record<string, Record<string, number>> => ({ u: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['k' + i, i === 3 ? 1 + 4 * v : 1 + v])) });
    const prev = rec({ setpoints: sp(0) });
    const cur = rec({ setpoints: sp(1), kpis: { product_t_per_h: 6, electric_kw: 400 } });
    let calls = 0;
    // only k3 drives production: reverting it takes production back to 10, reverting any other changes nothing
    const resolve: ResolveFn = (s) => { calls++; return rec({ setpoints: s, kpis: { product_t_per_h: s.u!.k3 === 1 ? 10 : 6, electric_kw: 400 } }); };
    const e = explainRun(prev, cur, resolve);
    expect(calls).toBeLessThanOrEqual(MAX_RESOLVES); expect(calls).toBe(8);
    expect(changedSetpoints(prev.setpoints, cur.setpoints)).toHaveLength(8);
    expect(e.factors[0]).toMatchObject({ unitId: 'u', key: 'k3', from: 1, to: 5 });
    expect(e.factors[0]!.effect).toBeCloseTo(-0.4, 12);
    expect(e.kpi).toBe('product_t_per_h');
  });
  it('is deterministic and does not mutate its inputs', () => {
    const prev = rec({ setpoints: { r1: { T: 693.15 } }, units: { r1: reactor({ K: 6.2e-5, Xeq: 0.27, X: 0.27, eta: 0.96 }) } });
    const cur = rec({ setpoints: { r1: { T: 793.15 } }, kpis: { product_t_per_h: 6.9, electric_kw: 400 }, units: { r1: reactor({ K: 4.5e-6, Xeq: 0.14, X: 0.14, eta: 1 }) } });
    const snap = JSON.stringify([prev, cur]);
    const a = explainRun(prev, cur, byKnob('r1', 'T', 693.15, prev, cur)), b = explainRun(prev, cur, byKnob('r1', 'T', 693.15, prev, cur));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify([prev, cur])).toBe(snap);
  });
  it('asked no missing key or variable of the locale for any template above', () => { expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]); });
});
