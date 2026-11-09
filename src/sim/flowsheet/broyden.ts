// Broyden's "good" method (inverse-Jacobian update) for F(x) = 0 with a forward-difference start and backtracking.
// Generic over F; F returns null when the point cannot be evaluated (a rejected step, never an exception).
import { inverse, SingularMatrixError } from '@core/numerics';

export interface BroydenOptions {
  /** Hard cap on calls of F (finite-difference columns included). */
  maxEvals: number;
  /** Quasi-Newton iterations (default 50). */
  maxIter?: number;
  /** Forward-difference step per variable. */
  step: number[];
  /** Norm weights per variable: the line search compares sqrt(sum (f_j / scale_j)^2). Default 1. */
  scale?: number[];
  /** Convergence test on (x, f). */
  done: (x: number[], f: number[]) => boolean;
  /** F(x0) if the caller already has it (not counted). */
  f0?: number[];
  /** Applied to every trial point (e.g. clamp flows to >= 0). */
  project?: (x: number[]) => number[];
  /** Called with every accepted iterate (history snapshots). */
  onIterate?: (x: number[], f: number[]) => void;
}
export interface BroydenResult {
  ok: boolean;
  x: number[];
  f: number[];
  evals: number;
  iterations: number;
  reason?: 'singular' | 'stalled' | 'maxEvals' | 'evalFail';
}

export function broydenSolve(F: (x: number[]) => number[] | null, x0: number[], opts: BroydenOptions): BroydenResult {
  const n = x0.length, maxIter = opts.maxIter ?? 50, project = opts.project ?? ((x: number[]) => x);
  const w = opts.scale ?? new Array<number>(n).fill(1);
  let evals = 0, iterations = 0;
  const call = (x: number[]): number[] | null => { evals++; const f = F(x); return f && f.every(Number.isFinite) ? f : null; };
  const norm = (f: number[]): number => { let s = 0; for (let j = 0; j < n; j++) { const q = f[j]! / w[j]!; s += q * q; } return Math.sqrt(s); };
  let x = x0.slice();
  let f = opts.f0 ?? call(x);
  const fin = (ok: boolean, reason?: BroydenResult['reason']): BroydenResult => ({ ok, x, f: f ?? [], evals, iterations, reason });
  if (!f) return fin(false, 'evalFail');
  opts.onIterate?.(x, f);
  if (opts.done(x, f)) return fin(true);

  const fdInverse = (): number[][] | 'maxEvals' | 'evalFail' | 'singular' => {
    const J: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let j = 0; j < n; j++) {
      if (evals >= opts.maxEvals) return 'maxEvals';
      let h = opts.step[j]!, xp = project(x.map((v, i) => (i === j ? v + h : v)));
      let fp = call(xp);
      if (!fp) { h = -h; xp = project(x.map((v, i) => (i === j ? v + h : v))); fp = evals < opts.maxEvals ? call(xp) : null; }
      if (!fp) return 'evalFail';
      const d = xp[j]! - x[j]!;
      if (d === 0) return 'singular';
      for (let i = 0; i < n; i++) J[i]![j] = (fp[i]! - f![i]!) / d;
    }
    try {
      const Hm = inverse(J);
      return Hm.every((r) => r.every(Number.isFinite)) ? Hm : 'singular';
    } catch (e) {
      if (e instanceof SingularMatrixError) return 'singular';
      throw e;
    }
  };

  const first = fdInverse();
  if (typeof first === 'string') return fin(false, first);
  let H = first, fresh = true;
  while (iterations < maxIter) {
    iterations++;
    const dx = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s -= H[i]![j]! * f![j]!; dx[i] = s; }
    const nf = norm(f!);
    let lam = 1, accepted: { x: number[]; f: number[] } | null = null;
    for (let ls = 0; ls < 7; ls++) {
      if (evals >= opts.maxEvals) return fin(false, 'maxEvals');
      const xt = project(x.map((v, i) => v + lam * dx[i]!));
      const ft = call(xt);
      if (ft && (opts.done(xt, ft) || norm(ft) < (1 - 1e-4 * lam) * nf)) { accepted = { x: xt, f: ft }; break; }
      lam *= 0.5;
    }
    if (!accepted) {
      if (fresh) return fin(false, 'stalled');
      const again = fdInverse();
      if (typeof again === 'string') return fin(false, again);
      H = again; fresh = true;
      continue;
    }
    // good Broyden update of H = J^-1 with s = x_new - x, y = f_new - f
    const s = accepted.x.map((v, i) => v - x[i]!), y = accepted.f.map((v, i) => v - f![i]!);
    const Hy = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < n; j++) t += H[i]![j]! * y[j]!; Hy[i] = t; }
    let denom = 0;
    for (let i = 0; i < n; i++) denom += s[i]! * Hy[i]!;
    if (Math.abs(denom) > 1e-300) {
      const sH = new Array<number>(n).fill(0);
      for (let j = 0; j < n; j++) { let t = 0; for (let i = 0; i < n; i++) t += s[i]! * H[i]![j]!; sH[j] = t; }
      for (let i = 0; i < n; i++) { const u = (s[i]! - Hy[i]!) / denom; for (let j = 0; j < n; j++) H[i]![j]! += u * sH[j]!; }
    }
    fresh = false;
    x = accepted.x; f = accepted.f;
    opts.onIterate?.(x, f);
    if (opts.done(x, f)) return fin(true);
  }
  return fin(false, 'maxEvals');
}
