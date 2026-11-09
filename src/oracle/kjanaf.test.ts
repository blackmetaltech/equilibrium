// DESIGN 9.2.2: K(T) of the engine against the NIST-JANAF log Kf tables (fixture written by scripts/port-thermo.py
// from docs/research/janaf/*.html): R1, R2, R5, R6, R8, R9, 298-1000 K, log10 K within 0.5 % (relative to |log10 K|, with a
// 0.005 floor where log10 K crosses zero, where a relative band has no meaning).
import { describe, expect, it } from 'vitest';
import fx from './fixtures/janaf.json';
import { lnKeq } from '../sim/chem';
import { dmath } from '@core/numerics';
import { reactionOf } from '../data/reactions';

interface Row { T: number; log10K_janaf: number; how: string }
interface Rx { id: string; name: string; nu: Record<string, number>; rows: Row[] }
const rxs = fx.reactions as unknown as Rx[];

describe('K(T) vs NIST-JANAF log Kf (+-0.5 %)', () => {
  it('fixture holds R1, R2, R5, R6, R8, R9', () => {
    expect(rxs.map((r) => r.id)).toEqual(['R1', 'R2', 'R5', 'R6', 'R8', 'R9']);
  });
  for (const r of rxs) {
    for (const row of r.rows) {
      it(`${r.id} ${r.name} at ${row.T} K (${row.how})`, () => {
        const got = lnKeq(r.nu, row.T, 'rigorous') / dmath.log(10);
        const tol = Math.max(0.005 * Math.abs(row.log10K_janaf), 0.005);
        expect(Math.abs(got - row.log10K_janaf), `log10K got ${got}, JANAF ${row.log10K_janaf}`).toBeLessThanOrEqual(tol);
      });
    }
  }
  it('the catalogue R2 (half form) has exactly half the log K of the fixture R2 (full form)', () => {
    const full = rxs.find((r) => r.id === 'R2')!;
    for (const row of full.rows) expect(lnKeq(reactionOf('R2').nu, row.T, 'rigorous') * 2 / dmath.log(10)).toBeCloseTo(lnKeq(full.nu, row.T, 'rigorous') / dmath.log(10), 10);
  });
  it('catalogue R1, R5, R6, R8, R9 stoichiometry equals the fixture stoichiometry', () => {
    for (const r of rxs) if (r.id !== 'R2') expect(reactionOf(r.id).nu).toEqual(r.nu);
  });
});
