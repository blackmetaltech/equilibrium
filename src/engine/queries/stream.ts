// stream(id) and streamTable(opts): the numbers behind a pipe. Flows are SI (mol/s, kg/s, K, Pa); species colours come from the species DB.
import { fail } from '@core/kit';
import type { QueryFn } from '@core/kit';
import { SPECIES } from '../../data/species';
import { moleFractions, totalFlow } from '../../sim/thermo';
import { massOf } from '../solved';
import type { StreamState } from '../../sim/types';
import { t } from '../../i18n';
import type { EqState } from '../../state';

export const colourOf = (id: string): string => SPECIES[id]?.colour ?? '#888888';

/** Top-3 species of a stream by mole fraction (ties by species order), zero fractions left out. */
export function top3(species: string[], st: StreamState): { id: string; name: string; x: number; colour: string }[] {
  const x = moleFractions(st.n);
  return x.map((v, i) => ({ i, v })).filter((e) => e.v > 0).sort((a, b) => b.v - a.v || a.i - b.i).slice(0, 3)
    .map((e) => ({ id: species[e.i]!, name: SPECIES[species[e.i]!]?.name ?? species[e.i]!, x: e.v, colour: colourOf(species[e.i]!) }));
}

function row(s: Readonly<EqState>, id: string, st: StreamState, full: boolean) {
  const p = s.flowsheet.streams.find((q) => q.id === id)!;
  const base = { id, from: p.from, to: p.to, flow: totalFlow(st.n), mass: massOf(s.species, st), T: st.T, P: st.P, top: top3(s.species, st) };
  if (!full) return base;
  const x = moleFractions(st.n);
  return { ...base, species: s.species.map((sp, i) => ({ id: sp, name: SPECIES[sp]?.name ?? sp, n: st.n[i]!, x: x[i]!, colour: colourOf(sp) })) };
}

export const streamQueries: Record<string, QueryFn<EqState>> = {
  stream: (s, id: unknown) => {
    const st = typeof id === 'string' ? s.solved?.streams[id] : undefined;
    if (!st) fail(t('err.stream.unknown', { id: String(id) }));
    return row(s, id as string, st, true);
  },
  /** All solved streams (optionally only `opts.ids`); a plant that is not solved has an empty table. */
  streamTable: (s, opts: unknown) => {
    const ids = (opts as { ids?: string[] } | undefined)?.ids;
    const sol = s.solved;
    if (!sol?.ok) return { ok: false, rows: [] };
    const rows = s.flowsheet.streams.filter((p) => sol.streams[p.id] && (!ids || ids.includes(p.id))).map((p) => row(s, p.id, sol.streams[p.id]!, false));
    return { ok: true, rows };
  },
};
