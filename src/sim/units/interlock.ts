// Trip interlock (DESIGN 3.7): static data only; the dynamics lane evaluates it. The unit function passes the numbers through.
import type { UnitOp } from '../types';
import { okResult } from '../types';
import { num } from './utilities';

export const INTERLOCK_ACTIONS: readonly string[] = ['cut_feed', 'full_coolant', 'dump'];
export const INTERLOCK_VARIABLES: readonly string[] = ['T', 'P', 'level', 'flow'];
export const interlock: UnitOp = (_inlets, u) => okResult({ outlets: {}, info: { setpoint: num(u, 'setpoint', 0) } });
