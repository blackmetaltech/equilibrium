# EQUILIBRIUM economics research (compiled 2026-11-09)

Tags: FETCHED = read in a downloaded/fetched document; FETCHED-2 = read in a third-party implementation of the source (not the book itself); SNIP = search-result summary only; UNVERIFIED = memory/derived.
Scripts: costs_turton.py (equipment), costs_utilities.py (Ulrich + steam-from-fuel). Both run with `python3 -I`.
Important: I could NOT access the Turton book or CAPCOST. K1-K3 and ranges are from OpenPyTEA `cost_correlations.csv` (Turton Table A.1 transcription, "Turton et al. (2018) Table A.1", base 2001); C1-C3, B1/B2, F_M, F_BM from the eqcost repo `catalog.toml` (Go tool implementing Turton, CEPCI base 397). Cross-checked partially against Scribd student copies (floating-head 4.8306/-0.8509/0.3187, B 1.63/1.66; fired heater 7.3488/-1.1666/0.2028) via search snippets.

## A1. CEPCI
| Year | CEPCI | Tag | Source |
|---|---|---|---|
| 2001 | 397 | FETCHED-2 | eqcost catalog.toml; Turton basis |
| 2019 | 607.5 | FETCHED | Chem. Eng. Sept 2024 Economic Indicators PDF (chemengonline.com/wp-content/uploads/2024/08/19_CHE_0924_EconInd_p45.pdf) |
| 2022 | 816.0 | FETCHED | same |
| 2023 | 797.9 | FETCHED | same |
| 2024 | ~797 (annual avg NOT found) | UNVERIFIED | CHE says 2023 and 2024 both fell; May'24 final 800.2, Jun'24 prelim 798.8 (FETCHED, same PDF). eqcost uses 800.0. Treat as 797 +/-3 |
| 2025 | ~810 (=2024 x 1.016) | UNVERIFIED | CHE headline "2025 annual average edged 1.6% higher than 2024" (FETCHED page text, no absolute value; behind login) |

