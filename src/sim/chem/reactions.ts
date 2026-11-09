// Reaction thermodynamics at three detail levels (DESIGN 3.3, 3.4):
//   rigorous  dH(T), dS(T) from the species h and s (dCp included)           ln K = -dG(T)/(R T)
//   textbook  dH298 and dS298 held constant                                  ln K = -dH/(R T) + dS/R, linear in 1/T
//   book      constants the problem supplies (BookData)                      K at T, K at T and dH, dH and dS, or ln K
// K is dimensionless in the bar-based standard state (gas activity y P / 1 bar; pure condensed phases a = 1).
// The extent solver lives in lane M1.4; this module defines K(T) only. SI: J/mol, J/(mol K), K.
import { dmath } from '@core/numerics';
import type { ReactionRec } from '../../data/reactions';
import { R_GAS } from '../../data/species';
import type { ThermoDetail } from '../types';
import { deltaH298, deltaHrxn, deltaS298, deltaSrxn, lnKRigorous, lnKTextbook } from '../thermo';

import type { Nu } from './stoich';

/**
 * The constants of a textbook problem (exam bridges). Give ONE of: {dH, dS}; {K, T} (optionally with dH: integrated van t Hoff
 * from that point); {lnK} (optionally with T and dH). `R` is the problem's gas constant (default CODATA); it is an input,
 * never a global. Without dH a given K is constant in T (dH = 0). Anything else is NaN: no silent default.
 */
export interface BookData { K?: number; lnK?: number; T?: number; dH?: number; dS?: number; R?: number }

interface BookParams { R: number; dH: number; dS: number; lnK0?: number; T0?: number }
function bookParams(b: BookData | undefined): BookParams | null {
  if (b === undefined) return null;
  const R = b.R ?? R_GAS;
  if (b.K !== undefined || b.lnK !== undefined) {
    const lnK0 = b.lnK ?? dmath.log(b.K!);
    const dH = b.dH ?? 0;
    if (dH !== 0 && b.T === undefined) return null;
    const T0 = b.T ?? 298.15;
    return { R, dH, dS: dH / T0 + R * lnK0, lnK0, T0 };
  }
  if (b.dH !== undefined && b.dS !== undefined) return { R, dH: b.dH, dS: b.dS };
  return null;
}

/** dH(T), J/mol. Rigorous: from the species; textbook: dH298; book: the problem's dH (0 when only K is given). */
export function rxnDH(nu: Nu, T: number, detail: ThermoDetail, book?: BookData): number {
  if (detail === 'rigorous') return deltaHrxn(nu, T);
  if (detail === 'textbook') return deltaH298(nu);
  const p = bookParams(book);
  return p === null ? Number.NaN : p.dH;
}
/** dS(T), J/(mol K), 1 bar standard state. */
export function rxnDS(nu: Nu, T: number, detail: ThermoDetail, book?: BookData): number {
  if (detail === 'rigorous') return deltaSrxn(nu, T);
  if (detail === 'textbook') return deltaS298(nu);
  const p = bookParams(book);
  return p === null ? Number.NaN : p.dS;
}
/** dG(T) = dH - T dS, J/mol. */
export function rxnDG(nu: Nu, T: number, detail: ThermoDetail, book?: BookData): number {
  return rxnDH(nu, T, detail, book) - T * rxnDS(nu, T, detail, book);
}
/** ln K(T). */
export function lnKeq(nu: Nu, T: number, detail: ThermoDetail, book?: BookData): number {
  if (detail === 'rigorous') return lnKRigorous(nu, T);
  if (detail === 'textbook') return lnKTextbook(nu, T);
  const p = bookParams(book);
  if (p === null) return Number.NaN;
  if (p.lnK0 !== undefined) return p.dH === 0 ? p.lnK0 : p.lnK0 - (p.dH / p.R) * (1 / T - 1 / p.T0!);
  return -p.dH / (p.R * T) + p.dS / p.R;
}
/** K(T). */
export function Keq(nu: Nu, T: number, detail: ThermoDetail, book?: BookData): number { return dmath.exp(lnKeq(nu, T, detail, book)); }

/** ln K of a catalogue reaction; NaN for rigorous / textbook on a lab row whose species carry no thermo. */
export function lnKOfReaction(r: ReactionRec, T: number, detail: ThermoDetail, book?: BookData): number {
  if (detail !== 'book' && !r.thermo) return Number.NaN;
  return lnKeq(r.nu, T, detail, book);
}

/** K_textbook / K_rigorous at T (the Codex error number: R1 1.76 at 500 K, 3.91 at 723 K). */
export function textbookKRatio(nu: Nu, T: number): number { return dmath.exp(lnKTextbook(nu, T) - lnKRigorous(nu, T)); }

/** The same reaction written with every coefficient multiplied by `f` (K becomes K^f). */
export function scaleNu(nu: Nu, f: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(nu)) out[id] = nu[id]! * f;
  return out;
}

/** Kp = Kc (R T)^dn, with the R the caller passes (units of R fix the units of Kc and Kp). */
export function kpFromKc(Kc: number, T: number, dn: number, R: number): number { return Kc * dmath.pow(R * T, dn); }
/** Kc = Kp (R T)^-dn. */
export function kcFromKp(Kp: number, T: number, dn: number, R: number): number { return Kp * dmath.pow(R * T, -dn); }
