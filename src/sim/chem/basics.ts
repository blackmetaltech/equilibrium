// Chemistry basics (DESIGN 3.2, oracles of lane chem/basics): molar mass, mole/mass/particle conversions, solutions, gas
// laws with the caller's R (book constants are inputs, never globals), Dalton, empirical formula, combustion analysis,
// dU vs dH, Hess sums, bond enthalpies, spontaneity temperature, heat of reaction from a Cp polynomial. Plain numbers
// in, plain numbers out; units are in the names (g, mL, L, K, J, kJ) and stated per function.
import { CONST } from '@core/numerics';
import { ATOMIC_WEIGHT } from '../../data/species';

export type Elements = Readonly<Record<string, number>>;

/**
 * Standard atomic weights, g/mol: the catalogue table (IUPAC 2021 conventional, data/species.ts: one source of truth)
 * plus the elements the textbook problems need that no catalogue species contains. Extras: IUPAC 2021 abridged values.
 */
export const ELEMENT_WEIGHT: Readonly<Record<string, number>> = {
  ...ATOMIC_WEIGHT, He: 4.0026, Mg: 24.305, Al: 26.982, K: 39.098, Ca: 40.078, Fe: 55.845, Cu: 63.546, Zn: 65.38,
};

const PHASE_TAG = /\((?:g|l|s|aq)\)$/;

/** Element counts of a formula such as `Ca(OH)2`, `CH3COONa`, `H2O(l)`. Unknown symbols are kept (molarMass gives NaN). */
export function parseFormula(formula: string): Record<string, number> {
  const f = formula.replace(PHASE_TAG, '');
  const stack: Record<string, number>[] = [{}];
  let i = 0;
  const num = (): number => {
    let j = i;
    while (j < f.length && ((f[j]! >= '0' && f[j]! <= '9') || f[j] === '.')) j++;
    const v = j > i ? Number(f.slice(i, j)) : 1;
    i = j;
    return v;
  };
  while (i < f.length) {
    const c = f[i]!;
    if (c === '(') { stack.push({}); i++; } else if (c === ')') {
      i++;
      const k = num();
      const top = stack.pop()!;
      const into = stack[stack.length - 1]!;
      for (const e of Object.keys(top)) into[e] = (into[e] ?? 0) + top[e]! * k;
    } else if (c >= 'A' && c <= 'Z') {
      let j = i + 1;
      while (j < f.length && f[j]! >= 'a' && f[j]! <= 'z') j++;
      const sym = f.slice(i, j);
      i = j;
      const k = num();
      const top = stack[stack.length - 1]!;
      top[sym] = (top[sym] ?? 0) + k;
    } else i++;
  }
  return stack[0]!;
}

/** Molar mass, g/mol, of a formula or element vector; `weights` (g/mol) override the shared table (book constants). */
export function molarMass(formula: string | Elements, weights: Readonly<Record<string, number>> = {}): number {
  const el = typeof formula === 'string' ? parseFormula(formula) : formula;
  let m = 0;
  for (const e of Object.keys(el)) {
    const w = weights[e] ?? ELEMENT_WEIGHT[e];
    m += (w === undefined ? Number.NaN : w) * el[e]!;
  }
  return m;
}

// ------------------------------------------------------------------------------------------ mole, mass, particles
/** mol from g and g/mol. */
export function molesFromMass(mass_g: number, M: number): number { return mass_g / M; }
/** g from mol and g/mol. */
export function massFromMoles(n: number, M: number): number { return n * M; }
/** Number of particles from mol (Avogadro from the core CODATA constants). */
export function particlesFromMoles(n: number): number { return n * CONST.NA; }
export function molesFromParticles(N: number): number { return N / CONST.NA; }

/** Molarity, mol/L, of a solution that is `pct` mass % solute with density `rho_g_mL`: c = 10 w rho / M. */
export function molarityFromMassPercent(pct: number, rho_g_mL: number, M: number): number { return (10 * pct * rho_g_mL) / M; }
/** Mass of solute, g, for `V_L` litres at `c` mol/L. */
export function massFromMolarity(c: number, V_L: number, M: number): number { return c * V_L * M; }
/** Actual mass from a theoretical mass and a percent yield. */
export function actualFromPercentYield(theoretical: number, pct: number): number { return (theoretical * pct) / 100; }

