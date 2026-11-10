# CRITIQUE 0.3: chapters 2-9 and Career, first full play pass (2026-11-11, night)

Four persona play-testers drove the desktop build through the desk harness. Each made 80-190 actions. Screenshots are in `.qa/equilibrium/{a,b,c,d}/shots/`.
All findings, verbatim, are in `.work/backlog.md`. Fixes are in round F3: lanes F3a (engine/text), F3b (Godot), and units round 3 (Ch6).

| Tester | Persona | Levels | Won | Headline |
|---|---|---|---|---|
| a | JEE aspirant, 17 | L05 L06 L07 L10 L12 L13 | none: L05 shift ran 180/180 s, SO₂ goal missed | "The interface fights you more than the chemistry": the DESIGN/COMMISSION/RUN key, the click-click piping, and "build as before" briefs |
| b | ChemE year 2 | L15 L16 L19-L22 | L15 | The intercom teaches well; the heater utility dial is a trap; L16 sleeps; L20-L22 show a $0 budget |
| c | teacher | L23 L24 L25 L27 L09 L14 | L23, L09; L14 goal only | Physics is mostly sound. Unit bases are not labelled (mol % vs wt %, bar(g) vs bar(a)), answers leak before predictions, and there is no way back from RUN |
| d | junior process engineer | L29 L30 L33 L34 L35 L37 L38 | L29, L30, L33 | "It does feel like real work." Bugs: the cost readout is 10× off, stars show while a goal has failed, and board levels show an empty slab |

## Scores (0-10; a / b / c / d)
| Criterion | a | b | c | d |
|---|---|---|---|---|
| Brief → goal | 7 | 7 | 7 | 8 |
| Win from in-game guidance | 3 | 4 | 4 | 7 |
| Teaching | 6 | 7 | 6 | 7 |
| Feedback truth | 5 | 5 | 4 | 5 |
| Fun | 6 | 6 | 6 | 7 |
| Polish | 4 | 4 | 5 | 5 |
| Depth / progression | 7 | 8 | 7 | 8 |

## What works
- The teaching voice. Intercom lines carry the player's own numbers (8.2 MW from 100 kmol/h × 296.8 kJ/mol; 99.94 % approach to equilibrium).
- Every DESIGN number that was checked held up: ΔH − ΔU = 2RT; Semenov hysteresis; the DCDA emission identity; the API relief letter.
- Ch8 and Ch9 read as real engineering: a bump test feeds IMC tuning, voting logic, a HAZOP matrix, SOP ordering and CPM planning.
- The ramp of depth from std 9 to a junior engineer is visible across chapters.

## What fails (themes)
1. **The run/design state machine.** There is no clear stop/edit. Edits reset to DESIGN silently, and "Restart job" wipes the build and the prediction.
2. **Building is hard to discover.** Piping is click OUT then IN, with no drag and no ghost line. Ports are unlabelled, and the heater utility cycles on click.
3. **Unit honesty.** Values carry no basis (mol % vs wt %, g vs a), keypad bounds are absurd, and one readout is 10× off.
4. **Spoilers.** Call-it answers appear in intercom, why and flask text before the player predicts.
5. **Briefs assume continuity.** "As before" leaves a player who starts mid-campaign with nothing.
6. **Board levels have no world.** L33-L38 and Career show an empty slab.
7. **Several predictions per level.** L09 and L18 need `callIts[]`.

## Gate for 0.3 → 0.4
Every theme above is fixed and tested. A re-run of testers a-d must win at least one level per chapter using only in-game guidance, and must find no feedback contradictions.
