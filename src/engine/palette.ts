// The palette: what the level offers, grouped by category, with count limits, footprints and availability. Pure; never mutates state.
import { t } from '../i18n';
import { ALWAYS_AVAILABLE, PALETTE_CATS, UNIT_TYPES, metaOf, type PaletteCat } from './registry';
import type { EqState } from '../state';

export interface PaletteEntry {
  type: string;
  label: string;
  cat: PaletteCat;
  w: number;
  h: number;
  available: boolean;
  /** Placed now / allowed (null = unlimited). */
  count: number;
  limit: number | null;
  /** Reason key (an err.* key) when not available. */
  why: string | null;
}

export function paletteOf(s: Readonly<EqState>): { cats: { cat: PaletteCat; label: string; items: PaletteEntry[] }[]; plot: { w: number; h: number } } {
  const items: PaletteEntry[] = UNIT_TYPES.map((type) => {
    const m = metaOf(type);
    const inLevel = s.palette === null || s.palette.includes(type) || ALWAYS_AVAILABLE.includes(type);
    const count = s.flowsheet.units.filter((u) => u.type === type).length;
    const limit = s.limits[type] ?? null;
    const why = !inLevel ? 'err.place.locked' : limit !== null && count >= limit ? 'err.place.limit' : null;
    return { type, label: t(`label.unit.${type}`), cat: m.cat, w: m.w, h: m.h, available: why === null, count, limit, why };
  });
  return { cats: PALETTE_CATS.map((cat) => ({ cat, label: t(`label.cat.${cat}`), items: items.filter((i) => i.cat === cat) })).filter((c) => c.items.length > 0), plot: { ...s.plot } };
}
