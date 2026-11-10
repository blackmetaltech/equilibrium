// Queries over the plant as a whole: plant, palette, kpis, runs, ledger. Read-only: nothing here mutates the state.
import type { QueryFn } from '@core/kit';
import type { EqState } from '../../state';
import { paletteOf } from '../palette';
import { ledgerOf } from '../solved';

export const plantQueries: Record<string, QueryFn<EqState>> = {
  /** The plant as the Plant screen draws it: placed units, pipes, phase, the active species, plot, undo depth and the last KPIs. */
  plant: (s) => ({
    phase: s.phase, thermoDetail: s.thermoDetail, species: s.species, units: s.flowsheet.units, streams: s.flowsheet.streams, plot: s.plot,
    kpis: s.solved?.ok ? s.solved.kpis : {}, failed: s.solved?.failedUnits ?? [], undo: { past: s.undo.past.length, future: s.undo.future.length },
  }),
  palette: (s) => paletteOf(s),
  kpis: (s) => (s.solved?.ok ? s.solved.kpis : {}),
  runs: (s) => s.runs,
  ledger: (s) => ledgerOf(s),
};
