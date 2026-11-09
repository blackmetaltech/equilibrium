# EQUILIBRIUM kinetics research notes

Legend: [F] = number read in a fetched source this session. [F2] = read in a fetched secondary source that quotes the primary. [R] = recalled from memory, NOT confirmed (UNVERIFIED). [G] = game-tuned / calibrated by me, not literature.
Scripts (same folder): kinetics_haber.py, kinetics_so2.py, kinetics_methanol.py, kinetics_ferment.py, kinetics_cstr.py (Btu units, Fogler data), kinetics_cstr_si.py (game CSTR, SI), kinetics_smr_wgs.py, kinetics_wgs_hts.py, kinetics_arrhenius.py. Every script runs standalone with python3 + numpy/scipy.

## 1. Ammonia synthesis, promoted Fe (Temkin-Pyzhev, Dyson-Simon 1968 form)
Rate [F2: Hernandez-type paper, eq.5-7, quoting Dyson & Simon, Ind. Eng. Chem. Fundam. 7(4) 605 (1968)]:
  r_NH3 = 2 k [ Ka^2 a_N2 (a_H2^3 / a_NH3^2)^alpha - (a_NH3^2 / a_H2^3)^(1-alpha) ] * eta      [kmol NH3 / m3cat / h], a_i in atm
  k = 8.849e14 exp(-170560 / (R T))   (Ea = 170.56 kJ/mol = 40.77 kcal/mol; R = 8.314 J/mol/K)   [F2]
  alpha = 0.5 (literature 0.5-0.75) [F2]. Ideal-gas simplification: a_i = y_i P (phi_i = 1); Dyson-Simon use a_i = y_i phi_i P with SRK-like phi (not coded; real equilibrium at 200 bar is higher than ideal-gas).
  Ka = Gillespie-Beattie (atm^-1, 1/2N2+3/2H2=NH3): log10 Ka = -2.691122 log10 T - 5.519265e-5 T + 1.848863e-7 T^2 + 2001.6/T + 2.6899.
  NOTE: the fetched paper PRINTS 1.848863e-5 T^2, a typo; e-7 (your value) is right: Ka(700K)=8.8e-3 atm^-1 (e-5 gives nonsense). Ka valid ~ 300-600 C; Ka(298)=555 vs thermo 762, so do not use below ~500 K.
  Effectiveness: eta = 0.3-0.5 for industrial 6-10 mm particles [F2: Elnashaie & Alhabdan 1989 quoted]; Dyson-Simon give eta(T, X_N2) polynomial per pressure [F2, coefficients not obtained]. Game: eta = 0.4 (or ~1 for 1-2 mm particles).
  Catalyst bulk density: ~2.2-2.9 t/m3 for fused Fe (used 2200) [R]. Void ~0.33 [R].
  Rate equation is singular at a_NH3 -> 0: always keep >= ~1-3 % NH3 (real converter feed has 2-4 % NH3 from recycle) or clamp.
  Valid 380-520 C, 100-300 bar, Fe-K2O-Al2O3 (Dyson-Simon fit on ICI 35-4 type) [R].
  Cheap forms: for game, evaluate formula directly (2 exp, 1 pow); no simplification needed.
PFR check (kinetics_haber.py): 400 C inlet, 200 bar, N2:H2=1:3 + 3 % NH3 + 3.9 % inert (y = .2328/.6984/.03/.0388), adiabatic, eta=0.4, dH(T) approx -51.6 kJ/mol NH3 at 673 K (const-Cp estimate, [G]; literature ~ -55), Cp mixture const.
  V_cat per (kmol feed/h) 0.2 L -> yNH3 .047, 428 C; 0.4 L -> .065, 456 C; 0.8 L -> .101, 513 C; 1.0 L (GHSV 1000 kmol/h/m3 = ~22,000 Nm3/m3/h) -> .112, 530 C; >=2 L -> .1171, 537.8 C = equilibrium.
  Adiabatic rise 138 K total (15.8 K per mol % NH3, literature ~14-15 [R]). Rate never exceeds equilibrium: 0 violations at any point vs local-T equilibrium. Net rate hits 0 exactly on the equilibrium line (checked).
  With eta=1 equilibrium is reached in 1/2 the volume. Rates are high enough that bed 1 reaches near-equilibrium at industrial space velocity (consistent with real bed-1 exit ~ 500-520 C, ~10-14 % NH3).

