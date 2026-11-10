// Meta actions: markCoach (the coach's last step), pin (a readout, at most 3), claimStars (record a won level's stars).
import { need } from '@core/kit';
import type { ActionFn } from '@core/kit';
import { t } from '../../i18n';
import type { EqState } from '../../state';

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

/** A won level earns at least one star here; the per-level star thresholds from the metrics arrive with the levels (M2.1). */
const claimStars: Fn = (s) => {
  need(s.level !== null, t('err.stars.no_level'));
  need(s.status === 'won', t('err.stars.not_won'));
  const level = s.level as string;
  s.progress.stars[level] = (s.progress.stars[level] ?? 1) as 0 | 1 | 2 | 3;
  if (s.progress.stars[level] === 0) s.progress.stars[level] = 1;
};

export const metaActions: Record<string, Fn> = { markCoach, pin, claimStars };
