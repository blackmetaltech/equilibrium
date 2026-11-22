// Player wiki generator: site/wiki/*.html from the game's own text (level briefs, notes, goals, stars, the coach's steps and their "why",
// and the codex). Run `WIKI_WRITE=1 npx vitest run src/wiki.test.ts` to write it; the same test fails when the committed pages are stale.
// Placeholders that need the player's own numbers ({target} and the like) are shown as "…".
import { en } from '../src/locales/en';
import { SPECS } from '../src/levels/registry';

/** Chapter number → title, site and look (mirrors godot/ui/works_map.gd CHAPTERS and NEW_LOOK). */
export const CHAPTERS: { n: number; title: string; site: string; look: 'new' | 'classic'; intro: string; shot?: [string, string] }[] = [
  { n: 0, title: 'Night Shift', site: 'The gate', look: 'new', intro: 'The prologue. A running ammonia loop at 02:40, one pump trip and one dial. The cooler is slow: turn it late and the interlock trips the plant.', shot: ['night-shift-hall.jpg', 'Night Shift in the process hall: the fired heater, the green trim cooler and the converter R-106'] },
  { n: 1, title: 'The Bench', site: 'QC lab', look: 'classic', intro: 'Mass balances, extent of reaction and the first equilibrium on a lab bench.' },
  { n: 2, title: 'Fire', site: 'Burner house', look: 'classic', intro: 'Combustion: air-fuel ratio, flame temperature, heat recovery.' },
  { n: 3, title: 'The Wall', site: 'Converter house', look: 'new', intro: 'Pressure, temperature and inerts against the equilibrium wall of ammonia and SO₃, then Le Chatelier on your own bench. Build on the drafting table; commission, and your plant stands in the hall.', shot: ['chapter3-hall.jpg', 'L13 The Staircase: three adiabatic beds in the hall, each glowing by its outlet temperature, with waste-heat boilers between them'] },
  { n: 4, title: 'Speed', site: 'Catalyst house', look: 'classic', intro: 'Kinetics: rate laws, Arrhenius, catalyst and reactor volume.' },
  { n: 5, title: 'The Loop', site: 'The loop', look: 'classic', intro: 'Recycle, purge and the inerts that build up in a loop.' },
  { n: 6, title: 'Containment', site: 'Containment yard', look: 'classic', intro: 'Relief, interlocks, runaway and the safety case.' },
  { n: 7, title: 'The Works', site: 'Integrated Works', look: 'classic', intro: 'The whole works on one flowsheet.' },
  { n: 8, title: 'The Control Room', site: 'Control room', look: 'classic', intro: 'Control loops, tuning and alarms.' },
  { n: 9, title: 'Turnaround', site: 'Turnaround yard', look: 'classic', intro: 'Maintenance, reconciliation and HAZOP.' },
  { n: 10, title: 'Hydraulics', site: 'Pump house', look: 'classic', intro: 'Pumps, pipe sizes, NPSH and cavitation.' },
];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A string as the player reads it; run-time {placeholders} become "…". '' when the key does not exist. */
const tx = (key: string): string => { const s = en[key]; return s === undefined ? '' : s.replace(/\{[a-zA-Z_0-9]+\}/g, '…'); };
const keysWith = (prefix: string): string[] => Object.keys(en).filter((k) => k.startsWith(prefix));

