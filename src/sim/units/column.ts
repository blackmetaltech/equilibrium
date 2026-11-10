// Shortcut distillation column (DESIGN 3.7, L23): Fenske minimum stages and Underwood-type minimum reflux on the NRTL equilibrium of the key pair
// (thermo/nrtl.ts), Gilliland (Molokanov) for the stage count at R = rr x Rmin, a total condenser and a kettle reboiler, feed at its bubble point (q = 1).
// Keys: light = ethanol, heavy = water (params lk / hk, gas ids). Other components go with whichever end they belong to: lighter than the light key (gases,
// methanol) overhead, everything else (glucose, salts, heavier) to the bottoms. Ports: in; vap = distillate (a liquid at its bubble point), liq = bottoms.
// Params: P (Pa, default the feed's), xD (mole fraction of the light key among the keys in the distillate), rec (light-key recovery to the distillate, default 0.99),
//   rr (R / Rmin, default 1.3), lk, hk.
// Failures: AZEOTROPE_LIMIT {xD, x_az, wt_az} when the distillate spec is at or beyond the azeotrope of the pair (no reflux gets there), SPEC_RANGE, SPEC_INFEASIBLE.
// Info: N (theoretical stages), Nmin, Rmin, R, alpha (mean relative volatility), xD, xB, D, B (mol/s of keys), T_top, T_bot, Q_cond, Q_reb (W), steam_kg_s, cw_duty_W,
//   x_az, feed_stage, trays_actual, D_m, H_m, vol_m3 (sizing for capex), and the display numbers tray_n, tray_T0.. (K, top to bottom), level, reflux (0-1).
import { dmath } from '@core/numerics';
import { SPECIES } from '../../data/species';
import { enthalpyFlow, makeMixture } from '../thermo';
import { R_GAS } from '../thermo/shomate';
import { alphaAt, azeotrope, bubbleBinary, pairParams } from '../thermo/nrtl';
import type { Diag, SimCtx, StreamState, UnitInst, UnitOp } from '../types';
import { failResult, okResult } from '../types';
import { THERMO, hOf } from '../thermo/species';
import { guardInlets, has, num, str, steamLatent } from './utilities';

/** Overall tray efficiency (GAME), tray spacing m, vapour velocity m/s (GAME), disengagement allowance m. */
const E_OVERALL = 0.7, TRAY_SPACING = 0.6, U_VAP = 0.8, H_EXTRA = 4;
const N_DISPLAY_MAX = 20;
const XB_FLOOR = 1e-6;

/** Molar latent heat of a component at T from the catalogue gas and liquid rows (the liquid twin is `<id>(l)`), J/mol. */
const latent = (c: string, T: number): number => {
  const gas = THERMO[c], liq = THERMO[c + '(l)'];
  return gas !== undefined && liq !== undefined ? hOf(gas, T) - hOf(liq, T) : 0;
};
const lnOdds = (x: number): number => dmath.log(x / (1 - x));
const fromOdds = (l: number): number => 1 / (1 + dmath.exp(-l));