## A2. Turton equipment correlations (Cp0 in 2001 USD; log10 Cp0 = K1 + K2 log10 A + K3 (log10 A)^2)
Pressure: log10 Fp = C1 + C2 log10 P + C3 (log10 P)^2 (P barg). C_BM = Cp0 (B1 + B2 F_M F_P) or direct C_BM = Cp0 F_BM (Fp).
| Equipment (A, units) | K1 | K2 | K3 | A range | C1,C2,C3 (P range barg) | B1,B2 or F_BM | F_M CS / SS / Ni | Tag |
|---|---|---|---|---|---|---|---|---|
| Centrifugal/axial/recip compressor (fluid power kW) | 2.2897 | 1.3604 | -0.1027 | 450-3000 | none (Fp=1) | F_BM direct 2.7 / 5.8 / 11.5 | (those F_BM) | K: FETCHED-2; F_BM: FETCHED-2 (eqcost) |
| Electric drive, open/drip-proof (shaft kW) | 2.9508 | 1.0688 | -0.1315 | 75-2600 | - | F_BM 1.5 | - | K FETCHED-2; F_BM UNVERIFIED |
| Centrifugal pump (shaft kW) | 3.3892 | 0.0536 | 0.1538 | 1-300 | -0.3935, 0.3957, -0.00226 (10-100; Fp=1 below 10) | 1.89, 1.35 | 1.6 / 2.3 / 4.4 (cast iron 1.0) | FETCHED-2 |
| S&T floating head (area m2) | 4.8306 | -0.8509 | 0.3187 | 10-1000 | 0.03881, -0.11272, 0.08183 (5-140) | 1.63, 1.66 | 1.0 / 2.73 / 3.73 (Ti 11.4) | FETCHED-2 (+SNIP Scribd) |
| S&T fixed tube sheet | 4.3247 | -0.3030 | 0.1634 | 10-1000 | same as above | 1.63, 1.66 | same | FETCHED-2 |
| Fired heater, non-reactive (duty kW) | 7.3488 | -1.1666 | 0.2028 | 1000-100000 | 0.1347, -0.2368, 0.1021 (10-200) | F_BM 2.13 CS / 2.51 Cr-Mo / 2.81 SS (direct, x Fp) | tube alloy via F_BM | FETCHED-2 |
| Reformer furnace (duty kW) | 3.0680 | 0.6597 | 0.0194 | 3000-100000 | not obtained | not obtained | - | K FETCHED-2 |
| Vertical process vessel (volume m3) | 3.4974 | 0.4485 | 0.1074 | 0.3-520 | wall-thickness form: Fp=((P+1)D/(2(850-0.6(P+1)))+0.00315)/0.0063, min 1 | 2.25, 1.82 | 1.0 / 3.10 / 5.40 (Ti 7.70) | K,B,F_M FETCHED-2; Fp formula UNVERIFIED (memory) |
| Sieve trays (area m2, per tray) | 2.9949 | 0.4465 | 0.3961 | 0.07-12.3 | - | F_BM ~1.0 CS x quantity factor F_q | - | K FETCHED-2; F_BM/F_q per eqcost comment, UNVERIFIED |
| Loose packing (volume m3) | 2.4493 | 0.9744 | 0.0055 | 0.03-628 | - | F_BM not obtained (memory ~3.2 UNVERIFIED) | - | K FETCHED-2 |
| Jacketed agitated reactor (volume m3) | 4.1052 | 0.5320 | -0.0005 | 0.1-35 | not obtained | not obtained (vessel-type B1/B2 likely) | - | K FETCHED-2 |
| Fermenter (volume m3) | 4.1052 | 0.5320 | -0.0005 | 0.1-35 | same row as jacketed agitated in CSV | not obtained | - | K FETCHED-2 |
| Steam boiler (duty kW) | 6.9617 | -1.4800 | 0.3161 | 1200-9400 | not obtained | not obtained | - | K FETCHED-2 |
| Axial gas turbine (fluid kW) | 2.7051 | 1.4398 | -0.1776 | 100-4000 | - | not obtained | - | K FETCHED-2 |
| Radial gas/liquid expander (fluid kW) | 2.2476 | 1.4965 | -0.1618 | 100-1500 | - | not obtained | - | K FETCHED-2 |
| Steam turbine (shaft kW) | 2.6259 | 1.4398 | -0.1776 | 70-7500 | - | not obtained | - | K FETCHED-2 |
| Large "gas turbine" (shaft kW) | -21.7702 | 13.2175 | -1.5279 | 7500-23000 | - | - | - | K FETCHED-2 |
| Cooling tower | NOT in Turton Table A.1 (not found). Alternative: Towler & Sinnott 2010 "cooling tower & pumps" C = 170000 + 1500 Q^0.9 (USD 2010, Q in L/s, 100-10000) | | | | | | | FETCHED-2 (OpenPyTEA CSV) |
| Package boiler | Towler 2010: packaged 15-40 bar C = 124000 + 10 S (S kg/h, 5000-200000); field-erected 10-70 bar 130000 + 53 S^0.9 (20000-800000) (USD 2010) | | | | | | | FETCHED-2 |
Gap: boiler/turbine/expander/reactor/packing bare-module factors and pressure factors were not obtainable; get them from the book/CAPCOST before using.

### Worked examples (costs_turton.py; 2024 factor 797/397 = 2.008, UNVERIFIED CEPCI)
| Case | Cp0 (2001) | Fp | C_BM (2001) | C_BM 2024 USD |
|---|---|---|---|---|
| 1 MW CS centrifugal compressor (A = 1000 kW fluid), F_BM 2.7 | $279.6k | 1 | $755k | ~$1.52 M (+ 1 MW open motor ~$0.28 M => ~$1.80 M) |
| 100 m2 floating-head CS HX, 10 barg | $25.3k | 1.018 | $84.1k | ~$169k (purchased only ~$51k) |
| Vertical CS vessel 3 m dia x 15 m (V = 106 m3), 20 barg | $70.2k | 6.47 (formula UNVERIFIED) | $985k | ~$1.98 M (Fp dominates: thin-wall assumption min t = 6.3 mm is exceeded) |
Caution: vessel Fp uses my remembered formula; the value 6.47 is physically plausible (wall ~41 mm) but verify.

