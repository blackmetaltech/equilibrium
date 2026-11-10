// Loop performance numbers of a recorded response: IAE, ISE, overshoot, settling time, peak, valve saturation share.
export interface LoopMetrics { iae: number; ise: number; overshootPct: number; settleS: number; peak: number; satShare: number }

/** `pv` and `sp` sampled every dt; `op` the valve in percent with limits lo/hi. Overshoot is of the last set-point step (|final - initial|) beyond the final set point; band = 2 % of that step. */
export function loopMetrics(pv: number[], sp: number[], op: number[], dt: number, lo = 0, hi = 100, band = 0.02): LoopMetrics {
  let iae = 0, ise = 0, sat = 0, peak = 0;
  for (let k = 0; k < pv.length; k++) {
    const e = sp[k]! - pv[k]!;
    iae += Math.abs(e) * dt; ise += e * e * dt;
    if (op[k]! <= lo + 1e-9 || op[k]! >= hi - 1e-9) sat++;
    peak = Math.max(peak, Math.abs(e));
  }
  const n = pv.length, fin = sp[n - 1]!;
  let k0 = n - 1;
  while (k0 > 0 && sp[k0 - 1]! === fin) k0--;
  const start = k0 > 0 ? sp[k0 - 1]! : pv[0]!, step = fin - start;
  let over = 0, settle = 0;
  if (step !== 0) {
    const dir = Math.sign(step);
    for (let k = k0; k < n; k++) over = Math.max(over, dir * (pv[k]! - fin));
    for (let k = n - 1; k >= k0; k--) if (Math.abs(pv[k]! - fin) > band * Math.abs(step)) { settle = (k - k0 + 1) * dt; break; }
    return { iae, ise, overshootPct: (over / Math.abs(step)) * 100, settleS: settle, peak, satShare: sat / n };
  }
  return { iae, ise, overshootPct: 0, settleS: 0, peak, satShare: sat / n };
}
