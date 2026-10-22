import { describe, expect, it } from "vitest";
import {
  CHAIN_PROFILES, checkFixedLimit, getChainProfile, recommendForProfile, recommendGasLimit, recommendWindows,
  sweepDataPosting, defaultWindowInputs, validateTimelocks,
} from "../src/index.js";

describe("profiles", () => {
  it("are plain data and labelled illustrative", () => {
    expect(Object.keys(CHAIN_PROFILES)).toEqual(["ethereum-l1", "layer-2-rollup"]);
    for (const p of Object.values(CHAIN_PROFILES)) expect(p.note).toContain("Illustrative");
    expect(getChainProfile("ethereum-l1").dataFeeCountsAgainstGasLimit).toBe(false);
    expect(getChainProfile("layer-2-rollup").dataFeeCountsAgainstGasLimit).toBe(true);
  });
});

describe("recommendGasLimit", () => {
  it("is (execution + data) times the multiplier, rounded up", () => {
    const r = recommendGasLimit({ executionGas: 100_000, dataPostingGas: 50_000, safetyMultiplier: 1.25 });
    expect(r.baseGas).toBe(150_000);
    expect(r.recommendedGasLimit).toBe(187_500);
    expect(r.headroomGas).toBe(37_500);
    expect(recommendGasLimit({ executionGas: 3, dataPostingGas: 0, safetyMultiplier: 1.1 }).recommendedGasLimit).toBe(4);
  });
  it("validates inputs", () => {
    expect(() => recommendGasLimit({ executionGas: 0, dataPostingGas: 0, safetyMultiplier: 1 })).toThrow(RangeError);
    expect(() => recommendGasLimit({ executionGas: 1, dataPostingGas: -1, safetyMultiplier: 1 })).toThrow(RangeError);
    expect(() => recommendGasLimit({ executionGas: 1, dataPostingGas: 0, safetyMultiplier: 0.9 })).toThrow(RangeError);
    expect(() => recommendGasLimit({ executionGas: Number.NaN, dataPostingGas: 0, safetyMultiplier: 1 })).toThrow(RangeError);
  });
  it("ignores the data component on a profile that does not charge it in gas", () => {
    const l1 = recommendForProfile(CHAIN_PROFILES["ethereum-l1"], 100_000, 1.2, 999_999);
    expect(l1.input.dataPostingGas).toBe(0);
    const l2 = recommendForProfile(CHAIN_PROFILES["layer-2-rollup"], 100_000, 1.2);
    expect(l2.input.dataPostingGas).toBe(CHAIN_PROFILES["layer-2-rollup"].dataPostingGasHigh);
    expect(l2.recommendedGasLimit).toBeGreaterThan(l1.recommendedGasLimit);
  });
});

describe("fixed limits", () => {
  it("pass while the data component is small and fail once it grows", () => {
    const ok = checkFixedLimit(150_000, 100_000, 40_000);
    expect(ok.ok).toBe(true);
    expect(ok.failsAboveDataPostingGas).toBe(50_000);
    const bad = checkFixedLimit(150_000, 100_000, 60_000);
    expect(bad.ok).toBe(false);
    expect(bad.shortfallGas).toBe(10_000);
  });
  it("fails at once when execution alone exceeds the limit", () => {
    const c = checkFixedLimit(50_000, 100_000, 0);
    expect(c.ok).toBe(false);
    expect(c.failsAboveDataPostingGas).toBe(0);
  });
  it("sweep shows the fixed limit failing while the recommendation keeps covering", () => {
    const rows = sweepDataPosting(150_000, 100_000, 1.2, [0, 20_000, 50_000, 50_001, 400_000]);
    expect(rows.map((r) => r.fixedLimitOk)).toEqual([true, true, true, false, false]);
    for (const r of rows) expect(r.recommendedGasLimit).toBeGreaterThanOrEqual(100_000 + r.dataPostingGas);
  });
  it("validates inputs", () => {
    expect(() => checkFixedLimit(0, 1, 0)).toThrow(RangeError);
  });
});

describe("recommendWindows", () => {
  const l1 = CHAIN_PROFILES["ethereum-l1"];
  const l2 = CHAIN_PROFILES["layer-2-rollup"];

  it("T0 and T1 are whole blocks and the components add up", () => {
    const w = recommendWindows({ profile: l1 });
    expect(w.t0Sec % l1.blockTimeSec).toBe(0);
    expect(w.t1Sec % l1.blockTimeSec).toBe(0);
    const t0Sum = w.t0Components.reduce((a, c) => a + c.seconds, 0);
    expect(w.t0Sec).toBeGreaterThanOrEqual(t0Sum);
    expect(w.t0Sec - t0Sum).toBeLessThan(l1.blockTimeSec);
    expect(w.t1Sec).toBe(w.t0Sec + w.claimWindowSec);
    expect(w.latestSafeClaimSec).toBe(w.t1Sec - w.claimSafetyMarginSec);
  });

  it("includes the Monero confirmation wait with variance", () => {
    const w = recommendWindows({ profile: l1, requiredConfirmations: 20, moneroBlockVarianceFactor: 3 });
    expect(w.t0Components.find((c) => c.name === "confirmationWait")?.seconds).toBe(20 * 120 * 3);
  });

  it("a slower poll lengthens both windows", () => {
    const a = recommendWindows({ profile: l1, detectionPollSec: 30 });
    const b = recommendWindows({ profile: l1, detectionPollSec: 90 });
    expect(b.t0Sec).toBeGreaterThan(a.t0Sec);
    expect(b.claimWindowSec).toBeGreaterThan(a.claimWindowSec);
    expect(a.t0Components.find((c) => c.name === "detectionLatency")?.seconds).toBe(60);
  });

  it("clock skew lengthens both windows", () => {
    const a = recommendWindows({ profile: l1, clockSkewSec: 0 });
    const b = recommendWindows({ profile: l1, clockSkewSec: 120 });
    expect(b.t0Sec).toBeGreaterThan(a.t0Sec);
    expect(b.claimWindowSec).toBeGreaterThan(a.claimWindowSec);
  });

  it("the claim window always covers the safety margin plus the online margin", () => {
    for (const p of [l1, l2]) {
      const w = recommendWindows({ profile: p });
      expect(w.claimWindowSec).toBeGreaterThan(w.claimSafetyMarginSec + w.inputs.xmrHolderOnlineMarginSec);
    }
  });

  it("recommended windows pass the existing constraint checks", () => {
    for (const p of [l1, l2]) expect(recommendWindows({ profile: p }).report.valid).toBe(true);
  });

  it("does not hide a window that is too short", () => {
    const w = recommendWindows({ profile: l1 });
    expect(validateTimelocks(w.t0Sec / 10, w.t1Sec / 10).valid).toBe(false);
  });

  it("the profile changes the block alignment and margin", () => {
    const a = recommendWindows({ profile: l1 });
    const b = recommendWindows({ profile: l2 });
    expect(b.t0Sec % l2.blockTimeSec).toBe(0);
    expect(a.claimSafetyMarginSec).not.toBe(b.claimSafetyMarginSec);
  });

  it("defaults come from the profile", () => {
    expect(defaultWindowInputs(l2).detectionPollSec).toBe(l2.eventPollSec);
  });

  it("validates inputs", () => {
    expect(() => recommendWindows({ profile: l1, moneroBlockTimeSec: 0 })).toThrow(RangeError);
    expect(() => recommendWindows({ profile: l1, clockSkewSec: -1 })).toThrow(RangeError);
    expect(() => recommendWindows({ profile: l1, congestionFactor: 0.5 })).toThrow(RangeError);
  });
});
