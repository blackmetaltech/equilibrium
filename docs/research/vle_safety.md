# EQUILIBRIUM - VLE / thermo / safety / process data (research worker output, 2026-11-09)
Tags: FETCHED = read from the primary/secondary source page or file this session; SNIP = only seen in a search snippet; DERIVED = computed here (script named); UNVERIFIED = not confirmed.
Scripts: vle_antoine_check.py, vle_antoine_refit.py, vle_binary.py, vle_steam_api.py (same folder). CoolProp verification uses HEOS reference EOS.

## 1. Antoine constants  (all: log10(P/bar) = A - B/(T/K + C))  source: NIST WebBook Phase-change/Antoine pages (FETCHED), orig. refs in table
Error = Antoine vs CoolProp at 10/50/90 % of the range (vle_antoine_check.py). Use the "game" row.
| Species | Range K | A | B | C | Orig. ref | Err vs CoolProp |
|---|---|---|---|---|---|---|
| NH3 | 239.6-371.5 | 4.86886 | 1113.928 | -10.409 | Stull 1947 | +0.3/-0.7/+0.4 % (good) |
| NH3 | 164-239.6 | 3.18757 | 506.713 | -80.78 | Stull 1947 | -38 % at 172 K, +2 % mid (poor below 200 K) |
| H2O | 255.9-373 | 4.6543 | 1435.264 | -64.848 | Stull 1947 | -7 % at 268 K, +1.3 % at 314 K, -0.6 % at 361 K |
| H2O | 344-373 | 5.08354 | 1663.125 | -45.622 | Bridgeman&Aldrich 1964 | -0.1 % (best, 71-100 C) |
| H2O | 304-333 | 5.20389 | 1733.926 | -39.485 | Bridgeman&Aldrich 1964 | -0.1 % |
| CH3OH | 288.1-356.83 | 5.20409 | 1581.341 | -33.50 | Ambrose&Sprake 1970 | -0.25 % |
| CH3OH | 353.5-512.63 | 5.15853 | 1569.613 | -34.846 | Ambrose et al 1975 | **-6.2 to -6.7 % vs CoolProp (as printed by NIST page; do NOT use)** |
| C2H5OH | 292.77-366.63 | 5.24677 | 1598.673 | -46.424 | Ambrose&Sprake 1970 | -0.14/+0.33/+0.54 % |
| C2H5OH | 273-351.7 | 5.37229 | 1670.409 | -40.191 | Kretschmer&Wiebe 1949 | <0.35 % |
| C2H5OH | 364.8-513.91 | 4.92531 | 1432.526 | -61.819 | Ambrose et al 1975 | **-6 to -7 % (do NOT use)** |
| SO2 | 263-414.9 | 4.37798 | 966.575 | -42.071 | Stull 1947 | +1.2/+3.6/+2.1 % |
| SO2 | 177.7-263 | 3.48586 | 668.225 | -72.252 | Stull 1947 | -26 % at 186 K, -2.7 % at 255 K |
| Cl2 | 239.4-400.3 | 4.28814 | 969.992 | -12.791 | Stull 1947 | -0.9/+0.5/+1.9 % |
| Cl2 | 155-239.4 | 3.0213 | 530.591 | -64.639 | Stull 1947 | -23 % at 163 K, -2.4 % at 231 K |
(Other NIST water sets: Liu&Lindsay 379-573 K 3.55959/643.748/-198.043 is labelled D2O vapour pressure in its title - do not use for H2O.)
Caveat: NIST page flagged the Ambrose 1975 high-T alcohol constants as printed by fetch; the ~6.5 % constant offset suggests a unit/transcription issue on NIST or in the fetch summary -> UNVERIFIED, prefer the DERIVED refits below.

DERIVED refits to CoolProp (vle_antoine_refit.py), same form, bar/K - recommended for the engine when one equation must span a wide range:
| Species | Fit range K | A | B | C | max abs err |
|---|---|---|---|---|---|
| NH3 | 230-370 | 4.68550 | 1009.889 | -24.025 | 0.61 % |
| H2O | 300-520 | 5.07658 | 1660.626 | -45.654 | 0.24 % |
| CH3OH | 290-460 | 5.17440 | 1564.223 | -35.005 | 0.13 % |
| C2H5OH | 290-460 | 5.09143 | 1515.440 | -53.549 | 0.84 % |
| SO2 | 250-400 | 4.47598 | 1035.769 | -31.438 | 0.67 % |
| Cl2 | 230-380 | 4.17412 | 913.043 | -20.146 | 0.39 % |

