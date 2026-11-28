// Player wiki generator: site/wiki/*.html from the game's own text and data: level briefs, goals with their numbers and the stars as the
// job card shows them (read from the engine's levelInfo), the verdicts a printout can name, the coach's steps and their "why", the codex,
// and the facts on the wiki home (version, level counts, which chapters are in the new look, platforms).
// Run `WIKI_WRITE=1 npx vitest run src/wiki.test.ts` to write it; the same test fails when the committed pages are stale or say something
// the build no longer does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Env } from '@core/kit';
import { en } from '../src/locales/en';
import { GAME } from '../src/game';
import { SPECS } from '../src/levels/registry';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// ---- facts read from the build -------------------------------------------------------------------------------------------------
/** The newest release in the CHANGELOG: `## [0.12.0] - 2026-11-23 · "The Lab at Home" (...)`. */
export function releaseOf(changelog: string): { version: string; name: string } {
  const m = /^## \[(\d+\.\d+\.\d+)\][^\n"]*"([^"]+)"/m.exec(changelog);
  if (!m) throw new Error('CHANGELOG.md: the newest section has no [x.y.z] ... "Name" heading');
  return { version: m[1]!, name: m[2]! };
}
/** godot/ui/works_map.gd: the stops on the Works Map, the chapters drawn in the new look, and the levels of them that are still classic. */
export function worksMap(src = read('godot/ui/works_map.gd')): { stops: number; newLook: number[]; classicLevels: string[] } {
  const block = /const CHAPTERS := \[([\s\S]*?)\n\]/.exec(src);
  const nl = /const NEW_LOOK := \[([^\]]*)\]/.exec(src);
  const part = /const PART_LOOK := \{([^}]*)\}/.exec(src);
  if (!block || !nl) throw new Error('works_map.gd: CHAPTERS or NEW_LOOK not found');
  return { stops: [...block[1]!.matchAll(/^\t\[\d+,/gm)].length, newLook: nl[1]!.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)), classicLevels: [...(part?.[1] ?? '').matchAll(/"(L\d\d) classic"/g)].map((m) => m[1]!) };
}
/** Platforms the release workflow exports (its `for p in Linux Windows; do` line). */
export function releasePlatforms(src = read('.github/workflows/release.yml')): string[] | null {
  const m = /for p in ([A-Za-z ]+); do/.exec(src);
  return m ? m[1]!.trim().split(/\s+/) : null;
}
/** What the wiki home says about builds. src/wiki.test.ts fails when release.yml exports another list. */
export const PLATFORMS = ['Linux', 'Windows', 'macOS'];

type Look = 'new' | 'classic' | 'none';
interface Shot { file: string; alt: string; look: Look; /** in site/assets/shots (shared with the site home); otherwise in site/wiki/img */ shared?: boolean }
const shot = (file: string, look: Look, alt: string, shared = false): Shot => ({ file, alt, look, shared });

