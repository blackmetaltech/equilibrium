# CRITIQUE 0.4: the 0.3 → 0.4 gate, five play-test rounds (2026-11-11 to 2026-11-19)

Persona play-testers drove the desktop build through the desk harness. One pass was on a Pixel 9a by touch, and one played the Steam
Deck layout at 1280×800. Every finding, verbatim, is in `.work/backlog.md`, by round and tester. Screenshots are in
`.qa/equilibrium/{a,b,c,d,phone}/shots/`. Fix rounds F3–F10 followed the rounds.

## The gate
The gate set in CRITIQUE-0.3 had two parts. Every theme had to be fixed and tested, and a re-run of testers a–d had to win at least one
level per chapter from in-game guidance alone, with no feedback contradictions.

- **Wins per chapter (met in round 5).** L08 (Fire), L11 (The Wall), L16 and L18 (Speed), L21 and L22 (The Loop), L24 and L27
  (Containment), L28 (The Works), L29, L30 and L33 (Control Room), and L35 and L37 (Turnaround). Career made progress (24–25 months) but
  was not won. Chapter 1 was won in round 4 (L03).
- **No contradictions (met after F10, not re-played).** Round 5 still found numbers that disagreed across screens:
  - L24's steady state read 112, 115 or 117 °C depending on the screen.
  - L27 compared a 33.09 bar(g) peak with "110 % of 30 bar(g)".
  - L37 gave the χ² limit as 7.81 on one screen and 7.82 on another.
  - L26 showed "$230,000 spent" next to "spent 0 USD".

  F9b, F9c and F10 fixed all of them. No tester has re-played since F10, so this half of the gate rests on tests, not play.

**Verdict:** 0.4 ships. Its weakest claim is "no contradictions", which rests on tests rather than a play-through.

## Scores by round (0–10; mean of the testers who scored)
| Criterion | Round 3 (0.3) | Round 4 | Round 5 |
|---|---|---|---|
| Brief → goal | 7.3 | 7.0 | 8.0 |
| Win from in-game guidance | 4.5 | 3.8 | 7.3 |
| Teaching | 6.5 | 6.5 | 7.5 |
| Feedback truth | 4.8 | 5.3 | 6.5 |
| Fun | 6.3 | 6.0 | 7.0 |
| Polish | 4.5 | 4.8 | 6.0 |
| Depth / progression | 7.5 | 7.3 | 8.0 |

Round 5 is the first pass of testers a–d (the teacher's chapter 6 retest is not averaged in). Tester b gave a win list in place of a
number for "win", so that cell averages three testers.

Winning from in-game guidance moved most: from "I could not tell what to do" to wins in every chapter. Polish is still the weakest
score.

## What works
- **The chemistry teaches through the player's own numbers.** For example:
  - "174.8 kmol/h of NH₃": inerts dilute the reactants and push the equilibrium.
  - Carbon efficiency rising 61 → 73 → 86 % as the purge shrinks.
  - The Semenov plot jumping to the hot branch.
  - L27's "1,009 mm² against your call of 1,000".
- **The instruments make concepts click.** Testers named the Equilibrium Window (L11, L16), the X-T staircase, the Semenov plot, the
  L33 scenario strip ("Missed" → "Caught") and the L37 z-scores.
- **The depth reads as real work.** A junior engineer persona said: "PID, then IMC, then a SIS design with cost and false trips, then a
  start-up SOP, then data reconciliation, then a five-year plant manager."
- **Predict-first works.** The call-it gate with locked answers and a graded printout is the best teaching device, by the teacher's
  account.

## What still fails (harsh)
1. **Building is still the main obstacle.**
   - L23 Spirits, L25 (12 parts) and L26 (gauze deck) were not finished by any tester inside an action budget.
   - F10 fixed the placement footprint bug (the UI never loaded the engine's footprints).
   - The first pipe is still not obvious, and nobody has played a big build to a win in the UI.
2. **Career is not yet a game a tester can win.**
   - Two testers ran 24–25 months, and both ended year 2 in a loss.
   - F9c separates operating margin from investments and explains revenue drivers, but whether a careful player can reach the
     140 MUSD target in five years is untested.
3. **Long waits.**
   - L24's light-off takes about 9 minutes of wall time at 1x before you may speed up.
   - L08's shift took about 12 minutes at 16x in one round.
   - Time is a cost the game does not respect yet.
4. **The phone build is unproven.**
   - The layout passed 181 checks at phone size on desktop.
   - The last real-phone pass (round 4) had two blockers, an empty parts drawer and an unscrollable map. Both are fixed in code, but
     not re-checked on the device.
5. **Text density.** Notebooks for L18, L24, L33 and L37 run to 10–12 lines. F10 split L24 into steps; the others are still walls of
   text.
6. **The 1-in-5 call-its are gone, but some predictions are still hard to compute** without pencil and paper. That is intended for an
   employable-level game, but the brief should say so.

## Gate for 0.4 → 0.5 ("The plant you design")
- A fresh tester wins L23, L25 and L26 in the UI from the notebook.
- A tester following the in-game advice reaches a positive five-year Career, and the Career has at least two endings a player can
  steer toward.
- No level asks for more than 5 minutes of wall-clock waiting.
- A real-phone pass wins L00–L02 and one level from chapters 3, 6 and 8 by touch, at a stable 30 fps or better.
- A round-6 re-run of testers a–d finds no two numbers on screen that contradict each other.
