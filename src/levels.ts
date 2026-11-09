// Levels: setup, goal, failure rule and a solver bot per level (DESIGN §2.6). The 29 levels arrive in M2/M3; the skeleton ships none.
// Each level reads prices and limits only by key from `NewGameCtx.region` (src/regions/data.ts), never as numbers.
import type { Level } from '@core/kit';
import type { EqState } from './state';

export const LEVELS: Level<EqState>[] = [];