## A3. Ulrich & Vasudevan (2006), Chem. Eng. April 2006, p.66-69 (FETCHED: PDF at grace.umd.edu/~nsw/chbe446/HowToEstimateUtilityCosts-UlrichVasudevan2006.pdf)
C_S,u = a (CEPCI) + b (C_S,f). C_S,f = fuel price in $/GJ (HHV; for electricity-driven utilities the fuel price at the power station, for steam the boiler fuel). Worked example in paper uses CEPCI ~470 (year 2000), fuel $4.50/GJ. Coefficients (process module / grass-roots):
| Utility (unit; validity) | a | b |
|---|---|---|
| Electricity $/kWh purchased | 1.3e-4 | 0.010 |
| Electricity onsite, module / grass-roots | 1.4e-4 / 1.1e-4 | 0.011 / 0.011 |
| Process steam $/kg (1<p<46 barg; 0.06<ms<40 kg/s) | 2.7e-5 ms^-0.9 / 2.3e-5 ms^-0.9 | 0.0034 p^0.05 |
| Cooling water $/m3 (0.01<q<10 m3/s) | 0.0001+3.0e-5/q / 0.00007+2.5e-5/q | 0.003 |
| Demineralised water $/m3 | 0.007+2.5e-4 q^-0.6 / 0.005+2.0e-4 q^-0.6 | 0.04 |
| Refrigerant $/kJ cooling (1<Qc<1000 kJ/s; T in K) | 0.6 Qc^-0.9 T^-3 / 0.5 Qc^-0.9 T^-3 (text extraction shows "(T-3)"; interpreted as T^-3 by sanity check) | 1.1e6 T^-5 |
| Compressed air $/Nm3 | 5.0e-5 q^-0.30 ln p / 4.5e-5 ... | 9.0e-4 ln p |
Observation: with CEPCI 797 and 2024 fuel prices, formula yields electricity $0.125/kWh at Henry Hub gas (real US industrial 8.13 c/kWh) and cooling water ~$1.5/GJ(10 K) - i.e. it over-predicts when CEPCI is scaled to 2024, because the "a" term was fitted to a 2000 cost structure and coal/oil fuel. Use ratios or recalibrate; do not treat as absolute 2024 prices.

## B. Utility prices
| Item | Value | Tag | Source |
|---|---|---|---|
| US industrial electricity 2024 | 8.13 c/kWh (Dec 2025 8.53 c/kWh) | SNIP | EIA Electric Power Monthly / avg retail price table (eia.gov/electricity) |
| Germany industrial electricity 2024 | 16.77 ct/kWh (no relief); 10.47 ct/kWh (with reductions) | SNIP | SMARD (smard.de) |
| EU average industry electricity | NOT FOUND (Eurostat) | - | - |
| India HT industrial tariff | NOT FOUND; memory ~Rs 6-8/kWh | UNVERIFIED | - |
| Henry Hub 2024 / 2025 avg | $2.21 / $3.52 per MMBtu | SNIP | EIA Today in Energy id=61223; hydrocarbonengineering.com Jan 2026 (LSEG/EIA) |
| TTF 2024 avg | ~EUR 33.9/MWh (my average of 12 monthly values; Dec-24 44.76) | SNIP | luce-gas.it monthly table |
| TTF 2025 | Jan 48.2, Feb 51.2, Mar 42.1, Apr 35.4 EUR/MWh; mid-Dec 2025 ~27.8; full-year avg NOT found (my guess ~EUR 35-40) | SNIP | luce-gas.it; serbia-energy.eu |
| India APM price | Apr-25 $7.26; Jun-25 $6.41; Jul-25 $6.89 (capped $6.75); ceilings: ONGC/OIL nomination fields $7/MMBtu (later raised to), difficult-area ceiling $10.04 (Apr-Sep 25), $9.72 (Oct 25-Mar 26); Apr-26 formula $10.76 GCV | SNIP | PPAC via FIPI Policy Economic Report pages; freepressjournal/deccanherald |
| India LNG landed | NOT FOUND (Apr 2026 spot reported "below $16"); memory 2024-25 Dahej ~$10-13/MMBtu | SNIP / UNVERIFIED | RealClearEnergy/pulse.bot |
| LP/MP/HP steam $/t from fuel | fuel-only at 90% boiler efficiency, BFW 105 C, net 2.31/2.34/2.36 GJ/t: at HH 2024 ($2.09/GJ) $5.4/5.4/5.5; HH 2025 ($3.34/GJ) $8.6/8.7/8.8; TTF 2024 (~$10.2/GJ) $26/27/27; India APM ($6.6/GJ) $17/17/17. Add ~$1-3/t water treatment, capex | UNVERIFIED (derived; steam-table enthalpies from memory) | costs_utilities.py |
| Cooling water $/GJ | Ulrich formula gives $1.5-2.1/GJ (see A3 caveat). Turton Table 8.3 (memory) ~0.35-0.4 $/GJ, LP/MP/HP steam ~13-18 $/GJ, electricity ~17 $/GJ (2001-ish) | UNVERIFIED | - |
| Refrigeration (-5 C, grass-roots, Ulrich, 1 MW) | $1.7-8.2/GJ cooling depending on fuel | UNVERIFIED (derived) | costs_utilities.py |
| Process water, nitrogen | NOT FOUND | - | - |
| EU ETS avg 2024 | ~EUR 66.5-67/t | SNIP | marketnews.com / mnimarkets.com (BNEF) |
| EU ETS avg 2025 | ~EUR 74/t (front-Dec ICE EUA EUR 74.40; ESMA "+13% vs 2024, EUR 74") | SNIP | LSEG; lovguiden.dk quoting ESMA |
| India CCTS | Intensity-based (not cap). Targets notified 8 Oct 2025 for aluminium, cement, chlor-alkali, pulp & paper (282 plants); a later notification (Jan 2026) added refinery, petrochemicals, textiles, secondary aluminium (+208 entities). Ammonia/urea/fertiliser not seen in notified lists. Trading start date not found. | SNIP | icapcarbonaction.com; downtoearth.org.in; theprint.in |

