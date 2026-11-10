// Plot-oriented queries: eqWindow(unitId) (delegates to the equilibrium solver's eqCurve when a reactor unit asks for a reaction), lens(id, n)
// (molecule counts by largest remainder), loopHistory() (tear snapshots for the loop-filling animation: re-solved here, never stored).
import { fail } from '@core/kit';
import type { QueryFn } from '@core/kit';
import { eqCurve } from '../../sim/chem';
import { solveFlowsheet } from '../../sim/flowsheet';
import { moleFractions } from '../../sim/thermo';
import { t } from '../../i18n';
import type { EqState } from '../../state';
import { unitsForSolve } from '../actions/run';
import { bindRegistry, phaseHook } from '../registry';
import { ctxOf, largestRemainder, plumbing, speciesName } from '../solved';
import { colourOf } from './stream';

const T_GRID_N = 120;

export const plotQueries: Record<string, QueryFn<EqState>> = {
  /** X_eq(T) for a reactor unit that names a reaction (`params.reaction`), else { window: null, reason }. */
  eqWindow: (s, unitId: unknown) => {
    const u = s.flowsheet.units.find((x) => x.id === unitId);
    if (!u) fail(t('err.unit.unknown', { id: String(unitId) }));
    const rxn = u.params.reaction;
    if (typeof rxn !== 'string' || rxn === '') return { window: null, reason: 'NO_REACTOR' };
    const inId = plumbing(s).inPipe(u.id, 'in');
    const st = inId ? s.solved?.streams[inId] : undefined;
    if (!st) return { window: null, reason: 'NOT_SOLVED' };
    const T0 = typeof u.params.T === 'number' ? u.params.T : st.T;
    const grid = Array.from({ length: T_GRID_N }, (_, i) => 300 + (i * (1000 - 300)) / (T_GRID_N - 1));
    const r = eqCurve({ species: s.species, n0: st.n, P: st.P, reactions: rxn.split(','), detail: s.thermoDetail }, grid);
    if (!r.ok) return { window: null, reason: r.code };
    return { window: { T: r.value.T, X: r.value.X, ref: r.value.ref }, point: { T: T0 }, reason: null };
  },
  /** `n` molecules drawn from a stream's composition (or, for a unit id, its inlet streams / a feed's outlet); counts sum to n exactly. */
  lens: (s, id: unknown, n: unknown) => {
    const k = typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 10000 ? n : 100;
    const sol = s.solved;
    let flows: number[] | null = null;
    if (sol?.ok) {
      if (typeof id === 'string' && sol.streams[id]) flows = sol.streams[id]!.n.slice();
      else if (s.flowsheet.units.some((u) => u.id === id)) {
        const u = s.flowsheet.units.find((x) => x.id === id)!;
        const pipes = s.flowsheet.streams.filter((p) => (u.type === 'feed' ? p.from.unit === u.id : p.to.unit === u.id));
        flows = s.species.map((_, i) => pipes.reduce((a, p) => a + (sol.streams[p.id]?.n[i] ?? 0), 0));
      }
    }
    if (!flows) fail(t('err.stream.unknown', { id: String(id) }));
    const x = moleFractions(flows);
    const counts = largestRemainder(x, k);
    return { id, n: k, counts: s.species.map((sp, i) => ({ id: sp, name: speciesName(sp), colour: colourOf(sp), count: counts[i]! })) };
  },
  loopHistory: (s) => {
    if (!s.species.length || !s.flowsheet.units.length) return { ok: false, history: [] };
    const r = solveFlowsheet({ species: s.species, units: unitsForSolve(s), pipes: s.flowsheet.streams, registry: bindRegistry(s.species), ctx: ctxOf(s), options: { phaseOk: phaseHook } });
    if (!r.ok) return { ok: false, code: r.code, history: [] };
    return { ok: true, method: r.value.method, tears: r.value.tears, history: r.value.history };
  },
};
