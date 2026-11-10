// The dynamic rigs of chapter 8, as pure functions of the player's dials (no state: the level re-runs the shift from the dials each time it is read).
// L29 level tank, L30 FOPDT temperature loop, L31 ratio of two flows, L32 cascade, L33 jacketed reactor with a trip. Time step 1 s (L33: sub-steps).
// Numbers are GAME numbers (UNVERIFIED) chosen so the chapter's textbook results are visible: every level also exposes the series the chart recorder draws.
import { dmath } from '@core/numerics';
import { fopdtInit, fopdtStep, type Fopdt, type FopdtState } from './process';
import { clamp, lagStep, pidInit, pidStep, type PidCfg } from './pid';
import { loopMetrics, type LoopMetrics } from './metrics';
import { cascadeStep } from './structures';

export interface Series { t: number[]; pv: number[]; sp: number[]; op: number[] }
const mk = (): Series => ({ t: [], pv: [], sp: [], op: [] });
const push = (s: Series, t: number, pv: number, sp: number, op: number): void => { s.t.push(t); s.pv.push(pv); s.sp.push(sp); s.op.push(op); };

// ------------------------------------------------------------------------------------------------ L29 level tank
export const L29_RIG = { len: 600, sp: 50, qin0: 50, qin1: 60, stepAt: 60, area: 40, tauV: 10, callKc: 2 };
export interface L29Out { series: Series; m: LoopMetrics; offsetPct: number; peakDev: number; overshootPct: number; moves: number }
/** Feed drum LIC: level h (% of range), outlet valve (direct acting, bias 50 %, first-order actuator), inflow steps from 50 to 60 % of valve capacity at t = 60 s. */
export function runL29(kc: number, tauI: number): L29Out {
  const R = L29_RIG, cfg: PidCfg = { kc, tauI, tauD: 0, action: 'direct', bias: 50, lo: 0, hi: 100 }, st = pidInit(cfg), ser = mk();
  let h = R.sp, v = 50, peak = 0, after = 0, maxOver = 0;
  for (let k = 0; k < R.len; k++) {
    const qin = k < R.stepAt ? R.qin0 : R.qin1;
    const u = pidStep(cfg, st, R.sp, h, 1);
    v = lagStep(v, u, R.tauV, 1);
    h = clamp(h + ((qin - v) / R.area), 0, 100);
    push(ser, k + 1, h, R.sp, u);
    peak = Math.max(peak, Math.abs(h - R.sp));
  }
  const tail = ser.pv.slice(-60), offset = Math.abs(tail.reduce((a, b) => a + b, 0) / tail.length - R.sp);
  // overshoot of the recovery: how far the level crosses the set point on the far side after the first return
  const sgn = Math.sign(R.qin1 - R.qin0);   // inflow up -> level rises
  let crossed = false;
  for (let k = R.stepAt; k < R.len; k++) { const d = sgn * (ser.pv[k]! - R.sp); if (!crossed && d > 0.5) crossed = true; if (crossed) { after = Math.min(after, d); } }
  maxOver = peak > 0 ? (-after / peak) * 100 : 0;
  const m = loopMetrics(ser.pv, ser.sp, ser.op, 1, 0, 100);
  let moves = 0; for (let k = 1; k < ser.op.length; k++) moves += Math.abs(ser.op[k]! - ser.op[k - 1]!);
  return { series: ser, m, offsetPct: offset, peakDev: peak, overshootPct: maxOver, moves };
}
/** The oracle of the Call-it: the P-only offset after the inflow step is (qin1 - qin0) / Kc, in percent of the level range. */
export const l29Offset = (kc: number): number => (L29_RIG.qin1 - L29_RIG.qin0) / kc;