## C. Feedstock / product prices
| Item | Value | Tag | Source |
|---|---|---|---|
| Ammonia FOB Middle East | Dec-24 avg $370; Jan-25 $331; Feb-25 $315; early Aug-25 $300-330; Nov-25 $480; Dec-25 $525-532 | SNIP | Argus Ammonia pdf; Intratec; S&P Platts |
| Urea granular FOB ME | 2024 avg $338/t; Jul-25 +~10% m/m (level not found) | SNIP | Vietcap report; alchempro |
| Sulfur | Qatar QSP rose +$234/t (+141%) Jan->Nov 2025 (=> ~$166 -> ~$400/t, derived); Argus "May QSP $740/t, record" appears to be 2026 (Hormuz context) - date ambiguous | SNIP | worldfertilizer.com 31 Oct 2025; argusmedia; metal.com |
| Sulfuric acid | NOT FOUND | - | - |
| Methanol (Methanex posted) | Feb-25 APAC $420, China $400; Aug-25 APAC $370, China $350; Nov/Dec-25 ~$360/$340 (secondary); Q4-25 realised $331/t; China domestic ~RMB 2,042/t late Nov 2025; China import Sep-25 $271/t | SNIP | methanex.com price sheets (search text; direct fetch 404); SunSirs; Methanex Q4-25 |
| Fuel ethanol (OMC, ESY Nov 2024-Oct 2025) | C-heavy Rs 57.97/L (from 56.58); B-heavy Rs 60.73; cane juice/sugar/syrup Rs 65.61; damaged grain Rs 64.00; FCI rice conflicting (Rs 58.50 vs 71.86 - the 71.86 is likely maize, UNVERIFIED); FCI rice reserve price Rs 2,250/quintal | SNIP (some conflict) | angelone.in; deccanherald.com; theweek.in (PTI 29 Jan 2025); direct fetch 403 |
| US/Brazil fuel ethanol | NOT FOUND | - | - |
| Nitric acid | NOT FOUND | - | - |
| Ammonium nitrate / CAN | AN Europe $540/t (Nov-25), Q4-25 avg ~$485; CAN27 cif Germany EUR 295-317/t (Dec-24) | SNIP | Intratec; Argus (2024 items); IMARC |
| Hydrogen | Grey (SMR) ~$1.0-2.5/kg (IEA 0.5-1.7 gas-price-dependent); green gap vs grey >= $3/kg (IEA GHR 2025) => green ~$4-6/kg; electrolyser $600-1200/kW China vs $2000-2600/kW elsewhere | SNIP | MDPI/IEA via search; hydrogen-central / Recharge coverage of IEA GHR 2025 |
| Caustic soda | US $379/t (Q4-25), $518 (Jun-25); India $475-540 (Q3-25); Japan $467 | SNIP (low-quality aggregators) | IMARC; Intratec; price-watch.ai |
| Chlorine | ~$0.43/kg global Q1-25; N. America $0.62-0.65/kg | SNIP (low quality) | Expert Market Research |
| Molasses, industrial O2, food-grade CO2 | NOT FOUND | - | - |

