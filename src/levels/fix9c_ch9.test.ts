// F9c: L35 rack / NOT READY names / duplicate card refused; L37 one chi-square notation, reconciled "after", computable call-it; L33 budget readout.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { SPEC_BY_ID } from './registry';
import { L35_REF } from './l35';
import { LOOP_A } from '../sim/ops/recon';
import { signatureMeter } from '../sim/ops/recon';
import { en } from '../locales/en';
import type { EqState } from '../state';

function start(id: string, seed = 1003, mode = 'learner'): Env<EqState> { const env = new Env(GAME); env.reset({ seed, level: id, mode }); return env; }
const view = (e: Env<EqState>): any => e.engine.q('levelView');
const info = (e: Env<EqState>): any => e.engine.q('levelInfo');
const lact = (e: Env<EqState>, name: string, ...args: unknown[]) => e.step({ name: 'levelAct', args: [name, ...args] }).info as { ok: boolean; message: string };

describe('L35 (F9c)', () => {
  it('the view carries every card (count stated) and the rack has all of them', () => {
    const e = start('L35'); const v = view(e);
    expect(v.cards.length).toBe(v.cardCount); expect(v.cardCount).toBeGreaterThanOrEqual(8);
  });
  it('NOT READY names what is missing, per requirement, and the verdict repeats it', () => {
    const e = start('L35');
    for (const id of ['cool_on', 'flare_on', 'purge', 'circ_on', 'press_test', 'heat_slow']) lact(e, 'add', id);
    const v = view(e);
    expect(v.ready).toBe(false);
    expect(v.missing.length).toBe(2);
    expect(v.missing.join(' ')).toMatch(/Introduce hydrogen/); expect(v.missing.join(' ')).toMatch(/Pressurise to full loop pressure/);
    expect(v.missing[0]).toMatch(/^add "/);
  });
  it('a card that is in the sequence but ineffective is named as such', () => {
    const e = start('L35');
    for (const id of ['cool_on', 'flare_on', 'purge', 'circ_on', 'press_full', 'press_test', 'heat_slow', 'intro_h2']) lact(e, 'add', id);
    expect(view(e).missing.join(' ')).toMatch(/is in the sequence but its effect is lost/);
  });
  it('a complete procedure has nothing missing', () => {
    const e = start('L35'); for (const id of L35_REF) lact(e, 'add', id);
    expect(view(e).missing).toEqual([]); expect(view(e).ready).toBe(true);
  });
  it('adding a duplicate card is refused with the card name, not the key', () => {
    const e = start('L35'); expect(lact(e, 'add', 'heat_slow').ok).toBe(true);
    const r = lact(e, 'add', 'heat_slow'); expect(r.ok).toBe(false); expect(r.message).toContain('Heat at 50 K/h'); expect(r.message).toContain('already');
    expect(view(e).order.length).toBe(1);
  });
});

describe('L37 (F9c)', () => {
  it('one chi-square notation: 7.81 raw, 5.99 after a meter is out, and the line says the degrees of freedom drop', () => {
    const e = start('L37'); lact(e, 'reconcile');
    const v0 = view(e);
    expect(v0.chi2CritRaw.toFixed(2)).toBe('7.81'); expect(v0.chi2Note).toContain('7.81'); expect(v0.chi2Note).toContain('5.99'); expect(v0.chi2Note).toMatch(/degrees of freedom/);
    expect(info(e).goals.find((g: any) => g.key === 'closed').text).toContain('7.81');
    lact(e, 'flag', 1);
    const v1 = view(e);
    expect(v1.chi2Crit.toFixed(2)).toBe('5.99'); expect(v1.chi2Note).toMatch(/3 → 2/);
    expect(info(e).goals.find((g: any) => g.key === 'closed').text).toContain('5.99');
    expect(JSON.stringify(en)).not.toContain('7.82');
  });
  it('the "after" imbalance is the reconciled flows (zero), not the raw readings', () => {
    const e = start('L37'); lact(e, 'reconcile'); lact(e, 'flag', 1);
    const v = view(e);
    for (const n of v.nodes) expect(Math.abs(n.imbalanceAfter)).toBeLessThan(1e-6);
    expect(v.nodes.some((n: any) => Math.abs(n.imbalance) > 1)).toBe(true);
    expect(v.nodes[2].imbalanceAfter).toBe(0);
  });
  it('the call-it is computable from the shown node imbalances (signature match) and equals the drifting meter on 60 seeds in both modes', () => {
    for (const mode of ['learner', 'engineer']) for (let seed = 1; seed <= 60; seed++) {
      const e = start('L37', seed, mode), v = view(e);
      const sig = signatureMeter(LOOP_A, v.nodes.map((n: any) => n.imbalance)) + 1;
      expect(sig, `${mode}/${seed}`).toBe(2);
      expect(SPEC_BY_ID.L37!.callIt!.truth(e.state, SPEC_BY_ID.L37!.measures(e.state))).toBe(sig);
    }
    const v = view(start('L37')); expect(v.meters[1].onNodes).toEqual(['N1', 'N2']);
    expect(en['lv.L37.note.2']).not.toMatch(/before you look/);
  });
});

describe('L33 (F9c)', () => {
  it('the budget goal reads 0 (not "-") before anything is bought, like the notebook', () => {
    const e = start('L33', 1003, 'engineer');
    const g = info(e).goals.find((x: any) => x.key === 'budget');
    expect(g.text).not.toContain('spent -'); expect(g.text).toMatch(/spent 0/);
    expect(info(e).spentUSD).toBe(0);
  });
});
