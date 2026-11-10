// What one level is, as data and pure functions (DESIGN §2.6, §7). A LevelSpec is turned into the core `Level` (setup / goal / solver) by
// src/levels.ts and read by the `levelInfo` / `resultCard` queries (src/engine/queries/level.ts). Nothing here mutates state outside `setup`.
// Every sentence the player reads is a key `lv.<ID>.…` in src/locales/en/levels.ts; this file holds keys, numbers and predicates only.
import type { PersonaFactory } from '@core/kit';
import type { EqState } from '../state';

export type Role = 'mentor' | 'supervisor' | 'manager' | 'safety';
export type AnnState = 'off' | 'normal' | 'high' | 'critical';

/** All numbers a level reads off the plant. `ok` is false until a commission succeeded (then every `v` entry is 0). */
export interface Measures { ok: boolean; v: Record<string, number> }

export interface GoalEval { key: string; met: boolean; value?: number; target?: number }
export interface Annunciator { key: string; legend: string; state: AnnState }

/** One coach step: advances from engine state, never from clicks (DESIGN 7.2). `speaker` is a cast role. */
export interface CoachStep {
  id: string; role: Role; done: (s: Readonly<EqState>) => boolean;
  /** What the front-end points at: a unit type (the first such unit is highlighted, or its parts-rack tile while none is placed), or 'key'. */
  focus?: string;
}

/** The optional prediction of a level. `truth` is the engine / oracle value the answer is graded against. */
export interface CallItSpec {
  /** Stored as `EqState.prediction.quantity`. */
  key: string;
  unit: string;
  /** Relative tolerance of the grade (the oracle tolerance of the level). */
  tol: number;
  /** The right answer for this state (an oracle value, or the engine's own number at the player's design); null when it does not exist yet. */
  truth: (s: Readonly<EqState>, m: Measures) => number | null;
  /** The answer may be entered after a commission (L03: the formula is deduced from a test burn). Default: before the first commission only. */
  lateOk?: boolean;
  /** The answer also names something (L04: the limiting reagent): the species id that is right. */
  named?: (s: Readonly<EqState>) => string;
}

export interface HeroSpec { key: string; unit: string; value: number; lo: number; hi: number }
export interface SecondarySpec { key: string; unit: string; value: number; limit: number }

export interface MetricSpec { key: string; unit: string; value: number }

export interface LevelSpec {
  id: string;
  chapter: number;
  index: number;
  /** Who writes the setter note. */
  setter: Role;
  budgetUSD: number;
  /** Units the level offers: count limit and bench price (GAME numbers, UNVERIFIED) of each. */
  units: Record<string, { max: number; price: number }>;
  /** How many `lv.<ID>.note.N` lines the setter note has. */
  notes: number;
  /** Seconds of the scripted shift (L00) or 0. */
  shiftLen: number;
  maxTicks?: number;
  /** Fill a fresh state. Deterministic. `s.level` is still null when this runs. */
  setup: (s: EqState) => void;
  measures: (s: Readonly<EqState>) => Measures;
  /** The goals of this level in this mode (Engineer adds the budget). Pure. */
  goals: (s: Readonly<EqState>, m: Measures) => GoalEval[];
  /** Is the level over its goal condition? Default: every goal met on a commissioned plant. */
  won?: (s: Readonly<EqState>, m: Measures, g: GoalEval[]) => boolean;
  /** ★★ and ★★★ conditions (★ is `won`). */
  extraStars: (s: Readonly<EqState>, m: Measures, g: GoalEval[]) => [boolean, boolean];
  callIt: CallItSpec | null;
  hero: (s: Readonly<EqState>, m: Measures) => HeroSpec;
  secondary: (s: Readonly<EqState>, m: Measures) => SecondarySpec | null;
  annunciators: (s: Readonly<EqState>, m: Measures, g: GoalEval[]) => Annunciator[];
  coach: CoachStep[];
  /** Verdict of the printout: a key under `lv.<ID>.verdict.` and the sentence variables of `cause` (null = no cause line, the run passed). */
  verdict: (s: Readonly<EqState>, m: Measures, g: GoalEval[]) => { key: string; cause: string | null };
  /** The one equation of the level with the player's numbers: `left = right` (numbers, × ÷ + − and parentheses; units are decoration). */
  equation: (s: Readonly<EqState>, m: Measures) => string | null;
  /** Variables of `lv.<ID>.lesson`, with the player's numbers. */
  lessonVars: (s: Readonly<EqState>, m: Measures) => Record<string, string | number>;
  /** Three printout metrics (first = primary) and the histogram of the first. `best` is the reference value the offline sample is built around. */
  metrics: (s: Readonly<EqState>, m: Measures) => [MetricSpec, MetricSpec, MetricSpec];
  histogram: { metric: string; best: (s: Readonly<EqState>, m: Measures) => number; spread: number; lowerIsBetter: boolean } | null;
  /** Extra numbers or strings the printout shows beside the engine's (L04: the textbook working with N = 14, H = 1). */
  card?: (s: Readonly<EqState>, m: Measures) => Record<string, number | string>;
  /** Feed units whose composition the UI must not show (L03 hides the fuel). */
  masked?: (s: Readonly<EqState>) => string[];
  solver: PersonaFactory<EqState>;
  naive: PersonaFactory<EqState>;
}