## 2. SO2 oxidation, V2O5-K2SO4/SiO2 (Eklund form)
Source [F2]: arXiv:1412.6486 eqs.2,4,5 (citing Eklund 1956; transcription of constants not independently checked against Eklund / Froment-Bischoff):
  r = k sqrt(pSO2/pSO3) ( pO2 - (pSO3 / (pSO2 Kp))^2 )     [mol SO2 / s / g cat], p in atm
  k = exp( -97782.22/T - 110 ln(1.8 T) + 912.8 )   (apparent Ea = R(97782 - 110 T): 179 kJ/mol at 693 K, 118 at 760 K, 54 at 830 K -> the known Arrhenius "break"/curvature; Chang et al. quote ~50 kcal/mol below 475 C and ~24 above [F2 search snippet])
  Kp = exp(11829.44/T - 11.24)  atm^-0.5  -> dH = -98.35 kJ/mol, dS = -93.4 J/mol/K; cross-checked vs formation data (-98.9 kJ, -94.0 J/K): Kp(700K) 287 vs 295.
  Range: Eklund differential reactor 420-554 C [F2: Livbjerg 1972 table]; catalyst-side limit ~ 620-630 C [R].
  Singular at pSO3 = 0 (sqrt(pSO2/pSO3)): clamp pSO3 >= 0.02 pSO2 (floor 0.01-0.05 changes bed-1 profile slightly; end point identical). A game can seed 0.5 % SO3.
  Simplification: closed-form is cheap (exp, ln, sqrt). Arrhenius-only k(T) fit: 660-760 K Ea=165.7 kJ/mol lnA=16.22 (max factor error 1.20); 760-850 K Ea=77.9 lnA=2.26 (1.12); single fit 660-850 K Ea=128 (max factor error 1.85 - too poor, use two segments). (k in the units above.)
  Also found [F2 search snippets]: Mars-Maessen K = 2.3e-8 exp(27200/RT) (Livbjerg review), Hulett & Wilson 1968 pure V2O5 Ea~49 kcal/mol 416-490 C. Collina 1971 not found. Froment-Bischoff example not obtained.
PFR (kinetics_so2.py): 420 C, 1.5 bar, 10 % SO2/11 % O2/79 % N2, adiabatic, dH(T)=-98.35e3+6.0*(T-700) J/mol, Cp(SO2 50.5, O2 32.5, SO3 72, N2 30.8) [G].
  W (g cat per mol/s total gas): 500 -> X .027 (428 C); 2000 -> .108 (452 C); 5000 -> .445 (552 C); 10000 -> .698 (626 C) = adiabatic equilibrium point (Xeq(626 C)=.698). Bed 1 exit 626 C, rise 206 K; matches industrial bed-1 (~600-630 C, ~65-70 %). 0 equilibrium violations. 1 m3 of 500 kg/m3 catalyst at 1500 h^-1 corresponds to W ~ 3e4 g/(mol/s), far beyond 1e4, so real beds are oversized for bed 1 (bulk 500 kg/m3 [R]).
  Light-off (isothermal, W = 2e4): X = .007 @340 C, .029 @360, .076 @380, .161 @400, .294 @420, .469 @440, .663 @460, .935 @500; equilibrium-limited above ~500 C (X = Xeq .88 @550, .77 @600, .63 @650). Matches "light-off 380-420 C", equilibrium trade-off, and 600+ C damage zone.

