# CRITIQUE 0.12: "The Lab at Home" (2026-11-23)

Layer 0.12 of LOOK2. The private lab is the home screen. The hall's equipment is rebuilt from the art director's list, and chapter 2 (L05-L08) builds in the hall. Text is plain. Pad play on the drafting table works on handheld. Decision records D-12-1 to D-12-5 are in `docs/LOOK2.md`.

The lead changed mid-layer: Ingrid took over at 13:25 from a lead that had hung twice.

## The gate (factory brief for 0.12, in priority order)
| Item | Result |
|---|---|
| 1. Art: re-score first, then Sigrid's list worst first; every scene 6.5+, the lab 8; 3D textures with mipmaps | **Not met.** Average 4.9 -> 6.15 -> 6.31 over three rounds. 13 of 17 rows are 6.5 or better; the title is 7.5. Under target: Works map 5.5, brief 5.5, analyser 5.5, L08 6, L11 6, L13 wide 6. The lab is 7.5 against 8. Mipmaps: textures_flow OK. |
| 2. The lab as home: works and looks right | **Met.** Title, Works map and brief live in the lab (home_mouse_flow, home_pad_flow). The map and brief are paper on a drafting table. Lena used it cold with the mouse. |
| 3. Text: short briefs, device-right prompts, no all-caps strip, larger port dots, "real X" swept with a test | **Met.** Briefs open with three short lines. Prompts say click, tap or press A. The annunciator lists only what is lit. The map is in sentence case. `src/no_real_selling.test.ts` guards locales, Godot strings, site, wiki, README and the newest CHANGELOG section; it caught one of my own CHANGELOG lines. |
| 4. Flaky flows: build_guide_flow and fix18_flow | **Met, plus one.** fix18 (clock-seeded Career, overflowing card) and build_guide (clicks during the notebook's settle) were fixed earlier in the layer. fix28 failed 1 in 6 under load (the shift clock ran before the test parked it); fixed without changing an assertion. |
| 5. Next chapter, only if 1-4 are done; decide with Priya | **Done early, partly.** L05-L08 build in the hall. L09 stays classic and the map says so (D-12-5). Strictly, item 1 was not done when this started; the models were already half built by the previous lead. |
| 6a. Hand play on the GPU, mouse and pad | **Met on the third pad round.** RTX 4090 confirmed in the log. Lena (mouse) won L01 and L02; Tomas (pad, handheld) finished L01 after two rounds of fixes. |
| 6b. Tests and flows green | **Met.** Vitest 2430 passed, 2 skipped. `scripts/flows.sh`: 53 of 53 OK, no SCRIPT ERROR in any log. |
| 6c. Low tier usable on the integrated GPU | **Met.** Radeon, compat tier, 1280x800: 33.3 ms (30 fps cap), GPU 7 ms. Sigrid scores the compat frames 5-5.5: the floor is nearly black. |
| 6d. CHANGELOG and this file | Met. |
| 6e. Site, wiki, README shots and GIFs on the released build | **Met.** New shots and both GIFs re-recorded on the 4090. The wiki text is fresh (wiki test). |

## Critique
| Critic | Score | What they said | Done after |
|---|---|---|---|
| Sigrid (art), round 1 | 4.9 | Pipe racks and grey boxes with floating labels; a floor glint in every view; blown and black bed bands; the camera too close | Kofi's hall pass, the lab pass, the instrument panels |
| Sigrid, round 2 | 6.15 | Chapters 2 and 3 read as plants in a hall; the burner drum is the best equipment in the game | Round-2 list |
| Sigrid, round 3 | 6.31 | The title is the best frame in the game; the map needs a 3D site plan; the brief needs a pencil sketch | Ledger padding only |
| Priya (product) | (a) ship | Ship L05-L08 in the new look and L09 classic. Against: chapter 2's exam ends in the old look | Recorded in D-12-5 |

## Playtest (GPU, real speed)
- **Lena, 16, mouse:** won L01 and L02 cold. The printout, the pipe drag and the hall flip work. Problems: no hint that the hall can be orbited; the L02 Call-it on O2 felt unfair because she called it before setting the air; L05 aborted on its first run (vessel over temperature) before the hall showed.
- **Tomas, pad only, handheld:** round 1 failed (the dial would not turn by D-pad anywhere, the bin took focus, four handheld layout collisions). Round 2 got through placing and three wires (focus lost after a wire, the H2 chip unreachable). Both rounds were fixed with new flows (`pad_handheld_flow` pipes all of L01 by D-pad on handheld). Round 3 (cdf3839): **passed.** He finished L01 by pad alone, title to printout (both goals PASS), then R3 to the hall and X back, in about 25 minutes of play. Left: a stray A can open the Codex from the notebook strip and B must be pressed twice; LB from the plot always lands on the last tray tile; parts can sit close enough to cramp ports; the calculator has no move hint (about 20 presses for 30.24); the pad hint row also shows over the hall, where it does nothing.

## Open, carried to 0.13 (first items)
1. Art under target: the Works map as a 3D site plan; a pencil sketch of the plant on the brief sheet and the dais top blown out; the analyser close-up (sample line not in view, black stack base); L08 heater still small in frame; warm floor pools with no visible source in L10-L12 (probably the plant downlights, fixtures out of frame; not proven); L13 wide still dim; the glare halo over the title's rod; L14 still has the old camera; the compat floor nearly black.
2. Text under 16 px by eye: the speed dial marks (about 12 px), the title foot and the map legend.
3. L09 in the new look (a bench scene in the lab).
4. Pad: the Codex opens on a stray A and needs B twice; LB lands on the last tray tile; calculator move hint; the hint row over the hall. Hall: no orbit or zoom hint. L02 Call-it timing (call before air is set). L05 aborts before the hall shows.
5. A flow printed OK after a parse error with fewer checks (instruments_flow, 7 checks instead of 19). The flow runner should fail on any SCRIPT ERROR.
6. Kofi's commit 325b89f says the L11 pool is fixed; it is not.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A a game, not SaaS | Mostly | The lab is home, the map is paper, no all-caps chips. The map is still a row of cards (Sigrid). |
| B its own soul | Pass | A boy genius's private lab as home; the plant hall at night. |
| C realism, proportion, texture | Mostly | 4.9 -> 6.31. Equipment has heads, nozzles, saddles, cages, an I-beam rack. Six scenes under 6.5. |
| D readability | Mostly | layout_flow OK with a new collision audit. Three texts under 16 px by eye. |
| E every control works | Pass after fixes | The pad dial bug was found by hand play, not by any flow; now covered. |
| F scroll and input stability | Pass | Focus stays on the sheet; flows isolated from machine pads. |
| G device classes | Mostly | Handheld layout fixed and checked by pad. iGPU 30 fps. Phone not re-checked by hand (phone_flow OK). |
| H learnable by an impatient first-timer | Mostly | Lena won L01 and L02 cold. No orbit hint in the hall. |
| I logic integrity | Pass | No engine or grading change this layer. |
| J depth to employable | Unchanged | No new content depth; chapter 2 got its equipment. |
| K fun and long-term play | Not scored | No fun critic this layer. |
| L performance | Pass | 4090 ultra; Radeon compat 30 fps. |
| M sound | Partial | Unchanged from 0.11; nobody has listened. |
| N saves and quitting | Pass | No save change. |
| O release hygiene | Pass | CHANGELOG, decision records, wiki fresh, version bumped, full gate run. |
| P visible status | Pass | Board lines at each milestone, the usage-limit stop and every failed retest; this file lists every miss. |
| Q cost, machine, tidiness | Mostly | One helper at a time, except one overlap (Sigrid's read-only score while the playtester queued for the GPU). GPU only through the shared lock. Two helper runs died on API overload; their work was finished and checked. |
| R story and world | Pass | Unchanged voices. |
| S cute that teaches | n/a | No change. |
| U README, screenshots, releases | Pass | README and site lead with 0.12 shots and new GIFs. |

— Ingrid Solheim, Game Lead
