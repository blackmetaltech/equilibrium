import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { tarjanScc, topoOrder, topologyHash, validateTopology } from './graph';
import { PP, TEST_REGISTRY, U } from './testunits';

const E = (pairs: [number, number][]) => pairs.map(([from, to]) => ({ from, to }));

describe('tarjanScc', () => {
  it('splits two cycles joined by a bridge, upstream first', () => {
    const s = tarjanScc(5, E([[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 3]]));
    expect(s).toEqual([[0, 1, 2], [3, 4]]);
  });
  it('a chain gives singleton components in topological order', () => {
    expect(tarjanScc(4, E([[2, 3], [1, 2], [0, 1]]))).toEqual([[0], [1], [2], [3]]);
  });
  it('a figure eight is one component', () => {
    expect(tarjanScc(5, E([[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 2]]))).toEqual([[0, 1, 2, 3, 4]]);
  });
  it('isolated nodes and a self loop', () => {
    expect(tarjanScc(3, E([[1, 1]]))).toEqual([[0], [1], [2]]);
  });
  it('every edge goes forward between components (random graphs)', () => {
    const r = new Rng(7);
    for (let g = 0; g < 200; g++) {
      const n = r.int(1, 12);
      const edges = Array.from({ length: r.int(0, 25) }, () => ({ from: r.int(0, n - 1), to: r.int(0, n - 1) }));
      const sccs = tarjanScc(n, edges);
      const comp = new Array<number>(n).fill(-1);
      sccs.forEach((c, k) => c.forEach((v) => { expect(comp[v]).toBe(-1); comp[v] = k; }));
      expect(comp.every((c) => c >= 0)).toBe(true);
      for (const e of edges) expect(comp[e.from]!).toBeLessThanOrEqual(comp[e.to]!);
      // brute-force mutual reachability agrees with the partition
      const reach = (a: number): boolean[] => {
        const seen = new Array<boolean>(n).fill(false); const st = [a]; seen[a] = true;
        while (st.length) { const v = st.pop()!; for (const e of edges) if (e.from === v && !seen[e.to]) { seen[e.to] = true; st.push(e.to); } }
        return seen;
      };
      const R = Array.from({ length: n }, (_, a) => reach(a));
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) expect(comp[a] === comp[b]).toBe(R[a]![b]! && R[b]![a]!);
    }
  });
});

describe('topoOrder', () => {
  it('orders a DAG and is null on a cycle', () => {
    expect(topoOrder(3, E([[0, 1], [1, 2]]))).toEqual([0, 1, 2]);
    expect(topoOrder(3, E([[0, 1], [1, 2], [2, 0]]))).toBeNull();
    expect(topoOrder(3, E([[0, 1], [1, 2], [2, 0]]), new Set([2]))).toEqual([0, 1, 2]);
  });
});

describe('validateTopology', () => {
  const base = () => ({
    units: [U('F', 'feed'), U('M', 'mix2'), U('P', 'product')],
    pipes: [PP('a', 'F.out', 'M.in1'), PP('b', 'M.out', 'P.in')],
  });
  it('open inlet and open outlet name the unit and port', () => {
    const { units, pipes } = base();
    const r = validateTopology(units, pipes, TEST_REGISTRY)!;
    expect(r.code).toBe('TOPOLOGY_OPEN_PORT');
    expect(r.unitId).toBe('M');
    expect(r.data.port).toBe('in2');
    const r2 = validateTopology(units, [pipes[0]!], TEST_REGISTRY)!;
    expect(r2.code).toBe('TOPOLOGY_OPEN_PORT');
  });
  it('double inlet, unknown unit, unknown port', () => {
    const { units, pipes } = base();
    const f2 = [...units, U('F2', 'feed')];
    const dbl = [...pipes, PP('c', 'F2.out', 'M.in1'), PP('d', 'F2.out', 'M.in2')];
    expect(validateTopology(f2, dbl, TEST_REGISTRY)!.code).toBe('TOPOLOGY_DOUBLE_INLET');
    expect(validateTopology([...units, U('Q', 'nosuch')], pipes, TEST_REGISTRY)!.code).toBe('TOPOLOGY_UNKNOWN_UNIT');
    expect(validateTopology(units, [...pipes, PP('z', 'M.nope', 'P.in')], TEST_REGISTRY)!.code).toBe('TOPOLOGY_UNKNOWN_PORT');
    expect(validateTopology(units, [PP('z', 'GHOST.out', 'P.in')], TEST_REGISTRY)!.code).toBe('TOPOLOGY_UNKNOWN_UNIT');
  });
  it('a complete flowsheet validates; phase hook can veto a pipe', () => {
    const { units, pipes } = base();
    pipes.push(PP('c', 'F.out', 'M.in2'));
    units.push(U('F3', 'feed'));
    // F.out used twice as an outlet is a duplicate outlet
    expect(validateTopology(units, pipes, TEST_REGISTRY)!.code).toBe('TOPOLOGY_DOUBLE_OUTLET');
    const ok = { units: [U('F', 'feed'), U('P', 'product')], pipes: [PP('a', 'F.out', 'P.in')] };
    expect(validateTopology(ok.units, ok.pipes, TEST_REGISTRY)).toBeNull();
    const veto = validateTopology(ok.units, ok.pipes, TEST_REGISTRY, () => false)!;
    expect(veto.code).toBe('TOPOLOGY_PHASE');
  });
});

describe('topologyHash', () => {
  it('ignores params and order, changes with topology', () => {
    const a = { units: [U('F', 'feed', { x: 1 }), U('P', 'product')], pipes: [PP('a', 'F.out', 'P.in')] };
    const b = { units: [U('P', 'product'), U('F', 'feed', { x: 2 })], pipes: [PP('a', 'F.out', 'P.in')] };
    expect(topologyHash(['A'], a.units, a.pipes)).toBe(topologyHash(['A'], b.units, b.pipes));
    expect(topologyHash(['A', 'B'], a.units, a.pipes)).not.toBe(topologyHash(['A'], a.units, a.pipes));
    expect(topologyHash(['A'], a.units, [PP('b', 'F.out', 'P.in')])).not.toBe(topologyHash(['A'], a.units, a.pipes));
  });
});