export const column: UnitOp = (inlets, u: UnitInst, ctx: SimCtx) => {
  const g = guardInlets<never>(inlets, u); if (g) return g;
  const s = inlets.in;
  if (!s) return failResult('NO_INLET', { port: 0 }, { unitId: u.id });
  const fail = (code: string, data: Record<string, number | string> = {}) => failResult<never>(code, data, { unitId: u.id });
  const lk = str(u, 'lk', 'C2H5OH'), hk = str(u, 'hk', 'H2O');
  const xD = num(u, 'xD', 0.8), rec = num(u, 'rec', 0.99), rr = num(u, 'rr', 1.3);
  const P = has(u, 'P') ? num(u, 'P') : s.P;
  if (!(xD > 0 && xD < 1)) return fail('SPEC_RANGE', { xD });
  if (!(rec > 0 && rec <= 1)) return fail('SPEC_RANGE', { rec });
  if (!(rr >= 1)) return fail('SPEC_RANGE', { rr });
  if (!(P > 0)) return fail('PRESSURE_NONPOSITIVE', { Pin: s.P, dP: 0 });
  // the key species are looked up by gas id or its liquid twin (C2H5OH or C2H5OH(l)): every species of the level is its own slot here
  const slotOfKey = (id: string): number => { const i = ctx.species.indexOf(id); return i >= 0 ? i : ctx.species.indexOf(id + '(l)'); };
  const iL = slotOfKey(lk), iH = slotOfKey(hk);
  if (iL < 0 || iH < 0) return fail('SPECIES_MISSING', {});
  const nS = ctx.species.length;
  if (!(s.n.reduce((a, b) => a + b, 0) > 0)) {
    const z = (): StreamState => ({ n: new Array<number>(nS).fill(0), T: s.T, P });
    return okResult({ outlets: { vap: z(), liq: z() }, duty: 0, info: { N: 0, Nmin: 0, Rmin: 0, R: 0, D: 0, B: 0, F: 0, Q_cond: 0, Q_reb: 0, steam_kg_s: 0, cw_duty_W: 0, T_top: s.T, T_bot: s.T, vol_m3: 0, tray_n: 0, level: 0, reflux: 0 } });
  }
  const zL = s.n[iL]!, zH = s.n[iH]!;
  const mx = makeMixture(ctx.species);
  const diag: Diag[] = [];

  const dOut = new Array<number>(nS).fill(0), bOut = new Array<number>(nS).fill(0);
  // components other than the keys go to the end they belong to: lighter than the light key (gases, methanol) overhead, the rest to the bottoms
  const TbL = SPECIES[lk]?.Tb ?? 351.57;
  ctx.species.forEach((id, k) => {
    if (k === iL || k === iH) return;
    const tb = SPECIES[id]?.Tb;
    const light = tb !== undefined ? tb < TbL - 3 : SPECIES[id]?.phase === 'g';
    (light ? dOut : bOut)[k]! += s.n[k]!;
  });

  if (!(zL > 0)) return fail('SPEC_INFEASIBLE', { zL });
  const pair = pairParams(lk, hk);
  const az = pair === null ? null : azeotrope(lk, hk, P);
  const zk = zL / (zL + zH);
  if (az !== null && xD >= az.x - 1e-9) return fail('AZEOTROPE_LIMIT', { xD, x_az: az.x, wt_az: az.wt, P });
  if (!(xD > zk)) return fail('SPEC_RANGE', { xD, zF: zk });

  const DL = rec * zL, DH = (DL * (1 - xD)) / xD;
  if (DH > zH + 1e-12) return fail('SPEC_INFEASIBLE', { DH, zH });
  const BL = zL - DL, BH = zH - DH;
  dOut[iL]! += DL; dOut[iH]! += DH; bOut[iL]! += BL; bOut[iH]! += BH;
  const xB = Math.max(BL / (BL + BH), XB_FLOOR);
  const Dk = DL + DH, Bk = BL + BH, Fk = zL + zH;

  const top = bubbleBinary(lk, hk, xD, P), bot = bubbleBinary(lk, hk, xB, P);
  const alpha = Math.sqrt(alphaAt(lk, hk, xD, top.T) * alphaAt(lk, hk, xB, bot.T));
  if (!(alpha > 1.0001)) return fail('AZEOTROPE_LIMIT', { xD, x_az: az?.x ?? 1, wt_az: az?.wt ?? 1, P });
  const Nmin = dmath.log((xD / (1 - xD)) * ((1 - xB) / xB)) / dmath.log(alpha);

  // minimum reflux: the steepest line from (xD, xD) to the equilibrium curve between the feed (q = 1: x = zk) and the top (pinch or tangent)
  let Rmin = 0;
  const NG = 48;
  for (let i = 0; i < NG; i++) {
    const x = zk + ((xD - zk) * i) / NG;
    const y = bubbleBinary(lk, hk, x, P).y;
    if (!(y > x)) return fail('AZEOTROPE_LIMIT', { xD, x_az: az?.x ?? x, wt_az: az?.wt ?? 1, P });
    Rmin = Math.max(Rmin, (xD - y) / (y - x));
  }
  const R = rr * Rmin;
  // Gilliland, Molokanov: Y = (N - Nmin)/(N + 1) = 1 - exp[ (1 + 54.4 X)/(11 + 117.2 X) (X - 1)/sqrt(X) ], X = (R - Rmin)/(R + 1)
  const X = (R - Rmin) / (R + 1);
  const Y = X > 0 ? 1 - dmath.exp(((1 + 54.4 * X) / (11 + 117.2 * X)) * ((X - 1) / Math.sqrt(X))) : 1;
  const N = (Nmin + Y) / (1 - Y);
  // Kirkbride split of the stages around the feed
  const ratio = dmath.pow(((zH / zL) * dmath.pow((BL / (BL + BH)) / ((DH / Dk) || 1e-12), 2) * Bk) / Dk, 0.206);
  const feedStage = Math.min(Math.max(1, Math.round(N / (1 + ratio))), Math.max(1, Math.ceil(N)));

  // streams and energy
  const D: StreamState = { n: dOut, T: top.T, P }, B: StreamState = { n: bOut, T: bot.T, P };
  const V = (R + 1) * Dk;
  let lam = 0;
  for (const [c, x] of [[lk, xD], [hk, 1 - xD]] as [string, number][]) lam += x * latent(c, top.T);
  const Qc = V * lam;
  const Qr = Qc + enthalpyFlow(mx, D) + enthalpyFlow(mx, B) - enthalpyFlow(mx, s);
  if (!(Qr > 0)) diag.push({ code: 'REBOILER_NEGATIVE', severity: 'warn', unitId: u.id, data: { Q: Qr } });
  const duty = Qr - Qc;

  // sizing
  const Dm = Math.sqrt((4 * ((V * R_GAS * top.T) / P)) / (Math.PI * U_VAP));
  const Hm = TRAY_SPACING * (N / E_OVERALL) + H_EXTRA;
  const info: Record<string, number> = {
    N, Nmin, Rmin, R, alpha, xD, xB, D: Dk, B: Bk, F: Fk, T_top: top.T, T_bot: bot.T, Q_cond: Qc, Q_reb: Qr, steam_kg_s: Math.max(0, Qr) / steamLatent(), cw_duty_W: Qc,
    x_az: az?.x ?? 1, wt_az: az?.wt ?? 1, feed_stage: feedStage, trays_actual: N / E_OVERALL, D_m: Dm, H_m: Hm, vol_m3: (Math.PI / 4) * Dm * Dm * Hm,
    P, level: 0.5, reflux: R / (R + 1),
  };
  const nd = Math.min(N_DISPLAY_MAX, Math.max(3, Math.ceil(N)));
  info.tray_n = nd;
  const lo = lnOdds(xB), hi = lnOdds(xD);
  for (let i = 0; i < nd; i++) {
    info['tray_T' + i] = i === 0 ? top.T : i === nd - 1 ? bot.T : bubbleBinary(lk, hk, fromOdds(hi + ((lo - hi) * i) / (nd - 1)), P).T;
  }
  return okResult({ outlets: { vap: D, liq: B }, duty, info }, diag);
};