### DeltaHvap at normal boiling point (CoolProp, DERIVED)
| Species | Tb K (1 atm) | dHvap kJ/mol |
|---|---|---|
| NH3 | 239.83 | 23.33 |
| H2O | 373.12 | 40.65 |
| CH3OH | 337.63 | 35.28 |
| C2H5OH | 351.57 | 39.14 |
| SO2 | 263.14 | 24.96 |
| Cl2 | 239.20 | 20.35 |
(Literature cross-check from memory only: water 40.65, MeOH 35.2, EtOH 38.6-39.3, NH3 23.3 - consistent; not fetched -> UNVERIFIED as literature.)

## 2. Ethanol-water and methanol-water VLE at 1.01325 bar
Parameter source: ChemSep interaction-parameter database (Kooijman & Taylor), which tabulates DECHEMA Chemistry Data Series NRTL at 1 atm (.ipd header: "DECHEMA NRTL data @ 1atm", units cal/mol) and Wilson (original-T form), read from the `thermo` 0.6.1 wheel data files (FETCHED, ChemSep/nrtl.ipd, wilson.json). Original DECHEMA volume page numbers not seen (MeOH-water row cites "p61 1/1a"). Treat as: FETCHED via secondary packaging of DECHEMA/ChemSep.
NRTL: tau_ij = A_ij/(R T) (A in cal/mol, R=1.9872), G_ij = exp(-alpha tau_ij), alpha12 = alpha21.
| Pair (1)-(2) | A12 | A21 | alpha |
|---|---|---|---|
| Ethanol-Water | -57.9601 | 1241.7396 | 0.2937 |
| Methanol-Water | -189.0469 | 792.8020 | 0.2999 |
Wilson: Lam12=(V2/V1)exp(-(l12-l11)/RT), Lam21=(V1/V2)exp(-(l21-l22)/RT); V cm3/mol: ethanol 58.68, water 18.07 (matches Gmehling DECHEMA recommended volumes, SNIP via Scribd textbook table), methanol 40.73 (back-calculated from ChemSep ln(V2/V1) = -0.812; 40.73 = standard value).
| Pair | l12-l11 cal/mol | l21-l22 cal/mol |
|---|---|---|
| Ethanol(1)-Water(2) | 382.3 (= -bij*R, bij=-192.38 K) | 955.4 (bij=-480.80 K) |
| Methanol(1)-Water(2) | 205.3 (bij=-103.31 K) | 482.1 (bij=-242.63 K) |

### Azeotrope check (vle_binary.py; Antoine = NIST low-range sets 292-367 K EtOH, 344-373 K water, 288-357 K MeOH)
| Model | x_EtOH (mol) | wt % EtOH | T C |
|---|---|---|---|
| NRTL (above) | 0.880 | 94.9 | 78.08 |
| Wilson (above) | 0.873 | 94.6 | 78.01 |
| Literature (azeotrope, ~standard value, not re-fetched: UNVERIFIED) | 0.894 | 95.6 | 78.15 |
Error: -1.4 mol % pts (NRTL), -2.1 (Wilson), T within 0.1 K. Model gamma_inf at 360 K (EtOH in water / water in EtOH): NRTL 5.2/2.6, Wilson 6.4/2.7. For the game: NRTL gives ethanol enrichment to ~88-89 mol % then azeotrope pinch; if exact 89.4 wanted, scale A12/A21 slightly or hard-code azeotrope. Selected NRTL points (x, y, T C): 0.05/0.319/90.8, 0.10/0.442/86.5, 0.20/0.542/82.9, 0.40/0.624/80.4, 0.60/0.701/79.0, 0.80/0.817/78.2.

