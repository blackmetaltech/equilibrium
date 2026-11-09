// Heat-capacity polynomials, SI output: J, mol, K. Pure functions of (coef, T); no allocation.
//   Shomate (NIST, t = T/1000, coef = [A,B,C,D,E,F,G,H]):
//     Cp = A + B t + C t^2 + D t^3 + E/t^2                                   J/(mol K)
//     H(T) = 1000 (A t + B t^2/2 + C t^3/3 + D t^4/4 - E/t + F)              J/mol, absolute (formation basis)
//     S(T) = A ln t + B t + C t^2/2 + D t^3/3 - E/(2 t^2) + G                J/(mol K)
//   NASA 7-coefficient (TM-4513, coef = [a1..a7]): Cp/R = a1 + a2 T + ... + a5 T^4, H/RT = ..., S/R = ...
//   constcp coef = [H298 kJ/mol, S298, Cp]: H = H298 + Cp (T - 298.15), S = S298 + Cp ln(T/298.15).
import { dmath } from '@core/numerics';

/** CODATA 2018 gas constant, J/(mol K). */
export const R_GAS = 8.314462618;
const T_REF = 298.15;

export function shomateCp(c: readonly number[], T: number): number {
  const t = T / 1000;
  return c[0]! + t * (c[1]! + t * (c[2]! + t * c[3]!)) + c[4]! / (t * t);
}
export function shomateH(c: readonly number[], T: number): number {
  const t = T / 1000;
  return 1000 * (t * (c[0]! + t * (c[1]! / 2 + t * (c[2]! / 3 + t * (c[3]! / 4)))) - c[4]! / t + c[5]!);
}
export function shomateS(c: readonly number[], T: number): number {
  const t = T / 1000;
  return c[0]! * dmath.log(t) + t * (c[1]! + t * (c[2]! / 2 + t * (c[3]! / 3))) - c[4]! / (2 * t * t) + c[6]!;
}
/** dCp/dT, J/(mol K^2). */
export function shomateDcp(c: readonly number[], T: number): number {
  const t = T / 1000;
  return (c[1]! + t * (2 * c[2]! + t * 3 * c[3]!) - (2 * c[4]!) / (t * t * t)) / 1000;
}

export function nasa7Cp(c: readonly number[], T: number): number {
  return R_GAS * (c[0]! + T * (c[1]! + T * (c[2]! + T * (c[3]! + T * c[4]!))));
}
export function nasa7H(c: readonly number[], T: number): number {
  return R_GAS * T * (c[0]! + T * (c[1]! / 2 + T * (c[2]! / 3 + T * (c[3]! / 4 + T * (c[4]! / 5)))) + c[5]! / T);
}
export function nasa7S(c: readonly number[], T: number): number {
  return R_GAS * (c[0]! * dmath.log(T) + T * (c[1]! + T * (c[2]! / 2 + T * (c[3]! / 3 + T * (c[4]! / 4)))) + c[6]!);
}
export function nasa7Dcp(c: readonly number[], T: number): number {
  return R_GAS * (c[1]! + T * (2 * c[2]! + T * (3 * c[3]! + T * 4 * c[4]!)));
}

export function constCpH(c: readonly number[], T: number): number { return c[0]! * 1000 + c[2]! * (T - T_REF); }
export function constCpS(c: readonly number[], T: number): number { return c[1]! + c[2]! * dmath.log(T / T_REF); }

/** Kind codes used by the compiled species (no string compares in hot paths). */
export const KIND_SHOMATE = 0, KIND_NASA7 = 1, KIND_CONSTCP = 2;

export function segCp(kind: number, c: readonly number[], T: number): number {
  return kind === KIND_SHOMATE ? shomateCp(c, T) : kind === KIND_NASA7 ? nasa7Cp(c, T) : c[2]!;
}
export function segH(kind: number, c: readonly number[], T: number): number {
  return kind === KIND_SHOMATE ? shomateH(c, T) : kind === KIND_NASA7 ? nasa7H(c, T) : constCpH(c, T);
}
export function segS(kind: number, c: readonly number[], T: number): number {
  return kind === KIND_SHOMATE ? shomateS(c, T) : kind === KIND_NASA7 ? nasa7S(c, T) : constCpS(c, T);
}
export function segDcp(kind: number, c: readonly number[], T: number): number {
  return kind === KIND_SHOMATE ? shomateDcp(c, T) : kind === KIND_NASA7 ? nasa7Dcp(c, T) : 0;
}
