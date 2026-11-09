// Scripted players for playtests, soak runs and title-screen demos. They drive the real engine through Env.step.
// M0.2 has no design actions yet; the build/solve personas arrive with the actions of M1 (tasks 1.9 to 1.13).
import type { PersonaFactory } from '@core/kit';
import type { EqState } from './state';

export const PERSONAS: Record<string, PersonaFactory<EqState>> = {
  /** Does nothing. */
  idle: () => () => [],
  /** Tries a random legal action now and then. */
  random: () => (_s, ctx) => {
    const legal = ctx.legal().filter((a) => a.name !== 'tick');
    return legal.length && ctx.rng.chance(0.3) ? [ctx.rng.pick(legal)] : [];
  },
};
