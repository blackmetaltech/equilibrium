# Oracle blind cross-check (2026-11-09)

A second worker received 18 oracle statements with every answer removed (EQ-CE-005, 006, 007, 011, 013, 016, 020, 021, 022, 024, 026, 029, 030; EQ-NC-022, 024, 026, 027, 037), solved them independently in Python (`crosscheck.py`), and critiqued each.

**Result: all 18 agree numerically with the first solver** (to the 4-5 significant figures reported).

Defects found in the statements (fixed in DESIGN.md §9.2.1):
| id | issue | fix |
|---|---|---|
| EQ-NC-024 | gas constant unspecified; Kp = 85.87 (R = 0.083) vs 83.71 (R = 0.083145) | statement fixes R = 0.083 L bar/(mol K) (book convention), tolerance 0.5 % |
| EQ-NC-026 | mislabelled: the NCERT example has [HI] = 0.5 M *at equilibrium*, not initially | replaced by the NCERT version: [H2] = [I2] = 0.5/√54.8 = 0.06754 M |
| EQ-NC-037 | units of k missing ("same relation"); min⁻¹ gives 739 K instead of 669 K | statement gives log₁₀ k (s⁻¹) explicitly |
| EQ-CE-026 | two rows (constant ΔH, with Cp) differ 43 %; Cp data not in that problem's inputs | two separate assertions; Cp data referenced from EQ-CE-030 |
| EQ-CE-011 | air composition unstated (79/21 vs 3.76 changes T_ad by 0.5 K) | fixed to 21/79, absolute tolerance 1 K |
| EQ-CE-024 | ambiguous which Semenov approximation is compared | exact tangency asserted; approximation reported only |
| EQ-CE-021 | low steady state 300.096 K sits 0.1 K above the coolant (weak example) | absolute tolerance 0.01 K on that root |
| EQ-CE-005/006 | direct substitution converges slowly (280 / >500 passes) | the engine must use Wegstein (asserted ≤ 30 passes) |

Separately, a citation check against the NCERT PDFs could not reach ncert.nic.in (connection refused); every NCERT citation remains "recalled, not verified" until the PDFs are checked (implementation task, DESIGN.md §9.2).

A design-time discovery from the rigorous thermo: the NCERT-style N₂O₄ problem (EQ-NC-024) implies Kp(400 K) = 85.9 bar, but NIST-JANAF gives 51.1 bar (a real vessel would read 8.83 bar, not 9.15). Hence the "Book data" thermo mode for exam bridges (DESIGN.md §3.3).