/** Chapter number → title, site, what it teaches, and screenshots (captures of released builds from docs/readme and docs/look2). Mirrors godot/ui/works_map.gd CHAPTERS. */
export const CHAPTERS: { n: number; title: string; site: string; teach: string; shots: Shot[] }[] = [
  { n: 0, title: 'Night Shift', site: 'The gate', teach: 'A running ammonia loop at 02:40, one pump trip and one dial. The cooler is slow: turn it late and the interlock trips the plant. You learn to watch the Equilibrium Window and act within seconds.',
    shots: [shot('night-shift-hall.jpg', 'new', 'Night Shift in the process hall: the fired heater and the converter, with the cooler dial in the corner', true)] },
  { n: 1, title: 'The Bench', site: 'QC lab', teach: 'Mass balances, moles against kilograms, and the first equilibrium on a lab bench. You size feeds so that nothing is wasted.',
    shots: [shot('ch1-burner-house.jpg', 'new', 'The burner house in the new look, with your plant standing in the hall once it runs')] },
  { n: 2, title: 'Fire', site: 'Burner house', teach: 'Combustion: air-fuel ratio, flame temperature and heat recovery. You build a burner, a boiler and a converter feed and keep the gas at the right temperature.',
    shots: [shot('hall-heater.jpg', 'new', 'L08: the fired heater and the feed-effluent exchanger in the hall'), shot('hall-burner.jpg', 'new', 'A sulfur burner in the hall: a drum on saddles, its fan and burner front')] },
  { n: 3, title: 'The Wall', site: 'Converter house', teach: 'Pressure, temperature and inerts against the equilibrium wall of ammonia and SO₃, then Le Chatelier on your own bench. You build on the drafting table; once you commission, your plant stands in the hall.',
    shots: [shot('chapter3-hall.jpg', 'new', 'Your L13 plant in the hall: a catalyst bed glowing at its temperature, a boiler steaming behind', true), shot('two-flasks-lab.jpg', 'new', 'L14 Two Flasks: the twin flask on the dais in the private lab'), shot('flue-analyser.jpg', 'new', 'The flue analyser reads the engine\'s own gas, wet basis')] },
  { n: 4, title: 'Speed', site: 'Catalyst house', teach: 'Kinetics: rate laws, Arrhenius, catalyst and reactor volume. You learn why a hot bed is fast but has a low ceiling.',
    shots: [shot('staircase.jpg', 'classic', 'L15 The Staircase: the X-T chart with the steps of the reactor'), shot('notebook.jpg', 'classic', 'L16 Light-off: the notebook with the brief, the goals and the flasks')] },
  { n: 5, title: 'The Loop', site: 'The loop', teach: 'Recycle, purge and the inerts that build up in a loop. You choose how much to purge and pay for it in lost product.',
    shots: [shot('l23-win.jpg', 'classic', 'L23: the printout of a won run, with the cost per tonne against other runs (an earlier build)')] },
  { n: 6, title: 'Containment', site: 'Containment yard', teach: 'Relief, interlocks, runaway and the safety case. You find the point where a reactor runs away and what stops it.',
    shots: [shot('runaway.jpg', 'classic', 'L24 Runaway: the Semenov plot while the plant runs'), shot('l24-checklist.jpg', 'classic', 'L24: the start-up checklist ticks from the plant itself')] },
  { n: 7, title: 'The Works', site: 'Integrated Works', teach: 'The whole works on one flowsheet: several plants sharing steam, power and feed.', shots: [] },
  { n: 8, title: 'The Control Room', site: 'Control room', teach: 'Control loops, tuning and alarms. You bump a loop, tune it, and set a trip you can trust.',
    shots: [shot('tune-it.jpg', 'classic', 'L30 Tune It: bump test, IMC tuning and the error readout'), shot('interlock.jpg', 'classic', 'L33 The Interlock: sensors, votes and the trip point')] },
  { n: 9, title: 'Turnaround', site: 'Turnaround yard', teach: 'Maintenance, reconciliation and HAZOP. You walk a hazard study, write a start-up sequence, and find the meter that lies.',
    shots: [shot('hazop.jpg', 'classic', 'L34 HAZOP Node: the worksheet beside the plant'), shot('reconcile.jpg', 'classic', 'L37 The Analyser Lies: data reconciliation')] },
  { n: 10, title: 'Hydraulics', site: 'Pump house', teach: 'Pumps, pipe sizes, NPSH and cavitation. You size a line against the pump curve and pick the cheapest one over a year.',
    shots: [shot('pump-house.jpg', 'classic', 'L39: the system curve against the pump curve, and the NPSH sight-glass'), shot('pump-cavitation.jpg', 'classic', 'The same job cavitating on a 2-inch suction')] },
];
/** Chapters that have no screenshot on the wiki yet; the page says so. */
export const NO_SHOT = CHAPTERS.filter((c) => c.shots.length === 0).map((c) => c.n);
const CAREER_SHOTS: Shot[] = [shot('career.jpg', 'classic', 'The Career: year 2 of 5 on the Works'), shot('career-decision.jpg', 'classic', 'The Career: one decision a year, every option with the terms that make up its cost'), shot('incident-slip.jpg', 'classic', 'An incident in the Career: the re-purged loop running, with your fix beside the contractor and ignoring it')];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A string as the player reads it; run-time {placeholders} become "…". '' when the key does not exist. */
const tx = (key: string): string => { const s = en[key]; return s === undefined ? '' : s.replace(/\{[a-zA-Z_0-9]+\}/g, '…'); };
/** A string with no run-time placeholder, or ''. */
const plain = (key: string): string => { const s = en[key]; return s === undefined || /\{[a-zA-Z_0-9]+\}/.test(s) ? '' : s; };
const keysWith = (prefix: string): string[] => Object.keys(en).filter((k) => k.startsWith(prefix));
const levelIds = (): string[] => SPECS.map((s) => s.id).filter((i) => /^L\d\d$/.test(i));
const idsOf = (n: number): string[] => SPECS.filter((s) => s.chapter === n && /^L\d\d$/.test(s.id)).map((s) => s.id);
const ranges = (ids: string[]): string => {
  const nums = ids.map((i) => Number(i.slice(1))).sort((a, b) => a - b); const parts: string[] = [];
  for (let i = 0; i < nums.length; ) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j]! + 1) j++; const f = (n: number): string => `L${String(n).padStart(2, '0')}`; parts.push(j - i >= 2 ? `${f(nums[i]!)} to ${f(nums[j]!)}` : nums.slice(i, j + 1).map(f).join(', ')); i = j + 1; }
  return parts.join(', ');
};
const chTitle = (n: number): string => (n === 0 ? 'Prologue' : `Chapter ${n}`) + ' · ' + CHAPTERS.find((c) => c.n === n)!.title;

