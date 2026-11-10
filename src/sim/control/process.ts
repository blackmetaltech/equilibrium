// Process blocks in deviation variables: first order (K, tau), dead time (sample buffer), FOPDT = both, a level tank (integrator) and a valve lag.
// Plain-JSON state (arrays of numbers), exact discretisation: a step input gives y = K(1 - exp(-(t - theta)/tau)) at the sample times.
import { lagStep } from './pid';

export interface Fopdt { K: number; tau: number; theta: number }
export interface FopdtState { y: number; buf: number[] }
export const fopdtInit = (p: Fopdt, dt: number, y0 = 0): FopdtState => ({ y: y0, buf: new Array<number>(Math.max(0, Math.round(p.theta / dt))).fill(0) });

/** Advance one dt with input u (deviation); returns the output. The dead time is a whole number of samples (round(theta / dt)). */
export function fopdtStep(p: Fopdt, st: FopdtState, u: number, dt: number): number {
  let ud = u;
  if (st.buf.length > 0) { st.buf.push(u); ud = st.buf.shift()!; }
  st.y = lagStep(st.y, p.K * ud, p.tau, dt);
  return st.y;
}

/** Open-loop step response of a FOPDT: n samples of dt after a unit step of size `du` at t = 0. */
export function stepResponse(p: Fopdt, du: number, n: number, dt: number): { t: number[]; y: number[] } {
  const st = fopdtInit(p, dt), t: number[] = [], y: number[] = [];
  for (let k = 1; k <= n; k++) { y.push(fopdtStep(p, st, du, dt)); t.push(k * dt); }
  return { t, y };
}

/** Closed-form first-order step response y(t) = K du (1 - exp(-t/tau)); the oracle of the tests (takes `exp` so this file stays free of Math.exp). */
export const firstOrderAt = (K: number, tau: number, du: number, t: number, exp: (x: number) => number): number => K * du * (1 - exp(-t / tau));

/** Level tank: A dh/dt = qin - qout, h in percent of range, flows in percent of the valve capacity (so qout = valve opening). */
export interface Tank { area: number }
export const tankStep = (h: number, qin: number, qout: number, p: Tank, dt: number): number => h + ((qin - qout) / p.area) * dt;
