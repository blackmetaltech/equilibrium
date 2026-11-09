// SI <-> display unit conversions (DESIGN §3.1, §8.2). Everything inside src/sim is SI (mol/s, K, Pa, J, W, kg, s); the UI shows
// kmol/h, degC, bar, MW, t/h, t/d, GJ/t. Pure functions, no state. Each pair is an exact inverse up to float rounding (property P22).
// Constants: 1 atm = 101325 Pa (exact, CGPM 1954); 1 Btu(IT) = 1055.05585262 J (exact by definition), so 1 MMBtu = 1.05505585262 GJ.

export const ATM_PA = 101325;
export const ZERO_C_K = 273.15;
const BTU_IT_J = 1055.05585262;

// --- molar flow: kmol/h <-> mol/s
export const kmolhToMolS = (x: number): number => (x * 1000) / 3600;
export const molSToKmolh = (x: number): number => (x * 3600) / 1000;

// --- temperature: degC <-> K
export const cToK = (c: number): number => c + ZERO_C_K;
export const kToC = (k: number): number => k - ZERO_C_K;

// --- pressure: bar, atm, bar(g) <-> Pa
export const barToPa = (x: number): number => x * 1e5;
export const paToBar = (x: number): number => x / 1e5;
export const atmToPa = (x: number): number => x * ATM_PA;
export const paToAtm = (x: number): number => x / ATM_PA;
export const bargToPa = (g: number): number => g * 1e5 + ATM_PA;
export const paToBarg = (p: number): number => (p - ATM_PA) / 1e5;

// --- power and energy
export const wToKw = (x: number): number => x / 1e3;
export const kwToW = (x: number): number => x * 1e3;
export const wToMw = (x: number): number => x / 1e6;
export const mwToW = (x: number): number => x * 1e6;
export const gjToJ = (x: number): number => x * 1e9;
export const jToGj = (x: number): number => x / 1e9;
export const kjpmolToJpmol = (x: number): number => x * 1e3;
export const jpmolToKjpmol = (x: number): number => x / 1e3;
export const mmbtuToGj = (x: number): number => (x * 1e6 * BTU_IT_J) / 1e9;
export const gjToMmbtu = (x: number): number => (x * 1e9) / (1e6 * BTU_IT_J);
/** A price per MMBtu as a price per GJ: one GJ is 0.948 MMBtu, so the price per GJ is a little lower. */
export const perMmbtuToPerGj = (p: number): number => p / mmbtuToGj(1);
export const perGjToPerMmbtu = (p: number): number => p * mmbtuToGj(1);

// --- mass flow: t/h, t/d <-> kg/s
export const tphToKgS = (x: number): number => (x * 1000) / 3600;
export const kgSToTph = (x: number): number => (x * 3600) / 1000;
export const tpdToKgS = (x: number): number => (x * 1000) / 86400;
export const kgSToTpd = (x: number): number => (x * 86400) / 1000;

// --- specific energy: GJ/t <-> J/kg (1 GJ / 1000 kg = 1e6 J/kg)
export const gjptToJpkg = (x: number): number => x * 1e6;
export const jpkgToGjpt = (x: number): number => x / 1e6;

// --- composition: mol% <-> fraction
export const molPctToFrac = (x: number): number => x / 100;
export const fracToMolPct = (x: number): number => x * 100;

/** Every display unit pair with a plausible display range (used by the P22 fuzz and by the UI's unit toggles). */
export interface DisplayPair { toSI: (x: number) => number; fromSI: (x: number) => number; range: [number, number] }
export const DISPLAY_PAIRS: Record<string, DisplayPair> = {
  'kmol/h': { toSI: kmolhToMolS, fromSI: molSToKmolh, range: [0, 5e4] },
  degC: { toSI: cToK, fromSI: kToC, range: [-200, 1500] },
  bar: { toSI: barToPa, fromSI: paToBar, range: [0, 400] },
  atm: { toSI: atmToPa, fromSI: paToAtm, range: [0, 400] },
  'bar(g)': { toSI: bargToPa, fromSI: paToBarg, range: [-1, 400] },
  kW: { toSI: kwToW, fromSI: wToKw, range: [0, 1e5] },
  MW: { toSI: mwToW, fromSI: wToMw, range: [0, 500] },
  GJ: { toSI: gjToJ, fromSI: jToGj, range: [0, 1e4] },
  'kJ/mol': { toSI: kjpmolToJpmol, fromSI: jpmolToKjpmol, range: [-2000, 2000] },
  MMBtu: { toSI: (x) => mmbtuToGj(x) * 1e9, fromSI: (j) => gjToMmbtu(j / 1e9), range: [0, 1e5] },
  't/h': { toSI: tphToKgS, fromSI: kgSToTph, range: [0, 2000] },
  't/d': { toSI: tpdToKgS, fromSI: kgSToTpd, range: [0, 5000] },
  'GJ/t': { toSI: gjptToJpkg, fromSI: jpkgToGjpt, range: [0, 100] },
  'mol%': { toSI: molPctToFrac, fromSI: fracToMolPct, range: [0, 100] },
};
