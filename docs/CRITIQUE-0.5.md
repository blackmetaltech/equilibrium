# CRITIQUE 0.5: "The plant you design" (2026-11-20)

Rounds 6 and 6b tested against the gate set in CRITIQUE-0.4. Findings are verbatim in `.work/backlog.md`. Screenshots are in
`.qa/equilibrium/{c,d}/shots/`. Fix rounds F11, F12 and F13 followed.

## The gate
| Gate item (from CRITIQUE-0.4) | Result |
|---|---|
| A fresh tester wins L23, L25 and L26 in the UI from the notebook | **Met.** Round 6: all three were won from the build checklist alone (3 flasks on L25 and L26). Commissioning to GOAL MET took 6–9 s; the rest was clicking. |
| A careful player reaches a positive five-year Career; at least two endings to steer toward | **Met.** Round 6 ended Steady because the screens disagreed on what was being scored. After F11, round 6b reached **Flagship**: 171.3 MUSD operating margin against a 140 target, 0 strikes, ranked 27 of 187. The tester explained why from the ledger, the course line and the memos. Scripted players: careful and human-careful reach Flagship; idle and reckless are sold or shut. |
| No level asks for more than 5 minutes of waiting | **Met on paper, borderline in play.** `wallclock.test` now includes 30 s of reaction time per step (L24: 289 s of 300). Round 6b measured about 6.5 min on L24 *before* F13 moved it to 16x throughout; nobody has replayed it since. |
| A real-phone pass | **Not met.** The phone has been disconnected since round 4. The layout passes its checks at phone size on desktop only. |
| No two contradicting numbers (testers a–d) | **Mostly met.** Round 6b found no hard contradictions. The confusing items it did find (L24 trip 130 vs 125; overlapping card states; catalyst wording) are fixed in F13. A full a–d re-run did not happen this layer; rounds 6 and 6b were testers c and d only. |

**Verdict:** 0.5 ships with two of five gate items fully met and two met with caveats. The real-phone pass is the honest gap.

## Scores (round 6b, tester d; round 6, tester c)
| Criterion | c (big builds) | d (L24 + Career) |
|---|---|---|
| Brief → goal | 9 | 8 |
| Win from in-game guidance | won 3 of 4 | L24 6 · Career 8 |
| Teaching | 8 | L24 7 · Career 8 |
| Feedback truth | 8 | 7 |
| Fun | 7 | 6 |
| Polish | 7 | 6 |
| Depth / progression | 9 | 8 |

## What works
- **The build checklist turned the hardest levels into the most satisfying ones.** In the tester's words: "The pipe-by-pipe pulse in L25 is satisfying." The X-T staircase filled bed by bed (74.3 → 88.0 → 90.6 → 95.8 → 100 %).
- **The Career now teaches management with numbers.** "Book the ammonia turnaround before catalyst falls under 80 %: about +17.1 MUSD a year." One score is used everywhere, and the year-3 jump to Flagship is a real payoff.
- **Physics stayed honest.** Two examples:
  - The L24 recipe was changed to match the dynamics, rather than the dynamics bent to fit the recipe.
  - L26's flammable limit comes from the engine, not from text.

## What still fails (harsh)
1. **L24 is still the most fragile level.** It took four fix rounds (F8a, F9b, F10, F12/F13) to make a human-safe recipe. Its production margin is thin: about 5.3 against a 5 kmol target. A runaway level that only works through a precise procedure is realistic, but it may be the wrong difficulty for chapter 6.
2. **The Career is long and click-heavy.** 60 months took about 24 minutes, mostly clicks and scrolling. The alert strip helps. There is still little to decide in most months.
3. **No real-device play since round 4.** That covers the phone, gamepad, Windows and macOS.
4. **Two testers, not four.** This layer's gate rounds used two personas. The novice and the ChemE student have not played since 0.4.
5. **Notebooks are still prose-first.** The build checklist duplicates the long notes on L23, L25 and L26.

## Gate for 0.5 → 0.6
- A full round with all four personas (a–d) plus a real-phone pass, with every level in the campaign attempted by at least one tester.
- L24 replayed by two fresh testers with no failed first try.
- A Career month with nothing to decide can be skipped without risk; testers report at least one meaningful decision per in-game year.
- Notebooks for checklist levels cut to the goals plus one paragraph of "why".
