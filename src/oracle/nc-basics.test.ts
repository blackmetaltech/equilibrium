// DESIGN 9.2 textbook oracles of lanes chem/basics, chem/stoich and thermo (src/oracle/oracles.json), table-driven:
// every entry is run through the engine function named in the brief and compared with its own tolerance.
import { describe, expect, it } from 'vitest';
import oracleFile from './oracles.json';
import {
  actualFromPercentYield, airFeed, bondEnthalpySum, combustionAnalysis, conversionToExtent, daltonPartialsFromMass,
  deltaHfromDeltaU, extentToMoles, extentsFromSpecs, gibbsFromHS, heatOfReactionPoly, hessSum, idealGasMolarMass,
  boyleMixPressure, limitingReagent, massFromMolarity, massFromMoles, molarMass, molarityFromMassPercent, molesFromMass, moleFractions,
  o2Demand, parseEquation, parseFormula, particlesFromMoles, empiricalFormula, moleRatios, selectivity, spontaneityT, deltaUfromDeltaH,
  stoichMass, deltaCpCoefficients, enthalpyFromMass,
} from '../sim/chem';

interface Oracle {
  id: string;
  lane: string;
  fn: string;
  source: string;
  inputs: any;
  expected: Record<string, any>;
  tol: { rel?: number; abs?: number };
}
const LANES = new Set(['chem/basics', 'chem/stoich', 'thermo']);
const oracles = (oracleFile.oracles as unknown as Oracle[]).filter((o) => LANES.has(o.lane));
const L_PER_MOL_STP = 1;

type Out = Record<string, any>;
const sparse = (species: string[], v: number[]) => Object.fromEntries(species.map((s, i) => [s, v[i]!]));
const massesOf = (o: Oracle) => (o.inputs.atomic_masses_g_mol ?? {}) as Record<string, number>;

