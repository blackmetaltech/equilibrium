# CRITIQUE 0.10: "The Wall, in the new look" (2026-11-23)

This was LOOK2 phase B. Chapter 3 (L10-L14) is the released new-look chapter, and the prologue L00 is new look too. Every other chapter stays classic and is labelled so. Lead: Ingrid Solheim. One helper at a time, and the critics ran once. The decision records are in docs/LOOK2.md (D-B1 to D-B5).

## The gate (factory/briefs/LOOK2.md, phase B)
| Gate item | Result |
|---|---|
| A playtester persona's hand play through the real input path | **Met after three rounds.** Lena (16, new to the game) played from the title strip on the desk harness with mouse and keyboard and won L10, L11, L12 and L13 (L13 with three flasks and a correct call). L14 took three rounds. Round 1: the wheels turned only on an exact grab and nothing said how; fixed with a hover ring, a name line beside it, and scroll over a wheel. Round 2: the clamp could not be found, because the flask's own anchor stole the picks; fixed with controls-only picking (30 px targets), a red PISTON CLAMP handle and the coach saying where it is. Round 3: all three tests and the book-temperature star ticked, but no win, because L14's clock was paused and the 30 s settle never ended. That was fixed (the clock runs, with a countdown on the Call box) and checked on the desk to the end card; Lena did not replay it a fourth time. |
| Tests and flows green | **Met, with two load-sensitive exceptions.** Vitest 2420 of 2423 pass, 2 skipped. The commission-time p95 test fails under machine load and passes alone. 46 Godot flows: `build_guide_flow` failed under load and passed alone; `phone_flow` failed once on the longer map label, which was then shortened, and now passes. New flows: pad3_flow (real joypad events), textures_flow, and look2_flow's coached order. |
| Low tier usable on the iGPU | **Met, at the line.** Integrated Radeon, compat tier, 1280x800: L00 34.1 ms, L14 34.5 ms, L10 hall 34.0 ms. That is about 30 fps, paced by vsync; the GPU itself takes 11-16 ms. Sigrid: legible, HUD type at 16 px or more, L14 dark on compat. |
| CHANGELOG and CRITIQUE with the owner-concerns audit | This file and CHANGELOG [0.10.0]. |
| Site, wiki, README shots and GIFs (the colour shift and a trip) | **Met.** equilibrium.blackmetal.tech built in site/ (Pages workflow). The wiki is generated from the game text, and a test fails if it goes stale. The README has colour-shift.gif, night-trip.gif and four stills. |
| Merge look2 to master, tag, release with a smoke-tested build | See the release notes for v0.10.0. |
| The blackmetal.tech card | Added: EQUILIBRIUM moves from "Still in the forge" to a card with three shots, the version and one line. |
| New-look controls fully pad-operable in the released chapter | **Met for the new-look controls** (wheels, lever, valve, clamp, Call box keypad, camera, the views in chapter 3). **Not verified**: the classic drafting table in L10-L13 by pad alone; the 0.9 pad pass found gaps there. |

## Critique (scored once, new shots only)
| Critic | Score | Strongest point | Done after scoring |
|---|---|---|---|
| Sigrid (art) | L14 5, L00 6.5, chapter 3 hall 3.5 | The hall read as primitives on a floor with 7-8 px tags. L14 was still a rig on a neon disc in a dim room. Blotch noise remained on the steel. | The hall got the L00 kit and screen-sized tags. L14 got a railed steel plinth and a new opening frame. Mottling is now set per vessel. The twin's plate is drawn last. Not re-scored. |
| Mateo (design) | — | L14's win is a checklist of three tests. Overcooling L00 cost only a star read at the end of the night. The hall does not respond to design beyond the glow. Chapter 3 from the title skips the arc. | Star 2 reads the lowest set point of the night. Boiler steam follows duty. The clamp wording was fixed. The title label is now a string. **Not done:** making T* the win with a run budget (a redesign, next layer); cutting the Tests panel (kept, because the coach's questions hang on it); routing new players through L00 first (kept direct, because the owner needs one press to the chapter). |
| Anjali (domain) | — | Test 3 passed at any fixed pressure. The engineer-mode save needed an inlet 190 K below light-off. | Both fixed (D-B5). The other findings were also fixed. |
| Naledi (educator) | — | The coached order broke test 3. Why? gave the answer away. The cue was a sound the build does not have. | All fixed except hiding Why? until a test has run; its wording now asks for a prediction instead. |