### Methanol-water: need gamma?
Max gamma_inf ~2.3 (MeOH in water, NRTL, 360 K; Wilson 2.6), 1.7 (water in MeOH). x-y at 1 atm (x_MeOH, y):
| x | y ideal Raoult (T C) | y NRTL (T C) | y Wilson |
|---|---|---|---|
| 0.05 | 0.157 (96.7) | 0.275 (92.5) | 0.291 |
| 0.10 | 0.285 (93.7) | 0.425 (87.6) | 0.436 |
| 0.20 | 0.478 (88.5) | 0.584 (81.6) | 0.585 |
| 0.40 | 0.718 (80.2) | 0.735 (75.2) | 0.731 |
| 0.60 | 0.855 (73.8) | 0.831 (71.1) | 0.829 |
| 0.80 | 0.942 (68.8) | 0.916 (67.6) | 0.915 |
| 0.90 | 0.974 (66.6) | 0.958 (66.1) | 0.957 |
Conclusion: no azeotrope, but ideal Raoult UNDER-predicts y at low x by up to ~0.12-0.15 and over-predicts above x~0.5, and overstates T by up to 4-6 K. A shortcut column (Fenske/Underwood, constant alpha) with ideal Raoult is acceptable for a game only as an easy mode; with NRTL, relative volatility is ~7-8 at x=0.05 falling to ~3.4 at x=0.9 (compute from table). Recommend NRTL/Wilson for realism; it is cheap.

## 3. Henry's law constants in water, 298.15 K (Hcp, mol/(m3 Pa); d ln Hcp/d(1/T) in K)
Source: henrys-law.org (Sander compilation, current release v5.0.0 2023; the AR6-era 2015 ACP paper is marked obsolete there). Values below are the top/recommended-type "L" rows (Burkholder et al. 2019/2015 JPL = Sander 2015 recommended; H2 from Fernandez-Prini 2003). FETCHED page (CAS-number pages). ACP 15, 4399 PDF itself exceeded fetch size -> not read directly.
| Gas | Hcp 298 K | dlnH/d(1/T) K | Ref row | Notes |
|---|---|---|---|---|
| H2 | 7.8e-6 | 530 | Fernandez-Prini 2003 | alt 7.7e-6/490 (Young 1981) |
| N2 | 6.4e-6 | 1300 | Burkholder 2019 | |
| O2 | 1.3e-5 | 1500 | Burkholder 2019 | |
| Ar | 1.4e-5 | 1500 (range 1400-1700) | Fernandez-Prini/Clever | |
| CH4 | 1.4e-5 | 1600 | Burkholder 2019 | pure water row |
| CO | 9.7e-6 | 1300 | Burkholder 2019 | pure water row |
| CO2 | 3.4e-4 | 2300 | Burkholder 2019 | physical solubility only (no carbonic acid) |
| NH3 | 5.9e-1 | 4200 | Burkholder 2019 | effective solubility is pH dependent (NH3+H2O<->NH4+) |
| SO2 | 1.3e-2 | 2900 | Burkholder 2019 | physical only; effective H much higher at pH>2 (hydrolysis) |
Use: Hcp(T)=Hcp298*exp(C*(1/T-1/298.15)); x_i = Hcp*p_i*(rho_w/M_w)^-1 ... i.e. c_i = Hcp*p_i. (Also in `thermo` wheel Sander_henry_*.json, FETCHED.)

### Gas solubility in liquid ammonia (synthesis loop separator) - NOT FOUND numerically
- Primary sources exist: Wiebe & Tremearne, JACS 1934, 56, 2357 (H2 in liquid NH3 25-100 C to 1000 atm); JACS 1937 "Solubility in liquid ammonia of hydrogen at 0 C and of nitrogen at 0,50,75,90,100 C to 1000 atm" (authors per snippet uncertain); Larsen & Black (N2-H2-NH3, 1920s). Bibliographic only (SNIP).
- Only quantitative datum found (SNIP, lecture-note PDF, unnamed primary): N2 in liquid NH3 at 0 C ~2.2 mol % at 1000 bar; 12.9 mol % at 70 C, 1000 bar. => at 150-200 bar and 0 C order ~0.4-0.5 mol % N2 (linear scaling, DERIVED rough estimate, UNVERIFIED). H2 and Ar/CH4 values: UNVERIFIED / not found. Suggest engine uses a modest literature-style placeholder and labels it as an estimate, or look up the IUPAC-NIST Solubility Data Series (Ammonia volume) for exact numbers.

## 4. Steam tables (CoolProp, IF97 and HEOS backends agree within 0.2 kJ/kg; vle_steam_api.py) - DERIVED
Reference state: IAPWS-IF97 (u=s=0 at triple-point liquid), h in kJ/kg.
| P bar | Tsat C | h_f | h_g | h_fg |
|---|---|---|---|---|
| 4 | 143.61 | 604.7 | 2738.1 | 2133.3 |
| 10 | 179.89 | 762.7 | 2777.1 | 2014.4 |
| 40 | 250.36 | 1087.4 | 2800.9 | 1713.5 |
Boiler feed water at 105 C: h = 440.2 kJ/kg (sat. liquid, ~1.2 bar); compressed 440.9 kJ/kg at 10 bar, 443.1 kJ/kg at 40 bar (IF97). Use ~441-443 kJ/kg. (Cp_liq ~4.22 kJ/kg K.)

