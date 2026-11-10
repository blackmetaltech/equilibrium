// Turnaround planning (DEPTH Ch 9, L38): critical path method and a resource-levelled schedule (serial schedule generation in the player's priority order; integer days).
export interface Job { id: string; days: number; deps: string[]; crew: number; crane: number }
export interface Cpm { es: Record<string, number>; ef: Record<string, number>; ls: Record<string, number>; lf: Record<string, number>; float: Record<string, number>; critical: string[]; length: number }

/** Forward / backward pass. Jobs may be listed in any order (they are sorted topologically here). */
export function cpm(jobs: Job[]): Cpm {
  const done = new Set<string>(), order: Job[] = [];
  while (order.length < jobs.length) {
    const n = jobs.find((j) => !done.has(j.id) && j.deps.every((d) => done.has(d)));
    if (!n) throw new Error('cycle');
    order.push(n); done.add(n.id);
  }
  const es: Record<string, number> = {}, ef: Record<string, number> = {}, ls: Record<string, number> = {}, lf: Record<string, number> = {}, float: Record<string, number> = {};
  for (const j of order) { es[j.id] = Math.max(0, ...j.deps.map((d) => ef[d]!)); ef[j.id] = es[j.id]! + j.days; }
  const length = Math.max(...Object.values(ef));
  for (const j of [...order].reverse()) {
    const succ = jobs.filter((q) => q.deps.includes(j.id));
    lf[j.id] = succ.length === 0 ? length : Math.min(...succ.map((q) => ls[q.id]!));
    ls[j.id] = lf[j.id]! - j.days; float[j.id] = ls[j.id]! - es[j.id]!;
  }
  return { es, ef, ls, lf, float, critical: order.filter((j) => float[j.id] === 0).map((j) => j.id), length };
}

export interface Limits { crew: number; crane: number }
export interface Sched { start: Record<string, number>; finish: Record<string, number>; makespan: number; feasible: boolean }
/** Serial SGS: take the first job of `priority` whose predecessors are placed and start it at the earliest day the crews and cranes allow for its whole duration. */
export function schedule(jobs: Job[], priority: string[], lim: Limits): Sched {
  const rest = [...priority.filter((id) => jobs.some((j) => j.id === id)), ...jobs.map((j) => j.id).filter((id) => !priority.includes(id))];
  const start: Record<string, number> = {}, finish: Record<string, number> = {};
  const crew: number[] = [], crane: number[] = [];
  const horizon = 400;
  while (rest.length > 0) {
    const k = rest.findIndex((id) => jobs.find((j) => j.id === id)!.deps.every((d) => finish[d] !== undefined));
    if (k < 0) return { start, finish, makespan: horizon, feasible: false };
    const j = jobs.find((q) => q.id === rest[k]!)!; rest.splice(k, 1);
    if (j.crew > lim.crew || j.crane > lim.crane) return { start, finish, makespan: horizon, feasible: false };
    let t = Math.max(0, ...j.deps.map((d) => finish[d]!));
    for (;; t++) {
      let ok = true;
      for (let d = t; d < t + j.days && ok; d++) if ((crew[d] ?? 0) + j.crew > lim.crew || (crane[d] ?? 0) + j.crane > lim.crane) ok = false;
      if (ok) break;
    }
    for (let d = t; d < t + j.days; d++) { crew[d] = (crew[d] ?? 0) + j.crew; crane[d] = (crane[d] ?? 0) + j.crane; }
    start[j.id] = t; finish[j.id] = t + j.days;
  }
  return { start, finish, makespan: Math.max(0, ...Object.values(finish)), feasible: true };
}
/** Critical chain of a levelled schedule: back from the last finish, the predecessor (a dependency first, else any job) that ends exactly when this one starts. */
export function levelledCritical(jobs: Job[], s: Sched): string[] {
  const out: string[] = [];
  let cur: Job | undefined = jobs.find((j) => s.finish[j.id] === s.makespan);
  while (cur !== undefined) {
    out.unshift(cur.id);
    const st: number = s.start[cur.id]!, me: Job = cur;
    cur = st === 0 ? undefined : (me.deps.map((d) => jobs.find((j) => j.id === d)!).find((j) => s.finish[j.id] === st) ?? jobs.find((j) => j.id !== me.id && s.finish[j.id] === st));
  }
  return out;
}
