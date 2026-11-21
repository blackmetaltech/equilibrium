// Liquid line and centrifugal pump hydraulics (DEPTH "Hydraulics", L39 Size the Line). Pure SI functions: velocity, Reynolds number, Darcy friction factor (Colebrook
// iterated from the Swamee-Jain start, laminar 64/Re), Darcy-Weisbach plus fittings (K values), the system curve, a quadratic pump curve with the affinity laws for an
// impeller trim, the operating point (where the curves cross), shaft power and NPSH available. Rule code: dmath only (no Math.exp/log/pow, no `**`).
// Sources: Darcy-Weisbach and Colebrook (Perry's 8th ed. 6-10..6-12, Crane TP-410 eq. 1-5/1-6); Swamee & Jain (1976) J. Hydraulics Div. ASCE 102(5); Karassik,
// Pump Handbook (affinity laws, NPSH); Hydraulic Institute ANSI/HI 9.6.1 (NPSH margin, preferred operating region 70-120 % of BEP).
import { dmath, brent } from '@core/numerics';

export const G = 9.80665;
/** Laminar below this Reynolds number. */
export const RE_LAMINAR = 2300;

export interface Fluid { name: string; rho: number; /** Pa s */ mu: number; /** vapour pressure, Pa abs */ pVap: number }
/** One straight run with its fittings: inside diameter D (m), length L (m), sum of K values, absolute roughness eps (m). */
export interface Line { D: number; L: number; K: number; eps: number }

export const areaOf = (D: number): number => (Math.PI / 4) * D * D;
/** Mean velocity, m/s, of Q m3/s in a pipe of inside diameter D m. */
export const velocity = (Q: number, D: number): number => Q / areaOf(D);
export const reynolds = (rho: number, v: number, D: number, mu: number): number => (rho * v * D) / mu;

/** Swamee-Jain explicit approximation of Colebrook (within about 1 % for 5e3 < Re < 1e8, 1e-6 < eps/D < 1e-2). */
export function frictionSwameeJain(Re: number, rel: number): number {
  const l = dmath.log10(rel / 3.7 + 5.74 / dmath.pow(Re, 0.9));
  return 0.25 / (l * l);
}
/** Darcy friction factor: 64/Re in laminar flow, else Colebrook-White solved by fixed-point iteration on 1/sqrt(f) from the Swamee-Jain start. */
export function friction(Re: number, rel: number): number {
  if (!(Re > 0)) return 0;
  if (Re < RE_LAMINAR) return 64 / Re;
  let x = 1 / dmath.sqrt(frictionSwameeJain(Re, rel));
  for (let i = 0; i < 60; i++) {
    const nx = -2 * dmath.log10(rel / 3.7 + (2.51 * x) / Re);
    if (Math.abs(nx - x) < 1e-13) { x = nx; break; }
    x = nx;
  }
  return 1 / (x * x);
}

export interface LineFlow { v: number; Re: number; f: number; /** velocity head v^2/2g, m */ hv: number; /** pipe friction, m */ hPipe: number; /** fittings, m */ hFit: number; /** total loss, m of liquid */ h: number }
/** Darcy-Weisbach loss of a line at Q m3/s: h = (f L/D + sum K) v^2 / 2g. */
export function lineLoss(line: Line, Q: number, fl: Fluid): LineFlow {
  const v = velocity(Q, line.D), Re = reynolds(fl.rho, v, line.D, fl.mu), f = friction(Re, line.eps / line.D), hv = (v * v) / (2 * G);
  const hPipe = ((f * line.L) / line.D) * hv, hFit = line.K * hv;
  return { v, Re, f, hv, hPipe, hFit, h: hPipe + hFit };
}

/** The system a pump must serve: liquid surface of the suction tank `zs` m above the pump centreline (negative = suction lift), the delivery point `dz` m above the suction surface,
 *  gas pressures on the two surfaces (Pa abs), and the two lines. */