## 5. API 520 Part I, critical-flow gas/vapour relief sizing (SI)
A [mm2] = W / (C K_d P1 K_b K_c) * sqrt(T Z / M)  with W kg/h, P1 kPa abs (set pressure + overpressure + 101.325), T K at relieving, M kg/kmol.
C = 0.03948 * sqrt( k (2/(k+1))^((k+1)/(k-1)) )   (k=1 limit: 0.023946). Source: `fluids.safety_valve` code/docstring which implements API 520-1 (FETCHED, secondary; API text itself not read -> UNVERIFIED primary). Equivalent US-unit form C = 520*sqrt(...) ; relation 1/0.03948 = 25.3, and 13160/520 = 25.3, so the often-quoted SI form A = 13160 W/(C_US K_d P1 K_b K_c) sqrt(TZ/M) is consistent (13160 itself not fetched, SNIP-level: UNVERIFIED literal).
| k | C (SI form) | C_US form |
|---|---|---|
| 1.1 | 0.02481 | 326.7 |
| 1.2 | 0.02560 | 337.2 |
| 1.3 | 0.02634 | 347.0 |
| 1.4 | 0.02703 | 356.1 (API tables: 356) |
| 1.67 | 0.02869 | 377.9 |
K_d = 0.975 (gas, API default; fluids defaults K_d=0.975, K_b=K_c=1 - FETCHED). Critical flow if P2/P1 <= (2/(k+1))^(k/(k-1)) = 0.528 for k=1.4 (SNIP).
Example (vle_steam_api.py): 10,000 kg/h NH3 (k=1.31, M=17.03, 400 K, Z=1) at 1000 kPa abs -> 1882 mm2 -> letter M (2323 mm2); L (1841 mm2) is just too small.
API 526 effective orifice areas (in2 from API 526 as reproduced in fluids code FETCHED; mm2 Neutrium FETCHED, precision 1 mm2 conversion):
| Letter | in2 | mm2 |
|---|---|---|
| D | 0.110 | 71 |
| E | 0.196 | 126 |
| F | 0.307 | 198 |
| G | 0.503 | 325 |
| H | 0.785 | 506 |
| J | 1.287 | 830 |
| K | 1.838 | 1186 |
| L | 2.853 | 1841 |
| M | 3.60 | 2323 |
| N | 4.34 | 2800 |
| P | 6.38 | 4116 |
| Q | 11.05 | 7129 |
| R | 16.00 | 10323 |
| T | 26.00 | 16774 |
(One web blog gives T = 9064 mm2: wrong.)

## 6. Flammability limits in air (vol %, ~20 C, 1 atm)
| Fuel | LFL | UFL | Source |
|---|---|---|---|
| NH3 | 15 (15.0-17.1 in compilations; 16.6 measured) | 28 (26.4-28; 27.2 measured) | Wikipedia table (FETCHED, uncited); Coward&Jones/Zabetakis range and Harris & MacDermott quoted in the ICI paper below (FETCHED) |
| H2 | 4 | 75 | Wikipedia/Engineering ToolBox (FETCHED secondary) |
| CH4 | 5.0 (ISO 10156) / 4.4 (IEC 60079-20-1) | 14.3 / 17 | Wikipedia citing ISO/IEC (FETCHED secondary) |
| CO | 12 (12.5 common) | 75 | Engineering ToolBox via Wikipedia (FETCHED secondary) |
| CH3OH vapour | 6 - 6.7 | 36 | same |
| C2H5OH vapour | 3 - 3.3 | 19 | same |
NH3-air vs temperature (1 atm): G.F.P. Harris & P.E. MacDermott (ICI), "Flammability and explosibility of ammonia", I.Chem.E. Symposium Series No. 49 (FETCHED PDF, open tube, spark ignition): 16.6-27.2 % at ambient; 13.1-34.3 % at 300 C; 11.2-37.1 % at 400 C; MIE 40-170 mJ (vs pentane 1.0-1.2 mJ). Limits widen ~linearly with T. Minimum O2 for flame propagation decreases as T rises (paper text, ~17 vol% O2 at ambient).
NH3-air vs pressure/T: Chemical Engineering Transactions 2025 paper (SNIP only): LEL 15.0 vol% at 0.5 MPa, 20 C -> 12.4 vol% at 200 C; 10.4 vol% at 0.1 MPa, 200 C (snippet; internally odd - lower at lower pressure; UNVERIFIED). Energy & Fuels 2024 (SNIP): limits measured 298-423 K, 0.05-0.5 MPa, linear in T, logarithmic in P. No source found for 10 bar / 200-500 C; design practice quoted in task (10-11 % NH3 safe feed limit) matches BREF: NO yield optimum at NH3/air 9.5-10.5 % (BREF text, FETCHED). Rule for engine: operate converter at 9.5-11 vol% NH3, trip above ~11 (hot, pressurised LEL falls toward ~10 %).

