import { describe, expect, it } from 'vitest';
import { REACTIONS, REACTOR_SETS, reactionOf } from '../../data/reactions';
import {
  airFeed, atomBalance, atomMatrixOf, conversion, conversionToExtent, elementsOf, extentToMoles, extentsFromSpecs, extentFromMoles,
  independentReactions, limitingReagent, o2Demand, parseEquation, rank, reactionSetRank, selectivity, stoichMatrix, yieldOf, elementTotals,
} from './stoich';

describe('atom matrix, stoichiometric matrix, rank', () => {
  it('atom matrix of a species list (rows elements sorted, columns species)', () => {
    const { elements, A } = atomMatrixOf(['N2', 'H2', 'NH3']);
    expect(elements).toEqual(['H', 'N']);
    expect(A).toEqual([[0, 2, 3], [2, 0, 1]]);
  });

  it('elementsOf: catalogue species and plain formulas (not in the catalogue) alike', () => {
    expect(elementsOf('H2O(l)')).toEqual({ H: 2, O: 1 });
    expect(elementsOf('C2H4O')).toEqual({ C: 2, H: 4, O: 1 });
  });

  it('stoichiometric matrix: rows reactions, columns species', () => {
    const ids = ['N2', 'H2', 'NH3', 'Ar'];
    expect(stoichMatrix([reactionOf('R1').nu], ids)).toEqual([[-1, -3, 2, 0]]);
  });

  it('rank: independent, repeated and combined rows; tolerance-robust to scale', () => {
    expect(rank([[1, 0], [0, 1]])).toBe(2);
    expect(rank([[1, 2, 3], [2, 4, 6]])).toBe(1);
    expect(rank([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(2);
    expect(rank([[1e-9, 2e-9], [2e-9, 4e-9]])).toBe(1);
    expect(rank([])).toBe(0);
  });

  it('atom balance of EVERY catalogue reaction is exact (no tolerance)', () => {
    for (const r of REACTIONS) {
      const b = atomBalance(r.nu);
      expect(b.ok, `${r.id} residual ${JSON.stringify(b.residual)}`).toBe(true);
      for (const e of Object.keys(b.residual)) expect(b.residual[e], `${r.id} ${e}`).toBe(0);
    }
  });

  it('atom balance detects an unbalanced reaction and names the element', () => {
    const b = atomBalance({ N2: -1, H2: -2, NH3: 2 });
    expect(b.ok).toBe(false);
    expect(b.residual['H']).toBe(2);
  });

  it('rank test: every must-ship reactor reaction set is independent (rank = number of reactions)', () => {
    for (const [name, ids] of Object.entries(REACTOR_SETS)) {
      const r = reactionSetRank(ids.map((id) => reactionOf(id).nu));
      expect(r.rank, name).toBe(ids.length);
      expect(r.independent, name).toBe(true);
    }
  });

  it('rank detects the dependent methanol triple R3 R4 R5 (R4 = R3 - R5) and names the dependent row', () => {
    const rs = ['R3', 'R4', 'R5'].map((id) => reactionOf(id).nu);
    const r = independentReactions(rs);
    expect(r.rank).toBe(2);
    expect(r.independent).toBe(false);
    expect(r.dependent).toEqual([2]);
  });

  it('parseEquation: coefficients, fractions, decimals, arrows', () => {
    expect(parseEquation('N2+3H2->2NH3')).toEqual({ N2: -1, H2: -3, NH3: 2 });
    expect(parseEquation('C3H8 + 3.5 O2 -> 3 CO + 4 H2O')).toEqual({ C3H8: -1, O2: -3.5, CO: 3, H2O: 4 });
    expect(parseEquation('SO2 + 1/2 O2 <=> SO3')).toEqual({ SO2: -1, O2: -0.5, SO3: 1 });
  });
});

describe('extent <-> moles, limiting reagent, conversion, yield, selectivity', () => {
  it('extentToMoles / extentFromMoles are inverse; multi-reaction', () => {
    const n0 = [100, 200, 0, 0];
    const nu = [[-4, -5, 4, 6]];
    const n = extentToMoles(n0, nu, [12.5]);
    expect(n).toEqual([50, 137.5, 50, 75]);
    expect(extentFromMoles(n0, n, nu[0]!)).toBe(12.5);
    const two = extentToMoles([1, 1, 0], [[-1, 0, 1], [0, -1, 1]], [0.25, 0.5]);
    expect(two).toEqual([0.75, 0.5, 0.75]);
  });

  it('limitingReagent: smallest n/|nu|, with the ratios; absent reactant gives extent 0', () => {
    const l = limitingReagent({ N2: 71.4, H2: 496 }, parseEquation('N2+3H2->2NH3'));
    expect(l.species).toBe('N2');
    expect(l.xiMax).toBe(71.4);
    expect(limitingReagent({ N2: 0, H2: 5 }, parseEquation('N2+3H2->2NH3'))).toMatchObject({ species: 'N2', xiMax: 0 });
  });

  it('conversionToExtent: a conversion above what the limiting reagent allows returns CONVERSION_EXCEEDS_LIMITING with data', () => {
    // N2 + 3 H2 feed 1 : 2. N2 conversion up to 1/3 * ... H2 limits: max X(N2) = (2/3) / 1
    const r = conversionToExtent([1, 2, 0], [-1, -3, 2], 0, 0.9, ['N2', 'H2', 'NH3']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('CONVERSION_EXCEEDS_LIMITING');
      expect(r.data['asked']).toBe(0.9);
      expect(r.data['max']).toBeCloseTo(2 / 3, 12);
      expect(r.data['limiting']).toBe('H2');
      expect(r.data['limitingIndex']).toBe(1);
    }
    const ok = conversionToExtent([1, 2, 0], [-1, -3, 2], 0, 0.5);
    expect(ok.ok && ok.value).toBe(0.5);
    // conversion of a species that is not a reactant is rejected with a code, never NaN
    const bad = conversionToExtent([1, 2, 0], [-1, -3, 2], 2, 0.5);
    expect(bad.ok).toBe(false);
  });

  it('conversion, yield, selectivity definitions on the ethylene oxide example', () => {
    // C2H4 + 1/2 O2 -> C2H4O (xi1 = 22.22), C2H4 + 3 O2 -> 2 CO2 + 2 H2O (xi2 = 2.78): 100 mol C2H4, 25 % converted
    expect(conversion(100, 75)).toBe(0.25);
    const S = selectivity(22.222222222222, 1, 1, 25);
    expect(S).toBeCloseTo(8 / 9, 9);
    expect(yieldOf(22.222222222222, 1, 1, 100)).toBeCloseTo(S * 0.25, 12);
    // stoichiometric coefficient scaling: 2 mol product per 1 mol reactant, 40 formed from 25 consumed -> S = 0.8
    expect(selectivity(40, 2, 1, 25)).toBeCloseTo(0.8, 12);
  });

  it('extentsFromSpecs solves linear constraints on the product moles (2 extents)', () => {
    const xi = extentsFromSpecs([[-1, -0.5, 1, 0, 0], [-1, -3, 0, 2, 2]], [100, 100, 0, 0, 0], [
      { coef: { 0: 1 }, rhs: 75 },
      { coef: { 2: 1, 3: -4 }, rhs: 0 },
    ]);
    expect(xi[0]).toBeCloseTo(22.2222222222, 9);
    expect(xi[1]).toBeCloseTo(2.7777777778, 9);
  });

  it('mass conservation along any reaction: sum nu M = 0 for the catalogue reactions with molar masses', () => {
    for (const r of REACTIONS) {
      const tot = elementTotals(Object.keys(r.nu), Object.values(r.nu));
      for (const e of Object.keys(tot)) expect(tot[e], `${r.id} ${e}`).toBe(0);
    }
  });
});

describe('combustion air', () => {
  it('o2Demand from the element vector: CH4 2, C3H8 5, CO 1/2, H2 1/2, C 1, ethanol 3', () => {
    expect(o2Demand(elementsOf('CH4'))).toBe(2);
    expect(o2Demand(elementsOf('C3H8'))).toBe(5);
    expect(o2Demand(elementsOf('CO'))).toBe(0.5);
    expect(o2Demand(elementsOf('H2'))).toBe(0.5);
    expect(o2Demand(elementsOf('C2H6O'))).toBe(3);
  });
  it('airFeed: excess fraction on the theoretical O2, N2 from the air composition', () => {
    const a = airFeed(200, 0.2, 0.21);
    expect(a.O2).toBeCloseTo(240, 12);
    expect(a.air).toBeCloseTo(240 / 0.21, 10);
    expect(a.N2).toBeCloseTo((240 / 0.21) * 0.79, 10);
  });
});
