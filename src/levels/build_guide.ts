// The build checklist of a level (levelInfo.buildGuide): each part, pipe and setting of the notebook's build order, with whether the engine sees it done.
// Pure and deterministic; the text is generic (`lv.build.*`) except a 'set' line, which is the level's own (`lv.<ID>.build.<step id>`).
import { t } from '../i18n';
import type { EqState } from '../state';
import type { BuildSlot, BuildStep, LevelSpec } from './spec';
import { unitsOfType } from './util';

type S = Readonly<EqState>;
export interface GuideEnd { unit: string | null; type: string; port: string }
export interface GuideLine {
  id: string; kind: BuildStep['kind']; text: string; done: boolean; next: boolean;
  type?: string; at?: [number, number]; unit?: string | null;
  from?: GuideEnd; to?: GuideEnd;
}
const PORT: Record<string, string> = { out: 'OUT', in: 'IN', vap: 'V', liq: 'L', acid: 'ACID', in1: 'IN1', in2: 'IN2', in3: 'IN3' };
const portLabel = (p: string): string => PORT[p] ?? p.toUpperCase();
const slotUnit = (s: S, k: BuildSlot): string | null => unitsOfType(s, k.type)[(k.n ?? 1) - 1]?.id ?? null;
const part = (guide: BuildStep[], k: BuildSlot): string => {
  const label = t(`label.unit.${k.type}`);
  const same = new Set(guide.flatMap((g) => [g.slot, g.from, g.to]).filter((x): x is BuildSlot => x !== undefined && x.type === k.type).map((x) => x.n ?? 1));
  return same.size > 1 ? `${label} ${k.n ?? 1}` : label;
};

/** The live checklist of a level, or null when it has no guide. The first line not yet done is `next`. */
export function buildGuideOf(s: S, spec: LevelSpec): GuideLine[] | null {
  const guide = spec.buildGuide;
  if (guide === undefined || guide.length === 0) return null;
  let next = false;
  return guide.map((g): GuideLine => {
    let done = false, text = '';
    const line: GuideLine = { id: g.id, kind: g.kind, text, done, next: false };
    if (g.kind === 'place' && g.slot) {
      done = unitsOfType(s, g.slot.type).length >= (g.slot.n ?? 1);
      text = t('lv.build.place', { part: part(guide, g.slot) });
      line.type = g.slot.type; line.unit = slotUnit(s, g.slot);
      if (g.at) line.at = g.at;
    } else if (g.kind === 'pipe' && g.from && g.to) {
      const a = slotUnit(s, g.from), b = slotUnit(s, g.to);
      done = a !== null && b !== null && s.flowsheet.streams.some((p) => p.from.unit === a && p.from.port === g.from!.port && p.to.unit === b && p.to.port === g.to!.port);
      text = t('lv.build.pipe', { from: a ?? part(guide, g.from), fport: portLabel(g.from.port), to: b ?? part(guide, g.to), tport: portLabel(g.to.port) });
      line.from = { unit: a, type: g.from.type, port: g.from.port }; line.to = { unit: b, type: g.to.type, port: g.to.port };
    } else {
      done = g.done !== undefined && g.done(s);
      text = t(`lv.${spec.id}.build.${g.id}`, spec.textVars?.(s));
      if (g.slot) { line.type = g.slot.type; line.unit = slotUnit(s, g.slot); }
    }
    line.done = done; line.text = text;
    if (!done && !next) { next = true; line.next = true; }
    return line;
  });
}
