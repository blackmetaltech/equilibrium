"""Ulrich & Vasudevan (2006) Chem. Eng. April p.66: C_S,u = a*CEPCI + b*C_S,f ; C_S,f in $/GJ (HHV). Table 1 coefficients (FETCHED).
Steam from fuel: approximate sat-steam enthalpies (standard steam tables, rounded), BFW 105C h=440 kJ/kg."""
CEPCI=797.0
def elec(cf,kind='purchased'):
    a,b={'purchased':(1.3e-4,0.010),'module':(1.4e-4,0.011),'grass':(1.1e-4,0.011)}[kind]; return a*CEPCI+b*cf   # $/kWh
def cw(cf,q=10.0,grass=True):
    a=(0.00007+2.5e-5/q) if grass else (0.0001+3.0e-5/q); return a*CEPCI+0.003*cf   # $/m3
def steam_ulrich(cf,ms=40.0,p=10.0,grass=True):
    a=(2.3e-5 if grass else 2.7e-5)*ms**-0.9; return (a*CEPCI+0.0034*p**0.05*cf)*1000  # $/t
# NOTE: PDF text extraction shows '(T-3)' = T^-3 (superscript lost); result sanity-checked
def refrig(cf,Qc=1000.0,T=268.0,grass=True):
    a=(0.5 if grass else 0.6)*Qc**-0.9*T**-3; return a*CEPCI+1.1e6*T**-5*cf   # $/kJ
def steam_fuel(cf,hg,eff=0.90,h_bfw=440.0): return cf*(hg-h_bfw)/1e6/eff*1000  # $/t fuel-only
if __name__=='__main__':
    for name,cf in [('US HH 2024 ($2.21/MMBtu=2.09/GJ)',2.09),('US HH 2025 ($3.52=3.34/GJ)',3.34),('TTF 2024 (~EUR34/MWh=~$10.2/GJ @1.08)',10.2),('India APM ~$7/MMBtu=6.6/GJ',6.6)]:
        print(f'--- fuel {name}')
        print(f'  Ulrich elec purchased ${elec(cf):.3f}/kWh | CW grass q=10 ${cw(cf):.4f}/m3 = ${cw(cf)/41.9e-3:.2f}/GJ(dT=10K) | 40 bar-ish steam(p=10,ms=40) ${steam_ulrich(cf):.1f}/t | refrig -5C ${refrig(cf)*1e6:.1f}/GJ')
        for lab,hg in [('LP 4 barg',2748),('MP 10 barg',2781),('HP 40 barg',2800)]:
            print(f'  fuel-only {lab}: ${steam_fuel(cf,hg):.1f}/t  ({(hg-440)/1000:.2f} GJ/t net)')