/** What the job card shows for a level: the engine's goals and star rules, rendered. A text that differs between attempts (a seeded fuel, say) is not stable enough to print; those levels return null. */
interface Card { notes: string[]; goals: string[]; stars: string[]; callIt: string }
const cardCache = new Map<string, Card | null>();
function cardOf(id: string): Card | null {
  if (cardCache.has(id)) return cardCache.get(id)!;
  const one = (seed: number): Card => {
    const env = new Env(GAME); env.reset({ seed, level: id, mode: 'learner' });
    const info = env.engine.q('levelInfo') as { note: string[]; goals: { text: string }[]; stars: { rules: string[] }; callIt?: { prompt: string } | null };
    return { notes: info.note, goals: info.goals.map((g) => g.text), stars: info.stars.rules, callIt: info.callIt?.prompt ?? '' };
  };
  const a = one(1003), b = one(7), c = one(99);
  const same = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c);
  cardCache.set(id, same ? a : null);
  return same ? a : null;
}

// ---- images --------------------------------------------------------------------------------------------------------------------
function jpegSize(path: string): [number, number] {
  const b = readFileSync(path); let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`no size in ${path}`);
}
const LOOK_WORD: Record<Look, string> = { new: 'New look.', classic: 'Classic look.', none: '' };
function figure(s: Shot): string {
  const rel = s.shared ? `assets/shots/${s.file}` : `wiki/img/${s.file}`;
  const [w, h] = jpegSize(join(ROOT, 'site', rel));
  const src = s.shared ? `../assets/shots/${s.file}` : `img/${s.file}`;
  return `<figure class="shot"><img src="${src}" alt="${esc(s.alt)}" width="${w}" height="${h}" loading="lazy" decoding="async"><figcaption>${s.look === 'none' ? '' : `<b class="look ${s.look}">${LOOK_WORD[s.look]}</b> `}${esc(s.alt)}</figcaption></figure>`;
}
const lookChip = (look: 'new' | 'classic'): string => `<span class="look ${look}">${look === 'new' ? 'New look' : 'Classic look'}</span>`;

