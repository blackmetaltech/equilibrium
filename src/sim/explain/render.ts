// Turn an Explanation (keys + SI numbers) into sentences: pick the word for each direction, format every number in its display unit, fill the
// i18n template (locales/en/why.ts) and, in learner mode only, append the one hint. No sentence is built here: only keys and formatting.
import { t } from '../../i18n';
import { en } from '../../locales/en';
import type { Explanation, Vars } from './types';

export interface Fmt {
  /** Decimal separator and minus sign are the only locale parts; the pack-aware formatter of the engine passes its own. */
  num(x: number, sig: number): string;
  /** Display name of a species id or a KPI key. */
  name(id: string): string;
}

const trim = (s: string): string => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
export const defaultFmt: Fmt = {
  num: (x, sig) => { const v = Number(x.toPrecision(sig)); const s = trim(Math.abs(v) >= 1e6 ? v.toFixed(0) : String(Math.abs(v)).includes('e') ? v.toFixed(0) : String(Math.abs(v))); return (v < 0 ? '−' : '') + s; },
  name: (id) => id,
};

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** 6.2e-5 -> 6.2×10⁻⁵ */
export function sci(x: number, f: Fmt = defaultFmt): string {
  if (x === 0 || !Number.isFinite(x)) return f.num(x, 2);
  const [m, e] = x.toExponential(1).split('e') as [string, string];
  const exp = String(Number(e)).split('').map((c) => SUP[c] ?? c).join('');
  return trim(m) + '×10' + exp;
}

type Kind = 'degC' | 'bar' | 'pct' | 'sci' | 'kjmol' | 'kw' | 'kmolh' | 'int' | 'signed' | 'time' | 'dT' | 'secs' | 'dir' | 'move' | 'name' | 'num';
const KIND: Record<string, Kind> = {
  T0: 'degC', T1: 'degC', T: 'degC', Tmin: 'degC', Tpeak: 'degC', Trelief: 'degC', dT: 'dT', dt: 'secs', time: 'time',
  P0: 'bar', P1: 'bar', P: 'bar',
  Xeq0: 'pct', Xeq1: 'pct', X0: 'pct', X1: 'pct', X: 'pct', eta0: 'pct', y0: 'pct', y1: 'pct', f0: 'pct', f1: 'pct', pchg: 'pct', flowdrop: 'pct', xspec: 'pct', xaz: 'pct', gap: 'pct',
  K0: 'sci', K1: 'sci', dH: 'kjmol', dW: 'kw', inflow: 'kmolh', have: 'kmolh', need: 'kmolh', left: 'kmolh', dn: 'signed',
  dir: 'dir', kmove: 'move', xmove: 'move', pmove: 'move', wmove: 'move', species: 'name', other: 'name', kpi: 'name', k0: 'num', k1: 'num', v0: 'num', v1: 'num', pred: 'num', act: 'num',
};
const WORD: Record<string, Record<number, string>> = { dir: { 1: 'why.word.raised', [-1]: 'why.word.lowered' }, move: { 1: 'why.word.rose', [-1]: 'why.word.fell' } };

function fmtVar(name: string, v: number | string, f: Fmt): string | number {
  const kind = KIND[name];
  if (typeof v === 'string') return kind === 'name' ? f.name(v) : v;
  switch (kind) {
    case 'degC': return f.num(v - 273.15, 3) + ' °C';
    case 'dT': return f.num(v, 2) + ' K';
    case 'bar': return f.num(v / 1e5, 3) + ' bar';
    case 'pct': return f.num(v * 100, 2) + ' %';
    case 'sci': return sci(v, f);
    case 'kjmol': return f.num(v, 3) + ' kJ/mol';
    case 'kw': return v >= 1000 ? f.num(v / 1000, 2) + ' MW' : f.num(v, 2) + ' kW';
    case 'kmolh': return f.num((v * 3600) / 1000, 3) + ' kmol/h';
    case 'signed': return (v > 0 ? '+' : '') + f.num(v, 3);
    case 'secs': return f.num(v, 2) + ' s';
    case 'time': { const m = Math.floor(v / 60), s = Math.floor(v % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
    case 'dir': case 'move': return t(WORD[kind]![v >= 0 ? 1 : -1]!);
    case 'num': return f.num(v, 3);
    default: return v;
  }
}

/** The sentences of an explanation: the template split at sentence ends, then the hint when `learner`. */
export function renderExplanation(e: Explanation, mode: string, f: Fmt = defaultFmt): string[] {
  if (e.key === '') return [];
  const key = e.key in en ? e.key : 'why.FAILED';
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.vars)) vars[k] = fmtVar(k, v as number | string, f);
  if (key === 'why.FAILED') vars.code = e.key.slice(4);
  const out = t(key, vars).split(/(?<=[.!?])\s+(?=[A-ZΔ\d])/);
  if (e.hint && mode === 'learner' && key + '.hint' in en) out.push(t(key + '.hint', vars));
  return out;
}

export type { Vars };
