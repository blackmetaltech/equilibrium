# EQUILIBRIUM: depth ladder (Opus, 2026-11-10; user direction "start at std 9, reach employable")
Amends DESIGN §2. Every rung is played, not read: a mechanic the player must use to win, graded by the engine.

## The ladder
| Rung | Who | What the player can do at the end | Where |
|---|---|---|---|
| 0 · std 9-10 | anyone | atoms vs molecules, conservation of mass, word → formula, balancing | L00 + Ch1 critters, atom ledger bars |
| 1 · std 11-12 (NCERT/JEE/NEET) | aspirants | mole, stoichiometry, limiting reagent, gas laws, ΔH/Hess, K/Q/Le Chatelier, rate laws, Arrhenius | Ch1-Ch4 (DESIGN levels) |
| 2 · ChemE yr 1-2 | undergrads | material + energy balances with recycle/purge, flash (Raoult), reactor design (PFR/CSTR/multibed), heat-exchanger duty | Ch3-Ch5 |
| 3 · ChemE yr 3-4 | undergrads | distillation, heat integration (pinch: composite curves, ΔT_min), runaway (Semenov), relief sizing (API 520), equipment costing (Turton), NPV/payback | Ch5-Ch7 + Ch8 |
| 4 · junior process engineer | graduates | read/build P&IDs with ISA tags; tune PID loops (P, I, D; cascade, ratio control); run a HAZOP node; write a start-up SOP; permit-to-work + LOTO; data reconciliation from faulty analysers; MOC; turnaround planning | threaded from Ch1, Ch8 "Control room", Ch9 "Turnaround", Career |

## Systems added for depth (in build order)
1. **P&ID + ISA tags from L01** (parts rack shows ISO 10628 symbols; units auto-tagged R-101, FIC-101). Codex teaches the
   symbol legend; a Ch2 side job "Read the drawing": rebuild a unit from a P&ID sheet.
2. **Controllers as gameplay (Ch5 onward, Ch8 core):** every setpoint is held by a loop (FIC/TIC/PIC/LIC) with real
   dynamics; Learner = perfect loops; Engineer = player tunes Kc, τI, τD on the faceplate; bad tuning oscillates on the chart
   recorder (the recorder *is* the teaching surface). Ratio control for the H₂:N₂ feed (L01 callback), cascade for the
   converter inlet. Oracle tests: first-order-plus-dead-time responses, ZN/IMC tuning rules.
3. **HAZOP minigame (Ch6):** pick a node on the P&ID, apply guide words (no/more/less/reverse/other than) to a parameter;
   the engine simulates the deviation; the player records cause, consequence, safeguard; graded against the engine's
   consequence and the level's safeguard list. Ties to relief, interlocks and the incident file.
4. **SOPs (Ch8):** start-up / shutdown as an ordered checklist the player writes from steps (purge with N₂ before H₂, heat
   at ≤ 50 K/h, open cooling before feed…); the shift executes it; wrong order → realistic consequence (explosive mixture in
   a vessel not purged, thermal shock, flare overload).
5. **Lab QC + data reconciliation (Ch1 L03 onward):** analysers can drift/fail (event `analyser_fault`); the player uses the
   atom balance to find the bad instrument. Ch8 job: reconcile a plant's mass balance from noisy meters (least squares).
6. **Equipment that ages (Career):** catalyst activity decays, exchangers foul (U falls), compressors wear; inspections and
   **turnarounds** (Ch9) are planned against production loss; permits and LOTO gate maintenance actions.
7. **Economics as decisions:** capex vs opex trade-offs per level (already in engine), Ch7 project NPV/payback for the
   integrated Works; Career contracts (supply tonnes at a price) with penalties.

## Long-term play
- **Works map that persists** (chapters bring plants back; their steam/products feed each other: DESIGN §2.4).
- **Career mode (after the campaign):** run the whole Works for years: contracts, prices, events, ageing, turnarounds,
  inspections, incidents, an annual review by Victor + Noor (production, cost, safety, emissions). Seeded, deterministic,
  verifiable for leaderboards ("best 5-year margin with zero Critical alarms").
- **Daily Shift** (one seeded event set for everyone), **histograms** per level, **Called-it** streak, incident file.
- **Sandbox** with every unit and species, P&ID export (PNG) and stream table CSV.

## Chapter 1 enrichment (now)
- L01 feeds are real **cylinder banks** (H₂ tube trailer / N₂ bank) with a mass gauge that drains: the player sees kg leave
  and critters (moles) arrive. FIC-101/102 flow controllers on each feed (first faceplates).
- Chapter 1 ends with a **plant-check job (L04+)**: the lab notebook's numbers vs the printout (exam bridge).
- Every Ch1 level: P&ID view toggle (mimic view, key 6) shows the player's plant as a drawing with ISA tags.