## 7. Ostwald process (EU BREF LVIC-AAF, adopted 2007, text version Dec 2006 FETCHED: aida.ineris.fr/.../lvic_bref_1206.pdf)
| Quantity | Value | Where |
|---|---|---|
| NO yield vs P,T | <1.7 bar, 810-850 C: 97 %; 1.7-6.5 bar, 850-900 C: 96 %; >6.5 bar, 900-940 C: 95 % | Table 3.2 (EFMA 2000) |
| Oxidation parameters | 1 bar: 3-5 gauze layers, 0.4-1.0 m/s, 840-850 C, Pt loss 0.04-0.06 g/t HNO3, campaign 8-12 mo; 3-7 bar: 6-10 layers, 1-3 m/s, 850-900 C, 0.10-0.16 g/t, 4-7 mo; 8-12 bar: 20-50 layers, 2-4 m/s, 900-950 C, 0.25-0.32 g/t, 1.5-3 mo | Table 3.9 (InfoMil 1999; Austrian UBA 2001) |
| Pt primary losses (plants) | 0.15 (6 bar), 0.26 (10 bar), 0.13 g/t 100 % HNO3 (4.6/12 bar) | Table 3.5 |
| Pt recovery getter | 60-80 % of losses | text |
| Optimum | NH3/air 9.5-10.5 vol %, T 750-900 C; NO yield higher at low P | sect. 3.4.x |
| Typical actual plant NO yield | ~93-97 % | text |
| N2O | fresh medium-P gauze <1.5 % of NH3 (<1000 ppm tail gas) rising to 2.5 % (1500 ppm) at campaign end; 5.6-9 kg/t HNO3 (900-1500 ppmv) over a campaign; all plants 1.9-21.6 kg/t (300-3500 ppmv); low-P 4-5 kg/t; medium-P 6-7.5 kg/t (IPCC 2000); Norsk Hydro modern 2.5 kg/t; CDM baselines 3.5-8.7 kg/t (SNIP, UNFCCC) | Table 3.7 |
| N2O abatement | improved Pt catalysts -30 to -50 %; Co3O4 etc. -80-90 % N2O but NO yield 88-95 % | text |
| NH3 consumption | 283-290 kg NH3/t 100 % HNO3 | Table 3.5 |
The task prompt's figures (97-98/95-96/93-94 %) are higher at the high-P end than BREF (97/96/95): use BREF. Ullmann / Kirk-Othmer / JM / Yara not accessible (Scribd render failed): UNVERIFIED.

## 8. Climate metrics
| Item | Value | Source |
|---|---|---|
| GWP100 N2O | 273 (+/-130) (GWP20 273) | IPCC AR6 WG1 Ch.7 Table 7.15 (FETCHED, PDF read) |
| GWP100 CH4 fossil | 29.8 (+/-11); non-fossil 27.0 (+/-11); GWP20 82.5/79.7 | same |
| India grid, CEA CO2 Baseline Database v20.0 (Dec 2024): weighted avg EF FY2023-24, RE-adjusted | 0.727 t CO2/MWh; build margin 0.552; combined margin 0.757 | SNIP (SolarQuarter 6 Jan 2025, fetched article; cea.nic.in refused connection). A newer v22.0 exists (CEA site, 2026) - value NOT obtained: UNVERIFIED as "latest". Older rule of thumb ~0.82 (v17/v18) UNVERIFIED. |
| EU average electricity | 213 g CO2/kWh (2024, Ember via news summary) | SNIP; EEA says 2024 intensity -62/-63 % vs 1990, -9/-11 % vs 2023; absolute EEA figure only in interactive chart: UNVERIFIED. Alt ~230 gCO2e/kWh (EI article, SNIP). |