export interface System { fluid: Fluid; dz: number; zs: number; pSuction: number; pDischarge: number; suction: Line; discharge: Line }
/** Static head: lift plus the pressure difference as liquid head, m. */
export const staticHead = (sys: System): number => sys.dz + (sys.pDischarge - sys.pSuction) / (sys.fluid.rho * G);
/** The system curve H_sys(Q) = static head + friction of both lines, m (Q in m3/s). */
export const systemHead = (sys: System, Q: number): number => staticHead(sys) + lineLoss(sys.suction, Q, sys.fluid).h + lineLoss(sys.discharge, Q, sys.fluid).h;
/** NPSH available at the pump suction, m: (P_surface - P_vap)/(rho g) + zs - suction friction. */
export function npshAvailable(sys: System, Q: number): number {
  return (sys.pSuction - sys.fluid.pVap) / (sys.fluid.rho * G) + sys.zs - lineLoss(sys.suction, Q, sys.fluid).h;
}

/** A centrifugal pump at full impeller, Q in m3/h: head H = h0 + h1 Q - h2 Q^2 (m), efficiency eta = etaBep (2x - x^2) with x = Q/qBep, NPSHr = n0 + n2 Q^2 (m),
 *  catalogue range qMin..qMax (minimum continuous flow to end of curve). */
export interface Pump { id: string; h0: number; h1: number; h2: number; qBep: number; etaBep: number; n0: number; n2: number; qMin: number; qMax: number; priceUsd: number; motorKw: number }
/** Affinity laws for an impeller trimmed to fraction t of full diameter (constant speed): Q ~ t, H ~ t^2, so H_t(Q) = t^2 H(Q/t). */
export const pumpHead = (p: Pump, Qh: number, t = 1): number => { const q = Qh / t; return t * t * (p.h0 + p.h1 * q - p.h2 * q * q); };
export const pumpEta = (p: Pump, Qh: number, t = 1): number => { const x = Qh / (p.qBep * t); return Math.max(0, p.etaBep * (2 * x - x * x)); };
export const pumpNpshr = (p: Pump, Qh: number, t = 1): number => { const q = Qh / t; return t * t * (p.n0 + p.n2 * q * q); };
/** Flow at which the head curve reaches zero (the far end of the drawn curve), m3/h. */
export function pumpQZero(p: Pump, t = 1): number { const d = p.h1 * p.h1 + 4 * p.h2 * p.h0; return (t * (p.h1 + dmath.sqrt(d))) / (2 * p.h2); }

export interface OperatingPoint { ok: boolean; /** m3/h */ Qh: number; H: number; eta: number; npshr: number; npsha: number; /** shaft power, kW */ kW: number; onCurve: boolean; reason: '' | 'shutoff' | 'runout' | 'mincflow' }
/** Where the pump curve meets the system curve (Brent on H_pump - H_sys over 0..zero-head flow). `shutoff`: the pump cannot lift the static head at all. */
export function operatingPoint(p: Pump, sys: System, t = 1): OperatingPoint {
  const g = (Qh: number): number => pumpHead(p, Qh, t) - systemHead(sys, Qh / 3600);
  const qz = pumpQZero(p, t);
  if (g(0) <= 0) return { ok: false, Qh: 0, H: pumpHead(p, 0, t), eta: 0, npshr: pumpNpshr(p, 0, t), npsha: npshAvailable(sys, 0), kW: 0, onCurve: false, reason: 'shutoff' };
  const r = brent(g, 0, qz, { tol: 1e-10 });
  const Qh = r.x, H = pumpHead(p, Qh, t), eta = pumpEta(p, Qh, t);
  const kW = eta > 0 ? (sys.fluid.rho * G * (Qh / 3600) * H) / eta / 1000 : 0;
  const reason = Qh > p.qMax * t ? 'runout' : Qh < p.qMin * t ? 'mincflow' : '';
  return { ok: true, Qh, H, eta, npshr: pumpNpshr(p, Qh, t), npsha: npshAvailable(sys, Qh / 3600), kW, onCurve: reason === '', reason };
}
/** Shaft power, W, of Q m3/s against H m at efficiency eta. */
export const shaftPower = (rho: number, Q: number, H: number, eta: number): number => (rho * G * Q * H) / eta;
