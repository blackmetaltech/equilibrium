// Safety layer (DESIGN 3.7, 3.9, 5.5, 8.5 system 5): vessel pressure ODE with a relief valve, interlock trips, containment loss.
// Pure step functions of (state, inputs): the shift system feeds them the lagged stream values and the steady-state results.
//   Vessel pressure (ideal gas):  dP/dt = (R T / V) (n_in - n_out (P / P_ss) - n_relief)       dt = 1 plant s
//   The outflow scales with P / P_ss (a choked orifice), so P settles back to its steady value P_ss; the relief lifts above the set pressure Pset,
//   passes exactly what holds P at Pset up to its API 520 capacity (a bigger imbalance keeps climbing) and reseats below 0.93 Pset (blowdown).
import { BLOWDOWN, DESIGN_P_FACTOR, FULL_COOLANT, LOSS_P_FACTOR, RELIEF_LIQ, RELIEF_RESEAT_K } from '../../data/events';
import { R_GAS } from '../thermo/shomate';

/** A tripped interlock or manually tripped unit: what it did (`act`), when, and who tripped it (an interlock id, a unit id or 'auto'). */
export interface TripRec { act: string; t: number; by: string }
/** A relief valve's state: lifted, since when, and the mass it has released (kg). */
export interface ReliefRec { open: 0 | 1; seen: 0 | 1; t0: number; kg: number }
/** Pressure state of a vessel that has a relief valve. */
export interface VesselDyn { P: number; Pss: number; V: number; Pset: number; capKgS: number; M: number }

export interface VesselOut { P: number; open: 0 | 1; nRel: number }

/** One plant second of the vessel pressure ODE. T in K, flows in mol/s, `open` the relief state going in, `vent` multiplies the relief capacity (a dump interlock). */
export function vesselStep(v: VesselDyn, T: number, nIn: number, nOut: number, open: 0 | 1, vent = 1): VesselOut {
  const P = v.P, k = (R_GAS * T) / v.V;
  const net = nIn - (nOut * P) / (v.Pss > 0 ? v.Pss : P);
  let o = open;
  if (o === 0 && P > v.Pset) o = 1;
  else if (o === 1 && P < v.Pset * BLOWDOWN) o = 0;
  let nRel = 0;
  if (o === 1) {
    const cap = (v.capKgS * vent) / v.M;
    nRel = Math.min(cap, Math.max(0, net + (P - v.Pset) / k));
  }
  return { P: Math.max(1e3, P + k * (net - nRel)), open: o, nRel };
}

/** Temperature-equivalent relief of a liquid-full vessel (L24: lifts at 140 C): `open` after this second given the vessel temperature. */
export function liquidReliefOpen(T: number, Tset: number, open: 0 | 1): 0 | 1 {
  if (open === 0) return T >= Tset ? 1 : 0;
  return T < Tset - RELIEF_RESEAT_K ? 0 : 1;
}

/** A lifting liquid relief boils off charge: a parallel coolant of conductance capacity x latent heat / dT at the set temperature, added to the jacket. */
export function liquidReliefSink(capKgS: number): number { return (capKgS * RELIEF_LIQ.latent) / RELIEF_LIQ.dT; }

/** Jacket (UA, Tc) after mixing in a parallel sink (UA_r at Tset) and, for a full-coolant trip, the colder / bigger jacket. */
export function jacketWith(UA: number, Tc: number, sinkUA: number, Tset: number, fullCoolant: boolean): { UA: number; Tc: number } {
  let ua = UA, tc = Tc;
  if (fullCoolant) { ua = UA * FULL_COOLANT.ua; tc = Tc - FULL_COOLANT.dTc; }
  if (sinkUA > 0) { const tot = ua + sinkUA; tc = (ua * tc + sinkUA * Tset) / tot; ua = tot; }
  return { UA: ua, Tc: tc };
}

/** Does an interlock on `variable` trip at this value? Flow trips low, everything else high; a zero set point is disarmed. */
export function interlockTrips(variable: string, value: number, setpoint: number): boolean {
  if (!(setpoint > 0)) return false;
  return variable === 'flow' ? value < setpoint : value > setpoint;
}

/** Containment loss (DESIGN 5.5): P above 1.5 x design pressure, or T above the material limit. 0 = intact, 1 = pressure, 2 = temperature. */
export function containment(P: number, Pdesign: number, T: number, Tmaterial: number): 0 | 1 | 2 {
  if (P > LOSS_P_FACTOR * Pdesign) return 1;
  if (T > Tmaterial) return 2;
  return 0;
}

/** Design pressure rule of the game: 25 % above the operating pressure at shift start (a unit's `Pdes` param overrides). */
export const designPressure = (Pop: number): number => DESIGN_P_FACTOR * Pop;
