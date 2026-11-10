// Case budget of the property tests under src/props: FUZZ_N env, default 10 000 (CI default; nightly sets FUZZ_N=1000000).
// Test tooling, not rule code.
const raw = typeof process !== 'undefined' ? process.env.FUZZ_N : undefined;
const parsed = raw === undefined ? NaN : Number(raw);
export const FUZZ_N: number = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10000;
/** A per-test timeout that scales with the case budget (ms). */
export const fuzzTimeout = (msPerCase: number): number => Math.max(60000, Math.ceil(FUZZ_N * msPerCase * 3));
