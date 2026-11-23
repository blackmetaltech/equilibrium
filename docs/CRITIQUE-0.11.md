# CRITIQUE 0.11: "The Bench in the new look" (2026-11-23)

This was LOOK2 phase C. Chapter 1 (L01-L04) joins the drafting table and the 3D hall. L14 gets a real goal. The drafting table plays by pad. The new look has sound. Decision records D-C1 to D-C9 are in `docs/LOOK2.md`.

## The gate (factory/briefs/LOOK2.md, phase C)
| Gate item | Result |
|---|---|
| Close the open gaps in CRITIQUE-0.10, worst first | **Mostly met.** Closed: L14's win (D-C1, D-C8, D-C9); the printout wait now has a countdown; the hover label over the Call box; the L11 silent drags (two causes fixed, regression tests); the drafting table by pad. Still open: the L12/L13 brief text clipping and the L13 bed warning cut (not reproduced; the playtester did not reach L13). |
| The next chapter in the new look, with the reason written down | **Met.** Chapter 1 (D-C2, Priya; D-C4). It adds a burner, a stack with a flue analyser and a bench reactor to the hall. There is no separate QC-lab room (cut, written down). |
| Sound and pad in the new look; sources in ASSETS.md; say who has listened | **Met.** Sound is synthesised and has no files (docs/ASSETS.md). The plant bed follows live state, and L14's controls click. **No human has listened to the mix.** Pad: `pad_build_flow` wins L01 and L10 with joypad events only. Not covered by pad: the Career's yearly cards, the L30 loop knobs and the Light theme. |
| Hand play on the GPU | **Met.** `scripts/desk-gpu.sh`: Forward+ on the RTX 4090, presented into the tester's own Xvfb (confirmed in the log). The frame cost is about 45 ms, set by the readback; the GPU takes 8 ms. Lena played L01, L02, L03 and L14 by mouse. |
| Site and README: no classic shots above the fold or in "how it plays"; paragraphs of one or two plain sentences | **Met.** The site's hero, the "how it plays" steps and the README lead are all new-look shots. Classic galleries are labelled "(classic look)". The README's download section no longer says "no public release". |
| Art toward shipped sims; Sigrid re-scores at the end | **Re-scored: average 4.9.** See below. Her worst finding is real and was fixed after she scored: every hall shot she saw was the wide view, because of a camera-spec bug. |
| The load-sensitive tests made robust without loosening | **Two of three.** The engine timing test is fixed, and pad_build_flow (new) is isolated from machine gamepads (D-C7). build_guide_flow is **not explained**: it passed in the last three full runs, and its check now names what took the click. fix18_flow is a further intermittent failure, found this layer and present in phase B runs (1 run in 2 alone at one point; 3 passes in a row since). It gets the same diagnostic. |
| Tests and flows green | **Met on the release candidate.** `scripts/flows.sh`: 48 of 48 flows OK, build_guide_flow and fix18_flow included. Vitest: 2426 passed, 2 skipped. The timing test reports CPU p95 5.7 ms against wall p95 47.0 ms in the same run. |
| iGPU low tier usable | **Met.** Integrated Radeon at 1280x800, compat tier: L14 and L00 run at 33.3 ms (30 fps cap; GPU 15-16 ms) and the L13 hall at 13.2 ms. |

## Critique (scored once)
| Critic | Score | Strongest point | Done after scoring |
|---|---|---|---|
| Sigrid (art) | L14 lab 7 (was 5), L13 hall 4.5 (was 3.5), L02 4, L03 4.5, analyser 4.5, L00 6.5; average 4.9 | The hall camera is not low and close, so the vessel kit is invisible. Two UI languages. World text under 16 px. A white hot spot on the floor. Primitive materials. | **The camera:** the spec "nbclose plant" never reached the plant preset, so every hall shot had been wide. "Plant" is now a hero view on a reactor, bed or burner. **The stack:** rails are steel, not yellow halos. **The analyser:** a grey cabinet with a bezel. **L14:** a pale epoxy plinth. **Not re-scored after these fixes.** |
| Mateo (design) | L14 fun 6, clarity 7, tension 3; chapter 1 fun 6, clarity 5, tension 5 | Ten runs is a stroll: the start reading plus "hotter reads higher" win in two. | Six runs, shared with the tests (D-C8; he asked for five). Header comment fixed. **Open:** the classic all-caps status strip; recorder labels over the trace. |
| Anjali (domain) | no errors | The analyser was wet basis, unlabelled, and hid the H2O; CO was shown in %. | All fixed: "mol % wet", H2O shown, CO in ppm. The L14 why line names both causes, T* is quoted to the kelvin, and the dead strings are gone. |
| Naledi (educator) | — | L14 could be won by bisecting T, with no equilibrium idea in it. | **D-C9:** the job needs one argon test on record. The lesson states the three Le Chatelier outcomes, and the coach no longer asks about runs that did not happen. Mateo wanted the test lines cut; I sided with Naledi. |

