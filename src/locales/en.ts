// Every player-facing string of the engine side, keyed. `{name}` marks a variable. Regional names (works, cast, places) are NOT here:
// they come from the region pack's `strings` and are passed in as variables. The files under en/ hold one family each (DESIGN §8.9);
// godot/locales/strings.csv holds the UI chrome. Add a locale by copying this folder (es.ts, hi.ts...) and registering it in ../i18n.ts.
import { briefs } from './en/briefs';
import { coach } from './en/coach';
import { codex } from './en/codex';
import { errors } from './en/errors';
import { events } from './en/events';
import { levels } from './en/levels';
import { ui } from './en/ui';
import { why } from './en/why';

export const en: Record<string, string> = { ...ui, ...briefs, ...coach, ...why, ...codex, ...events, ...errors, ...levels };