// ------------------------------------------------------------------------------------------ gases (caller supplies R)
/** P = nRT/V (consistent units chosen by the R passed). */
export function idealGasPressure(n: number, T: number, V: number, R: number): number { return (n * R * T) / V; }
/** n = PV/(RT). */
export function idealGasMoles(P: number, V: number, T: number, R: number): number { return (P * V) / (R * T); }
/** M = m R T/(P V). */
export function idealGasMolarMass(m: number, P: number, V: number, T: number, R: number): number { return (m * R * T) / (P * V); }

/** Mole fractions of a record of amounts (mol, or any consistent amount). */
export function moleFractions(n: Readonly<Record<string, number>>): Record<string, number> {
  let t = 0;
  for (const k of Object.keys(n)) t += n[k]!;
  const y: Record<string, number> = {};
  for (const k of Object.keys(n)) y[k] = n[k]! / t;
  return y;
}
/** Dalton: partial pressure = mole fraction x total pressure. */
export function daltonPartials(n: Readonly<Record<string, number>>, P: number): Record<string, number> {
  const y = moleFractions(n);
  const p: Record<string, number> = {};
  for (const k of Object.keys(y)) p[k] = y[k]! * P;
  return p;
}
/** Dalton partials from a composition by mass (any mass unit) and molar masses. */
export function daltonPartialsFromMass(mass: Readonly<Record<string, number>>, M: Readonly<Record<string, number>>, P: number): Record<string, number> {
  const n: Record<string, number> = {};
  for (const k of Object.keys(mass)) n[k] = mass[k]! / M[k]!;
  return daltonPartials(n, P);
}
/** Total pressure when gases (p, V) at one temperature are put into a vessel of volume Vfinal (Boyle + Dalton). */
export function boyleMixPressure(gases: readonly { p: number; V: number }[], Vfinal: number): number {
  let s = 0;
  for (const g of gases) s += g.p * g.V;
  return s / Vfinal;
}

// ------------------------------------------------------------------------------------------ empirical formula
/** Mole ratios from mass percents (or masses), scaled so the smallest is 1. */
export function moleRatios(pct: Readonly<Record<string, number>>, weights: Readonly<Record<string, number>> = {}): Record<string, number> {
  const n: Record<string, number> = {};
  let min = Infinity;
  for (const e of Object.keys(pct)) {
    n[e] = pct[e]! / (weights[e] ?? ELEMENT_WEIGHT[e]!);
    if (n[e]! < min) min = n[e]!;
  }
  const r: Record<string, number> = {};
  for (const e of Object.keys(n)) r[e] = n[e]! / min;
  return r;
}

/** Smallest integer multiplier that makes every ratio an integer within 2 % of the multiplier; falls back to rounding. */
export function empiricalFormula(
  pct: Readonly<Record<string, number>>, weights: Readonly<Record<string, number>> = {},
): { ratios: Record<string, number>; multiplier: number; formula: Record<string, number> } {
  const ratios = moleRatios(pct, weights);
  const ks = Object.keys(ratios);
  let mult = 1;
  for (let m = 1; m <= 12; m++) {
    if (ks.every((k) => Math.abs(ratios[k]! * m - Math.round(ratios[k]! * m)) <= 0.02 * m)) { mult = m; break; }
  }
  const formula: Record<string, number> = {};
  for (const k of ks) formula[k] = Math.round(ratios[k]! * mult);
  return { ratios, multiplier: mult, formula };
}

export interface CombustionIn { sample_g: number; CO2_g: number; H2O_g: number; weights?: Readonly<Record<string, number>> }
/**
 * Combustion analysis of a C, H, (O) compound: C from CO2, H from H2O, O by difference. `mol` and `mass` (g) per element,
 * `formula` the empirical formula by the smallest integer ratio (O omitted when the difference is not positive).
 */
