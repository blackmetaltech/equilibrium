// Data reconciliation (DEPTH Ch 9, L37): weighted least squares on a linear mass balance A x = 0 with measured y = x + noise (+ bias). Closed form via the core LU solve:
//   V = A S A^T, r = A y, w = V^-1 r, eps = S A^T w, xhat = y - eps, S = diag(sigma^2).
// Gross-error test: normalised adjustment z_i = |eps_i| / sqrt(Cov(eps)_ii), Cov(eps)_ii = sigma_i^4 a_i^T V^-1 a_i; the global test chi2 = r^T w against the 95 % point of chi-square(nodes).
import { solve } from '@core/numerics';

export interface ReconOut { xhat: number[]; eps: number[]; z: number[]; resid: number[]; chi2: number; chi2Crit: number; worst: number }
/** 95 % points of chi-square for 1..6 degrees of freedom (table values). */
const CHI95 = [0, 3.8415, 5.9915, 7.8147, 9.4877, 11.0705, 12.5916];
const UNMEASURED = 1e4;

/** `excluded` meters are treated as unmeasured (their sigma is inflated 1e4-fold, so the balance, not the reading, decides them). */
export function reconcile(A: number[][], y: number[], sigma: number[], excluded: number[] = []): ReconOut {
  const m = A.length, n = y.length;
  const sg = sigma.map((s, i) => (excluded.includes(i) ? s * UNMEASURED : s));
  const V: number[][] = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => { let a = 0; for (let k = 0; k < n; k++) a += A[i]![k]! * sg[k]! * sg[k]! * A[j]![k]!; return a; }));
  const resid = A.map((row) => row.reduce((a, c, k) => a + c * y[k]!, 0));
  const w = solve(V, resid);
  const eps = y.map((_, k) => sg[k]! * sg[k]! * A.reduce((a, row, i) => a + row[k]! * w[i]!, 0));
  const z = y.map((_, k) => {
    const col = A.map((row) => row[k]!);
    const u = solve(V, col);
    const q = col.reduce((a, c, i) => a + c * u[i]!, 0);
    const sd = sg[k]! * sg[k]! * Math.sqrt(q);
    return excluded.includes(k) || sd === 0 ? 0 : Math.abs(eps[k]!) / sd;
  });
  let worst = 0;
  z.forEach((v, i) => { if (v > z[worst]!) worst = i; });
  return { xhat: y.map((v, k) => v - eps[k]!), eps, z, resid, chi2: resid.reduce((a, r, i) => a + r * w[i]!, 0), chi2Crit: CHI95[Math.max(1, m - excluded.length)] ?? 12.5916, worst };
}

/** The loop of L37: feed F1, reactor in F2, reactor out F3, purge F4, recycle F5. Nodes: mixer F1+F5=F2, reactor F2=F3, splitter F3=F4+F5. */
export const LOOP_A: number[][] = [[1, -1, 0, 0, 1], [0, 1, -1, 0, 0], [0, 0, 1, -1, -1]];
export const LOOP_TRUE = [100, 400, 400, 100, 300];
export const LOOP_TAGS = ['FI-101', 'FI-102', 'FI-103', 'FI-104', 'FI-105'];

/** Gross-error isolation by signature, computable from the shown node imbalances: the meter whose balance-matrix column (the nodes it sits on, with signs) lines up best with the imbalance vector (largest |cosine|). */
export function signatureMeter(A: number[][], resid: number[]): number {
  const nr = Math.hypot(...resid) || 1;
  let best = 0, bv = -1;
  for (let k = 0; k < A[0]!.length; k++) {
    const col = A.map((row) => row[k]!), nc = Math.hypot(...col) || 1, c = Math.abs(col.reduce((a, v, i) => a + v * resid[i]!, 0)) / (nc * nr);
    if (c > bv + 1e-12) { bv = c; best = k; }
  }
  return best;
}
