// Scripted players for playtests, soak runs and title-screen demos. They drive the real engine through Env.step.
// M0.2 has no design actions yet; the build/solve personas arrive with the actions of M1 (tasks 1.9 to 1.13).
import type { PersonaFactory } from '@core/kit';
import type { EqState } from './state';
import { SPEC_BY_ID } from './levels/registry';

export const PERSONAS: Record<string, PersonaFactory<EqState>> = {
  /** Phase B (QA captures, the release GIFs): plays the current level the way its own solver does (the expert persona of the level tests). */
  expert: (seed) => {
    let lv: string | null = null; let agent: ((s: EqState, ctx: any) => any[]) | null = null;
    return (s, ctx) => {
      if (s.level !== lv) { lv = s.level; const sp = lv ? SPEC_BY_ID[lv] : undefined; agent = sp ? (sp.solver(seed) as any) : null; }
      return agent ? agent(s, ctx) : [];
    };
  },
  /** Does nothing. */
  idle: () => () => [],
  /** Tries a random legal action now and then. */
  random: () => (_s, ctx) => {
    const legal = ctx.legal().filter((a) => a.name !== 'tick');
    return legal.length && ctx.rng.chance(0.3) ? [ctx.rng.pick(legal)] : [];
  },
};
