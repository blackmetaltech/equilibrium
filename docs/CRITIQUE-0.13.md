# CRITIQUE 0.13: "Inside the Bed" (2026-11-24)

Layer 0.13 of LOOK2 (phase D, first of two releases). Chapter 4 (L15-L18) and L09 stand in the hall: a catalyst bed you can see into, glass kettles that foam, and a laboratory bench for the calorimeter exam. The art misses and pad items from CRITIQUE-0.12 were worked first. Decision records D-13-1 and D-13-2 are in `docs/LOOK2.md`.

## The gate (factory brief for phase D, 0.13)
| Item | Result |
|---|---|
| 1. CRITIQUE-0.12 art misses: six scenes under 6.5, the low-tier floor, the teal strip, text under 16 px | **Partly met.** The low-tier floor is lit (Sigrid's L16-compat 6 -> 6.5). The hall console is smoked glass, not teal. Text: the speed marks, the title foot and the map legend are 16 px at 1080p (layout_flow, 0 under the floor). The warm floor patch with no source (L10-L12) was the outside flare light through a window gap; it is off in the hall. Of the six 0.12 misses, the Works map (5.5 -> 6.5) and the analyser (5.5 -> 6.5) reached the target; the brief (5.5 -> 6), L08, L11 and L13 wide (6 each) did not. |
| 2. Pad items from 0.12 | **Met.** LB/RB land on the last tile you used; the keypad has a hint and shortcuts; the pad hint row is hidden over the hall (Kofi, cc2380a). The stray Codex was found late, from a flaky flow: LB/RB with a part in hand opened it; fixed and checked. Pad entry to a chapter's sheet on the new map is by A on its tag only, and **no person has tried it by pad** (see Playtest). |
| 3. L09 and chapter 4 in the new look | **Met.** Every L09 and L15-L18 plant stands in the hall. The chemistry shows: the bed glows by its temperature down the bed and five wells read it; the kettle's foam head grows with the rate; the furnace's tube glows and its controller reads the temperature the level reports. `hall4_flow` (49 checks) checks each against the engine. |
| 4. Version-sync guard test | **Met.** `src/version-sync.test.ts`. |
| 5. Art target: every scene 6.5 or better | **Not met.** Three reads of the same 26 scenes: 6.29, 6.40, 6.48. Ten scenes are under 6.5. See D-13-2. |
| 6a. Hand play on the GPU | **Met for mouse, not for pad.** RTX 4090 in the log. Lena won L15, L16, L18 and L09 by mouse; L17 not won. No pad pass: the virtual pad reaches every Godot window on the machine and other sessions had windows open. |
| 6b. Tests and flows | **Met.** Vitest 159 files, 2446 passed, 2 skipped. `scripts/flows.sh` (JOBS=2): 56 of 56 pass on the release head, after the three flaky flows below were traced to their causes. |
| 6c. Low tier on the integrated GPU | **Met.** Radeon iGPU (radeonsi), compat tier, 1280x800, hall with the plant built: L16 16.8 ms average (p95 18.1, GPU 12.2 ms); L09 11.9 ms (GPU 8.6 ms). Sigrid's L16-compat: 6.5. |
| 6d. CHANGELOG and this file | Met. |
| 6e. Site, wiki, README shots and GIFs | **Met, with one GIF kept.** Four new stills on the 4090 (the bed window, the foaming kettle, the L09 bench, the Works map model) in the README and on the site. The Night Shift trip GIF is re-recorded with the smoked-glass console (1.4 MB). The colour-shift GIF is kept from 0.12: nothing in the L14 lab changed this layer, but nobody re-recorded it to prove that frame for frame. The recipe is now `scripts/gif.sh`. Wiki regenerated with the 0.13 art score. |
| 6f. Builds for Linux, Windows, macOS | From the v0.13.0 tag by the release workflow; result on the board. |

## Critique
| Critic | Score | What they said | Done after |
|---|---|---|---|
| Sigrid (art), read 1 | 6.29 (26 scenes; 14 under 6.5) | L09 a school desk and a stovepipe; L18 foam not visible; the cold top of the bed lit brightest; no glass in the window; thermowell tags 12 px on compat with stems through them; the hint dotted by sparks; "FLUE" cut off | L09 rebuilt; foam head and rim light; per-level views; glass; plates; banner plate |
| Sigrid, read 2 | 6.40 (12 under) | L09 a bench you can describe but the lamp burns the backboard; L18 a plastic tub; the L16 pellets flat | Lamp -40 %, backboard grey; foam of bubbles; analyser line shortened |
| Sigrid, read 3 | 6.48 (10 under) | L18 foam reads (subject: yes). L09 better but the bomb stays shut in its cabinet (subject: weak). Materials hold down about 20 scenes | Carried to 0.14 (D-13-2) |

Text size: Sigrid measured about 14 px on 1600x900 shots; the UI scales with the window (0.83 of 1080p), so 16 px reads as 13.3. At 1080p the floor holds (layout_flow). The diegetic analyser screen is about 12 px; the recorder carries the same numbers.

## Playtest (GPU, real speed)
- **Lena, 16, mouse, chapter 4:** won L15, L16 and L18 first try; L17 not won (the lesson, that a catalyst changes the rate and not the end point, came through). "The glowing bed made me smile. I would reopen it tomorrow." Found: the bottom thermowell read 525 C against the recorder's 527.2 C (fixed: the last well sits at the outlet, checked in hall4_flow); L16's exchanger ports crowd and their labels overlap; "Bed temp high" amber while "Goal met" is green on L15; flask 2 on L16 (heater at most 10 kW) has no pointer to its lever; the L18 catalyst card wraps in a narrow column; wheel zoom pushes the target under the console.
- **Lena, L09:** won (all three exam items, all flasks). Found: **the recorder's furnace pen read 298 K the whole run while the printout said 2400 K** and the bench glowed. The recorder took each run's point at commission. Fixed: during a first run the latest point follows the plant (`hall4_flow` plays L09 the player's way; it failed before the fix with 298.15 against 2400). Also: the bench is small at the default view; exam item 3 needs a scroll.
- **Pad:** not played by a person. To run when the machine is quiet: `padstart.sh`, then `desk-gpu.sh h start ... CB_PAD=1 CB_HOME=map`, then `padrun.sh`.

## Flaky flows found and their causes
- `fix21_flow` failed once in the full suite: the notebook was still sliding in after 10 frames. It now waits, at most 240 frames, until the Start key holds still; the assertion is unchanged.
- `fix24_flow` failed 6 of 18 runs alone: the Career seed came from the wall clock, so the stop's text changed from run to run, and the short text fits two lines at 1280x800, where no "more" key is due. The banner check now runs on a pinned seed. A first guess at the board code did not help and was reverted.
- `pad13_flow` failed 1 run in 3: **a product bug**. With a part in hand, LB or RB fell through to the shell's drawer switch and opened the Codex. This is the 0.12 "stray Codex" that nobody could reproduce. Fixed; a new check fails before the fix and passes after.

## Open, carried to 0.14 (first items)
1. Materials across the hall (D-13-2): one shared material library (brushed stainless, worn painted steel, seamed cladding, matte enamel), nothing chalk-white. Sigrid's first item; about 20 scenes.
2. L09 staging: the bomb out of its cabinet beside the furnace under one pool of light; the bench larger in the default view.
3. Pad pass on the Works map and chapter 4 by a person.
4. Classic drafting-table items from Lena: L16 exchanger port labels overlap; amber "Bed temp high" beside a met goal; L16 flask 2 needs a pointer; L18 catalyst card wrap; wheel zoom toward the cursor.
5. `_arc` draws its outward faces facing away (worked around with two-sided materials in the bed window and the L23 fermenter).

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A a game, not SaaS | Mostly | The Works map is a scale model on the planning table. The drafting table's inspector cards are still forms. |
| B its own soul | Pass | The boy genius's lab and his plant hall; the bench in the hall is his. |
| C realism, proportion, texture | Mostly | 6.31 -> 6.48 over 26 scenes; ten under 6.5. The vessels lack material variety. |
| D readability | Mostly | 16 px floor holds at 1080p (layout_flow). Thermowell readouts on plates. The analyser screen is small but diegetic. |
| E every control works | Mostly | Mouse play of five levels found no dead control. Pad not tried by a person this layer. |
| F scroll and input stability | Pass | No regressions in flows; the L09 brief's item 3 needs a scroll and says so. |
| G device classes | Mostly | Compat tier scored 6.5 at 1280x800. Phone not re-checked by hand (phone_flow OK). |
| H learnable by an impatient first-timer | Pass | Lena won four of five levels cold. |
| I logic integrity | Pass after a fix | The recorder disagreed with the printout in L09; found by hand play, fixed, and now a flow check. The thermowells match the recorder. |
| J depth to employable | Unchanged | No engine change; chapter 4 got its equipment. |
| K fun and long-term play | Not scored | No fun critic this layer. Lena would return tomorrow. |
| L performance | Pass | 4090 Forward+; Radeon compat 1280x800 at 12-17 ms a frame in the hall. |
| M sound | n/a | No sound work by brief. Nobody has listened. |
| N saves and quitting | Pass | No save change. |
| O release hygiene | Pass | CHANGELOG, D-13-1, D-13-2, wiki regenerated, version guard test. |
| P visible status | Pass | Board lines at each milestone, including the target miss. |
| Q cost, machine, tidiness | Pass | One helper at a time; GPU only through the shared lock; no pad input sent while other sessions had windows. |
| R story and world | Pass | Unchanged voices. |
| S cute that teaches | n/a | No change. |
| U README, screenshots, releases | Pass | README and site lead with 0.13 shots; the trip GIF re-recorded; a GIF recipe in the repo. |

— Ingrid Solheim, Game Lead
