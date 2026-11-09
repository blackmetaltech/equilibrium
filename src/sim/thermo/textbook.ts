// Reaction thermodynamics from the species database: rigorous (with Cp) and textbook mode (dH, dS fixed at 298.15 K,
// DESIGN 3.3). A reaction is a sparse stoichiometric map {speciesId: nu} (products +, reactants -). SI: J/mol, J/(mol K).
import { T_REF, hOf, sOf, thermoOf } from './species';
import { R_GAS } from './shomate';

export type Nu = Readonly<Record<string, number>>;

/** Standard reaction enthalpy at 298.15 K, J/mol (sum of nu dHf). */
export function deltaH298(nu: Nu): number { return deltaHrxn(nu, T_REF); }
/** Standard reaction entropy at 298.15 K, J/(mol K). */
export function deltaS298(nu: Nu): number { return deltaSrxn(nu, T_REF); }

/** Rigorous reaction enthalpy at T, J/mol. */
export function deltaHrxn(nu: Nu, T: number): number {
  let d = 0;
  for (const id of Object.keys(nu)) d += nu[id]! * hOf(thermoOf(id), T);
  return d;
}
/** Rigorous reaction entropy at T (1 bar standard state), J/(mol K). */
export function deltaSrxn(nu: Nu, T: number): number {
  let d = 0;
  for (const id of Object.keys(nu)) d += nu[id]! * sOf(thermoOf(id), T);
  return d;
}
/** ln K(T) (K dimensionless, 1 bar standard state): -(dH(T) - T dS(T))/(R T). */
export function lnKRigorous(nu: Nu, T: number): number {
  const dG = deltaHrxn(nu, T) - T * deltaSrxn(nu, T);
  return -dG / (R_GAS * T);
}
/** Textbook ln K(T) = -dH298/(R T) + dS298/R: exactly linear in 1/T. */
export function lnKTextbook(nu: Nu, T: number): number { return -deltaH298(nu) / (R_GAS * T) + deltaS298(nu) / R_GAS; }

