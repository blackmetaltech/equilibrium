// Levels: setup, goal, failure rule and a solver bot per level (DESIGN §2.6). Chapter 1 (L00-L04) lives in src/levels/*; the rest arrives in M2/M3.
// Each level reads prices and limits only by key from `NewGameCtx.region` (src/regions/data.ts), never as numbers.
import type { Level } from '@core/kit';
import type { EqState } from './state';
import { SPECS, levelOf } from './levels/registry';

export const LEVELS: Level<EqState>[] = SPECS.map(levelOf);
