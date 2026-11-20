// Numbers the Call-it "given" lines print from the engine itself (so the line and the grade can never disagree): reaction ΔH / ΔS at the call temperature, and the
// small equilibrium tables of the adiabatic-bed calls (L13, L15). Rule code: dmath only. Tables are computed once and memoised (levelInfo runs every frame).
import { reactionOf } from '../data/reactions';
import { findLaw } from '../data/kinetics';
import { lnKOfReaction, rxnDH } from '../sim/chem/reactions';
import { solveEquilibrium } from '../sim/chem/equilibrium';
import { equilibriumStage } from '../sim/units/rx_equil';

const R = 8.314462618;
/** ΔH (kJ/mol), ΔS (J/(mol K)) and ΔG (kJ/mol) of reaction `id` at `T` K, rigorous thermo: ΔG = ΔH - TΔS reproduces the engine's K exactly. */
export function thermoAt(id: string, T: number): { dH: number; dS: number; dG: number } {
  const rx = reactionOf(id);
  const dH = rxnDH(rx.nu, T, 'rigorous') / 1000, dG = (-R * T * lnKOfReaction(rx, T, 'rigorous')) / 1000;
  return { dH, dG, dS: ((dH - dG) / T) * 1000 };
}

/** L13: bed-1 gas (10 % SO2, 11 % O2, 79 % N2 at 1.2 bar): equilibrium SO2 conversion (%) at the three temperatures of the table. */
let l13Memo: number[] | null = null;
export function l13EqTable(species: readonly string[], p: number, kmolH: number, temps: readonly number[]): number[] {
  if (l13Memo) return l13Memo;
  const n0 = species.map((id) => (id === 'SO2' ? 0.1 : id === 'O2' ? 0.11 : id === 'N2' ? 0.79 : 0) * kmolH * (1000 / 3600)), i = species.indexOf('SO2');
  l13Memo = temps.map((Tc) => {
    const r = equilibriumStage({ n: n0, T: Tc + 273.15, P: p }, { species: [...species], reactions: ['R2'], mode: 'isothermal', detail: 'rigorous' } as never);
    return r.ok ? (1 - r.value.out.n[i]! / n0[i]!) * 100 : 0;
  });
  return l13Memo;
}

/** L15: equilibrium NH3 mol % of the bed feed at 200 bar at each T (K), and the adiabatic heating per mol % of NH3 made from the inlet `Tin`. */
let l15Memo: { y: number[]; slope: number; tad: number } | null = null;
export function l15EqTable(species: readonly string[], x: Record<string, number>, kmolH: number, P: number, Tin: number, temps: readonly number[]): { y: number[]; slope: number; tad: number } {
  if (l15Memo) return l15Memo;
  const law = findLaw('K1')!, n0 = species.map((id) => (x[id] ?? 0) * kmolH), ip = species.indexOf('NH3');
  const pct = (n: readonly number[]): number => (100 * n[ip]!) / n.reduce((a, b) => a + b, 0);
  const y = temps.map((T) => { const e = solveEquilibrium({ species: [...species], P, reactions: law.reactions, detail: 'rigorous', n0, T, mode: 'isothermal' }); return e.ok ? pct(e.value.n) : 0; });
  const ad = solveEquilibrium({ species: [...species], P, reactions: law.reactions, detail: 'rigorous', n0, T: Tin, mode: 'adiabatic' });
  const tad = ad.ok ? ad.value.T : Number.NaN, slope = ad.ok ? (tad - Tin) / (pct(ad.value.n) - pct(n0)) : Number.NaN;
  l15Memo = { y, slope, tad };
  return l15Memo;
}
