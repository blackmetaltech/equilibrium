// Call-it honesty: before the prediction is locked (or the run is over) no text the player can read may carry the number the Call-it asks for.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import { SPECS } from './registry';
import type { EqState } from '../state';

const forms = (x: number): string[] => {
  const out = new Set<string>();
  for (const sig of [3, 4]) { const n = Number(x.toPrecision(sig)); out.add(String(n)); }
  return [...out].filter((f) => f.replace(/[^0-9]/g, '').length >= 3);
};
const has = (text: string, f: string): boolean => new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}($|[^0-9])`).test(text);

describe('Call-it leaks', () => {
  for (const spec of SPECS) {
    const items = spec.callIts && spec.callIts.length > 0 ? spec.callIts : spec.callIt ? [spec.callIt] : [];
    if (items.length === 0) continue;
    it(`${spec.id}: nothing readable before the answer carries a Call-it truth`, () => {
      for (const mode of ['learner', 'engineer']) {
        const e = new Env(GAME); e.reset({ seed: 1003, level: spec.id, mode });
        const s = e.state as EqState;
        const m = spec.measures(s);
        const info = e.engine.q('levelInfo') as any;
        const texts: string[] = [info.title, info.place, ...info.note, ...info.goals.map((g: any) => g.text + ' ' + (g.readout ?? '')), ...info.stars.rules, info.lesson, info.runLine ?? '', info.notice?.text ?? ''];
        // coach steps after the commission step only show once the run is in (the Call-it is closed by then)
        const pre = new Set<string>(); for (const st of spec.coach) { pre.add(st.id); if (st.focus === 'key') break; }
        for (const k of Object.keys(en)) if ((k.startsWith(`lv.${spec.id}.coach.`) && pre.has(k.split('.')[3]!)) || k.startsWith(`lv.${spec.id}.note.`) || k.startsWith(`lv.${spec.id}.callit`) || k.startsWith(`lv.${spec.id}.hero`) || k.startsWith(`lv.${spec.id}.sec`)) texts.push(en[k as keyof typeof en]);
        const c = info.coach; if (c) texts.push(c.text, c.why);
        for (const c of items) {
          const truth = c.truth(s, m);
          if (truth === null || !Number.isFinite(truth) || truth === 0) continue;
          for (const f of forms(truth)) for (const tx of texts) expect(has(tx, f), `${spec.id} ${mode}: "${tx}" shows ${f}`).toBe(false);
        }
      }
    });
  }
});