## 3. Methanol synthesis, Cu/ZnO/Al2O3
Vanden Bussche & Froment, J. Catal. 161, 1-10 (1996), Table 2, equations [3] [F: PDF read]. Commercial Cu/ZnO/Al2O3, 180-280 C, 15-51 bar, pCO/pCO2 0-4.1, 276 runs. p in bar, r in mol/kgcat/s, kappa = A exp(B/RT) (R = 8.314, B in J/mol):
  beta = 1 + (K_H2O/(K8 K9 K_H2)) pH2O/pH2 + sqrt(K_H2) sqrt(pH2) + K_H2O pH2O
  r_MeOH = k5a' K2' K3 K4 K_H2 pCO2 pH2 [1 - (1/K2*) pH2O pMeOH/(pH2^3 pCO2)] / beta^3
  r_RWGS = k1' pCO2 [1 - K3* (pH2O pCO/(pCO2 pH2))] / beta
  sqrt(K_H2): A=0.499, B=17197 | K_H2O: A=6.62e-11, B=124119 | K_H2O/(K8K9K_H2): A=3453.38 (B none) | k5a'K2'K3K4K_H2: A=1.07, B=36696 | k1': A=1.22e10, B=-94765.
  (Your recalled "k5a' = 1.07 exp(36696/RT)" and "K3 3453.38" were right in value, but the 3453.38 is the K_H2O/(K8K9K_H2) group.)
  Equilibria (Graaf 1986 as quoted): log10 K2* = 3066/T - 10.592 (CO2+3H2=MeOH+H2O, bar^-2); K3* (WGS) = 10^(2073/T - 2.029). Implied K1 (CO+2H2=MeOH) = 5139/T - 12.621 verified exactly equal to Graaf's K1.
  Fugacity: authors found Z within 0.99-1.01, so partial pressures OK; at 70 bar slight extrapolation. Bench catalyst density 1775 kg/m3 (particle), voidage 0.5; bulk ~1100 kg/m3 [R, my assumption].
  Graaf et al. 1988 (Chem Eng Sci 43:3185) parameters not obtained (UNVERIFIED).
PFR (kinetics_methanol.py): 250 C, 70 bar, feed H2 .70/CO .10/CO2 .05/inert .15. Dh: CO2->MeOH -49.5, RWGS +41.2 kJ/mol [R], Cp 34 J/mol/K [G].
  Isothermal 250 C: equilibrium xMeOH = .0826 per mol feed (yMeOH .099; RWGS extent -.073 i.e. net WGS). W (kg/(mol/s)): .5 -> 23 % of eq; 1 -> 37 %; 2 -> 63 %; 5 -> 93 %; 10 -> 99.5 %.
  Cooled tube (hw = 27 W/kg/K, wall 250 C): hot spot 298 C at W~0.8, exit 250 C (hot spot above ~280 C is the Cu sintering concern). Adiabatic: only xMeOH .027, T_exit 311 C (+61 K), exactly the local equilibrium -> adiabatic is equilibrium-limited, reason for quench/tubular reactors. 0 equilibrium violations.
  Rate at VdB bench inlet (493 K, 50 bar, 4 % CO/3 % CO2/82 % H2): rMeOH 0.053 mol/kg/s.

## 4. WGS (HT Fe-Cr) and SMR
SMR: Xu & Froment, AIChE J. 35(1) 88-96 (1989), Ni/MgAl2O4, 500-575 C bench, industrial 800 C use [F2: values in Korean Chem Eng Res 56(6) 2018 Table 6, unit-converted to the textbook set, matches]:
  r1 = k1/pH2^2.5 (pCH4 pH2O - pH2^3 pCO/K1)/DEN^2 ; r2 = k2/pH2 (pCO pH2O - pH2 pCO2/K2)/DEN^2 ; r3 = k3/pH2^3.5 (pCH4 pH2O^2 - pH2^4 pCO2/K3)/DEN^2 ;
  DEN = 1 + K_CO pCO + K_H2 pH2 + K_CH4 pCH4 + K_H2O pH2O/pH2 ; kmol/kgcat/h, p bar
  k1 = 4.225e15 exp(-240100/RT) (kmol bar^.5/kg/h) ; k2 = 1.955e6 exp(-67130/RT) (kmol/kg/h/bar) ; k3 = 1.020e15 exp(-243900/RT)
  K_CO = 8.23e-5 exp(70650/RT) bar^-1 ; K_H2 = 6.12e-9 exp(82900/RT) bar^-1 ; K_CH4 = 6.65e-4 exp(38280/RT) bar^-1 ; K_H2O = 1.77e5 exp(-88680/RT)
  K1 = exp(-26830/T + 30.114) bar^2, K2 = exp(4400/T - 4.036), K3 = K1 K2 [R, UNVERIFIED]. Rates are INTRINSIC: industrial pellets have eta ~ 0.01-0.05 [R].
  Check (kinetics_smr_wgs.py): isothermal 800 C, 25 bar, S/C 3: CH4 conversion goes to .673 = computed equilibrium .673 and stops; no overshoot.
  Cheap: for a game, merge to r_SMR only: r = k1(T) (pCH4 pH2O - pH2^3 pCO/K1)/(pH2^2.5 DEN^2) plus a fast equilibrated WGS (K2).
