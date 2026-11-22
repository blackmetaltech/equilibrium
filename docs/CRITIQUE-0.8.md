# CRITIQUE 0.8: "The plant behind the numbers" (2026-11-22)

Round 10 and round 11 were two desktop Career replays by tester c, a careful teacher. Before them the fix rounds were F26-F28 and F30; F29 landed between them. There was no Deck replay this layer. Findings are in `.work/backlog.md` under "Round 10", "Round 11" and the "0.8 plan". Both rounds ran while the machine was heavily loaded (load 20-36 from another session), and this cost tester time.

## The gate
| Gate item (from CRITIQUE-0.7) | Result |
|---|---|
| Re-play the Career after F24 on desktop and on the Deck: both reach at least Steady, and every review itemises forecast against realised with no unexplained term beyond the card's ± | **Mostly.** The desktop replays are covered below. **The Deck replay was not run.** |
| | *Desktop reviews:* every review read in round 10 (4) and round 11 (2) landed inside the card's stated ±, and each named the term that moved (the market price, catalyst, penalties). |
| | *Round 10:* run 1 was lost to a window crash, and this exposed that the Career did not resume; F27 fixed that. Run 2 was the tester clicking blind and was sold. |
| | *Round 11:* the tester was on a Steady course at year 3 with 1 strike when the machine lag stopped the run. The Career resumed intact after a crash, with month, cash and the incident result kept. No careful human has finished 60 months on this build. |
| One Career incident opens a real plant view, fixed with level mechanics, and the fix changes the Career numbers | **Met.** "Inerts in the ammonia feed" offers three choices: GO TO THE PLANT, the contractor, or ignore. |
| | *The plant view:* GO TO THE PLANT opens the L20 synthesis loop pre-loaded with the Career's inerts, catalyst and prices. |
| | *Round 11 result:* the tester set a 1.8 % purge, beat the contractor (2.51 against 2.83 MUSD) and came back to the same month. The board showed 97 % output, against 96.7 % in the plant. The tester called it fun. |
| | *Defects found:* the prediction is graded against the last purge; the log row names the wrong plant; the old purge and catalyst figures disagree between screens. All three are in F31 and carried into 0.9. |
| One new junior-engineer skill (a level or a pair) with a call-it, a checklist and a coach audit entry | **Met.** Chapter 10 is Hydraulics, with L39 "Size the Line". |
| | *Physics:* Darcy-Weisbach friction with Colebrook, the system curve against the pump curve, the affinity laws, NPSH available against required, and an economic-diameter star. |
| | *Tests:* oracle tests (Moody chart values, hand-worked loss, closed-form operating point), 11 level tests, coach audit, and a Godot flow test. |
| | *Not met:* no human tester has played it yet. |
| Shift loop performance: L08's 30-minute shift at 16x in ≤ 2 real minutes on the desk harness, or the brief states the real figure | **Met.** It takes 109.6 s wall time under llvmpipe, which is 16.3x, measured at host load 8-19. Before the fix it took 140-290 s. |
| | *Cause:* the frame `dt` was clamped and there was one bridge call per tick. Ticks now run in batches with bit-identical results. |
| Fix the regional calibration (L08 against L05), with a test comparing the ratios | **Met.** There is one `capexFx` conversion wherever USD equipment cost meets region-priced money, and the L08 star line is derived from the engine for every region. |
| | *Test:* a synthetic region with every price ×83 gives exactly 83× every money goal and star line across the levels. |
| A real-phone pass, if the owner authorises the device | **Not done.** No authorisation was given. |