const RUN: Record<string, (o: Oracle) => Out> = {
  'EQ-NC-001': (o) => ({ molar_mass_g_mol: molarMass(o.inputs.formula, massesOf(o)) }),
  'EQ-NC-002': (o) => {
    const n = molesFromMass(o.inputs.mass_g, molarMass(o.inputs.species, massesOf(o)));
    return { atoms: particlesFromMoles(n) };
  },
  'EQ-NC-003': (o) => ({ molarity_mol_L: molarityFromMassPercent(o.inputs.mass_pct, o.inputs.density_g_per_mL, molarMass(o.inputs.solute, massesOf(o))) }),
  'EQ-NC-004': (o) => ({ mass_g: massFromMolarity(o.inputs.c, o.inputs.V_L, o.inputs.M) }),
  'EQ-NC-005': (o) => {
    const nu = parseEquation(o.inputs.reaction);
    const Mm = o.inputs.molar_masses_g_mol as Record<string, number>;
    const g = o.inputs.reactants_g as Record<string, number>;
    const n0 = Object.fromEntries(Object.keys(g).map((s) => [s, molesFromMass(g[s]!, Mm[s]!)]));
    const lim = limitingReagent(n0, nu);
    return { limiting: lim.species, H2_left_mol: n0['H2']! - 3 * lim.xiMax, mass_NH3_g: massFromMoles(2 * lim.xiMax, Mm['NH3']!) };
  },
  'EQ-NC-006': (o) => {
    const w = massesOf(o);
    const nu = parseEquation(o.inputs.reaction);
    return { mass_H2O_g: stoichMass(nu, 'CH4', 'H2O', o.inputs.CH4_g, (id) => molarMass(id, w)) };
  },
  'EQ-NC-007': (o) => {
    const w = massesOf(o);
    return { mass_Cu_g: stoichMass({ CuSO4: -1, Cu: 1 }, 'CuSO4', 'Cu', o.inputs.mass_g, (id) => molarMass(id, w)) };
  },
  'EQ-NC-008': (o) => {
    const w = massesOf(o);
    const nu = parseEquation(o.inputs.reaction);
    const th = stoichMass(nu, 'CaCO3', 'CO2', o.inputs.CaCO3_g, (id) => molarMass(id, w));
    return { mass_CO2_g: actualFromPercentYield(th, o.inputs.yield_pct) };
  },
  'EQ-NC-009': (o) => {
    const w = massesOf(o);
    const nu = parseEquation('Mg+2HCl->MgCl2+H2');
    const n0 = { Mg: molesFromMass(o.inputs.Mg_g, w['Mg']!), HCl: o.inputs.HCl.c * o.inputs.HCl.V_L };
    const lim = limitingReagent(n0, nu);
    return { limiting: lim.species, V_H2_L: lim.xiMax * o.inputs.molar_volume_STP * L_PER_MOL_STP };
  },
  'EQ-NC-010': (o) => {
    const r = moleRatios({ Fe: o.inputs.Fe_pct, O: o.inputs.O_pct }, massesOf(o));
    return { O_per_Fe: r['O']! / r['Fe']! };
  },
  'EQ-NC-011': (o) => {
    const w = massesOf(o);
    const emp = empiricalFormula({ C: o.inputs.C_pct, H: o.inputs.H_pct, Cl: o.inputs.Cl_pct }, w);
    expect(emp.formula).toEqual({ C: 1, H: 2, Cl: 1 });
    return { n_multiplier: o.inputs.M / molarMass(emp.formula, w) };
  },
  'EQ-NC-012': (o) => {
    const c = combustionAnalysis({ sample_g: o.inputs.sample_g, CO2_g: o.inputs.CO2_g, H2O_g: o.inputs.H2O_g, weights: massesOf(o) });
    expect(c.formula).toEqual({ C: 1, H: 2, O: 1 });
    return { O_to_C: c.mol['O']! / c.mol['C']! };
  },
  'EQ-NC-013': (o) => ({ P_total_bar: boyleMixPressure(o.inputs.gases, o.inputs.Vfinal_L) }),
  'EQ-NC-014': (o) => {
    const i = o.inputs;
    const R = 8.314462618, V = 1, T = i.T ?? 300;
    const MA = idealGasMolarMass(i.gasA_g, i.pA_bar * 1e5, V, T, R);
    const MB = idealGasMolarMass(i.gasB_g, (i.ptot_bar - i.pA_bar) * 1e5, V, T, R);
    return { M_B_over_M_A: MB / MA };
  },
  'EQ-NC-015': (o) => {
    const i = o.inputs;
    const p = daltonPartialsFromMass({ H2: i.H2_wt_pct, O2: i.O2_wt_pct }, i.molar_masses_g_mol, i.P_bar);
    return { p_H2_bar: p['H2']! };
  },
  'EQ-NC-016': (o) => ({ heat_kJ: enthalpyFromMass(o.inputs.dH_kJ_per_mol, o.inputs.mass_g, o.inputs.M) }),
  'EQ-NC-017': (o) => ({ dH_kJ_mol: hessSum(o.inputs.steps) }),
  'EQ-NC-018': (o) => {
    const i = o.inputs;
    const dH = deltaHfromDeltaU(i.dU_kJ * 1000, i.dn_gas, i.T, i.R_J_mol_K) / 1000;
    return { dG_kJ: gibbsFromHS(dH, i.T, i.dS_J_per_K / 1000) };
  },
  'EQ-NC-019': (o) => ({ dU_kJ_mol: deltaUfromDeltaH(o.inputs.dH_kJ * 1000, o.inputs.dn_gas, o.inputs.T, o.inputs.R_J_mol_K) / 1000 }),
  'EQ-NC-020': (o) => ({ dH_kJ: bondEnthalpySum(o.inputs.broken, o.inputs.formed) }),
  'EQ-NC-021': (o) => ({ T_min_K: spontaneityT(o.inputs.dH_kJ, o.inputs.dS_kJ_per_K) }),
  'EQ-CE-001': (o) => {
    const i = o.inputs;
    const ext = conversionToExtent(i.feed, i.nu, 0, i.conv_NH3);
    if (!ext.ok) throw new Error(ext.code);
    const n = extentToMoles(i.feed, [i.nu], [ext.value]);
    return { ...sparse(i.species, n), total: n.reduce((a, b) => a + b, 0), xi: ext.value };
  },
  'EQ-CE-002': (o) => {
    const i = o.inputs;
    const xi = extentsFromSpecs(i.nu, i.feed, [
      { coef: { 0: 1 }, rhs: i.feed[0] * (1 - i.conv_C2H4) },
      { coef: { 2: 1, 3: -i.ratio_EO_CO2 }, rhs: 0 },
    ]);
    const n = extentToMoles(i.feed, i.nu, xi);
    return {
      ...sparse(i.species, n), xi1: xi[0], xi2: xi[1],
      selectivity_EO_per_C2H4_reacted: selectivity(n[2]! - i.feed[2], 1, 1, i.feed[0] - n[0]),
    };
  },
  'EQ-CE-003': (o) => {
    const i = o.inputs;
    const theo = i.basis_mol * o2Demand(parseFormula(i.fuel));
    const air = airFeed(theo, i.excess_air, i.air.O2);
    const ids = ['CH4', 'O2', 'N2', 'CO2', 'H2O'];
    const nu = parseEquation('CH4+2O2->CO2+2H2O');
    const n0 = [i.basis_mol, air.O2, air.N2, 0, 0];
    const xi = i.conv * i.basis_mol;
    const n = extentToMoles(n0, [ids.map((s) => nu[s] ?? 0)], [xi]);
    const o2 = n[1]!, n2 = n[2]!, co2 = n[3]!, h2o = n[4]!;
    const yd = moleFractions({ CO2: co2, N2: n2, O2: o2 });
    return { CO2: co2, H2O: h2o, N2: n2, O2: o2, air_fed: air.air, y_dry: yd };
  },
  'EQ-CE-004': (o) => {
    const i = o.inputs;
    const ids = ['C3H8', 'O2', 'N2', 'CO2', 'CO', 'H2O'];
    const nuCO2 = parseEquation('C3H8+5O2->3CO2+4H2O'), nuCO = parseEquation('C3H8+3.5O2->3CO+4H2O');
    const row = (nu: Record<string, number>) => ids.map((s) => nu[s] ?? 0);
    const air = airFeed(i.basis_mol * o2Demand(parseFormula(i.fuel)), i.excess_air, 0.21);
    const burned = i.basis_mol * i.burned_frac;
    const xi = [burned * (1 - i.frac_burned_to_CO), burned * i.frac_burned_to_CO];
    const n = extentToMoles([i.basis_mol, air.O2, air.N2, 0, 0, 0], [row(nuCO2), row(nuCO)], xi);
    const out = sparse(ids, n);
    const total = n.reduce((a, b) => a + b, 0);
    return { out, total, y_wet: moleFractions(out) };
  },
  'EQ-CE-031': (o) => {
    const i = o.inputs;
    const sp = [
      { nu: -1, ...i.CO, dHf298: i.CO.dHf298 },
      { nu: -2, ...i.H2, dHf298: i.H2.dHf298 },
      { nu: 1, ...i.CH3OH, dHf298: i.CH3OH.dHf },
    ];
    const at = (T: number) => heatOfReactionPoly(sp, T, 298.15, 8.314);
    return { dA_dB_dC_dD: deltaCpCoefficients(sp), dH298_J: at(298.15).dH, dH1073_J: at(1073.15).dH };
  },
};

