# EQUILIBRIUM: interface and soul (v1, Opus, 2026-11-10). Binding for the front-end.
Supersedes DESIGN §5.6 (UI chrome palette) and §6.1/§6.4 (drawer layout). DESIGN §5.1-5.5 (world, views, Equilibrium
Window, beam, lens, Semenov, alarms) and §6.2-6.3 (verbs, input map) stay, re-skinned as below.

## The soul in one line
**You run the control room of a 1970s chemical works you are bringing back to life.** Enamel mimic panels, annunciator
windows, pen chart recorders, Bakelite knobs, Dymo-tape labels, an intercom, a squared lab notebook and the plant
computer's green-bar printout. The world (the 3D plant) is always full-bleed; the console is a strip of hardware in front of it.
It must not look like GIGAWATT (top stats bar, tab buttons, cyan card stacks, Chakra Petch) **nor like GRID** (night sodium,
paper docket + radio + breaker + Big Shoulders/Plex). EQUILIBRIUM is *daylight-to-dusk, enamel and ink pens*.

## Palette (`godot/ui/eq_theme.gd`)
| token | hex | use |
|---|---|---|
| enamel | `#2C4A45` | console panel face (deep green-teal enamel), drawer backs |
| enamel_hi | `#3E635C` | raised bezels, panel seams (1 px light top edge) |
| porcelain | `#E9EDE4` | notebook pages, faceplates, recorder chart paper (cool, never GRID's warm paper) |
| ink | `#1E2A2E` | text on porcelain |
| beam teal | `#2EC4B6` | **the accent**: focus ring, primary key, equilibrium state, "lock" |
| lamp amber | `#FFB703` | High alarm windows, warnings |
| lamp red | `#E63946` | Critical alarm windows, failures, red pen |
| lamp white | `#F4F1DE` | normal/info annunciator windows |
| pen blue / pen red / pen green | `#2D5DA8` / `#C8323C` / `#2E8B57` | chart-recorder traces |
| dymo | `#141414` tape, `#F2F2F2` letters | unit tags, knob labels |
| greenbar | `#DDEBD5` / `#F7F9F2` | printout stripes |
| text / dim (on enamel) | `#E8EFEA` / `#9FB3AC` | |
Species colours: DESIGN §5.6 table, unchanged (physics only).

## Type (OFL, in `godot/ui/fonts/`)
- **Archivo** (variable, wdth 125 / wght 800): titles, level names, the logo. Wide 1970s industrial grotesk.
- **Barlow** (Regular/SemiBold): body text, sentence case. Min 15 px logical on desktop.
- **Space Mono** (Regular/Bold): readouts, faceplate numbers, notebook figures.
- **VT323**: the plant-computer printout (report) only.
- Dymo labels: Barlow SemiBold caps drawn white on black tape with a 1 px emboss highlight (caps allowed *only* on Dymo tape and annunciator windows, as on real hardware).

## Screen anatomy (desktop 1920×1080; world full-bleed)
```
 [notebook tab: L01 Moles, Not Kilograms ▸]                                       [⚙ small]
                              ·· the plant, full-bleed, daylight/dusk ··
                     faceplates and the Equilibrium Window float over selected units
 ┌──────────── CONSOLE (bottom, enamel, ~150 px, slight perspective top bevel) ──────────────────────────────────┐
 │ [INTERCOM ▣ MARA ›line]  │ [ANNUNCIATOR 2×4 windows] │ [CHART RECORDER: goal pen vs target band] │ [KEY] │
 │ [P&ID PARTS RACK: enamel tiles with real ISO 10628 symbols + Dymo names + price] ........................│ [SPEED]│
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
### 1. Parts rack (replaces the Build drawer)
Enamel tiles with the **real P&ID symbol** of each unit (ISO 10628 / ISA 5.1 shapes: vessel, reactor with bed hatching,
compressor trapezoid, shell-and-tube circle-with-line, flash drum, column, valve bow-tie, flare, cylinder bank) and a Dymo name
under it ("H₂ BANK", "MIXER", "REACTOR"). Only units the level allows; count limits as small pips; price on the tile.
Pick a tile → ghost on the build grid (green/red footprint) → click/tap/A to place. Placed units get **ISA tags** automatically
(R-101, E-102, V-103, K-104, FIC-101 for a feed's flow controller) shown on Dymo tape on the model. *Employability: the player
reads and builds P&IDs from chapter 1.*
### 2. Faceplates (replaces the Inspect drawer)
Select a unit → a **controller faceplate** (porcelain, tall, 180×300) pops beside it on a thin leader line, like a 1970s panel
controller: ISA tag + Dymo name at top; a vertical PV bar with the SP marker (and, for controlled units, the OP %); a big
Bakelite **rotary knob** (drag/rotate, wheel, LT/RT fine; tap the number for the keypad) for each setpoint; mono readouts below;
buttons *Why?*, *Lens*, *Window* (Equilibrium Window for reactors). Two faceplates max; the second pins. Streams (pipes): hover/tap →
a small porcelain **tag** with flow (kmol/h *and* kg/h side by side in chapter 1), T, P, top-3 species with colour swatches.
### 3. Intercom (replaces toasts and the coach)
A grille box bottom-left with four name lamps (MARA, TOMAS, VICTOR, NOOR); the speaker's lamp lights, their line types out in
Barlow (one line, two max). Coach steps arrive here; the current step keeps a teal tick; *why?* opens Mara's explanation.
Click → intercom log. Engine refusals come as **TOMAS** ("Can't pipe a gas outlet into the sulfur pit") in amber.
### 4. Annunciator (replaces the alarm list in design phase too)
2×4 backlit windows with engraved caps legends from the level (L01: `VENT FLOW HI`, `NH₃ OFF SPEC`, `H₂:N₂ RATIO`, `SOLVE FAIL`);
off = dark glass, normal-true = white, High = amber flashing until ACK (K / A / tap), Critical = red + klaxon. ISA-18.2 sequence
(flash → ack steady → clear). In the shift they are the alarm system; in design they are the live goal checks (a lit white
window means "this goal is met"; dark means not yet).
### 5. Chart recorder (replaces the goal meter / KPI chips)
A strip-chart window with porcelain paper scrolling right→left and up to three ink pens: the level's **hero quantity** (L01: NH₃
kmol/h, blue pen) against a printed **target band**, plus a secondary (vent %, red pen). Each commission adds a short pen trace
segment (a run = a tick mark with the run number), so the paper is the player's experiment history. During a shift it scrolls in
plant time. Click → full-size recorder with pinned trends (DESIGN "Trends").
### 6. Key switch + speed (replaces Commission/Start buttons and the speed pill)
A chunky **key switch** with three positions: DESIGN · COMMISSION · RUN (shift). Turning to COMMISSION runs the solve with the
3-second start-up cinematic (DESIGN §1.3); RUN starts the shift. Beside it a rotary speed selector ‖ 1× 4× 16×. Space = turn the
key one step; pad Y; touch: tap the key.
### 7. Lab notebook (brief + coach checklist; replaces the brief card)
Squared porcelain notebook page that slides up over a dimmed world: level title in Archivo ("01 · Moles, Not Kilograms"), the
setter's note in Barlow *as a handwritten-feel note signed by the character*, **Goal** as ruled lines with tick boxes, budget,
stars as three ⚗ flasks (empty/filled), and the optional **Call it** box (a ruled answer line with units: "H₂ needed: ____ kg/h").
Button "Start work" (teal key-cap). Closes into the top-left tab.
### 8. Printout (report; replaces the report card)
The plant computer prints the run on **green-bar tractor-feed paper** (sprocket holes, VT323): header "KESTREL BAY WORKS ·
RUN 007 · L01", goal lines with PASS/FAIL, the three flasks stamped, metrics, the histogram drawn as printed `█` bars with the
player's run marked `◄ YOU`, the **Call it** check, and Mara's note in blue pen at the margin with the player's numbers. Failure
prints the same sheet with `*** RUN ABORTED ***` and the cause line + the equation with their numbers (red pen circles the
wrong number). Buttons on the paper edge: Retry · Next job · Copy design code. Never show a histogram on a failure.
### 9. Title
The Works at dusk from the jetty, most plants dark and rusted, the QC lab lit; slow pan. Top-left in Archivo 800 wide:
**EQUILIBRIUM** with the balance-beam logo whose beam rocks and settles level; subtitle "run the plant that feeds the world".
Menu as Dymo-tape strips on an enamel plate (focus = teal indicator lamp lit beside the strip): Continue shift / New works,
Works map, Sandbox, Settings, Quit (desktop). Mode choice (Learner/Engineer) in the first notebook page footer.
### 10. Works map (meta)
The complex from above; each level is a plant site with an annunciator-style lamp (dark → white when won → teal ★★★).
Chapter plants light up and their pipelines connect as chapters complete.
### 11. Phone / Deck
Phone: console collapses to one row (intercom 1 line, 4 annunciator windows, recorder mini, key); parts rack becomes a scroll
strip that slides up from the console; faceplates open as a right-side sheet (40 % width); tags as bottom sheet. Deck: desktop
with 1.25× targets and pad glyphs on key (Y), rack (LB/RB), ACK (A).

## Cute mode (Settings, default ON) — molecule critters; charm encodes the physics
- **Critters in the pipes and the Molecule Lens:** each molecule is a round critter in its species colour with a tiny face.
  **Count ∝ molar flow** (largest remainder, same rule as the Lens), **size ∝ molar mass^(1/3)**, speed ∝ √T. So in L01 the
  player *sees* that 30 kg of H₂ is fifteen times more critters than 30 kg of N₂ would be — the lesson is the cuteness.
- N₂ critters are twin balls holding hands; H₂ tiny white twins; NH₃ a violet critter with three little H feet;
  O₂ cyan twins; SO₂ a yellow grump; argon/inerts **wear sunglasses and do nothing** (inert); water a blue droplet.
- **Reactions:** in a reactor, 1 N₂ + 3 H₂ hug → 2 NH₃ pop out (the stoichiometry as an animation); at equilibrium you see
  hugs and un-hugs at equal rates (dynamic equilibrium). Leftover reagent critters exit the vent looking lost.
- **Plant life:** gulls on the pipe rack that flap off when a compressor starts; flamingos in the salt pans; Mara's lab cat on
  the QC lab roof, which hides when an alarm sounds; workers in hard hats who walk to an alarming unit.
- Cute OFF: critters become plain balls (still counted), no faces/animals.

## Acceptance for chapter 1 (my gate)
1. No shared chrome/font/layout with GIGAWATT or GRID (side-by-side screenshots).
2. A Sonnet novice completes L01 using only the intercom and says *why* the mass-ratio feed vented hydrogen.
3. Truth tests: every faceplate/tag/recorder/printout number equals the engine value; the printout equation evaluates.
4. Layout audit clean at 1920×1080, 1280×800, 2424×1080; pad-only and touch-only finish L00-L04.
5. Pixel ≥ 30 fps on L00-L04.