**Verdict.** 0.8 adds a real plant behind a Career incident, a new trade (hydraulics), one currency per money number and fast shifts. The gap is the Career replay: the Deck run was not done, and no careful human has finished 60 months on this build, because the runs were cut short by machine load and crashes.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | **Mostly** | The plant, the loop and the pump house are on screen in 3D. Boards are drawers over the world, the incident fix happens in a real plant, and the printout is green-bar paper. The Career board is still a wall of cards, which is the most dashboard-like screen. |
| B its own soul | Pass | It reads as a 1970s control room: Bakelite knobs, annunciator, chart recorder, key switch, printout. The new L39 board is a side-view picture of the job with velocity-coloured pipes and cavitation bubbles. |
| C realism, proportion, texture | Mostly | Real schedule-40 IDs and real-shaped pump curves. The 3D models are low-poly, and the L39 pump plinth reuses the compressor model. |
| D readability | Mostly | The L39 board is legible at 2560x1440. In round 11 the Career panel ran wider than the window after a resume (ACCEPT clipped to "AC"); this is in F31. |
| E every control works | Mostly | 41 Godot flows press the real handlers. Round 11 found a control off screen after resume: the rate dial, which was the emissions lever. |
| F scroll and input stability | Mostly | F27 anchors the scroll to what you are reading and reserves key widths, and offers fold in place. In round 11 a "plant out 1 more day" line shifted the dial by 19 px; this is in F31. |
| G device classes | **Fail (not tested)** | There was no Deck or phone pass this layer. The layouts exist (desktop, handheld 1280x800, phone), and the last Deck pass was round 8. |
| H learnable by an impatient first-timer | Mostly | L39 has a coach, "What you have" data, and failure lines in plain words. The incident's three options state their outcome before you choose. |
| I logic integrity and a ledger | Pass | The incident's realised effect matched what was stated (97 % against 96.7 %). Reviews itemise forecast against realised per term, and the regional money test is exact. |
| J depth to employable | Mostly | Hydraulics is added on top of PID, interlocks, HAZOP, SOP, permits, reconciliation and turnaround planning. Control valve Cv, relief-case sizing and pumps in parallel are still missing. |
| K fun and long-term play | Mostly | The tester called the incident loop fun, and its best moment was beating the contractor. The Career is still click-heavy, with one incident type only. |
| L performance | Pass (desk) | A 16x shift runs at 16x under software rendering. No GPU, 4K or phone fps measurement was made this layer. |
| M sound | Not reviewed | No sound changes and no listening pass this layer. |
| N saves and quitting | Pass | The Career resumed intact after a real crash in round 11, including a crash inside the incident plant (fix29_flow). |
| O release hygiene | Pass | There is a CHANGELOG section and a private, then public, GitHub release per tag. The Linux build is smoke-run before upload, with SHA256SUMS. CI is green since the repo went public. |
| P visible status | Pass | Status lines are appended per milestone, and untested items are named here. |
| Q cost, machine, tidiness | Mostly | One heavy run at a time, and worktrees and desk slots are cleaned. Old agent-* worktrees from earlier sessions still sit in `.claude/worktrees`. |
| R story and world | Mostly | The cast (Mara, Tomas, Victor, Noor), endings with reasons, and annual reviews exist. There is no story arc across the campaign beyond the Works setting, and this is the playability layer to come. |
| S cute that teaches | Pass | Molecule critters follow molar flow and M^⅓, including in the incident loop (see the 0.8 screenshot). |
| U README and releases | Pass | README is refreshed with a "What's new in 0.8" strip of new 2560x1440 shots, plus the v0.7.0 and v0.8.0 releases. |
| V where effort goes | Plan | 0.9 = functionality: a pad-only pass on every screen and the F31 Career fixes. 0.10 = playability: a story arc, more incidents, fun-critic and story reviews. 0.11 = expansion: new plants and regional careers. Then Presence: site and wiki. |

## Scores
| Criterion | Career desktop, round 10 (c) | Career desktop, round 11 (c, partial) |
|---|---|---|
| Brief → goal | 8 | 7 |
| Win from guidance | 6 | 6 |
| Teaching | 8 | 8 |
| Feedback truth | 9 | 7 |
| Fun | 6 | 7 |
| Polish | 5 | 4 |
| Depth / progression | 9 | 8 |

L39 and the shift speed-up have only been checked by tests and screenshots. No human has scored them.

## What works
- **The incident loop is the first moment the Career feels like engineering.** The steps are: read the card, go to the plant, set the purge, watch the argon, and beat the contractor's price. The realised number then agrees with the stated one.
- **Money is honest across regions.** Every money number is in one currency, and the ×83 test makes any future mixed-currency bug fail loudly.
- **Speed is real.** A 30-minute shift at 16x takes under two minutes even on software rendering.
- **Tests catch truth bugs.** The new placeholder test found that L24's star line had lost its number in a merge.

## What still fails (harsh, ranked)
1. **The Career is still not proven end-to-end by a careful human on this build.** Two rounds in a row ended early because of crashes, machine load and blind clicking. The Deck replay was skipped.
2. **Layout breaks after resume.** The board ran wider than the window and hid the emissions lever. That cost the tester a strike they could not have avoided.
3. **The commitment patterns are inconsistent.** A yearly card choice can buy catalyst and book a turnaround in one click, while INSPECT asks twice.
4. **There is one incident type.** The seam is generic, but exchanger fouling and compressor wear are still text rows.
5. **There has been no device pass since round 8:** no Deck, no phone, and the gamepad has not been checked on every screen.
6. **The story is thin.** There are characters and endings but no arc, and the campaign's chapters do not build a narrative.

## Gate for 0.8 → 0.9 ("Every screen by pad; the Career you can trust")
- F31 is merged: the board fits the window after resume and after the incident; the prediction is graded at the first commission; the incident is forewarned; one source feeds every figure; one confirm pattern covers every commitment.
- A careful human finishes all 60 Career months on desktop and on the Deck (1280x800), with no layout clipping and the incident fixed in the plant at least once.
- A pad-only pass at 1280x800 with the virtual pad: every screen (title, Works map, notebook, plant and boards, faceplates, printout, Career, incident, settings) is operable with focus rings and A/B, and nothing needs a mouse.
- A human plays L39: they win from the in-game guidance and score feedback truth ≥ 7.
