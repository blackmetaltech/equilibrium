// Flowsheet graph: unit registry contract, topology validation, Tarjan SCC partition, topological order, topology hash.
// Pure functions over plain data; deterministic (stable ordering by index / id), no module-level state.
import type { Pipe, UnitInst, UnitOp } from '../types';

/** What the solver needs to know about a unit type (the units lane registers the real ones). */
export interface UnitDef {
  inlets: string[];
  outlets: string[];
  fn: UnitOp;
  /** Feed-like: its (absent) inlets may stay unconnected. */
  isSource?: boolean;
  /** Product-like: its outlets may stay unconnected. */
  isSink?: boolean;
  /** Species `i` can leave the flowsheet through one of this unit's outlets (purge, separator, sink). Parameter aware. */
  exits?: (u: UnitInst, i: number) => boolean;
  /** A reaction in this unit consumes species `i`. */
  consumes?: (u: UnitInst, i: number) => boolean;
}
export type Registry = Record<string, UnitDef>;

/** Optional phase-compatibility hook (units lane): return false to veto a pipe (gas into a pump, ...). */
export type PhaseHook = (pipe: Pipe, from: UnitDef, to: UnitDef) => boolean;

export interface TopoFail { code: string; unitId?: string; data: Record<string, number | string> }

export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const key = (u: string, p: string): string => u + '\u0001' + p;

/**
 * Step 1 of DESIGN 3.6: every port connected (sources/sinks excepted), no inlet with two pipes, known units and ports.
 * Returns the first failure (in a fixed order: ports, double inlet, double outlet, open ports by unit id, phase) or null.
 */
export function validateTopology(units: UnitInst[], pipes: Pipe[], registry: Registry, phase?: PhaseHook): TopoFail | null {
  const byId = new Map<string, UnitInst>();
  for (const u of units) {
    if (!registry[u.type]) return { code: 'TOPOLOGY_UNKNOWN_UNIT', unitId: u.id, data: { type: u.type } };
    if (byId.has(u.id)) return { code: 'TOPOLOGY_DUPLICATE_UNIT', unitId: u.id, data: {} };
    byId.set(u.id, u);
  }
  const sortedPipes = pipes.slice().sort((a, b) => cmp(a.id, b.id));
  for (const p of sortedPipes) {
    const f = byId.get(p.from.unit), t = byId.get(p.to.unit);
    if (!f || !t) return { code: 'TOPOLOGY_UNKNOWN_UNIT', unitId: !f ? p.from.unit : p.to.unit, data: { pipe: p.id } };
    if (!registry[f.type]!.outlets.includes(p.from.port)) return { code: 'TOPOLOGY_UNKNOWN_PORT', unitId: f.id, data: { pipe: p.id, port: p.from.port } };
    if (!registry[t.type]!.inlets.includes(p.to.port)) return { code: 'TOPOLOGY_UNKNOWN_PORT', unitId: t.id, data: { pipe: p.id, port: p.to.port } };
  }
  const into = new Set<string>(), outOf = new Set<string>();
  for (const p of sortedPipes) {
    const ki = key(p.to.unit, p.to.port);
    if (into.has(ki)) return { code: 'TOPOLOGY_DOUBLE_INLET', unitId: p.to.unit, data: { pipe: p.id, port: p.to.port } };
    into.add(ki);
  }
  for (const p of sortedPipes) {
    const ko = key(p.from.unit, p.from.port);
    if (outOf.has(ko)) return { code: 'TOPOLOGY_DOUBLE_OUTLET', unitId: p.from.unit, data: { pipe: p.id, port: p.from.port } };
    outOf.add(ko);
  }
  for (const u of units.slice().sort((a, b) => cmp(a.id, b.id))) {
    const d = registry[u.type]!;
    if (!d.isSource) for (const port of d.inlets) if (!into.has(key(u.id, port))) return { code: 'TOPOLOGY_OPEN_PORT', unitId: u.id, data: { port, inlet: 1 } };
    if (!d.isSink) for (const port of d.outlets) if (!outOf.has(key(u.id, port))) return { code: 'TOPOLOGY_OPEN_PORT', unitId: u.id, data: { port, inlet: 0 } };
  }
  if (phase) for (const p of sortedPipes) {
    if (!phase(p, registry[byId.get(p.from.unit)!.type]!, registry[byId.get(p.to.unit)!.type]!)) {
      return { code: 'TOPOLOGY_PHASE', unitId: p.to.unit, data: { pipe: p.id, port: p.to.port } };
    }
  }
  return null;
}

