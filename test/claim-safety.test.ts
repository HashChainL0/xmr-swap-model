import { describe, expect, it } from "vitest";
import {
  classifyClaim, createSwap, formatTrace, latestSafeClaimTime, recommendClaimSafetyMargin, runScenario, transition,
} from "../src/index.js";
import type { Scenario } from "../src/index.js";
import { terms } from "./helpers.js";

const base: Scenario = {
  name: "t",
  description: "",
  terms: { ...terms, claimSafetyMarginSec: 300 },
  steps: [
    { at: 0, event: { type: "LockEth", by: "ethHolder" } },
    { at: 10, event: { type: "LockXmr", by: "xmrHolder" } },
    { at: 20, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
    { at: 30, event: { type: "SignalReady", by: "ethHolder" } },
  ],
};
const withClaim = (at: number): Scenario => ({
  ...base,
  steps: [...base.steps, { at, event: { type: "Claim", by: "xmrHolder" } }],
});

describe("classifyClaim", () => {
  it("is safe before the margin starts", () => {
    const c = classifyClaim(3000, 2600, 300);
    expect(c.zone).toBe("safe");
    expect(c.mayRevert).toBe(false);
    expect(c.secondsToDeadline).toBe(400);
  });
  it("is unsafe from T1 minus the margin up to T1", () => {
    expect(classifyClaim(3000, 2700, 300).zone).toBe("unsafe-margin");
    expect(classifyClaim(3000, 2999, 300).zone).toBe("unsafe-margin");
    expect(classifyClaim(3000, 2699, 300).zone).toBe("safe");
  });
  it("is late at and after T1 and exposes b", () => {
    const c = classifyClaim(3000, 3000, 300);
    expect(c.zone).toBe("late");
    expect(c.revealsSecretIfReverted).toBe(true);
    expect(c.secondsToDeadline).toBe(0);
    expect(classifyClaim(3000, 3500, 0).secondsToDeadline).toBe(-500);
  });
  it("with no margin only late claims are flagged", () => {
    expect(classifyClaim(3000, 2999, 0).zone).toBe("safe");
  });
  it("rejects bad arguments", () => {
    expect(() => classifyClaim(3000, 100, -1)).toThrow(RangeError);
    expect(() => classifyClaim(Number.NaN, 100, 1)).toThrow(RangeError);
  });
  it("latestSafeClaimTime is T1 minus the margin", () => {
    expect(latestSafeClaimTime(3000, 300)).toBe(2700);
  });
});

describe("recommendClaimSafetyMargin", () => {
  const inputs = { inclusionBlocks: 20, blockTimeSec: 12, congestionFactor: 1.5, detectionLatencySec: 30, clockSkewSec: 30 };
  it("adds scaled inclusion, detection and skew, rounded up to a block", () => {
    const r = recommendClaimSafetyMargin(inputs);
    expect(r.inclusionSec).toBe(360);
    expect(r.marginSec).toBe(420);
  });
  it("rounds up to whole blocks", () => {
    expect(recommendClaimSafetyMargin({ ...inputs, clockSkewSec: 31 }).marginSec).toBe(432);
  });
  it("grows with each input", () => {
    const m = recommendClaimSafetyMargin(inputs).marginSec;
    expect(recommendClaimSafetyMargin({ ...inputs, detectionLatencySec: 90 }).marginSec).toBeGreaterThan(m);
    expect(recommendClaimSafetyMargin({ ...inputs, congestionFactor: 3 }).marginSec).toBeGreaterThan(m);
  });
  it("validates inputs", () => {
    expect(() => recommendClaimSafetyMargin({ ...inputs, inclusionBlocks: 0 })).toThrow(RangeError);
    expect(() => recommendClaimSafetyMargin({ ...inputs, congestionFactor: 0.5 })).toThrow(RangeError);
    expect(() => recommendClaimSafetyMargin({ ...inputs, blockTimeSec: 0 })).toThrow(RangeError);
    expect(() => recommendClaimSafetyMargin({ ...inputs, clockSkewSec: -1 })).toThrow(RangeError);
    expect(() => recommendClaimSafetyMargin({ ...inputs, detectionLatencySec: -1 })).toThrow(RangeError);
  });
});

describe("claimSafetyMarginSec in terms", () => {
  it("must be non-negative and shorter than the claim window", () => {
    expect(() => createSwap({ ...terms, claimSafetyMarginSec: -1 })).toThrow(RangeError);
    expect(() => createSwap({ ...terms, claimSafetyMarginSec: 2000 })).toThrow(RangeError);
    expect(() => createSwap({ ...terms, claimSafetyMarginSec: Number.NaN })).toThrow(RangeError);
    expect(createSwap({ ...terms, claimSafetyMarginSec: 1999 }).phase).toBe("None");
  });
  it("does not change what the state machine accepts", () => {
    let s = createSwap({ ...terms, claimSafetyMarginSec: 300 });
    for (const [at, e] of [
      [0, { type: "LockEth", by: "ethHolder" }],
      [10, { type: "LockXmr", by: "xmrHolder" }],
      [20, { type: "ObserveXmrConfirmations", confirmations: 10 }],
      [30, { type: "SignalReady", by: "ethHolder" }],
    ] as const) {
      const r = transition(s, e, at);
      if (!r.ok) throw new Error("setup failed");
      s = r.state;
    }
    expect(transition(s, { type: "Claim", by: "xmrHolder" }, 2900).ok).toBe(true);
  });
});

describe("simulator flags", () => {
  it("does not flag a claim outside the margin", () => {
    const r = runScenario(withClaim(2000));
    expect(r.unsafeClaimSteps).toEqual([]);
    expect(r.bExposed).toBe(false);
    expect(r.trace.at(-1)?.claimSafety?.zone).toBe("safe");
  });
  it("flags an accepted claim inside the margin as unsafe", () => {
    const r = runScenario(withClaim(2800));
    expect(r.trace.at(-1)?.ok).toBe(true);
    expect(r.unsafeClaimSteps).toEqual([5]);
    expect(r.bExposed).toBe(false);
    expect(formatTrace(r)).toContain("UNSAFE CLAIM (unsafe-margin)");
  });
  it("a claim after T1 is rejected, flagged, and exposes b", () => {
    const r = runScenario(withClaim(3006));
    const last = r.trace.at(-1);
    expect(last?.ok).toBe(false);
    expect(last?.error?.code).toBe("DEADLINE_PASSED");
    expect(last?.claimSafety?.zone).toBe("late");
    expect(last?.leaksB).toBe(true);
    expect(r.bExposed).toBe(true);
    expect(formatTrace(r)).toContain("LEAK");
  });
  it("a claim after the refund exposes b too", () => {
    const r = runScenario({
      ...base,
      terms: { ...base.terms, lateClaimAllowed: true },
      steps: [
        ...base.steps,
        { at: 3000, event: { type: "Refund", by: "ethHolder" } },
        { at: 3001, event: { type: "Claim", by: "xmrHolder" } },
      ],
    });
    expect(r.trace.at(-1)?.error?.code).toBe("INVALID_PHASE");
    expect(r.bExposed).toBe(true);
  });
  it("a claim by the wrong role does not count as a leak", () => {
    const r = runScenario({
      ...base,
      steps: [...base.steps, { at: 40, event: { type: "Claim", by: "ethHolder" as never } }],
    });
    expect(r.trace.at(-1)?.ok).toBe(false);
    expect(r.bExposed).toBe(false);
  });
  it("margin 0 flags only late claims", () => {
    const r = runScenario({ ...withClaim(2999), terms });
    expect(r.unsafeClaimSteps).toEqual([]);
  });
  it("non-claim steps carry no classification", () => {
    expect(runScenario(base).trace.every((t) => t.claimSafety === null && !t.leaksB)).toBe(true);
  });
});