## Playtest findings still open
- L14: a hover label can overlap the Call box when the camera is close. The drag rate (about 4 K per 15 px) is not stated. On the end card the coach line still shows the opening question.
- After GOAL MET the printout takes 20-45 s to appear, with no sign of progress.
- In the L12 and L13 briefs the flask text is clipped at "more below: scroll" (classic notebook).
- An L13 bed warning is cut at "the catalyst starts to…".
- The twin's plate sits under the HUD card in the L14 flask view.
- Piping nine units in L11 took about 15 minutes; several drags silently did nothing (classic build).

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A a game, not SaaS | Mostly | L14 is now the player's own experiment with controls in the world, and the form is retired. Mateo still calls the win a checklist. The classic chrome stays on the drafting table by decision (D-B4). |
| B its own soul | Pass | The private lab after hours and the plant at night in a hall; not borrowed. |
| C realism, proportion, texture | Mostly | PBR materials set per vessel, mipmaps, VRAM compression, the roughness limiter. The hall models are simple and stand on a grid at the player's positions. |
| D readability | Pass | layout_flow OK. Hall tags are screen-sized. Every new-look control names itself on hover or pad. |
| E every control works | Mostly | pad3_flow, look2_flow and the desk play reach every new-look control. The L14 wheels were not discoverable until the playtest fix. |
| F scroll and input stability | Pass | Pad buttons cannot leak to the hidden console (Look2 stays the last child). |
| G device classes | Mostly | Pad for the new look; iGPU at about 30 fps. No phone pass and no Deck pass this layer. |
| H learnable by an impatient first-timer | Mostly | A 16-year-old won L10-L13 cold. L14 needed the hover fix; the replay is the evidence. |
| I logic integrity | Pass | Test 3 is checked against the flask's own pressure. The call is the book's Kp, and the last run is labelled "real flask". The light-off rule is in the engine. |
| J depth to employable | Mostly | Unchanged in content. L14 now teaches the difference between data and textbook numbers. |
| K fun and long-term play | Mostly | L00 now has a real loss and a real overcooling cost. The hall glow is a reward but not yet a toy. |
| L performance | Pass | 4090 ultra unchanged; iGPU compat at about 30 fps; AA per tier. |
| M sound | Not reviewed | No new audio. L00's cue moved from a sound to the CW PUMP lamp. |
| N saves and quitting | Pass | No change in save format: the snapshot gained one info key (steam_kg_s). |
| O release hygiene | Pass | CHANGELOG section, a tag, a smoke-run build, SHA256SUMS. The privacy scan of the phase B diff was clean. |
| P visible status | Pass | The board has lines at the start, the mid-point and the release. |
| Q cost, machine, tidiness | Pass | One helper at a time and flows three at a time. Temporary probes were deleted. Load was mostly another game's process. |
| R story and world | Mostly | "Your bench, after hours" and the night shift carry the place. There is no new story arc. |
| S cute that teaches | Pass | Critters in the pipes of the hall; the brown gas is the measurement. |
| U README and releases | Pass | What's new in 0.10 with GIFs; the release; the site and the wiki. |
| V where effort goes | Plan | 0.11: functionality (the drafting table by pad, then the hall as a place to inspect, with clicking a bed opening its step on the staircase); playability (T* as L14's win with a run budget); expansion (a second chapter in the new look). |

— Ingrid Solheim, Game Lead
