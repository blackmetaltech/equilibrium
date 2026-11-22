# CRITIQUE 0.9: "The plant you can read" (2026-11-22)

Round 12 was a pad-only pass by a Steam Deck persona at 1280x800 in the handheld layout, with no mouse. Fix rounds were F31 (the Career and incident findings from round 11), F32 (readability: the tray, the camera, a 16 px floor, a layout test) and F33 (the pump house and the incident as plant objects, the comparison slip). The owner's review of the 0.8 screenshots set F32 and F33. Findings are in `.work/backlog.md` under "Round 11", "Round 12" and "0.9 plan".

## The gate
| Gate item (from CRITIQUE-0.8) | Result |
|---|---|
| F31 merged: the board fits after resume and after the incident; the call-it is graded at the first commission; the incident is forewarned; one source for every figure; one confirm pattern | **Met.** |
| | *Fit:* `fix31_flow` checks every key and dial inside the window at fresh start, with an incident, back from the plant and after resume, at 1920x1080, 1280x800 and 1280x720. |
| | *Call-it:* the truth is frozen at the first commission that solves, which also fixed nine other levels with the same flaw. |
| | *Forewarning:* the incident card opens a month ahead as one stop. The 30-press ceiling was kept unchanged; the most presses any seed needs is 27. |
| A careful human finishes all 60 Career months on desktop and on the Deck, with no clipping and the incident fixed in the plant at least once | **Not met.** No Career replay was run this layer. |
| A pad-only pass at 1280x800: every screen operable with focus rings and A/B | **Not met.** Round 12 scored pad operability 4/10. |
| | *Works by pad:* the title, the pause menu, the codex and the notebook keypad. |
| | *Out of reach:* the notebook's call-it field and brief scroll (LEFT leaks focus to the tray behind the modal), the L30 loop-panel knobs, the DESIGN/COMMISSION/RUN key, the speed dial, and the Career's yearly-card choices. Settings' Light theme cannot be reached either. |
| | *Focus ring:* faint on the slider, level nodes, Details and Start work. |
| | *Placing a part by pad:* left a large red overlay. |
| A human plays L39: wins from the in-game guidance, feedback truth ≥ 7 | **Not met.** L39 was not played by a human tester. Its new plant view was only checked by tests and screenshots. |

**Verdict:** 0.9 makes the plant readable and the Career trustworthy in its details. The gamepad is the plain failure: the game cannot be played with a pad alone. No human has played the new pump house or finished the Career on this build.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Mostly | The pump house is now the instrument: pipes are drawn at their size and coloured by velocity, with a sight-glass, a plotter and selector knobs. The incident comparison is a green-bar slip. The Career board is still mostly cards of text, and it repeats the incident warning three times. |
| B its own soul | Pass | 1970s control room: an X-Y plotter with a pen carriage, rotary selectors, green-bar slips. |
| C realism, proportion, texture | Mostly | Pipe radius follows the schedule-40 ID. The deaerator deck is 4 m tall in the scene against 14 m in the engine, which keeps it legible but not to scale. |
| D readability | **Pass** | 16 px floor. `layout_flow` runs 68,393 checks over every screen and level at 1920x1080 and 1280x800 with 0 failures; there were 2,875 before F32. 3D tags have outline plates. Recorder legends are never cut off. |
| E every control works | Mostly | 44 Godot flows press the real handlers. Round 12 found controls that cannot be reached by pad. |
| F scroll and input stability | Mostly | Anchored scroll and reserved key widths. The pinned Career area is capped and scrolls. |
| G device classes | **Fail** | The pad-only pass failed (see the gate). There was no Deck Career run and no phone pass. |
| H learnable by a first-timer | Mostly | The incident slip shows all three answers before you choose. The L39 selectors show velocity at design flow on each detent. |
| I logic integrity | Pass | Call-it truth is frozen at the first commission, every figure comes from one source, and the slip uses the engine's own stated numbers. |
| J depth to employable | Mostly | Unchanged from 0.8: hydraulics, control, safety and operations. Cv, relief cases and parallel pumps are still missing. |
| K fun and long-term play | Mostly | No new fun data this layer. The incident loop was rated fun in round 11. |
| L performance | Pass (desk) | 16x shifts hold. No GPU or phone measurement was taken. |
| M sound | Not reviewed | — |
| N saves and quitting | Pass | Career save and resume are checked across the incident level and after a resume (fix31). |
| O release hygiene | Pass | The CHANGELOG has a section per layer. Releases come from a smoke-run Linux build with SHA256SUMS. The release workflow was fixed after 0.8. |
| P visible status | Pass | — |
| Q cost, machine, tidiness | Pass | Fourteen old worktrees and their branches were removed. Each lane ran one at a time with a load guard. |
| R story and world | Mostly | Unchanged. |
| S cute that teaches | Pass | Critters in the incident loop, and ink bands moving at the water's speed in L39. |
| U README and releases | Pass | A "What's new in 0.9" strip with three new shots, plus the v0.9.0 release. |
| V where effort goes | Plan | 0.10 = functionality: a full pad pass and the Career runs. Then playability (story arc, more incident kinds), expansion (new plants, regional careers), and Presence (site and wiki). |

## Scores
| Criterion | Pad pass (round 12, d) |
|---|---|
| Pad operability | 4 |
| Focus visibility | 5 |
| Readability at 1280x800 | 6 |
| Polish | 5 |

## What works
- **The pump house teaches by looking.** A 2-inch suction line turns red, the sight-glass drops below its ring, the pump shakes and says CAVITATING, and the plotter's pen sits at 19 m³/h, far off the design line.
- **Readability is now enforced.** It is a test, not a promise: any text under 16 px, clipped or overlapping on any screen or level fails the build.
- **The Career is careful about money.** Every commitment asks twice, and every number has one source.

## What still fails (harsh, ranked)
1. **The game cannot be played by pad.** Five core controls are out of reach and focus leaks out of the notebook. For a game with a Deck layout, this is the biggest functional gap.
2. **Nobody has played the new views.** L39's pump house and the incident slip have been seen only in screenshots and flow tests.
3. **The Career is unproven end to end on this build,** and it still says the same warning three times.
4. **At 1280x800 the pump house is small,** squeezed between the selector panel and the plotter, and the incident keys wrap onto two rows.

## Gate for 0.9 → 0.10 ("Every screen by pad")
- A pad-only pass at 1280x800 scores pad operability ≥ 8. Every control in the round-12 list is reachable, focus never leaves a modal, there is one high-contrast focus ring, and the hint bar is at least 16 px with no overlap.
- An automated focus walk (a Godot flow) visits every focusable control on every screen by d-pad and fails on unreachable or invisible focus.
- A careful human finishes 60 Career months on the Deck with the pad, fixing the incident in the plant once.
- A human plays L39 and the incident level and scores feedback truth ≥ 7.
- The Career board says each warning once.
