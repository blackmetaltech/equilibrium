// Meta actions: markCoach (the coach's last step), pin (a readout, at most 3), claimStars (record a won level's stars).
import { need } from '@core/kit';
import type { ActionFn } from '@core/kit';
import { t } from '../../i18n';
import type { EqState } from '../../state';
import { specOf } from '../../levels/registry';
import { starsOf } from '../queries/level';

type Fn = ActionFn<EqState>;
const shortId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,48}$/.test(v);
export const MAX_PINNED = 3;

const markCoach: Fn = (s, stepId: unknown) => { need(shortId(stepId), t('err.meta.step')); s.ui.coachStep = stepId; };

const pin: Fn = (s, widget: unknown) => {
  need(shortId(widget), t('err.pin.widget'));
  const i = s.ui.pinned.indexOf(widget);
  if (i >= 0) { s.ui.pinned.splice(i, 1); return; }
  need(s.ui.pinned.length < MAX_PINNED, t('err.pin.full'));
  s.ui.pinned.push(widget);
};

/** Record a won level's stars: the stars the engine awards on the won state (`starsOf().have`, 1 to 3), kept if an earlier run earned more. Call it when the level is won. */
export function recordStars(s: EqState): void {
  const level = s.level as string;
  const spec = specOf(s);
  let have = 1;
  if (spec) { const m = spec.measures(s); have = starsOf(s, spec, m, spec.goals(s, m)).have; }
  have = Math.max(1, Math.min(3, have));
  const prev = s.progress.stars[level] ?? 0;
  s.progress.stars[level] = Math.max(prev, have) as 0 | 1 | 2 | 3;
}
const claimStars: Fn = (s) => {
  need(s.level !== null, t('err.stars.no_level'));
  need(s.status === 'won', t('err.stars.not_won'));
  recordStars(s);
};

export const metaActions: Record<string, Fn> = { markCoach, pin, claimStars };