/** FNV-1a over the canonical topology text, two seeds -> 16 hex chars. Params are not part of the topology. */
export function topologyHash(species: string[], units: UnitInst[], pipes: Pipe[]): string {
  const text = species.join(',') + '|' + units.map((u) => u.id + ':' + u.type).sort(cmp).join(',') + '|' +
    pipes.map((p) => `${p.id}:${p.from.unit}.${p.from.port}>${p.to.unit}.${p.to.port}`).sort(cmp).join(',');
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export interface GEdge { from: number; to: number }

/**
 * Tarjan strongly connected components (iterative). Returns the components in topological order of the condensation
 * (upstream first; ties by smallest node index), each component sorted ascending.
 */
export function tarjanScc(n: number, edges: GEdge[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) adj[e.from]!.push(e.to);
  for (const a of adj) a.sort((x, y) => x - y);
  const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), onStack = new Array<boolean>(n).fill(false);
  const comp = new Array<number>(n).fill(-1);
  const stack: number[] = [];
  const comps: number[][] = [];
  let counter = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const call: [number, number][] = [[root, 0]];
    index[root] = low[root] = counter++; stack.push(root); onStack[root] = true;
    while (call.length) {
      const top = call[call.length - 1]!;
      const v = top[0];
      if (top[1] < adj[v]!.length) {
        const w = adj[v]![top[1]++]!;
        if (index[w] === -1) { index[w] = low[w] = counter++; stack.push(w); onStack[w] = true; call.push([w, 0]); }
        else if (onStack[w]) low[v] = Math.min(low[v]!, index[w]!);
      } else {
        call.pop();
        if (call.length) { const p = call[call.length - 1]![0]; low[p] = Math.min(low[p]!, low[v]!); }
        if (low[v] === index[v]) {
          const c: number[] = [];
          let w: number;
          do { w = stack.pop()!; onStack[w] = false; comp[w] = comps.length; c.push(w); } while (w !== v);
          comps.push(c.sort((x, y) => x - y));
        }
      }
    }
  }
  // Kahn on the condensation, smallest minimum node first
  const m = comps.length;
  const succ: Set<number>[] = Array.from({ length: m }, () => new Set());
  const indeg = new Array<number>(m).fill(0);
  for (const e of edges) {
    const a = comp[e.from]!, b = comp[e.to]!;
    if (a !== b && !succ[a]!.has(b)) { succ[a]!.add(b); indeg[b]!++; }
  }
  const ready: number[] = [];
  for (let c = 0; c < m; c++) if (indeg[c] === 0) ready.push(c);
  const out: number[][] = [];
  while (ready.length) {
    let bi = 0;
    for (let i = 1; i < ready.length; i++) if (comps[ready[i]!]![0]! < comps[ready[bi]!]![0]!) bi = i;
    const c = ready.splice(bi, 1)[0]!;
    out.push(comps[c]!);
    for (const d of succ[c]!) if (--indeg[d]! === 0) ready.push(d);
  }
  return out;
}

/** Topological order (smallest ready node first) of the graph without the edges whose index is in `removed`; null if cyclic. */
export function topoOrder(n: number, edges: GEdge[], removed?: ReadonlySet<number>): number[] | null {
  const adj: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  edges.forEach((e, k) => { if (removed && removed.has(k)) return; adj[e.from]!.push(e.to); indeg[e.to]!++; });
  const ready: number[] = [];
  for (let v = 0; v < n; v++) if (indeg[v] === 0) ready.push(v);
  const out: number[] = [];
  while (ready.length) {
    let bi = 0;
    for (let i = 1; i < ready.length; i++) if (ready[i]! < ready[bi]!) bi = i;
    const v = ready.splice(bi, 1)[0]!;
    out.push(v);
    for (const w of adj[v]!) if (--indeg[w]! === 0) ready.push(w);
  }
  return out.length === n ? out : null;
}
