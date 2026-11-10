// Queries over the plant as a whole: plant, palette, kpis, runs, ledger. Read-only: nothing here mutates the state.
import type { QueryFn } from '@core/kit';
import type { EqState } from '../../state';
import { paletteOf } from '../palette';
import { ledgerOf } from '../solved';
import { defOf, hasUnitType } from '../registry';

/** Every port the pipework leaves open: { unit, port, dir: 'in' | 'out', stray } (stray: the unit has no pipe at all). The chevrons of the Plant screen and the commission message read this. */
export function openPortsOf(s: Readonly<EqState>): { unit: string; port: string; dir: 'in' | 'out'; stray: boolean }[] {
  const out: { unit: string; port: string; dir: 'in' | 'out'; stray: boolean }[] = [];
  for (const u of s.flowsheet.units) {
    if (!hasUnitType(u.type)) continue;
    const d = defOf(u.type);
    const stray = !s.flowsheet.streams.some((p) => p.from.unit === u.id || p.to.unit === u.id);
    if (!d.isSource) for (const port of d.inlets) if (!d.optionalInlets?.includes(port) && !s.flowsheet.streams.some((p) => p.to.unit === u.id && p.to.port === port)) out.push({ unit: u.id, port, dir: 'in', stray });
    if (!d.isSink) for (const port of d.outlets) if (!s.flowsheet.streams.some((p) => p.from.unit === u.id && p.from.port === port)) out.push({ unit: u.id, port, dir: 'out', stray });
  }
  return out;
}

export const plantQueries: Record<string, QueryFn<EqState>> = {
  /** The plant as the Plant screen draws it: placed units, pipes, phase, the active species, plot, undo depth and the last KPIs. */
  plant: (s) => ({
    phase: s.phase, thermoDetail: s.thermoDetail, species: s.species, units: s.flowsheet.units, streams: s.flowsheet.streams, plot: s.plot,
    kpis: s.solved?.ok ? s.solved.kpis : {}, failed: s.solved?.failedUnits ?? [], undo: { past: s.undo.past.length, future: s.undo.future.length },
  }),
  palette: (s) => paletteOf(s),
  kpis: (s) => (s.solved?.ok ? s.solved.kpis : {}),
  runs: (s) => s.runs,
  /** The campaign progress the Works Map reads: { stars: { levelId: 0-3 } } (recorded when a level is won; claimStars keeps the best). */
  progress: (s) => ({ stars: { ...s.progress.stars } }),
  openPorts: (s) => openPortsOf(s),
  ledger: (s) => ledgerOf(s),
};
