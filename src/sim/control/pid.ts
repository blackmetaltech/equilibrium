// PID controller, ISA (standard) form: u = bias + Kc * ( e + (1/tauI) * integral(e) - tauD * d(pv)/dt ). Derivative on measurement (no kick on set-point steps),
// filtered; output clamped to the valve range (0-100 %) with integral anti-windup. Plain-JSON state, deterministic. P, PI and PID are tauI = 0 / tauD = 0 cases.
import { dmath } from '@core/numerics';

export interface PidCfg {
  kc: number;
  /** Integral time, s; 0 = no integral action (P or PD). */
  tauI: number;
  /** Derivative time, s; 0 = none. */
  tauD: number;
  /** 'reverse': output rises when pv falls (heater, inlet valve); 'direct': output rises with pv (outlet valve of a tank). */
  action: 'reverse' | 'direct';
  bias: number;
  lo: number;
  hi: number;
  /** Anti-windup on (default) or off (the windup demonstration). */
  antiWindup?: boolean;
  /** Derivative filter divisor N: filter time tauD / N. */
  nFilter?: number;
}
export interface PidState { i: number; pvPrev: number; dF: number; u: number; init: boolean; sat: number }

export const pidInit = (cfg: Pick<PidCfg, 'bias'>): PidState => ({ i: 0, pvPrev: 0, dF: 0, u: cfg.bias, init: false, sat: 0 });
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** One controller step of length dt (s). Mutates `st`, returns the clamped output. `st.sat` counts the steps spent at a limit. */
export function pidStep(cfg: PidCfg, st: PidState, sp: number, pv: number, dt: number): number {
  const sgn = cfg.action === 'reverse' ? 1 : -1;
  const e = sgn * (sp - pv);
  if (!st.init) { st.pvPrev = pv; st.init = true; }
  const p = cfg.kc * e;
  if (cfg.tauI > 0) st.i += (cfg.kc / cfg.tauI) * e * dt;
  let d = 0;
  if (cfg.tauD > 0) {
    const tf = cfg.tauD / (cfg.nFilter ?? 8);
    const raw = (pv - st.pvPrev) / dt;
    st.dF += (dt / (tf + dt)) * (raw - st.dF);
    d = -sgn * cfg.kc * cfg.tauD * st.dF;
  }
  st.pvPrev = pv;
  const u0 = cfg.bias + p + st.i + d;
  const u = clamp(u0, cfg.lo, cfg.hi);
  if (u !== u0) {
    st.sat += 1;
    if (cfg.antiWindup !== false) st.i += u - u0;   // clamping: the integral gives back what the valve could not deliver
  }
  st.u = u;
  return u;
}

/** First-order lag toward `target`, exact for a step of dt (alpha = 1 - exp(-dt/tau)). */
export const lagStep = (y: number, target: number, tau: number, dt: number): number => (tau <= 0 ? target : y + (target - y) * (1 - dmath.exp(-dt / tau)));
