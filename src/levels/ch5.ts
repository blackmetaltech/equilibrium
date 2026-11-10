// Chapter 5 levels (DESIGN §2.6). Owned by the chapter-5 worker; registered in ./registry.ts.
// L22 (The Methanol Loop: cooled tubular reactor, rate law K3) and L23 (Spirits: fermenter K8, column with the azeotrope wall) need unit operations the engine does
// not have yet (their kinetics are stubs); they are not registered. See the chapter-5 report for the specification.
import type { LevelSpec } from './spec';
import { L19 } from './l19';
import { L20 } from './l20';
import { L21 } from './l21';
import { L22 } from './l22';
import { L23 } from './l23';

export const CH5_SPECS: LevelSpec[] = [L19, L20, L21, L22, L23];