## D. Benchmarks
| Item | Value | Tag | Source |
|---|---|---|---|
| NH3 BAT, natural gas SMR | 28 GJ/t NH3 and 1.6 t CO2/t NH3 | FETCHED | IFA, "Energy efficiency and CO2 emissions in ammonia production", Dec 2009 (fertilizer.org/wp-content/uploads/2023/01/2009_IFA_energy_efficiency.pdf), table from Prince 2007 |
| NH3 other routes (BAT) | naphtha 35 GJ/2.5 t; heavy fuel oil POX 38/3.0; coal POX 42/3.8 | FETCHED | same; text: coal plants emit ~2.4x CO2 of gas plants |
| NH3 survey 2008 (93 plants) | avg 36.6 GJ/t (27.0-58.2); top quartile 28-33; new-plant optimum 28-29; BPT top-decile gas 32 GJ/t | FETCHED | same |
| NH3 thermodynamic limit | ~20 GJ/t (chart label) | FETCHED | same chart; LHV basis not stated |
| H2SO4 SO2 limit | US NSPS: 2 kg SO2/t 100% acid (= ~99.7% conversion) | SNIP | US EPA AP-42 s8.10 (epa.gov) |
| H2SO4 India CPCB | SO2 2.5 (existing) / 2.0 (new) kg/t for <=300 tpd; 2.0 / 1.5 kg/t for >300 tpd (third-party transcription; another report says 3, 2, 1 kg/t) | SNIP | corpseed.com; verify against gazette |
| H2SO4 EU BAT | NOT VERIFIED (memory: DCDA conversion 99.7-99.9%, ~1-2 kg SO2/t) | UNVERIFIED | LVIC-AAF BREF |
| DCDA conversion | ~99.7% for 2 kg/t (EPA) | SNIP | AP-42 |
| Sulfur-burning acid steam | conventional 1.0-1.2 t steam/t acid; with LT heat recovery 1.7-1.8 t/t; HRS-type plants need >=12% SO2 | SNIP | e3s-conferences.org 2020 icaeer01001; Monsanto/fertilizer.org 2002_tech_shukla |
| Methanol energy | ~31-36 GJ/t (31-34 MMBtu/t HHV; one model 35.8 GJ/t net; LCA 30.4 GJ/t); CO2 ~1.0-1.4 t/t; best-in-class 0.9-1.0 | SNIP | RSC Sust. Energy & Fuels 2025 d5se00165j; hyco1.com; patents |
| HNO3 N2O unabated | IPCC 2006 defaults 5-9 kg/t (rising with pressure); CDM measured mean 8.7 (3.5-20); typical EU 1998 ~6 | SNIP | GHG Protocol N2O nitric guide; UNFCCC CDM; EFMA |
| HNO3 N2O abated | tertiary abatement >95% (KBR); EU BAT-AEL 0.12-0.45 kg/t (old BREF 1.85-2.5) | SNIP | kbr.com; EU taxonomy 3.16 summary |
| GWP100 N2O (AR6) | 273 | UNVERIFIED (memory of AR6 WG1 Table 7.15) | IPCC AR6 |
| Ethanol distillation steam | 2.3 kg/L (60 KLPD MPR), 1.7 kg/L (modern 100 KLPD evaporative); 350 KLPD table: B-heavy 2.25, C-heavy 2.80 kg/L. MJ/L ~ kg/L x ~2.2-2.6 MJ/kg = ~4-7 MJ/L (derived) | SNIP / UNVERIFIED | Praj case study (scribd); mpcb/EIA documents |
| Typical capacities (t/d) | NH3: 1000-3300 new world-scale (UNVERIFIED); H2SO4 sulfur-burning 2000-2700 MTPD cited in examples (SNIP: fertilizer.org Shukla; patent), Indian units commonly 300-1500 (UNVERIFIED); methanol 2200 t/d SMR to 5000-5700 t/d mega (SNIP); HNO3 300-1500 (UNVERIFIED); ethanol India 30-100 KLPD typical molasses, up to 350 (SNIP: MPCB EIA summaries) | mixed | as stated |

## Open items for a follow-up
Turton Tables A.2/A.4/A.6 first-hand (boiler, turbine, packing, reactor factors); CEPCI 2024/2025 absolute annual values; India electricity tariff and LNG landed; sulfuric acid, nitric acid, molasses, O2, CO2 prices; EU BAT-AEL SO2 for H2SO4; IPCC AR6 N2O GWP page check.