// ------------------------------------------------------------------------------------------------ L30 converter inlet TIC
export const L30_PROC: Fopdt = { K: 1.8, tau: 45, theta: 12 };
export const L30_RIG = { len: 700, T0: 380, spStep: 10, spAt: 60, loadAt: 380, load: -6, bias: 40, bump: 5, bumpLen: 400, lambda: 12 };
export interface L30Out { series: Series; m: LoopMetrics; iae: number; satShare: number; overshootPct: number }
/** Heater duty (%) -> inlet temperature (K above the start, FOPDT K = 1.8 K/%, tau = 45 s, theta = 12 s). Set-point step +10 K at 60 s, feed-cold load step -6 K at 380 s. */
export function runL30(kc: number, tauI: number, tauD: number): L30Out {
  const R = L30_RIG, p = L30_PROC, cfg: PidCfg = { kc, tauI, tauD, action: 'reverse', bias: R.bias, lo: 0, hi: 100 }, st = pidInit(cfg), ser = mk();
  const proc = fopdtInit(p, 1);
  let y = 0;
  for (let k = 0; k < R.len; k++) {
    const sp = R.T0 + (k < R.spAt ? 0 : R.spStep), load = k < R.loadAt ? 0 : R.load;
    const u = pidStep(cfg, st, sp, R.T0 + y + load, 1);
    y = fopdtStep(p, proc, u - R.bias, 1);
    push(ser, k + 1, R.T0 + y + load, sp, u);
  }
  const m = loopMetrics(ser.pv, ser.sp, ser.op, 1, 0, 100);
  // overshoot of the first (set-point) step only
  let over = 0;
  for (let k = R.spAt; k < R.loadAt; k++) over = Math.max(over, ser.pv[k]! - (R.T0 + R.spStep));
  return { series: ser, m, iae: m.iae, satShare: m.satShare, overshootPct: (over / R.spStep) * 100 };
}
/** The bump test the player runs: open loop, +5 % heater duty, the recorder shows the inlet temperature rising. Same plant, no controller. */
export function bumpL30(): { t: number[]; y: number[]; du: number } {
  const R = L30_RIG, proc = fopdtInit(L30_PROC, 1), t: number[] = [], y: number[] = [];
  for (let k = 1; k <= R.bumpLen; k++) { t.push(k); y.push(fopdtStep(L30_PROC, proc, R.bump, 1)); }
  return { t, y, du: R.bump };
}

// ------------------------------------------------------------------------------------------------ L31 ratio H2 : N2
export const L31_RIG = { len: 700, n2: 5, ratio: 3, tauM: 3, proc: { K: 1, tau: 8, theta: 2 } as Fopdt, bias: 0 };
/** N2 supply (kmol/h) of the surging header: nominal 5, drops to 3 at 100 s, back at 250 s, up to 6.5 at 420 s, back at 560 s. */
export const n2Supply = (k: number): number => (k < 100 ? 5 : k < 250 ? 3 : k < 420 ? 5 : k < 560 ? 6.5 : 5);
export interface L31Out { series: Series; n2: number[]; h2: number[]; ventH2: number; ventN2: number; fedH2: number; fedN2: number; ventH2Pct: number; ventPct: number; ratioErrPct: number }
/** H2 follower flow loop (PI, reverse, valve % -> kmol/h). ratioOn: set point = ratio x filtered N2 measurement; off: fixed 15 kmol/h. The converter consumes N2 and 3 H2 per N2: what exceeds that vents. */
export function runL31(ratioOn: boolean, ratio: number, kc: number, tauI: number): L31Out {
  const R = L31_RIG, cfg: PidCfg = { kc, tauI, tauD: 0, action: 'reverse', bias: 3 * R.n2, lo: 0, hi: 60 }, st = pidInit(cfg), proc: FopdtState = fopdtInit(R.proc, 1, 3 * R.n2), ser = mk();
  let meas = R.n2, h2 = 3 * R.n2, vH = 0, vN = 0, fH = 0, fN = 0, errSum = 0;
  const n2s: number[] = [], h2s: number[] = [];
  const full: Fopdt = R.proc;
  for (let k = 0; k < R.len; k++) {
    const n2 = n2Supply(k);
    meas = lagStep(meas, n2, R.tauM, 1);
    const sp = ratioOn ? ratio * meas : 3 * R.n2;
    const u = pidStep(cfg, st, sp, h2, 1);
    // the process block is in deviation form around the bias flow: h2 = bias + K (u - bias)
    h2 = 3 * R.n2 + fopdtStep(full, proc, u - 3 * R.n2, 1) - 0;
    const need = 3 * n2, exH = Math.max(0, h2 - need), exN = Math.max(0, n2 - h2 / 3);
    vH += exH / 3600; vN += exN / 3600; fH += h2 / 3600; fN += n2 / 3600;
    errSum += Math.abs(h2 / n2 - 3);
    push(ser, k + 1, h2, sp, u); n2s.push(n2); h2s.push(h2);
  }
  return { series: ser, n2: n2s, h2: h2s, ventH2: vH, ventN2: vN, fedH2: fH, fedN2: fN, ventH2Pct: (vH / fH) * 100, ventPct: ((vH + vN) / (fH + fN)) * 100, ratioErrPct: (errSum / R.len / 3) * 100 };
}

