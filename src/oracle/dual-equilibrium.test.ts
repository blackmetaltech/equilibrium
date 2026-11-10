// Dual-implementation fixtures (DESIGN 9.2.3): the TS extent solver against the Python research code
// (docs/research/thermo.py, levels_calc.py, levels_calc_n2o4_beds.py), exported to src/oracle/fixtures/*.json.
import { describe, expect, it } from 'vitest';
import haber from './fixtures/haber_grid.json';
import inerts from './fixtures/haber_inerts.json';
import wgs from './fixtures/wgs_grid.json';
import so2 from './fixtures/so2_beds.json';
import dcda from './fixtures/dcda.json';
import n2o4 from './fixtures/n2o4.json';
import { lnKeq } from '../sim/chem';
import { solveEquilibrium } from '../sim/chem/equilibrium';

const BAR = 1e5;
const ok = (r: any): any => {
  expect(r.ok, r.code).toBe(true);
  return r.value;
};
const rel = (a: number, e: number) => Math.abs(a - e) / Math.abs(e);

describe('Haber (R1, rigorous)', () => {
  it('36-point (T, P) grid within 0.2 % rel', () => {
    expect(haber.cases.length).toBe(36);
    for (const c of haber.cases) {
      const r = ok(solveEquilibrium({ species: ['N2', 'H2', 'NH3'], n0: [1, 3, 0], T: c.T_C + 273.15, P: c.P_bar * BAR, reactions: ['R1'], detail: 'rigorous' }));
      const y = r.n[2] / (r.n[0] + r.n[1] + r.n[2]);
      expect(rel(y, c.y_NH3), `T=${c.T_C} P=${c.P_bar}`).toBeLessThan(0.002);
    }
  });
  const run = (feed: { N2: number; H2: number; inert: number }) =>
    ok(solveEquilibrium({ species: ['N2', 'H2', 'NH3', 'Ar'], n0: [feed.N2, feed.H2, 0, feed.inert], T: inerts.inputs.T_C + 273.15, P: inerts.inputs.P_bar * BAR, reactions: ['R1'], detail: 'rigorous' }));
  it('H2:N2 ratio cases', () => {
    for (const c of inerts.ratio_cases) {
      const r = run(c.feed_mol);
      expect(rel(r.xi[0], c.extent_mol), `r=${c.H2_per_N2}`).toBeLessThan(0.002);
      expect(rel(r.n[2] / r.n.reduce((a: number, b: number) => a + b, 0), c.y_NH3)).toBeLessThan(0.002);
    }
  });
  it('inert cases', () => {
    for (const c of inerts.inert_cases) {
      const r = run(c.feed_mol);
      expect(rel(r.xi[0], c.extent_mol), `f=${c.inert_frac_of_feed}`).toBeLessThan(0.002);
      expect(rel(r.n[2] / r.n.reduce((a: number, b: number) => a + b, 0), c.y_NH3)).toBeLessThan(0.002);
    }
  });
});

describe('water-gas shift (R5, rigorous)', () => {
  it('30-point grid X_CO within 0.5 % rel, K from the same ln K', () => {
    expect(wgs.cases.length).toBe(30);
    for (const c of wgs.cases) {
      const T = c.T_C + 273.15;
      const r = ok(solveEquilibrium({ species: ['CO', 'H2O', 'CO2', 'H2'], n0: [1, c.S_per_CO, 0, 0], T, P: 20 * BAR, reactions: ['R5'], detail: 'rigorous' }));
      expect(rel(r.xi[0], c.X_CO), `T=${c.T_C} S/CO=${c.S_per_CO}`).toBeLessThan(0.005);
      expect(rel(Math.exp(r.lnK[0]), c.K)).toBeLessThan(0.005);
    }
  });
});

const SP4 = ['SO2', 'O2', 'SO3', 'N2'];
const bed = (n0: number[], TinC: number) =>
  ok(solveEquilibrium({ species: SP4, n0, T: TinC + 273.15, P: so2.inputs.P_bar * BAR, reactions: ['R2'], detail: 'rigorous', mode: 'adiabatic' }));

describe('SO2 converter beds (R2 half form, adiabatic equilibrium)', () => {
  const feed = [10, 11, 0, 79];
  it('bed 1 sweep: T_out 0.3 K, X 0.001 abs', () => {
    for (const c of so2.bed1_sweep) {
      const r = bed(feed, c.Tin_C);
      expect(Math.abs(r.T - 273.15 - c.Tout_C), `Tin=${c.Tin_C}`).toBeLessThan(0.3);
      expect(Math.abs(r.n[2] / 10 - c.X), `Tin=${c.Tin_C}`).toBeLessThan(0.001);
    }
  });
  it('4-bed staircases with inter-coolers (no absorption)', () => {
    for (const s of so2.staircases) {
      let n = feed.slice();
      for (const b of s.beds) {
        const r = bed(n, s.Tin_C);
        n = r.n;
        expect(Math.abs(r.T - 273.15 - b.Tout_C), `Tin=${s.Tin_C} bed ${b.bed}`).toBeLessThan(0.3);
        expect(Math.abs(n[2] / 10 - b.X_cum), `Tin=${s.Tin_C} bed ${b.bed}`).toBeLessThan(0.001);
      }
    }
  });
  it('DCDA 3+1: three beds, 99.9 % SO3 absorption, bed 4', () => {
    let n = feed.slice();
    for (let b = 0; b < 3; b++) n = bed(n, dcda.inputs.Tin_C).n;
    const x3 = n[2]!;
    expect(Math.abs((100 * x3) / 10 - 100 * dcda.conv_after_bed3)).toBeLessThan(0.002);
    n = [n[0]!, n[1]!, x3 * (1 - dcda.inputs.absorber_removal), n[3]!];
    const r = bed(n, dcda.inputs.Tin_C);
    const overall = (x3 + r.n[2] - x3 * (1 - dcda.inputs.absorber_removal)) / 10;
    expect(Math.abs(100 * overall - dcda.conv_overall_pct)).toBeLessThan(0.002);
    expect(Math.abs(r.T - 273.15 - dcda.bed4_Tout_C)).toBeLessThan(0.3);
  });
});

describe('N2O4 <=> 2NO2', () => {
  const nu = { N2O4: -1, NO2: 2 };
  it('Kp(298.15) and Kp(400) rigorous, 0.3 %', () => {
    expect(rel(Math.exp(lnKeq(nu, 400, 'rigorous')), n2o4.Kp_400_bar)).toBeLessThan(0.003);
    expect(rel(Math.exp(lnKeq(nu, 298.15, 'rigorous')), n2o4.Kp_298_15_bar)).toBeLessThan(0.003);
    expect(rel(Math.exp(lnKeq(nu, 400, 'textbook')), n2o4.textbook_Kp_bar['400'])).toBeLessThan(0.003);
  });
  it('alpha and P of 0.15 mol in 1 L at 400 K (constant V), 0.3 %', () => {
    const r = ok(solveEquilibrium({
      species: ['N2O4', 'NO2'], n0: [n2o4.inputs.n0_mol, 0], T: n2o4.inputs.T_K, V: n2o4.inputs.V_L * 1e-3, R: n2o4.inputs.R_L_bar * 100,
      mode: 'constV', reactions: [nu], detail: 'rigorous',
    }));
    expect(rel(1 - r.n[0] / n2o4.inputs.n0_mol, n2o4.alpha)).toBeLessThan(0.003);
    expect(rel(r.P / BAR, n2o4.P_bar)).toBeLessThan(0.003);
  });
});
