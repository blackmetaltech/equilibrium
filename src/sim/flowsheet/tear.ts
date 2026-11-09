// Tear-stream selection (DESIGN 3.6 step 3): the smallest set of streams whose removal makes a graph acyclic.
// Enumerates subsets of size 1..maxSize per strongly connected component; ties prefer higher `score`
// (the solver scores "leaves a splitter, enters a mixer" streams), then the lexicographically smallest id list.
import { tarjanScc } from './graph';

export interface TearEdge { id: string; from: number; to: number; score?: number }
export interface TearSelection {
  tears: string[];
  /** True when every component was solved by exhaustive enumeration and the total fits within maxSize. */
  exact: boolean;
}

/** Kahn acyclicity test on local arrays; `skip[k] = 1` removes edge k. */
function acyclic(n: number, from: Int32Array, to: Int32Array, skip: Uint8Array, indeg: Int32Array, stack: Int32Array, head: Int32Array,
  next: Int32Array): boolean {
  indeg.fill(0, 0, n);
  const m = from.length;
  for (let k = 0; k < m; k++) if (!skip[k]) indeg[to[k]!]!++;
  let sp = 0;
  for (let v = 0; v < n; v++) if (indeg[v] === 0) stack[sp++] = v;
  let seen = 0;
  while (sp) {
    const v = stack[--sp]!;
    seen++;
    for (let k = head[v]!; k !== -1; k = next[k]!) if (!skip[k]) { if (--indeg[to[k]!]! === 0) stack[sp++] = to[k]!; }
  }
  return seen === n;
}

function solveComponent(n: number, edges: TearEdge[], maxSize: number): { tears: TearEdge[]; exact: boolean } {
  const m = edges.length;
  const from = Int32Array.from(edges.map((e) => e.from)), to = Int32Array.from(edges.map((e) => e.to));
  const head = new Int32Array(n).fill(-1), next = new Int32Array(m).fill(-1);
  for (let k = m - 1; k >= 0; k--) { next[k] = head[from[k]!]!; head[from[k]!] = k; }
  const skip = new Uint8Array(m), indeg = new Int32Array(n), stack = new Int32Array(n + 1);
  const test = () => acyclic(n, from, to, skip, indeg, stack, head, next);
  const score = edges.map((e) => e.score ?? 0);
  for (let size = 1; size <= Math.min(maxSize, m); size++) {
    let best: number[] | null = null, bestScore = -Infinity;
    const pick: number[] = [];
    const rec = (start: number, left: number, sc: number) => {
      if (left === 0) {
        if (sc > bestScore && test()) { bestScore = sc; best = pick.slice(); }
        return;
      }
      for (let k = start; k <= m - left; k++) {
        skip[k] = 1; pick.push(k);
        rec(k + 1, left - 1, sc + score[k]!);
        pick.pop(); skip[k] = 0;
      }
    };
    rec(0, size, 0);
    if (best) return { tears: (best as number[]).map((k) => edges[k]!), exact: true };
  }
  // greedy fallback: break one cycle edge at a time (the one leaving the fewest cyclic edges), then drop redundant tears
  const torn: number[] = [];
  for (let guard = 0; guard < m; guard++) {
    if (test()) break;
    let bestK = -1, bestLeft = Infinity;
    for (let k = 0; k < m; k++) {
      if (skip[k]) continue;
      skip[k] = 1;
      const sub: { from: number; to: number }[] = [];
      for (let q = 0; q < m; q++) if (!skip[q]) sub.push({ from: from[q]!, to: to[q]! });
      let left = 0;
      for (const c of tarjanScc(n, sub)) if (c.length > 1) left += c.length;
      for (const e of sub) if (e.from === e.to) left++;
      skip[k] = 0;
      if (left < bestLeft || (left === bestLeft && score[k]! > score[bestK]!)) { bestLeft = left; bestK = k; }
    }
    skip[bestK] = 1; torn.push(bestK);
  }
  for (const k of torn.slice()) { skip[k] = 0; if (!test()) skip[k] = 1; else torn.splice(torn.indexOf(k), 1); }
  return { tears: torn.sort((a, b) => a - b).map((k) => edges[k]!), exact: false };
}

/**
 * Minimum feedback edge set. Edges may be given in any order (they are sorted by id). Self loops are always torn.
 * Components are independent, so the result is the union of per-component optima.
 */
export function minTearSet(n: number, edgesIn: TearEdge[], maxSize = 3): TearSelection {
  const edges = edgesIn.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tears: TearEdge[] = edges.filter((e) => e.from === e.to);
  const rest = edges.filter((e) => e.from !== e.to);
  const comps = tarjanScc(n, rest);
  let exact = true;
  for (const c of comps) {
    if (c.length < 2) continue;
    const local = new Map<number, number>(c.map((v, i) => [v, i]));
    const inner = rest.filter((e) => local.has(e.from) && local.has(e.to)).map((e) => ({ ...e, from: local.get(e.from)!, to: local.get(e.to)! }));
    const r = solveComponent(c.length, inner, maxSize);
    if (!r.exact) exact = false;
    for (const t of r.tears) tears.push(edges.find((e) => e.id === t.id)!);
  }
  if (tears.length > maxSize) exact = false;
  return { tears: tears.map((t) => t.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), exact };
}
