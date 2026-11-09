import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { topoOrder } from './graph';
import { minTearSet, type TearEdge } from './tear';

const ring = (n: number, off = 0, tag = 'r'): TearEdge[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${tag}${off}_${i}`, from: off + i, to: off + ((i + 1) % n) }));
const acyclicAfter = (n: number, edges: TearEdge[], tears: string[]) =>
  topoOrder(n, edges.filter((e) => !tears.includes(e.id))) !== null;

// independent brute force: smallest subset by bitmask enumeration + a recursive DFS cycle test
function bruteMin(n: number, edges: TearEdge[]): number {
  const m = edges.length;
  const cyc = (mask: number): boolean => {
    const adj: number[][] = Array.from({ length: n }, () => []);
    edges.forEach((e, k) => { if (!(mask >> k & 1)) adj[e.from]!.push(e.to); });
    const col = new Array<number>(n).fill(0);
    const dfs = (v: number): boolean => {
      col[v] = 1;
      for (const w of adj[v]!) { if (col[w] === 1) return true; if (col[w] === 0 && dfs(w)) return true; }
      col[v] = 2; return false;
    };
    for (let v = 0; v < n; v++) if (col[v] === 0 && dfs(v)) return true;
    return false;
  };
  let best = m;
  for (let mask = 0; mask < (1 << m); mask++) {
    let c = 0; for (let k = 0; k < m; k++) c += mask >> k & 1;
    if (c < best && !cyc(mask)) best = c;
  }
  return best;
}

describe('minTearSet: hand-built graphs with a known minimum', () => {
  const cases: { name: string; n: number; edges: TearEdge[]; min: number }[] = [];
  for (let k = 2; k <= 10; k++) cases.push({ name: `ring ${k}`, n: k, edges: ring(k), min: 1 });
  for (let k = 1; k <= 6; k++) {
    const edges = Array.from({ length: k }, (_, i) => ({ id: `c${i}`, from: i, to: i + 1 }));
    cases.push({ name: `chain ${k}`, n: k + 1, edges, min: 0 });
  }
  cases.push({ name: 'self loop', n: 2, edges: [{ id: 'a', from: 0, to: 0 }, { id: 'b', from: 0, to: 1 }], min: 1 });
  for (let a = 2; a <= 5; a++) for (let b = 2; b <= 4; b += 2) {
    // figure eight: two rings sharing node 0 (edge-disjoint cycles: need 2)
    const e1 = ring(a, 0, 'x');
    const e2 = ring(b, 100, 'y').map((e) => ({ ...e, from: e.from === 100 ? 0 : e.from, to: e.to === 100 ? 0 : e.to }));
    const ids = new Map<number, number>(); let nxt = a;
    const re = (v: number) => (v === 0 ? 0 : v < a ? v : (ids.has(v) ? ids.get(v)! : (ids.set(v, nxt), nxt++)));
    cases.push({ name: `figure-eight ${a}+${b}`, n: a + b - 1, edges: [...e1, ...e2.map((e) => ({ ...e, from: re(e.from), to: re(e.to) }))], min: 2 });
  }
  // two rings sharing an edge: 0->1->2->0 and 0->1->3->0
  cases.push({ name: 'shared edge', n: 4, edges: [
    { id: 'a', from: 0, to: 1 }, { id: 'b', from: 1, to: 2 }, { id: 'c', from: 2, to: 0 }, { id: 'd', from: 1, to: 3 }, { id: 'e', from: 3, to: 0 }], min: 1 });
  // nested: outer 0->1->2->3->0 with an inner back edge 2->1
  cases.push({ name: 'nested', n: 4, edges: [
    { id: 'a', from: 0, to: 1 }, { id: 'b', from: 1, to: 2 }, { id: 'c', from: 2, to: 3 }, { id: 'd', from: 3, to: 0 }, { id: 'e', from: 2, to: 1 }], min: 1 });
  // doubly nested: back edges 2->1 and 3->2 inside outer 0->1->2->3->4->0
  cases.push({ name: 'nested twice', n: 5, edges: [
    { id: 'a', from: 0, to: 1 }, { id: 'b', from: 1, to: 2 }, { id: 'c', from: 2, to: 3 }, { id: 'd', from: 3, to: 4 }, { id: 'f', from: 4, to: 0 },
    { id: 'e1', from: 2, to: 1 }, { id: 'e2', from: 3, to: 2 }], min: 2 });
  // complete digraph on 3 nodes: three edge-disjoint 2-cycles
  const k3: TearEdge[] = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) k3.push({ id: `k${i}${j}`, from: i, to: j });
  cases.push({ name: 'K3', n: 3, edges: k3, min: 3 });
  // three rings in a row joined by bridges (no shared edges): 3
  cases.push({ name: 'three rings', n: 9, edges: [...ring(3, 0, 'p'), ...ring(3, 3, 'q'), ...ring(3, 6, 'w'), { id: 'b1', from: 0, to: 3 }, { id: 'b2', from: 3, to: 6 }], min: 3 });
  // ladder of two rings sharing two edges
  cases.push({ name: 'diamond ring', n: 4, edges: [
    { id: 'a', from: 0, to: 1 }, { id: 'b', from: 0, to: 2 }, { id: 'c', from: 1, to: 3 }, { id: 'd', from: 2, to: 3 }, { id: 'e', from: 3, to: 0 }], min: 1 });

  it('has 30 hand-built graphs (plus 50+ random ones below)', () => expect(cases.length).toBeGreaterThanOrEqual(30));
  for (const c of cases) {
    it(c.name, () => {
      const r = minTearSet(c.n, c.edges);
      expect(r.tears.length).toBe(c.min);
      expect(acyclicAfter(c.n, c.edges, r.tears)).toBe(true);
      expect(r.exact).toBe(true);
    });
  }
});

describe('minTearSet: random graphs vs an independent brute force', () => {
  it('50 random graphs', () => {
    const rng = new Rng(2024);
    let checked = 0, big = 0;
    for (let g = 0; g < 80 && checked < 60; g++) {
      const n = rng.int(3, 6), m = rng.int(4, 11);
      const edges: TearEdge[] = Array.from({ length: m }, (_, k) => ({ id: 'e' + String(k).padStart(2, '0'), from: rng.int(0, n - 1), to: rng.int(0, n - 1) }));
      const want = bruteMin(n, edges);
      const r = minTearSet(n, edges);
      expect(acyclicAfter(n, edges, r.tears)).toBe(true);
      if (want <= 3) { expect(r.tears.length).toBe(want); expect(r.exact).toBe(true); checked++; } else { big++; expect(r.exact).toBe(false); }
    }
    expect(checked).toBeGreaterThanOrEqual(50);
    void big;
  });
});

describe('minTearSet: tie-breaks', () => {
  it('prefers the higher score, then the smaller id, and is order independent', () => {
    const edges = ring(4).map((e, i) => ({ ...e, score: i === 2 ? 2 : 0 }));
    expect(minTearSet(4, edges).tears).toEqual(['r0_2']);
    const flat = ring(4);
    expect(minTearSet(4, flat).tears).toEqual(['r0_0']);
    expect(minTearSet(4, [...flat].reverse()).tears).toEqual(['r0_0']);
  });
  it('falls back to a valid (inexact) set past the size limit', () => {
    const edges: TearEdge[] = [];
    for (let k = 0; k < 5; k++) edges.push(...ring(2, 2 * k, 'm')); // five disjoint 2-cycles need 5 tears
    const r = minTearSet(10, edges);
    expect(r.exact).toBe(false);
    expect(r.tears.length).toBe(5);
    expect(acyclicAfter(10, edges, r.tears)).toBe(true);
  });
});
