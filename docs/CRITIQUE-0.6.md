# CRITIQUE 0.6: "Every level, every persona" (2026-11-20)

Round 7 tested the whole campaign against the gate set in CRITIQUE-0.5. Twelve tester runs used the four personas: a (std-9 novice), b (ChemE
student), c (teacher) and d (Steam Deck, 1280x800). Fix rounds F14 to F18 ran between them. Findings are verbatim in `.work/backlog.md`
(the "Round 7" sections). Screenshots are in `.qa/equilibrium/{a,b,c,d}/shots/`.

## The gate
| Gate item (from CRITIQUE-0.5) | Result |
|---|---|
| A full round with all four personas plus a real-phone pass; every level attempted | **Levels met, phone not.** All 39 levels and the Career were attempted by at least one tester, and every level was won at least once except the L14 Le Chatelier tests (goal met, extra tests not run). There was no phone pass: the Pixel is on USB but adb lists it as "unauthorized", and only the owner can accept the prompt. |
| L24 replayed by two fresh testers with no failed first try | **Met after two fixes.** Tester b1 tripped three times, because the checklist vanished at commission (fixed: it now stays up). Tester c won on the first try (0 trips, peak 118.5 °C). Tester d3 followed every row with slow hands and made 3.87 kmol against 5, with no trip (fixed: the goal is now 3.5 kmol, and the Chief Engineer star keeps 6.6). Fresh tester e then won on the first try (0 trips, peak 114.8 °C, 4.90 kmol). Final count: two fresh first-try wins on the final build (c and e). |
| A Career month with nothing to decide can be skipped without risk; one meaningful decision per year | **Half met.** NEXT DECISION cut 60 months to about 25 presses, and a decision card appeared every year. But card numbers disagreed with their own terms (fixed in F18: the terms now add up and are tested). A re-test after F18 still found three things: an overlap of turnarounds that no card prices, repeated "overdue" stops, and a cautious player sold at month 36. |
| Notebooks for checklist levels cut to the goals plus one paragraph of why | **Met.** L22-L26 and L33 notebooks were trimmed; the numbers are in the checklist rows. |

**Verdict:** 0.6 meets two gate items and half of a third. The campaign is now playable end to end from the in-game guidance: every level
was attempted, and every level except L14's extra tests was won. The Career is the weak layer, and 0.7 is about it.

## Scores (round 7, median of the testers who played each band)
| Criterion | Ch0-2 (a) | Ch3 (b) | Ch4-7 (c) | Ch8-9 (d) | L24 (c, e) | Career (d, c) |
|---|---|---|---|---|---|---|
| Brief → goal | 6 | 7 | 7 | 8 | 8 | 7 |
| Win from guidance | 6 | 6 | 7 | 7 | 9 | 5 |
| Teaching | 7 | 8 | 8 | 8 | 8 | 6 |
| Feedback truth | 4 | 5 | 6 | 7 | 5 | 4 |
| Fun | 7 | 6 | 7 | 7 | 7 | 5 |
| Polish | 5 | 5 | 5 | 6 | 6 | 4 |
| Depth / progression | 7 | 7 | 8 | 8 | 8 | 7 |

## What works
- **The build checklist is the game's best guidance.** Testers called it "excellent" and "easy". With it, L23, L25 and L26 were won on the
  first commission, and L24 has now gone to two fresh first-try wins.
- **The debriefs teach.** Novices and teachers both singled out the printout lines, for example "heat swapped 1.79 MW", "Kp = Kc for
  equal moles", "the staircase is the way round the wall" and "251.2 × 2,114 ÷ 3,570 = 148.7 K".
- **Chapter 8-9 boards feel like real work.** HAZOP, SOP cards, the permit and the χ² flag drew "+4.01 !" and "best moment" from a Steam
  Deck player.
- **Call-its are now fair.** All 35 levels with a call-it got a "What you have" line. Before F16, testers found eight call-its they could
  not answer, among them L13, L14, L15, L21, L24 and L27.

## What still fails (harsh)
1. **The Career loses careful players.** A teacher who did what the game suggested was sold at month 36 (−33.2 MUSD in year 2). Three
   things combine:
   - Overlapping turnarounds cost 62 plant-days, and no card prices that overlap.
   - The board's yearly target (40 MUSD) disagrees with the Flagship total (140 over five years).
   - An emissions strike lands at year end with no banner.
   The scripted careful policies reach Flagship, but a human careful player does not. That gap is the whole problem.
2. **Feedback truth is still the lowest score on the early chapters.** Round 7 found stale intercom lines, values updated one step late,
   and "RUN 001" printed on every run. The F15-F17 fixes need a re-test.
3. **Wiring and the camera.** At far zoom the ports are about 10 px, a drag that misses gives no feedback, there is no pan, and there are
   only two zoom levels. This was the biggest time sink on L13, L19 and L25.
4. **Retry and editing do not always match their descriptions.** The call box locks on Enter, while the notebook says it locks on
   commission. Retry keeps the last settings, but the checklist resets.
5. **No real device since round 4.** That covers the phone, a gamepad, and Windows and macOS builds.

## Gate for 0.6 → 0.7 ("The Works you run")
- A human careful player (tester, not script) reaches at least Steady, and someone reaches Flagship, in two of three Career runs. No card's
  MUSD can differ from the realised year by more than its own stated terms allow; overlap, emissions and strike risks are priced and warned
  two months ahead.
- A re-test of chapters 0-3 (the novice and the ChemE student) with feedback truth ≥ 7: no stale intercom, no one-step-late values.
- Wiring: snap-to-port on drag, a "dropped on nothing" message, pan and a middle zoom; L13 and L25 wired in under 25 actions.
- A real-phone pass, if the owner authorises the device.