const head = (title: string, desc: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · EQUILIBRIUM wiki</title><meta name="description" content="${esc(desc)}">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="../base.css"><link rel="stylesheet" href="wiki.css"></head>
<body><header class="nav"><a class="logo" href="../">EQUILIBRIUM</a><nav aria-label="Primary"><a href="./">Wiki</a><a href="controls.html">Controls</a><a href="codex.html">Codex</a><a href="../#download" class="btn mini go">Download</a></nav></header>
`;
const foot = `<footer class="foot"><p>Generated from the game's own text (scripts/wiki.ts). Places, people and companies are fictional.</p><p><a href="https://github.com/blackmetaltech/equilibrium">Source</a> · <a href="https://github.com/blackmetaltech/equilibrium/issues">Issues</a></p></footer>
</body></html>
`;
const lookTag = (look: 'new' | 'classic'): string => (look === 'new' ? '<span class="look new">New look</span>' : '<span class="look">Classic look</span>');

function levelCard(id: string): string {
  const p = `lv.${id}.`;
  const notes = keysWith(p + 'note.').sort().map((k) => tx(k)).filter((s) => s !== '');
  const goals = keysWith(p + 'goal.').map((k) => tx(k)).filter((s) => s !== '');
  const stars = keysWith(p + 'star.').sort().map((k) => tx(k)).filter((s) => s !== '');
  const steps = keysWith(p + 'coach.').filter((k) => k.endsWith('.text')).map((k) => [tx(k), tx(k.replace(/\.text$/, '.why'))] as const).filter(([a]) => a !== '');
  const lesson = tx(p + 'lesson');
  let h = `<article class="level card" id="${id}">\n<h3><span class="wo">${esc(id)}</span> ${esc(tx(p + 'title'))}</h3>\n`;
  if (tx(p + 'place')) h += `<p class="place">${esc(tx(p + 'place'))}</p>\n`;
  if (notes.length) h += `<h4>Brief</h4><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>\n`;
  if (goals.length) h += `<h4>Goal</h4><ul>${goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>\n`;
  if (stars.length) h += `<h4>Stars</h4><ol>${stars.map((g) => `<li>${esc(g)}</li>`).join('')}</ol>\n`;
  if (steps.length) h += `<h4>Steps</h4><ol class="steps">${steps.map(([a, w]) => `<li>${esc(a)}${w ? `<span class="why">${esc(w.replace(/^Why: /, ''))}</span>` : ''}</li>`).join('')}</ol>\n`;
  if (lesson) h += `<h4>What it teaches</h4><p class="lesson">${esc(lesson)}</p>\n`;
  return h + '</article>\n';
}

export function wikiPages(): Record<string, string> {
  const out: Record<string, string> = {};
  const byCh = new Map<number, string[]>();
  for (const s of SPECS) { if (!/^L\d\d$/.test(s.id)) continue; const a = byCh.get(s.chapter) ?? []; a.push(s.id); byCh.set(s.chapter, a); }
  let idx = head('Wiki', 'The EQUILIBRIUM player wiki: every chapter and level, the controls and the codex, from the game\'s own text.');
  idx += `<main class="wrap"><h1>Player wiki</h1><p class="lede">Every job in the game, in the words the game uses. Chapter 3 and the prologue are in the <b>new look</b> (a 3D hall and lab); the rest are in the <b>classic</b> control-room look.</p>\n<ul class="chapters">\n`;
  for (const c of CHAPTERS) {
    const ids = byCh.get(c.n) ?? [];
    if (!ids.length) continue;
    const file = `chapter-${c.n}.html`;
    idx += `<li class="card"><a href="${file}"><b>${c.n === 0 ? 'Prologue' : 'Chapter ' + c.n} · ${esc(c.title)}</b></a> ${lookTag(c.look)}<p>${esc(c.intro)}</p><p class="ids">${ids.join(' · ')}</p></li>\n`;
    let pg = head(`${c.n === 0 ? 'Prologue' : 'Chapter ' + c.n} · ${c.title}`, c.intro);
    pg += `<main class="wrap"><p class="crumbs"><a href="./">Wiki</a> / ${c.n === 0 ? 'Prologue' : 'Chapter ' + c.n} · ${esc(c.title)}</p>\n<h1>${c.n === 0 ? 'Prologue' : 'Chapter ' + c.n} · ${esc(c.title)} ${lookTag(c.look)}</h1>\n<p class="lede">${esc(c.intro)}</p>\n`;
    if (c.shot) pg += `<figure class="shot"><img src="../assets/shots/${c.shot[0]}" alt="${esc(c.shot[1])}" width="1600" height="900" loading="lazy"><figcaption>${esc(c.shot[1])}</figcaption></figure>\n`;
    pg += `<nav class="toc">${ids.map((id) => `<a href="#${id}">${esc(tx(`lv.${id}.title`) || id)}</a>`).join('')}</nav>\n`;
    for (const id of ids) pg += levelCard(id);
    out[file] = pg + '</main>\n' + foot;
  }
  idx += `</ul>\n<p><a href="controls.html">Controls: keyboard, mouse and pad</a> · <a href="codex.html">Codex: the ideas behind the rules</a></p></main>\n`;
  out['index.html'] = idx + foot;

  let cx = head('Codex', 'The ideas behind EQUILIBRIUM\'s rules: what each means in the plant, why it holds, and the simplification the game makes.');
  cx += `<main class="wrap"><p class="crumbs"><a href="./">Wiki</a> / Codex</p><h1>Codex</h1><p class="lede">One idea per card: what it means in the plant, why, and the simplification the game makes, named.</p>\n`;
  for (const k of keysWith('concept.').filter((x) => x.endsWith('.name')).sort()) {
    const b = k.replace(/\.name$/, '');
    cx += `<article class="card" id="${esc(b.replace('concept.', ''))}"><h3>${esc(tx(k))}</h3>${tx(b + '.what') ? `<p>${esc(tx(b + '.what'))}</p>` : ''}${tx(b + '.why') ? `<p class="why">${esc(tx(b + '.why'))}</p>` : ''}${tx(b + '.simplification') ? `<p class="simp"><b>Simplified:</b> ${esc(tx(b + '.simplification'))}</p>` : ''}</article>\n`;
  }
  out['codex.html'] = cx + '</main>\n' + foot;

  out['controls.html'] = head('Controls', 'EQUILIBRIUM controls for keyboard, mouse and gamepad, in the classic and the new look.') + `<main class="wrap"><p class="crumbs"><a href="./">Wiki</a> / Controls</p><h1>Controls</h1>
<h2>New look (Prologue, Chapter 3)</h2>
<table class="keys"><tr><th>Do</th><th>Mouse and keyboard</th><th>Pad</th></tr>
<tr><td>Move the camera</td><td>Right-drag to orbit, left-drag to pan, wheel to zoom; W A S D; Q and E turn</td><td>Left stick pans, right stick orbits, triggers zoom</td></tr>
<tr><td>Camera presets</td><td>1 to 6</td><td>LB / RB</td></tr>
<tr><td>Pick a control in the world</td><td>Point at it</td><td>D-pad left / right (a ring marks it; a line names it and its value)</td></tr>
<tr><td>Turn a wheel (L14 T and V, L00 cooler handwheel)</td><td>Drag it sideways</td><td>D-pad up / down</td></tr>
<tr><td>Pull RUN, turn the argon valve, toggle the clamp</td><td>Click it</td><td>A</td></tr>
<tr><td>Write the Kp call (L14)</td><td>Type in the Call box</td><td>Pick the Call box, A opens a keypad</td></tr>
<tr><td>Drafting table / hall (L10 to L13)</td><td>B</td><td>X</td></tr>
<tr><td>X-ray of the converter (L00)</td><td>X</td><td>X</td></tr>
<tr><td>Back, menu</td><td>Esc</td><td>B, Start</td></tr></table>
<h2>Classic look (all other chapters, and the drafting table)</h2>
<p>Place parts from the tray, drag between ports to pipe them, click a part to open its faceplate, turn the key from DESIGN to COMMISSION to run the plant. The notebook holds the brief and the Call it line. On a pad: LB / RB switch drawers, the D-pad moves focus, A presses, B goes back, Y steps the clock, Back changes speed.</p>
</main>
` + foot;
  return out;
}
