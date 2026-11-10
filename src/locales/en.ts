// Every player-facing string of the engine side, keyed. `{name}` marks a variable. Regional names (works, cast, places) are NOT here:
// they come from the region pack's `strings` and are passed in as variables. The files under en/ hold one family each (DESIGN §8.9);
// godot/locales/strings.csv holds the UI chrome. Add a locale by copying this folder (es.ts, hi.ts...) and registering it in ../i18n.ts.
import { briefs } from './en/briefs';
import { coach } from './en/coach';
import { codex } from './en/codex';
import { errors } from './en/errors';
import { events } from './en/events';
import { levels } from './en/levels';
import { levelsCh2 } from './en/levels_ch2';
import { levelsCh3 } from './en/levels_ch3';
import { levelsCh4 } from './en/levels_ch4';
import { levelsCh5 } from './en/levels_ch5';
import { levelsCh6 } from './en/levels_ch6';
import { levelsCh8 } from './en/levels_ch8';
import { levelsCh9 } from './en/levels_ch9';
import { levelsCareer } from './en/levels_career';
import { ui } from './en/ui';
import { why } from './en/why';

export const en: Record<string, string> = { ...ui, ...briefs, ...coach, ...why, ...codex, ...events, ...errors, ...levels, ...levelsCh2, ...levelsCh3, ...levelsCh4, ...levelsCh5, ...levelsCh6, ...levelsCh8, ...levelsCh9, ...levelsCareer };
