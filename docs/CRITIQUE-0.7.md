# CRITIQUE 0.7 — "The Works you run" (2026-11-21)

Rounds 8 and 9 tested the gate set in CRITIQUE-0.6. There were five tester runs:
- a: std-9 novice, chapters 0-2, rounds 8 and 9
- b: ChemE student, chapter 3 and L25, rounds 8 and 9
- c: teacher, desktop Career, round 8
- d: Steam Deck Career, handheld 1280x800, round 8

The fix rounds between runs were F19 to F25 plus two small direct fixes. Findings are verbatim in `.work/backlog.md` under "Round 8", "R8-d" and "Round 9".

## The gate
| Gate item (from CRITIQUE-0.6) | Result |
|---|---|
| A human careful player reaches at least Steady and someone reaches Flagship in two of three Career runs; no card's MUSD differs from the realised year by more than its own terms allow; overlap, emissions and strike risks priced and warned two months ahead | **Met on reach; consistency fixed but not yet re-played.** Teacher c reached FLAGSHIP on the first try (246.8 MUSD, 0 strikes, about 22 presses). Deck tester d was on FLAGSHIP pace (projection 179) at month 59, when the window died in a usage pause. The round-7 Deck run d4, before F19, finished Steady (184.7 MUSD). Strike warnings came a year or more ahead. The card-vs-review mismatches d found had two causes. Y1 hedge: forecast −4.21, realised +23.3; this was real gas-price movement, and the card now states ±25-30 MUSD. Y4 contract: forecast +7.16 over 18 months, review +31.1 in 12; this was a replay bug, because option B did not consume an offer id. F24 fixed it and tests every card kind. No human has replayed the Career since F24. |
| Chapters 0-3 re-test with feedback truth ≥ 7: no stale intercom, no one-step-late values | **Met.** Novice band: truth 8, up from 4, with no stale intercom found and every tick matching its printout. ChemE band: truth 7, up from 4, and the tester's hand calculations agreed in 6 of 6 levels. The remaining items were the L08 pipe step, L25's coach running ahead, unlabelled design estimates and a cooler named "heater"; F25 and the R9-a fix closed them. The coach audit now replays every level. |
| Wiring: snap-to-port, a "dropped on nothing" message, pan and middle zoom; L13 and L25 wired in under 25 actions | **Met, L25 by test only.** Snap, the missed-drop message, right-drag pan, wheel zoom, F-to-frame and Esc all work in play. A tester piped L13 in about 21 actions. L25 took about 45 in play, so F25 added chained piping and auto-arm. `fix25_flow` now pipes L25 in 24 moves through the real handlers, but no human has replayed it. |
| A real-phone pass, if the owner authorises the device | **Not done.** The owner is away and said not to touch the phone. |

**Verdict:** 0.7 meets the truth gate and the Career reach gate in play. Career consistency and the L25 action count are met in tests. The next round has to re-play both before they count.

## Scores (round 9 for levels, round 8 for the Career; n/r = not recorded, since tester c reported the outcome without scores)
| Criterion | Ch0-2 (a, R9) | Ch3 + L25 (b, R9) | Career desktop (c, R8) | Career Deck (d, R8) |
|---|---|---|---|---|
| Brief → goal | 8 | 8 | n/r | 8 |
| Win from guidance | 7 | 8 | n/r | 7 |
| Teaching | 8 | 8 | n/r | 8 |
| Feedback truth | **8** (was 4) | **7** (was 4) | n/r | 6 |
| Fun | 7 | 7 | n/r | 7 |
| Polish | 7 | 7 | n/r | 6 |
| Depth / progression | 8 | 8 | n/r | 8 |

## What works
- **Every coached level is now checked by replaying its reference solution.** `f23_truth.test.ts` replays each solver and fails on any coach step that is stale or early. It caught the L08 pipe step that round 9 found, along with ten others that no human had reported.
- **Hand calculations hold.** The ChemE tester checked L10's NH3 fraction, L11's 21.18 %, L12's K(400 °C), L13's adiabatic line, L14's α and Kp, and L25's stack SO2. All agreed with the game.
- **The Career teaches money.** Testers singled out pricing a contract penalty before signing as the best moment. The levers carry the same number as the BOOK line, and a careful teacher reaches Flagship on the first try.
- **The camera is no longer the time sink.** Snap, pan, zoom and frame all worked for both wiring testers.

## What still fails (harsh)
1. **The Career is a spreadsheet with buttons.** It is 15 minutes of NEXT DECISION and CONTINUE ANYWAY. The plants never appear. An incident is a line of text, not a plant you open and fix with the skills from chapters 0-9. That is the biggest gap to "employable": the Career should send you into a level-style plant to re-tune it.
2. **The handheld Career is cramped.** Banners took a third of the screen and cards moved under the cursor. Both are fixed, but polish scored 6 on the Deck run.
3. **Thirty-minute shifts are slow on weak hardware.** L08 runs at "1.1x real" at 16x on llvmpipe, so the brief's "under two minutes" claim is false there. No performance work has been done on the shift loop.
4. **Every tester runs Linux at 1080p or 1280x800.** There has been no phone, no gamepad, and no Windows or macOS build since round 4.
5. **Depth past chapter 9 is thin.** Real practice includes cost estimation (CAPEX classes), P&ID reading, control loops (PID tuning) and safety studies beyond HAZOP cards. Each exists as a single level at most. A junior engineer would also size a pump, a line and a relief valve. None of these exist.
6. **Regional calibration looks inconsistent.** L08's star line is 78 USD/h globally and 763 INR/h in India, a ratio of 9.8. L05's ratio is 53. One of them is wrong.

## Gate for 0.7 → 0.8 ("The plant behind the numbers")
- **Re-play the Career after F24** on desktop and on the Deck. Both must reach at least Steady, and every year's review must itemise forecast against realised with no unexplained term above the card's stated uncertainty.
- **One Career incident or turnaround opens a real plant view.** The player fixes it there with level mechanics: re-tune, re-catalyst or debottleneck. The fix must change the Career numbers.
- **One new junior-engineer skill as a level or a pair:** pump, line and relief-valve sizing, or PID tuning on a dynamic loop. It needs a call-it, a checklist and a coach audit entry.
- **Shift loop performance:** L08's 30-minute shift at 16x must take two minutes of real time or less on the desk harness, or the brief has to state the real figure.
- **Fix the regional calibration** (L08 against L05), with a test that compares the ratios.
- **A real-phone pass,** if the owner authorises the device.