HT-WGS: form [R, UNVERIFIED] Hla et al., Appl. Catal. A 353 (2009): r = k pCO^0.9 pH2O^0.31 pCO2^-0.156 pH2^-0.05 (1-beta), Ea ~ 111 kJ/mol; k0 here is CALIBRATED [G] (ln k0 = 9.58, p in bar, units arbitrary) so the bed is ~50 % converted at W=1000 g/(mol/s). Keq = 10^(2073/T-2.029) [F via VdB]. Adiabatic 350 C inlet, 12 % CO / 30 % H2O / 8 % CO2 / 38 % H2: reaches equilibrium (CO conv .64, 443 C, +93 K), never above. Operating window 320-450 C; Fe-Cr catalyst typically 350-500 C [R].

## 5. Ostwald (NH3 oxidation) and NO oxidation
NO oxidation 2NO + O2 -> 2NO2: rate = k3[NO]^2[O2]; k3 = 3.3e-39 exp(530/T) cm6 molecule^-2 s^-1 = 1.2e3 exp(530/T) L2 mol^-2 s^-1 (273-600 K) [F2: review snippet; my unit conversion agrees: 7.1e3 L2/mol2/s at 298 K]. Apparent Ea = -4.4 kJ/mol (negative). Olbregts, Int. J. Chem. Kinet. 17 (1985) [F2 abstract]: 226-758 K, k falls with T, minimum near 600 K then rises, so the pure exp(530/T) is only valid <= ~600 K. IUPAC datasheet NOT obtained (UNVERIFIED k value vs IUPAC). Game consequence: NO half-life at 1000 ppm NO, 5 % O2, 1 atm = 840 s at 298 K, 2400 s at 400 K, 8400 s at 600 K: cooling the gas speeds NO->NO2 (hence cooler-condenser/absorption design).
Pt-Rh gauze: operating 800-950 C [F2 supplier page], 850-910 C [F2 dissertation]; byproducts N2 and N2O; high O/NHx surface ratio favours NO [F2 TAP study]. NO yield 95-98 % at ~ 1 bar and 93-96 % at medium pressure, falling at low gauze T (more N2) is [R, UNVERIFIED], no rate law obtained. Game-tuned selectivity suggestion [G]: S_NO(T) = 0.97 at 880 C, -0.05 per -50 C below 850 C (N2 takes the rest), plateau above 880, Pt loss rises sharply >950 C. Reaction is mass-transfer limited on gauze, so kinetics are effectively instantaneous: model as selectivity not rate.

