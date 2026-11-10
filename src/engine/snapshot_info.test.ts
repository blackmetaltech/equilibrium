// The per-unit display numbers of the snapshot (what the Godot unit models read): whitelisted, finite, small.
import { describe, expect, it } from 'vitest';
import { Env, TICK } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from '../levels/registry';
import type { EqState } from '../state';
import { infoDisplay, snapshotOf } from './snapshot';

const solved = (id: string): Env<EqState> => {
  const e = new Env(GAME); e.reset({ seed: 1003, level: id, mode: 'learner' });
  const agent = SPEC_BY_ID[id]!.solver(1003);
  for (const a of agent(e.state, undefined as never)) e.step(a);
  e.step(TICK);
  return e;
};
describe('snapshot per-unit info', () => {
  it('infoDisplay keeps only whitelisted finite numbers, to 4 significant digits', () => {
    expect(infoDisplay({ tray_n: 12, tray_T0: 351.234567, junk: 5, level: Number.NaN, gas: 0.5 })).toEqual({ tray_n: 12, tray_T0: 351.2, gas: 0.5 });
    expect(infoDisplay({ junk: 1 })).toBeUndefined(); expect(infoDisplay(undefined)).toBeUndefined();
  });
  it('L23: the column carries its tray ladder and the fermenter its gas, level and T_K; the snapshot stays small', () => {
    const e = solved('L23'), snap = snapshotOf(e.state) as { units: { type: string; info?: Record<string, number> }[] };
    const col = snap.units.find((u) => u.type === 'column')!, fer = snap.units.find((u) => u.type === 'fermenter')!;
    expect(col.info!.tray_n).toBeGreaterThanOrEqual(3); expect(col.info!.tray_T0).toBeGreaterThan(340); expect(col.info!['tray_T' + (col.info!.tray_n! - 1)]).toBeGreaterThan(col.info!.tray_T0!);
    expect(fer.info!.gas).toBeGreaterThan(0); expect(fer.info!.level).toBeGreaterThan(0); expect(fer.info!.T_K).toBeCloseTo(305.15, 1);
    expect(JSON.stringify(snap).length).toBeLessThan(16000);
    for (const u of snap.units) if (u.info) for (const v of Object.values(u.info)) expect(Number.isFinite(v)).toBe(true);
  });
  it('L26: the gauze burner shows T_K for its glow', () => {
    const snap = snapshotOf(solved('L26').state) as { units: { type: string; info?: Record<string, number> }[] };
    expect(snap.units.find((u) => u.type === 'gauze_burner')!.info!.T_K).toBeGreaterThan(1100);
  });
});