// ---- page frame ------------------------------------------------------------------------------------------------------------------
const ORDER = (): { file: string; title: string }[] => [
  { file: 'how.html', title: 'How a job goes' }, { file: 'controls.html', title: 'Controls' },
  ...CHAPTERS.map((c) => ({ file: `chapter-${c.n}.html`, title: chTitle(c.n) })), { file: 'career.html', title: 'Career: five years' }, { file: 'codex.html', title: 'Codex' },
];
function pager(file: string): string {
  const o = ORDER(); const i = o.findIndex((p) => p.file === file);
  const prev = i > 0 ? o[i - 1]! : null, next = i < o.length - 1 ? o[i + 1]! : null;
  const box = (cls: string, label: string, p: { file: string; title: string } | null): string => `<a class="${cls}" href="${p ? p.file : './'}"><small>${p ? label : 'Back to'}</small>${esc(p ? p.title : 'Wiki home')}</a>`;
  return `<nav class="pager" aria-label="Pages">${box('prev', 'Previous', prev)}${box('next', 'Next', next)}</nav>`;
}
const head = (title: string, desc: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · EQUILIBRIUM wiki</title><meta name="description" content="${esc(desc)}">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="../base.css"><link rel="stylesheet" href="wiki.css"></head>
<body class="wiki"><header class="nav"><a class="logo" href="../">EQUILIBRIUM</a><nav aria-label="Primary"><a href="./">Wiki</a><a href="how.html">How a job goes</a><a href="controls.html">Controls</a><a href="codex.html">Codex</a><a href="../#download" class="btn mini go">Download</a></nav></header>
`;
const foot = `<footer class="foot"><p>Generated from the game's own text and data (scripts/wiki.ts). Places, people and companies are fictional.</p><p><a href="https://github.com/blackmetaltech/equilibrium">Source</a> · <a href="https://github.com/blackmetaltech/equilibrium/issues">Issues</a></p></footer>
</body></html>
`;
const frame = (title: string, desc: string, crumbs: string, body: string, file: string): string => `${head(title, desc)}<main class="wrap"><p class="crumbs">${crumbs}</p>\n${body}\n${file === 'index.html' ? '' : pager(file)}</main>\n${foot}`;

// ---- jobs ------------------------------------------------------------------------------------------------------------------------
/** The verdict names a printout can show for a level (everything but "pass" and "not run"). */
function failures(id: string): string[] {
  const p = `lv.${id}.verdict.`;
  return keysWith(p).filter((k) => !/\.(pass|saved|not_run|unfinished)$/.test(k)).sort().map((k) => plain(k)).filter((s) => s !== '');
}
function levelCard(id: string, look: 'new' | 'classic'): string {
  const p = `lv.${id}.`;
  const card = cardOf(id);
  const notes = card ? card.notes : keysWith(p + 'note.').sort().map((k) => plain(k)).filter((s) => s !== '');
  const goals = card ? card.goals : keysWith(p + 'goal.').map((k) => plain(k)).filter((s) => s !== '');
  const stars = card ? card.stars : keysWith(p + 'star.').sort().map((k) => plain(k)).filter((s) => s !== '');
  const steps = keysWith(p + 'coach.').filter((k) => k.endsWith('.text')).map((k) => [plain(k), plain(k.replace(/\.text$/, '.why'))] as const).filter(([a]) => a !== '');   // a step that names your own unit or number is left to the game
  const lesson = plain(p + 'lesson');
  const lost = plain(p + 'lost');
  const fails = failures(id);
  let failHtml = '';
  if (lost) failHtml += `<p>${esc(lost)}</p>`;
  if (fails.length && !lost) failHtml += `<p>The printout names one of these when a goal is missed:</p><ul>${fails.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
  if (!failHtml) failHtml = '<p>A run that misses a goal ends in a printout that says which goal failed. Ask Why? for the numbers.</p>';
  let h = `<article class="level card" id="${id}">\n<h3><span class="wo">${esc(id)}</span> ${esc(tx(p + 'title'))} ${lookChip(look)}</h3>\n`;
  if (tx(p + 'place')) h += `<p class="place">${esc(tx(p + 'place'))}</p>\n`;
  if (notes.length) h += `<h4>Brief</h4><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>\n`;
  if (goals.length) h += `<h4>Goal</h4><ul>${goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>\n`;
  if (stars.length) h += `<h4>Stars</h4><ol>${stars.map((g) => `<li>${esc(g)}</li>`).join('')}</ol>\n`;
  h += `<h4>If it fails</h4>${failHtml}\n`;
  if (steps.length) h += `<details class="hints"><summary>Coach steps (hints that show how to build)</summary><ol class="steps">${steps.map(([a, w]) => `<li>${esc(a)}${w ? `<span class="why">${esc(w.replace(/^Why: /, ''))}</span>` : ''}</li>`).join('')}</ol></details>\n`;
  if (lesson) h += `<h4>What it teaches</h4><p class="lesson">${esc(lesson)}</p>\n`;
  return h + '</article>\n';
}

/** True when a job draws in the new look: its chapter is in NEW_LOOK and it is not one of the classic exceptions. */
export function isNewLook(id: string, chapter: number, wm = worksMap()): boolean { return wm.newLook.includes(chapter) && !wm.classicLevels.includes(id); }

function chapterPage(n: number): string {
  const c = CHAPTERS.find((x) => x.n === n)!;
  const wm = worksMap();
  const ids = idsOf(n);
  const nw = ids.filter((i) => isNewLook(i, n, wm)), cl = ids.filter((i) => !isNewLook(i, n, wm));
  const lookLine = cl.length === 0 ? 'All of its jobs are drawn in the new look: a 3D hall and lab.' : nw.length === 0 ? 'All of its jobs are in the classic control-room look for now.' : `${ranges(nw)} are drawn in the new look. ${ranges(cl)} ${cl.length === 1 ? 'is' : 'are'} in the classic look for now.`;
  const title = chTitle(n);
  let body = `<h1>${esc(title)}</h1>\n<p class="lede"><b>What it teaches.</b> ${esc(c.teach)}</p>\n<p class="meta">${ids.length} ${ids.length === 1 ? 'job' : 'jobs'}: ${ranges(ids)}. Site: ${esc(c.site)}. ${lookLine}</p>\n`;
  body += c.shots.length ? c.shots.map(figure).join('\n') : '<p class="meta">There is no screenshot of this chapter on the wiki yet.</p>';
  body += `\n<nav class="toc" aria-label="Jobs in this chapter">${ids.map((id) => `<a href="#${id}">${esc(tx(`lv.${id}.title`) || id)}</a>`).join('')}</nav>\n`;
  for (const id of ids) body += levelCard(id, isNewLook(id, n, wm) ? 'new' : 'classic');
  return frame(title, `${title}: ${c.teach}`, `<a href="./">Wiki</a> / ${esc(title)}`, body, `chapter-${n}.html`);
}

// ---- other pages -----------------------------------------------------------------------------------------------------------------
function howPage(): string {
  const body = `<h1>How a job goes</h1>
<p class="lede">Every job follows the same steps. Your private lab is the home screen.</p>
<ol class="how"><li><b>Pick a job on the Works Map.</b> The map and the briefing lie on the drafting table in your lab.</li></ol>
${figure(shot('title-lab.jpg', 'new', 'Step 1. The lab is the home screen: the title, the Works Map and the briefings are here.'))}
<ol class="how" start="2"><li><b>Read the brief.</b> The notebook holds the setter's note, the goals with their numbers, the stars and the Call it line. A Call it is a number you predict before you commission; a right call earns a star.</li></ol>
${figure(shot('notebook.jpg', 'classic', 'Step 2. The notebook: the brief, the goals and the flasks (classic look).'))}
<ol class="how" start="3"><li><b>Build.</b> Pick units from the parts rack, place them on the plot and pipe them. Each unit has a faceplate with knobs. In Engineer mode a budget is a goal too.</li><li><b>Turn the key.</b> The key goes from DESIGN to COMMISSION to RUN. The solver settles the whole plant, recycle loops included. In the new-look chapters your plant then stands in the hall.</li></ol>
${figure(shot('chapter3-hall.jpg', 'new', 'Step 4. Commissioned: your plant in the hall, a catalyst bed glowing at its temperature.', true))}
<ol class="how" start="5"><li><b>Read the printout.</b> It compares your goals and your call with the engine's numbers, and names the verdict when a goal is missed. Ask Why? for the working. Stop, edit and run again; your build is kept.</li></ol>
${figure(shot('l10-printout.jpg', 'new', 'Step 5. The printout after the first run: each goal with its number, and your call against the engine\'s.', true))}
<h2>The three stars</h2>
<p>The first star is for meeting the goals. The second and third are on the job card, with their numbers, before you build. One of them is usually the Call it.</p>
<h2>Modes</h2>
<p>Learner has a coach and gentler events. Engineer is stricter and adds a budget. Cute mode puts molecule critters in the pipes and is on by default.</p>
<h2>Order of jobs</h2>
<p>The Works Map opens chapters in order. The map marks each chapter "New look" or "classic".</p>`;
  return frame('How a job goes', 'The steps of every EQUILIBRIUM job: pick it, read the brief, build, turn the key, read the printout.', '<a href="./">Wiki</a> / How a job goes', body, 'how.html');
}

function controlsPage(): string {
  const body = `<h1>Controls</h1>
<p class="lede">Mouse and keyboard, and gamepad, in the new look (the lab and the hall) and in the classic look (the drafting table).</p>
<h2>New look: the lab and the hall</h2>
<div class="tablewrap"><table class="keys"><thead><tr><th>Do</th><th>Mouse and keyboard</th><th>Pad</th></tr></thead><tbody>
<tr><td>Move the camera</td><td>Right-drag or middle-drag to orbit. Left-drag to pan. Wheel to zoom. W A S D move. Q and E turn a quarter step.</td><td>Left stick pans, right stick orbits, triggers zoom</td></tr>
<tr><td>Camera presets</td><td>1 to 6 in the lab. 1 to 3 (wide, plant, close) in the hall.</td><td>LB and RB</td></tr>
<tr><td>Pick a control in the world</td><td>Point at it and click.</td><td>D-pad left and right (a ring marks it and a line names it)</td></tr>
<tr><td>Turn a wheel (the L14 T and V wheels, the L00 cooler handwheel)</td><td>Drag it sideways, or scroll over it. [ and ] step the dial.</td><td>D-pad up and down</td></tr>
<tr><td>Pull RUN, turn the argon valve, toggle the clamp</td><td>Click it.</td><td>A</td></tr>
<tr><td>Write the Kp call (L14)</td><td>Type in the Call box.</td><td>Pick the Call box, then A opens a keypad</td></tr>
<tr><td>Flip between the drafting table and the hall (chapters 1 to 3)</td><td>B</td><td>R3 (press the right stick). X also flips back while the hall hides the table.</td></tr>
<tr><td>X-ray of the converter (L00)</td><td>X</td><td>X</td></tr>
<tr><td>Back, menu</td><td>Esc</td><td>B, Start</td></tr></tbody></table></div>
<h2>Classic look and the drafting table</h2>
<div class="tablewrap"><table class="keys"><thead><tr><th>Do</th><th>Mouse and keyboard</th><th>Pad</th></tr></thead><tbody>
<tr><td>Place a part</td><td>Click a part in the rack, then click the plot. R turns the part in hand.</td><td>LB and RB walk the rack (a folded rack opens first). A takes the part. The D-pad or left stick moves the cursor, A places, X turns, B puts it back.</td></tr>
<tr><td>Pipe two units</td><td>Drag from one port to another.</td><td>A on a port starts the pipe, A on another port ends it.</td></tr>
<tr><td>Open a unit</td><td>Click it to open its faceplate.</td><td>A on a unit opens the faceplate and focuses its first knob. The D-pad walks the knobs.</td></tr>
<tr><td>Turn the key</td><td>Click the key. Space turns it one step.</td><td>A on the key</td></tr>
<tr><td>Run speed</td><td>The speed dial.</td><td>A on the dial steps it. Back steps it from anywhere.</td></tr>
<tr><td>Pan, zoom and turn the plot</td><td>Right-drag or middle-drag pans. Wheel or + and − zoom. Q and E turn the view. F or Home frames the plot.</td><td>Left stick pans. Right stick up and down zooms, left and right turns.</td></tr>
<tr><td>Undo and redo</td><td>Ctrl and Z, Ctrl and Y</td><td>B puts back a part in hand</td></tr>
<tr><td>Acknowledge alarms</td><td>K</td><td></td></tr></tbody></table></div>
<p>On a pad, the key hints show along the bottom while the pad is in use. The handheld layout (1280 by 800) keeps the console and the loop panel on screen together.</p>`;
  return frame('Controls', 'EQUILIBRIUM controls for keyboard, mouse and gamepad, in the new look and the classic look.', '<a href="./">Wiki</a> / Controls', body, 'controls.html');
}

function careerPage(): string {
  const notes = keysWith('lv.CAREER.note.').sort().map((k) => plain(k)).filter(Boolean);
  const body = `<h1>${esc(plain('lv.CAREER.title') || 'Career')}</h1>
<p class="lede"><b>What it teaches.</b> Running a works over time: contracts, wear, inspections and turnarounds, and what they cost. ${lookChip('classic')}</p>
<p class="meta">${esc(plain('lv.CAREER.place'))}. Five seeded years, sixty months.</p>
${CAREER_SHOTS.map(figure).join('\n')}
<h2>The brief</h2><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
<h2>What happens in a year</h2>
<p>Contracts and price walks, catalyst decay, fouling, wear, inspections, turnarounds, incidents, emissions caps, investments, and an annual review. When inerts creep into the ammonia feed you can go to the plant and fix the purge yourself, call a contractor, or ignore it.</p>`;
  return frame('Career: five years', 'The EQUILIBRIUM Career: five seeded years running the Works.', '<a href="./">Wiki</a> / Career', body, 'career.html');
}

function codexPage(): string {
  let cx = `<h1>Codex</h1><p class="lede">One idea per card: what it means in the plant, why, and the simplification the game makes, named.</p>\n`;
  for (const k of keysWith('concept.').filter((x) => x.endsWith('.name')).sort()) {
    const b = k.replace(/\.name$/, '');
    cx += `<article class="card" id="${esc(b.replace('concept.', ''))}"><h3>${esc(tx(k))}</h3>${tx(b + '.what') ? `<p>${esc(tx(b + '.what'))}</p>` : ''}${tx(b + '.why') ? `<p class="why">${esc(tx(b + '.why'))}</p>` : ''}${tx(b + '.simplification') ? `<p class="simp"><b>Simplified:</b> ${esc(tx(b + '.simplification'))}</p>` : ''}</article>\n`;
  }
  return frame('Codex', 'The ideas behind EQUILIBRIUM\'s rules: what each means in the plant, why it holds, and the simplification the game makes.', '<a href="./">Wiki</a> / Codex', cx, 'codex.html');
}

// ---- the home page -------------------------------------------------------------------------------------------------------------
/** Not built yet, in plain words. Review with each release. */
export const PLANNED: string[] = [
  'The next release (0.14) puts chapter 5 (the recycle loop) and chapter 6 (containment) in the hall: the loop with its compressor, the column and the fermenter, the reactor in its bund with its relief.',
  'A stray A press that opens the Codex from the notebook strip was reported in 0.12 and could not be reproduced in 0.13.',
  'Chapters 7 to 10 and the Career in the new look. No date is set.',
]
export const IDEAS = 'Ideas from the design doc that are not built or scheduled: a daily shift, Hindi strings, more plants (urea, chlor-alkali), stage-by-stage distillation, a teacher mode.';
export const NOT_CHECKED: string[] = [
  'The art review of 0.13 scored the new look 6.5 of 10 (6.48) against a target of 6.5 or more. Ten of 26 scenes are under 6.5; vessel materials are the main reason.',
  'Nobody has listened to the sound.',
  'The Windows build has not been played by a person.',
  'The phone layout was not re-checked by hand in 0.13.',
];

function nowSection(): string {
  const rel = releaseOf(read('CHANGELOG.md'));
  const wm = worksMap();
  const ids = levelIds();
  const newJobs = SPECS.filter((s) => /^L\d\d$/.test(s.id) && isNewLook(s.id, s.chapter, wm)).map((s) => s.id);
  const classicJobs = ids.filter((i) => !newJobs.includes(i));
  const chaptersOf = (list: string[]): string => CHAPTERS.map((c) => ({ c, ids: idsOf(c.n).filter((i) => list.includes(i)) })).filter((x) => x.ids.length).map((x) => `${x.c.n === 0 ? 'the prologue' : `chapter ${x.c.n}`} (${ranges(x.ids)})`).join(', ');
  return `<section class="now card" id="now" aria-labelledby="now-h">
<h2 id="now-h">What is in the game now</h2>
<dl class="facts">
<dt>Version</dt><dd>${esc(rel.version)}, "${esc(rel.name)}". Alpha. This wiki is built from that release.</dd>
<dt>Campaign</dt><dd>${ids.length} levels (${ranges(ids)}) on ${wm.stops} stops of the Works Map: the prologue, ten chapters and the Career. All of them can be played.</dd>
<dt>Career</dt><dd>Five seeded years running the Works.</dd>
<dt>In the new look</dt><dd>The title and the lab, ${chaptersOf(newJobs)}${classicJobs.length ? '' : ', and the Career'}.</dd>
${classicJobs.length ? `<dt>Still classic</dt><dd>${chaptersOf(classicJobs).replace(/^./, (c) => c.toUpperCase())}, and the Career. The Works Map marks each chapter.</dd>` : ''}
<dt>Platforms</dt><dd>${PLATFORMS.join(' and ')}. The macOS build is untested: no one has opened it on a Mac.</dd>
</dl>
<h3>The campaign is complete. What is not built yet</h3>
<p>Every level and the Career exist. What is left is mostly the look:</p>
<ul>${PLANNED.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<p>${esc(IDEAS)}</p>
<h3>What nobody has checked yet</h3>
<ul>${NOT_CHECKED.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
</section>`;
}

function indexPage(): string {
  const wm = worksMap();
  const items = CHAPTERS.map((c) => {
    const ids = idsOf(c.n);
    const nw = ids.filter((i) => isNewLook(i, c.n, wm)).length;
    const chips = nw === ids.length ? lookChip('new') : nw === 0 ? lookChip('classic') : `${lookChip('new')} ${lookChip('classic')}`;
    return `<li class="card-row"><a href="chapter-${c.n}.html"><b>${esc(chTitle(c.n))}</b></a> ${chips}<span>${esc(c.teach.split('. ')[0]!.replace(/\.$/, ''))}.</span><span class="ids">${ids.join(' · ')}</span></li>`;
  }).join('\n');
  const body = `<h1>Player wiki</h1>
<p class="lede">What each chapter teaches, every job with its goals and what a miss looks like, the controls, the Career and the Codex.</p>
${nowSection()}
<h2>Start here</h2>
<ul class="start"><li><a href="how.html"><b>How a job goes</b></a><span>The steps, with shots.</span></li><li><a href="controls.html"><b>Controls</b></a><span>Mouse, keyboard and gamepad.</span></li><li><a href="codex.html"><b>Codex</b></a><span>The ideas behind the rules.</span></li></ul>
<h2>The campaign</h2>
<ul class="chapters">
${items}
<li class="card-row"><a href="career.html"><b>Career · five years</b></a> ${lookChip('classic')}<span>Run the whole Works for sixty months.</span></li>
</ul>`;
  return frame('Wiki', 'The EQUILIBRIUM player wiki: what is in the game now, every chapter and job, the controls and the codex.', 'Wiki', body, 'index.html');
}

export function wikiPages(): Record<string, string> {
  const out: Record<string, string> = { 'index.html': indexPage(), 'how.html': howPage(), 'controls.html': controlsPage(), 'career.html': careerPage(), 'codex.html': codexPage() };
  for (const c of CHAPTERS) out[`chapter-${c.n}.html`] = chapterPage(c.n);
  return out;
}