## Playtest (Lena, 16, mouse, RTX 4090 in her own display)
- **Fixed:**
  - L03's mixer-to-burner pipe never connected: a drag from the pipe-in-hand's own outlet was ignored (`pipe_drag_flow` case 6).
  - The countdown was unlabelled or cut.
  - L14 refunded runs after an edit.
  - The coach kept asking for the volume test after the goal.
  - The CLAMP sign was cut by the HUD, and the name line was unreadable on the bright floor.
  - The hall said "nothing built yet" over a drawn plant.
  - L02's Call it did not say it is graded on the first run.
- **Not a bug:** her 3 K per scroll tick was the harness. `desk.sh wheel` sends three clicks.
- **Open:**
  - Pipes route in big loops; port dots are small.
  - Esc with no pipe pending pauses (by design).
  - "PA…" is cut at the bottom right of the table at 1600x900.
  - Hall tag Z-106 is under the top banner.
  - The briefing is a wall of text with duplicated "Call it" lines and "tap to enter" on a mouse game.
  - The analyser is unreadable from the wide view (the stack camera reads it).

## Incidents
- My programmer helper ran `pkill -x godot` to clear its own waits. That kills every Godot of the user, so other games' runs at about 07:54 may have died. It is noted on the board.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A a game, not SaaS | Mostly | L14 is a real experiment with a budget and a decision (D-C8, D-C9). Chapter 1 still sits under the classic all-caps status strip (Mateo). |
| B its own soul | Pass | The private lab and the night plant hall. The burner house and the analyser are ours, drawn from engine state. |
| C realism, proportion, texture | Mostly | Vessel kit and hero camera added. Sigrid averages 4.9; untextured drums and flat stack colours remain. |
| D readability | Mostly | layout_flow OK. Sigrid measured world text under 16 px (flask placard about 8 px; analyser 4 px in the wide view). |
| E every control works | Mostly | The drafting table works by pad (pad_build_flow), and two silent pipe-drag causes are fixed. The Career cards and the L30 knobs are not covered by pad. |
| F scroll and input stability | Pass | Dialogs keep the pad focus. The flows are isolated from machine gamepads. |
| G device classes | Mostly | iGPU at 30 fps on the compat tier. Desktop only for the new pad work; handheld and phone not re-checked. |
| H learnable by an impatient first-timer | Mostly | Lena found the L14 goal in two runs once the goal line said what to do. The briefing is still a wall of text. |
| I logic integrity | Pass | Anjali found no physics errors. The analyser numbers check (11.0 + 10.0 = 21 % for L02). Lab time is counted across restarts. |
| J depth to employable | Mostly | L14 now asks for a measurement plan (bracketing with a budget) plus a mechanism test. Content in other chapters is unchanged. |
| K fun and long-term play | Mostly | L14 tension raised (Mateo scored it 3 at ten runs; six runs plus the argon gate). Not re-scored. |
| L performance | Pass | 4090 ultra; iGPU compat at 30 fps. |
| M sound | Partial | First pass: the bed follows state. Nobody has listened, and the sound is not positional. |
| N saves and quitting | Pass | No save format change; carryBurns was already in the save. |
| O release hygiene | Pass | CHANGELOG section, decision records, wiki regenerated, tag through the full gate. |
| P visible status | Pass | Board lines at the start, midway and the incident; this file lists every failed or open item. |
| Q cost, machine, tidiness | Mostly | One helper at a time, and GPU shots under the shared lock. The helper's `pkill -x godot` broke the tidiness rule. |
| R story and world | Pass | Unchanged voices; the lab and hall are places. |
| S cute that teaches | n/a | No change to cute mode. |
| U README, screenshots, releases | Pass | README and site lead with new-look shots of 0.11. |

— Ingrid Solheim, Game Lead