// ------------------------------------------------------------------------------------------------ L32 cascade
export const L32_RIG = { len: 900, T0: 520, procM: { K: 1.2, tau: 150, theta: 40 } as Fopdt, slave: { tau: 4, theta: 1 }, hdrAt: 100, hdr: -20, hdrEnd: 400, feedAt: 600, feed: 8, bias: 50 };
export interface L32Out { series: Series; flow: number[]; peakDev: number; iae: number; satShare: number; hdrPeak: number }
/** Bed temperature (K, master, slow) cooled by quench flow (slave, fast). Quench flow % = valve lag + a header pressure disturbance (-20 % from 100 s to 400 s); a feed-warm load (+8 K) at 600 s.
 *  Without the cascade the master drives the valve directly. T = T0 + load - FOPDT(flow - bias). */
export function runL32(cascade: boolean, mKc: number, mTauI: number, sKc: number, sTauI: number): L32Out {
  const R = L32_RIG, mCfg: PidCfg = { kc: mKc, tauI: mTauI, tauD: 0, action: 'direct', bias: R.bias, lo: 0, hi: 100 };
  const sCfg: PidCfg = { kc: sKc, tauI: sTauI, tauD: 0, action: 'reverse', bias: R.bias, lo: 0, hi: 100 };
  const st = { master: pidInit(mCfg), slave: pidInit(sCfg) }, single = pidInit(mCfg), ser = mk(), proc = fopdtInit(R.procM, 1);
  const valveDelay: number[] = new Array<number>(Math.round(R.slave.theta)).fill(R.bias);
  let flow = R.bias, valve = R.bias, T = R.T0, peak = 0, hdrPeak = 0, op = R.bias;
  const flows: number[] = [];
  for (let k = 0; k < R.len; k++) {
    const dist = k >= R.hdrAt && k < R.hdrEnd ? R.hdr : 0, load = k >= R.feedAt ? R.feed : 0;
    
    if (cascade) { const r = cascadeStep(mCfg, sCfg, st, R.T0, T, flow, 0, 100, 1); op = r.op; }
    else op = pidStep(mCfg, single, R.T0, T, 1);
    valveDelay.push(op); const vIn = valveDelay.shift()!;
    valve = lagStep(valve, vIn, R.slave.tau, 1);
    flow = valve + dist;
    T = R.T0 + load - fopdtStep(R.procM, proc, flow - R.bias, 1);
    push(ser, k + 1, T, R.T0, op); flows.push(flow);
    const dev = Math.abs(T - R.T0);
    peak = Math.max(peak, dev); if (k < R.feedAt) hdrPeak = Math.max(hdrPeak, dev);
  }
  const m = loopMetrics(ser.pv, ser.sp, ser.op, 1, 0, 100);
  return { series: ser, flow: flows, peakDev: peak, iae: m.iae, satShare: m.satShare, hdrPeak };
}