/** Compare every numeric leaf with the oracle tolerance; strings and booleans must match exactly. */
function compare(got: any, exp: any, tol: { rel?: number; abs?: number }, path: string): void {
  if (typeof exp === 'number') {
    expect(typeof got, path).toBe('number');
    const err = Math.abs(got - exp);
    const lim = tol.abs !== undefined ? tol.abs : Math.max((tol.rel ?? 0) * Math.abs(exp), 1e-12);
    expect(err, `${path}: got ${got}, expected ${exp}, tol ${lim}`).toBeLessThanOrEqual(lim);
  } else if (Array.isArray(exp)) {
    expect(got.length, path).toBe(exp.length);
    exp.forEach((e, k) => compare(got[k], e, tol, `${path}[${k}]`));
  } else if (exp !== null && typeof exp === 'object') {
    for (const k of Object.keys(exp)) compare(got[k], exp[k], tol, `${path}.${k}`);
  } else expect(got, path).toBe(exp);
}

describe('textbook oracles (chem/basics, chem/stoich, thermo)', () => {
  it('has a runner for every oracle of these lanes (a new oracle must be wired, not silently skipped)', () => {
    expect(oracles.length).toBeGreaterThanOrEqual(26);
    expect(oracles.filter((o) => RUN[o.id] === undefined).map((o) => o.id)).toEqual([]);
  });
  for (const o of oracles) {
    it(`${o.id} [${o.lane}] ${o.fn}: ${o.source.slice(0, 70)}`, () => {
      const run = RUN[o.id];
      if (run === undefined) throw new Error('no runner for ' + o.id);
      compare(run(o), o.expected, o.tol, o.id);
    });
  }
});
