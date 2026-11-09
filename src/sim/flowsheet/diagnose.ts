// Loop failure diagnosis (DESIGN 3.6 step 7) from a short direct-substitution probe of the tear inventories.
// `seq[k][i]` = total flow (mol/s) of species i in the tear streams at probe pass k (direct substitution only, so
// consecutive increments of a linear loop form a geometric series with ratio = the loop gain of that mode).
export interface LoopDiagnosis { code: string; species?: string; data: Record<string, number | string> }
export interface ClassifyOptions {
  /** species not consumed by any reaction of the loop: preferred when naming the accumulating species. */
  prefer?: boolean[];
}

export const NEAR_ONE = 1 - 1e-3;

export function classifyLoop(species: string[], seq: number[][], opts: ClassifyOptions = {}): LoopDiagnosis {
  const S = species.length, L = seq.length;
  const last = seq[L - 1] ?? new Array<number>(S).fill(0);
  const scale = Math.max(last.reduce((a, b) => a + Math.abs(b), 0), 1e-30);
  const fallback = (): LoopDiagnosis => ({ code: 'ACCUMULATION', species: species[0], data: { species: species[0] ?? '', gain: 0, extrapolated: 0, inventory: last[0] ?? 0 } });
  if (L < 3) return fallback();
  const d: number[][] = [];
  for (let k = 0; k < L - 1; k++) d.push(seq[k + 1]!.map((v, i) => v - seq[k]![i]!));
  const W = Math.min(8, d.length - 1);
  const rho: number[] = [], sig: boolean[] = [], dl: number[] = [];
  for (let i = 0; i < S; i++) {
    let num = 0, den = 0;
    for (let k = d.length - 1 - W; k < d.length - 1; k++) { num += d[k + 1]![i]! * d[k]![i]!; den += d[k]![i]! * d[k]![i]!; }
    rho.push(den > 0 ? num / den : 0);
    const dLast = d[d.length - 1]![i]!, dPrev = d[d.length - 2]![i]!;
    dl.push(dLast);
    sig.push(Math.max(Math.abs(dLast), Math.abs(dPrev)) > 1e-8 * scale);
  }
  // oscillation: a significant mode with a strongly negative ratio
  let oi = -1;
  for (let i = 0; i < S; i++) if (sig[i] && rho[i]! <= -0.5 && (oi < 0 || Math.abs(dl[i]!) > Math.abs(dl[oi]!))) oi = i;
  if (oi >= 0) return { code: 'LOOP_OSCILLATING', species: species[oi], data: { species: species[oi]!, ratio: rho[oi]!, amplitude: Math.abs(dl[oi]!) } };

  const grow: number[] = [];
  for (let i = 0; i < S; i++) if (sig[i] && rho[i]! > 0 && dl[i]! > 0) grow.push(i);
  if (!grow.length) {
    // nothing grows and nothing alternates: report the slowest settling species as a (finite) accumulation
    let bi = 0;
    for (let i = 1; i < S; i++) if (Math.abs(dl[i]!) > Math.abs(dl[bi]!)) bi = i;
    const g = Math.min(Math.max(rho[bi]!, 0), NEAR_ONE);
    return { code: 'ACCUMULATION', species: species[bi], data: { species: species[bi]!, gain: g, extrapolated: Math.max(last[bi]!, 0) / scale, inventory: last[bi]! } };
  }
  let gmax = 0;
  for (const i of grow) gmax = Math.max(gmax, rho[i]!);
  const present: number[] = [];
  for (let i = 0; i < S; i++) if (Math.abs(last[i]!) > 1e-9 * scale) present.push(i);
  if (gmax >= NEAR_ONE) {
    if (present.every((i) => grow.includes(i))) return { code: 'LOOP_GAIN_GE_1', data: { gain: gmax } };
    let bi = grow[0]!;
    for (const i of grow) if (rho[i]! > rho[bi]!) bi = i;
    return { code: 'ACCUMULATION', species: species[bi], data: { species: species[bi]!, gain: gmax, extrapolated: 1, inventory: last[bi]! } };
  }
  // geometric tail: a_inf = a_last + d_prev * rho / (1 - rho) for every settling mode
  const ainf = last.map((a, i) => {
    const r = rho[i]!;
    return r > 0 && r < NEAR_ONE && sig[i] ? a + d[d.length - 1]![i]! * r / (1 - r) : a;
  });
  const tot = Math.max(ainf.reduce((a, b) => a + Math.max(b, 0), 0), 1e-30);
  let maxRel = 0;
  const rel = ainf.map((a, i) => (grow.includes(i) ? Math.max(a - last[i]!, 0) / Math.max(a, 1e-30) : 0));
  for (const v of rel) maxRel = Math.max(maxRel, v);
  let bi = -1;
  for (const i of grow) {
    if (rel[i]! < 0.5 * maxRel) continue;
    const better = bi < 0 ||
      (!!opts.prefer?.[i] && !opts.prefer?.[bi]) ||
      (!!opts.prefer?.[i] === !!opts.prefer?.[bi] && rel[i]! > rel[bi]!);
    if (better) bi = i;
  }
  return { code: 'ACCUMULATION', species: species[bi], data: { species: species[bi]!, gain: rho[bi]!, extrapolated: Math.max(ainf[bi]!, 0) / tot, inventory: ainf[bi]! } };
}
