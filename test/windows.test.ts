import { describe, expect, it } from "vitest";
import { CHAIN_PROFILES, defaultWindowInputs, recommendWindows } from "../src/index.js";
import type { WindowInputs } from "../src/index.js";

const l1 = CHAIN_PROFILES["ethereum-l1"];
const l2 = CHAIN_PROFILES["layer-2-rollup"];

describe("recommendWindows defaults", () => {
  it("pins the default numbers for the Ethereum profile", () => {
    // 3600 + 2400 + 2 * 30 + 30 + 14400 = 20490, rounded up to 12 s blocks.
    const w = recommendWindows({ profile: l1 });
    expect(w.t0Sec).toBe(20_496);
    // margin: 20 blocks * 12 s * 1.5 + 30 + 30 = 420. Claim window: 21600 + 30 + 30 + 420 = 22080.
    expect(w.claimSafetyMarginSec).toBe(420);
    expect(w.claimWindowSec).toBe(22_080);
    expect(w.t1Sec).toBe(42_576);
    expect(w.latestSafeClaimSec).toBe(42_156);
  });

  it("pins the default numbers for the layer 2 profile", () => {
    // margin: 30 blocks * 2 s * 1.5 + 30 + 30 = 150. T0 sum is 20490, already a whole number of 2 s blocks.
    const w = recommendWindows({ profile: l2 });
    expect(w.t0Sec).toBe(20_490);
    expect(w.claimSafetyMarginSec).toBe(150);
    expect(w.claimWindowSec).toBe(21_810);
    expect(w.t1Sec).toBe(42_300);
  });

  it("does not change the defaults when an override is passed", () => {
    const before = defaultWindowInputs(l1);
    recommendWindows({ profile: l1, clockSkewSec: 600 });
    expect(defaultWindowInputs(l1)).toEqual(before);
  });

  it("keeps the inputs it used, with overrides applied", () => {
    const w = recommendWindows({ profile: l2, clockSkewSec: 5 });
    expect(w.inputs.clockSkewSec).toBe(5);
    expect(w.inputs.detectionPollSec).toBe(l2.eventPollSec);
  });
});

describe("recommendWindows edge values", () => {
  it("accepts zero for the non-negative inputs and still returns valid windows", () => {
    const w = recommendWindows({
      profile: l1,
      counterpartyLockAllowanceSec: 0,
      detectionPollSec: 0,
      clockSkewSec: 0,
    });
    expect(w.report.valid).toBe(true);
    expect(w.t0Components.find((c) => c.name === "detectionLatency")?.seconds).toBe(0);
    expect(w.t0Components.find((c) => c.name === "clockSkew")?.seconds).toBe(0);
  });

  it("accepts a congestion factor of exactly 1", () => {
    const w = recommendWindows({ profile: l1, congestionFactor: 1, detectionPollSec: 0, clockSkewSec: 0 });
    // 20 blocks * 12 s, already block aligned.
    expect(w.claimSafetyMarginSec).toBe(240);
  });

  it("rejects each positive-only input at zero, negative and non-finite values", () => {
    const keys = ["moneroBlockTimeSec", "moneroBlockVarianceFactor", "requiredConfirmations", "moneroLockBlocks"] as const;
    for (const k of keys) {
      for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => recommendWindows({ profile: l1, [k]: bad } as Partial<WindowInputs> & Pick<WindowInputs, "profile">)).toThrow(RangeError);
      }
    }
  });

  it("rejects each non-negative input when negative or non-finite", () => {
    const keys = ["counterpartyLockAllowanceSec", "ethHolderOnlineMarginSec", "xmrHolderOnlineMarginSec", "detectionPollSec", "clockSkewSec"] as const;
    for (const k of keys) {
      for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => recommendWindows({ profile: l1, [k]: bad } as Partial<WindowInputs> & Pick<WindowInputs, "profile">)).toThrow(RangeError);
      }
    }
  });

  it("names the offending input in the error", () => {
    expect(() => recommendWindows({ profile: l1, clockSkewSec: -5 })).toThrow(/clockSkewSec/);
    expect(() => recommendWindows({ profile: l1, congestionFactor: 0.99 })).toThrow(/congestionFactor/);
  });
});

describe("recommendWindows monotonicity", () => {
  it("never shortens a window as congestion rises", () => {
    let prev = recommendWindows({ profile: l2, congestionFactor: 1 });
    for (const f of [1.5, 2, 3, 5, 10]) {
      const w = recommendWindows({ profile: l2, congestionFactor: f });
      expect(w.claimSafetyMarginSec).toBeGreaterThanOrEqual(prev.claimSafetyMarginSec);
      expect(w.claimWindowSec).toBeGreaterThanOrEqual(prev.claimWindowSec);
      expect(w.t0Sec).toBe(prev.t0Sec);
      prev = w;
    }
  });

  it("only the claim window grows when the XMR holder needs more online margin", () => {
    const a = recommendWindows({ profile: l1, xmrHolderOnlineMarginSec: 3600 });
    const b = recommendWindows({ profile: l1, xmrHolderOnlineMarginSec: 7200 });
    expect(b.t0Sec).toBe(a.t0Sec);
    expect(b.claimWindowSec).toBeGreaterThan(a.claimWindowSec);
  });

  it("only T0 grows when the ETH holder needs more online margin", () => {
    const a = recommendWindows({ profile: l1, ethHolderOnlineMarginSec: 3600 });
    const b = recommendWindows({ profile: l1, ethHolderOnlineMarginSec: 7200 });
    expect(b.t0Sec).toBeGreaterThan(a.t0Sec);
    expect(b.claimWindowSec).toBe(a.claimWindowSec);
  });

  it("more Monero confirmations raise T0 but not the margin", () => {
    const a = recommendWindows({ profile: l1, requiredConfirmations: 10 });
    const b = recommendWindows({ profile: l1, requiredConfirmations: 20 });
    expect(b.t0Sec).toBeGreaterThan(a.t0Sec);
    expect(b.claimSafetyMarginSec).toBe(a.claimSafetyMarginSec);
  });
});