## 6. Ethanol fermentation, S. cerevisiae (batch)
VERIFIED [F: abstract of Luong, Biotechnol. Bioeng. 27:280 (1985)]: ATCC 4126, anaerobic batch; ethanol stops growth at ~112 g/L and fermentation capacity vanishes at 115 g/L; model: mu = mu0 (1-(P/Pm)^alpha), nu = nu0 (1-(P/Pm')^beta). Table values of alpha, beta, mu0, Ks NOT obtained (UNVERIFIED; my recalled alpha 0.41/Pm 87 g/L is probably from another fit and conflicts with 112).
Also [F]: TUM abstract: S. cerevisiae Sc5 ethanol formation optimum 32-36 C, Tmax(ethanol) 57 C, Ea(ethanol formation) 78.5 +/- 2.2 kJ/mol; Penn student report: growth stops ~40 C, death Ea ~69 kcal/mol (weak); Ratkowsky/cardinal fits beat Arrhenius for growth (Biotechnol. Bioeng. 2012). Literature ranges seen: mu_max 0.18-0.31 /h, Ks 3.7-213 g/L (strain/medium dependent), Pmax ~ 49-112 g/L, Yp/s 0.49 (pilot).
Theoretical Yp/s = 2*46.07/180.16 = 0.5114 g/g (CO2 0.489). Practical 0.45-0.48 (88-94 %) [R].
Model used (kinetics_ferment.py), parameters [G] chosen inside literature ranges:
  mu = mu_max f(T) S/(Ks + S + S^2/Ki) (1 - P/112)^0.5 ; q_m = mS f(T) S/(Ks+S) (1-P/115)^0.5 ; dX = (mu - kd(T)) X ; dS = -(mu/Yxs + q_m) X ; dP = Yps (mu/Yxs + q_m) X
  mu_max .15 /h, Ks 5 g/L, Ki 250 g/L, Yxs .05 g/g, Yps .46 g/g, mS .06 g/g/h, Pm 112, Pm' 115, n = 0.5 (hmm: Luong alpha unknown).
  f(T) = Rosso CTMI cardinal model (form [R]) with Tmin 5 C, Topt 33 C, Tmax 47 C (f=.97 @30, 1.0 @32, .89 @38, .78 @40, .62 @42, .29 @45); death kd(T) = 0.03 exp(280e3/R (1/313.15 - 1/T)) /h for T > 32 C (Ed weak, [G]).
Batch check, 150 g/L glucose, X0 = 1 g/L: 32 C: 90 % glucose used at 22.5 h, final P 69.0 g/L (= .46*150, max possible .511*150 = 76.7), X 8.3 g/L, Yp/s overall 0.46, never exceeds stoichiometric max. 20 C 40 h, 30 C 23 h, 35 C 24 h, 38 C 28 h, 40 C 38 h, 42 C stuck (28 g/L glucose left, 56 g/L EtOH), 45 C dies (X falls, 2 g/L EtOH). Ethanol inhibition only binds if S0 >~ 200 g/L (P -> 112) - raise S0 to demonstrate. Real 150 g/L lab runs are slower (40-70 h); scale mS/mu_max for pacing.
Maintenance 0.05-0.5 g glucose/g cell/h reported widely [R]; no source fetched.

## 7. Textbook CSTR (Semenov), Fogler propylene oxide + water -> propylene glycol
Data [F2: jqbond.github.io CEN587 L43, Fogler examples]: k = 16.96e12 exp(-E/RT) h^-1, E = 32,400 BTU/lbmol (= 75.4 kJ/mol = 18,000 cal/mol; NOT 32,400 cal/mol), R = 1.987 Btu/lbmol/R. dH = -36,000 Btu/lbmol (528 R). First order in PO. Cp (Btu/lbmol/R): PO 35, water 18, glycol 46 (code uses 45), methanol 19.5. Feed 43.04 lbmol/h PO, 802.8 water, 71.87 methanol, Q0 = 326.34 ft3/h, CA0 = .132 lbmol/ft3, T0 = 75 F; V = 300 gal (40.1 ft3); jacket UA = 100*40 = 4000 Btu/h/R, Ta = 85 F. Multiplicity example: dH = -108,000 Btu/lbmol, V = 10 gal.
  My G(T)/R(T) (kinetics_cstr.py): Fogler as given -> ONE steady state, T = 100.6 F, X = .32 (flow-cooling 17,358 Btu/h/R dominates UA 4000). dH x3, V=300 gal -> one state (294 F, X=.999). dH x3, V=10 gal -> three: 78 F (X .005 stable), 201 F (X .57 UNSTABLE), 285 F (X .956 stable).
  With the real dH (-83.7 MJ/kmol, adiabatic rise only 50 K) NO multiplicity exists for these flows; multiplicity needs dTad ~ 150 K (the x3 variant) or lower flow cooling.
GAME CSTR (kinetics_cstr_si.py, SI): V = 0.10 m3, Q = 5 m3/h (tau 72 s), CA0 = 2.114 kmol/m3, rho Cp = 3.57 MJ/m3/K, dH = -251.2 MJ/kmol, UA = 10 MJ/h/K (2.8 kW/K), T0 = Tcoolant = 25 C. [G design]
  Steady states: 27.6 C (X .03, stable), 63.1 C (X .40, UNSTABLE), 117.0 C (X .965, stable). G/R (MJ/h) at 37/57/77/97/117/137 C: G 169/758/1746/2353/2562/2624, R 330/887/1444/2001/2558/3115.
  Ignition (lower state vanishes): feed+coolant raised together at 33.1 C; coolant only (feed 25 C) at 47.4 C. States at T0=Tc 20/25/30 C: lower 21/28/35 C; at 35 C only the hot state (129 C). Dynamic: step 25 -> 30 C stays low (35 C); 25 -> 35 C jumps to 128.6 C, X .98 in < 0.5 h.
  Cooling loss from the hot state, UA -> 30 % (-70 %): new steady state ~152 C; +5 K in 9 s, +10 K in 19 s, +20 K in 49 s; T(1 h) 151.7 C. UA -> 0: 173.5 C (adiabatic bound 173.7 C). Thermal mass 0.357 MJ/K (only liquid). Because the hot state is already ignited, loss of cooling is "runaway toward adiabatic temperature", not a jump; ignition from the cold branch is the Semenov case (use start-up / warm coolant event). Add a boiling/relief limit (PO bp 34 C [R], methanol 65 C) for the narrative.
T2 Laboratories (CSB; facts from fetched pages csb.gov, claimsjournal, OGJ, IOMosaic snippets): 19 Dec 2007, Jacksonville FL; batch of MCMT (methylcyclopentadienyl manganese tricarbonyl, gasoline additive) in a 2,500 gal reactor; cooling water to the jacket failed (likely blockage in supply pipe or a valve failure; cause "apparently"/probable); a second, unrecognised exothermic reaction took over a bit above normal temperature (also generates hydrogen); ~10 min after the cooling problem was noticed the vessel burst, rupture disk too small/late. 4 killed (incl. one co-owner), 32 injured (4 T2 staff + 28 at neighbouring businesses). CSB: T2 did not recognise the runaway hazard of MCMT; cooling system had single-point failure, no redundancy; relief system could not handle runaway; final report approved 15 Sep 2009; recommended more reactive-chemistry education for undergrad ChemEs. Not confirmed from CSB report: reaction temperatures (reported elsewhere ~ 360 F normal 177 C, onset of secondary reaction ~ 200 C) [R].

## 8. Catalyst facts (ALL [R] - UNVERIFIED, no source fetched; prices very uncertain)
- Fe-K2O-Al2O3 (fused magnetite, reduced): 380-520 C, 100-300 bar; poisons O compounds (H2O, CO, CO2 reversible; O2 worse), S, P, As, Cl irreversible; sintering/thermal ageing above ~ 520-550 C, life 10-20 y, price ~ USD 3-8 /kg.
- Ru/C (KAAP, Kellogg; Cs/Ba promoted graphitized carbon): 340-440 C, 70-100 bar; ~10 x Fe activity per volume; methanation of the C support above ~ 450 C; poisons O compounds; Ru ~ very expensive (catalyst > 100x Fe per kg).
- V2O5-K2SO4/SiO2 (diatomite): light-off ~ 380-420 C, max 600-630 C, below ~ 400 C V4+ sulfate (inactive) precipitates; poisons: Fe (forms KFe(SO4)2 inactive, [F2 Grzesiak 2013: iron compounds deactivate]), dust, moisture; life 10-20 y with screening; Cs-promoted low-T grades work from ~ 360 C.
- Cu/ZnO/Al2O3: 200-280 C, 50-100 bar; poisons S, Cl (ppb), carbonyls; deactivation: Cu sintering above ~ 280-300 C (the chief cause, accelerated by water); life 2-4 y.
- HTS Fe2O3-Cr2O3: 320-450 C (inlet ~ 350-400); poisons S (reversible), Cl; sintering and Cr(VI) issues, over-reduction to Fe metal at low S/C (FT byproducts); life 3-5 y.
- LTS Cu-ZnO-Al2O3: 190-250 C; poisons S, Cl; sintering above ~ 260 C, condensation damage; life 2-4 y.
- Ni/Al2O3 (or MgAl2O4) SMR: tube-wall 500-900 C (gas out 780-880 C), 20-40 bar; poisons S (< 0.1 ppm), As; coking if S/C low; sintering >~ 850-900 C; life 4-6 y.
- Pt-Rh gauze (Pt 90-95 %, Rh 5-10 %): 800-950 C [F2 above]; poisons: Fe, P, S, Cl dust; Pt volatilisation loss (recovered with Pd getter gauze), campaign 3-12 months; material cost dominated by metal price (Pt ~ USD 1,000-1,500/oz, Rh several thousand USD/oz, look up current).
- Yeast (S. cerevisiae): 28-35 C, pH 4-5.5; inhibited by ethanol > ~ 12-15 % v/v, killed > ~ 40-45 C (see section 6); contaminants Lactobacillus.

## 9. Arrhenius numbers (kinetics_arrhenius.py)
- H2O2 decomposition: Ea uncatalysed 75.3 kJ/mol (300 K), I- catalysed 56.5, catalase 8.4 [F2: LibreTexts 4.04 Ea and Catalysts; Carolina, MIT sources]; RSC student investigation reports 19 kJ/mol for catalase (so say "8-19"). Q10 at 300 K: 2.64, 2.06, 1.11 (8 kJ) / 1.28 (19 kJ).
- HI decomposition 2HI -> H2 + I2: Ea = 182 kJ/mol [F2 textbook problem]; (Bodenstein k, bimolecular, not obtained).
- N2O5 -> 2NO2 + 1/2 O2: Ea ~ 102-103 kJ/mol [F2], k(25 C) = 3.4-3.9e-5 s^-1 (A = 4.3e13 s^-1 [R] gives 3.87e-5 at 25 C, 1.5e-4 at 35 C, 5.3e-4 at 45 C). Your pair (1.7e-5, 3.38e-5) is inconsistent with Ea = 103: that ratio implies Ea ~ 52 kJ/mol; the often quoted 3.38e-5 is the 25 C value [R]. High-pressure N2O5 -> NO2 + NO3 fit k = 1.78e17 exp(-12540/T) s^-1 (262-307 K) [F2] is a different elementary step.
- Rate doubling per 10 C: for Ea = 50 kJ/mol ratio is 2.10 at 280 K, 1.91 at 300 K, 1.77 at 320 K, 1.61 at 350 K. Ea giving exactly 2.0 at 300-310 K is 53.6 kJ/mol. The rule is roughly right for 50-55 kJ/mol near room temperature and fails for catalase (1.1) and for high-T industrial reactions.

## UNVERIFIED list (not confirmed against a fetched source)
1. Ammonia: catalyst bulk density/voidage, Dyson-Simon eta polynomial, literature dH(T), fugacity coefficients; Nielsen 1964 parameters not obtained (only the Dyson-Simon constant set via a secondary paper).
2. SO2: Eklund constants only via arXiv secondary transcription (primary Eklund, Collina 1971, Froment-Bischoff example not seen); catalyst bulk 500 kg/m3; thermo Cp values; 600-630 C damage limit.
3. Methanol: Graaf 1988 not obtained; reaction enthalpies, Cp, bulk density, hw. Table 2 values ARE verified.
4. SMR: K1, K2 expressions and eta values; HTS power-law exponents/Ea/Hla citation; HTS k0 is calibrated.
5. Ostwald: NO selectivity vs T numbers, N2O formation rates, IUPAC k3 value; NO3 recommended expression beyond 600 K.
6. Fermentation: all table parameters except 112/115 g/L, 32-36 C, 78.5 kJ/mol; Luong alpha/beta; cardinal temperatures; maintenance; CTMI form; kd.
7. CSTR: R/G numbers are from Fogler data scraped from a lecture page, not the textbook itself; Cp(C) 45 vs 46 discrepancy; T2 temperatures; PO/methanol boiling points.
8. Catalyst section (section 8) entirely from memory including every price and lifetime.
9. N2O5 A-factor and 25 C k; HI and catalase values are secondary-source.