export function combustionAnalysis(inp: CombustionIn): { mol: Record<string, number>; mass: Record<string, number>; formula: Record<string, number> } {
  const w = inp.weights ?? {};
  const mC = (inp.CO2_g / molarMass('CO2', w)) * molarMass('C', w);
  const nH = (2 * inp.H2O_g) / molarMass('H2O', w);
  const mH = nH * molarMass('H', w);
  const mO = inp.sample_g - mC - mH;
  const mol: Record<string, number> = { C: mC / molarMass('C', w), H: nH };
  const mass: Record<string, number> = { C: mC, H: mH };
  const present: Record<string, number> = { C: mC, H: mH };
  if (mO > 1e-9 * inp.sample_g) { mol['O'] = mO / molarMass('O', w); mass['O'] = mO; present['O'] = mO; }
  return { mol, mass, formula: empiricalFormula(present, w).formula };
}

// ------------------------------------------------------------------------------------------ thermochemistry
/** dH = dU + dn_g R T (J/mol with R in J/(mol K)). */
export function deltaHfromDeltaU(dU: number, dnGas: number, T: number, R: number): number { return dU + dnGas * R * T; }
export function deltaUfromDeltaH(dH: number, dnGas: number, T: number, R: number): number { return dH - dnGas * R * T; }
/** Heat for a given mass: dH per mole x mol (same energy unit as dH_per_mol). */
export function enthalpyFromMass(dH_per_mol: number, mass_g: number, M: number): number { return (dH_per_mol * mass_g) / M; }
/** Hess: sum coef x dH of the steps. */
export function hessSum(steps: readonly { coef: number; dH: number }[]): number {
  let s = 0;
  for (const st of steps) s += st.coef * st.dH;
  return s;
}
/** dG = dH - T dS (dH and T dS in the same energy unit). */
export function gibbsFromHS(dH: number, T: number, dS: number): number { return dH - T * dS; }
/** Temperature at which dG = 0: T = dH/dS (spontaneous above for dH, dS > 0). */
export function spontaneityT(dH: number, dS: number): number { return dH / dS; }
/** dH of a reaction from bond enthalpies: sum(broken) - sum(formed). A bond is `energy` or `[energy, count]`. */
export function bondEnthalpySum(broken: Readonly<Record<string, number | readonly number[]>>, formed: Readonly<Record<string, number | readonly number[]>>): number {
  const sum = (m: Readonly<Record<string, number | readonly number[]>>) => {
    let s = 0;
    for (const k of Object.keys(m)) { const v = m[k]!; s += typeof v === 'number' ? v : v[0]! * v[1]!; }
    return s;
  };
  return sum(broken) - sum(formed);
}

/** A species of a Cp/R = A + B T + C T^2 + D T^-2 table (Smith, Van Ness, Abbott form). */
export interface PolyCpSpecies { nu: number; A?: number; B?: number; C?: number; D?: number; dHf298: number }
/** [dA, dB, dC, dD] of a reaction: sum nu x coefficient. */
export function deltaCpCoefficients(sp: readonly PolyCpSpecies[]): number[] {
  const d = [0, 0, 0, 0];
  for (const s of sp) { d[0]! += s.nu * (s.A ?? 0); d[1]! += s.nu * (s.B ?? 0); d[2]! += s.nu * (s.C ?? 0); d[3]! += s.nu * (s.D ?? 0); }
  return d;
}
/** dH(T) = dH(T0) + R [dA (T - T0) + dB/2 (T^2 - T0^2) + dC/3 (T^3 - T0^3) - dD (1/T - 1/T0)] (Kirchhoff). */
export function heatOfReactionPoly(sp: readonly PolyCpSpecies[], T: number, T0: number, R: number): { dH: number; dH0: number } {
  let dH0 = 0;
  for (const s of sp) dH0 += s.nu * s.dHf298;
  const [dA, dB, dC, dD] = deltaCpCoefficients(sp) as [number, number, number, number];
  const dH = dH0 + R * (dA * (T - T0) + (dB / 2) * (T * T - T0 * T0) + (dC / 3) * (T * T * T - T0 * T0 * T0) - dD * (1 / T - 1 / T0));
  return { dH, dH0 };
}
