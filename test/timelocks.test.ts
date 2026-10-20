import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELOCK_CONFIG, computeTimelocks, minimumClaimWindowSec, minimumT0Sec, resolveConfig, validateTimelocks,
} from "../src/index.js";

const failing = (r: ReturnType<typeof validateTimelocks>): string[] => r.checks.filter((c) => !c.ok).map((c) => c.id);

describe("computeTimelocks", () => {
  it("produces a plan that passes its own validation", () => {
    const p = computeTimelocks();
    expect(validateTimelocks(p.t0Sec, p.t1Sec).valid).toBe(true);
  });
  it("uses the documented default arithmetic", () => {
    const p = computeTimelocks();
    // 3600 + 10 * 120 * 2 + 14400 = 20400
    expect(p.t0Sec).toBe(20400);
    // 21600 + 20 * 12 = 21840
    expect(p.t1Sec - p.t0Sec).toBe(21840);
    expect(p.t0Blocks).toBe(1700);
    expect(p.t1Blocks).toBe(p.t1Sec / 12);
  });
  it("T1 is later than T0 and both are block aligned", () => {
    const p = computeTimelocks({ ethSideBlockTimeSec: 7 });
    expect(p.t1Sec).toBeGreaterThan(p.t0Sec);
    expect(p.t0Sec % 7).toBe(0);
    expect(p.t1Sec % 7).toBe(0);
  });
  it("grows T0 with confirmations and block variance", () => {
    const base = computeTimelocks();
    expect(computeTimelocks({ requiredConfirmations: 20 }).t0Sec).toBeGreaterThan(base.t0Sec);
    expect(computeTimelocks({ moneroBlockVarianceFactor: 3 }).t0Sec).toBeGreaterThan(base.t0Sec);
  });
  it("explains every component", () => {
    const p = computeTimelocks();
    expect(p.components.map((c) => c.name)).toEqual([
      "counterpartyLockAllowance", "confirmationWait", "ethHolderOnlineMargin", "claimWindow",
    ]);
    for (const c of p.components) expect(c.explanation.length).toBeGreaterThan(10);
  });
  it("accepts a slower Hash Chain block time", () => {
    const p = computeTimelocks({ ethSideBlockTimeSec: 2 });
    expect(p.t0Blocks).toBe(p.t0Sec / 2);
  });
});

describe("resolveConfig", () => {
  it("fills defaults", () => {
    expect(resolveConfig()).toEqual(DEFAULT_TIMELOCK_CONFIG);
  });
  it.each([
    { ethSideBlockTimeSec: 0 },
    { moneroBlockTimeSec: -1 },
    { requiredConfirmations: 2.5 },
    { moneroLockBlocks: Number.NaN },
    { counterpartyLockAllowanceSec: -5 },
    { claimInclusionBlocks: 0 },
  ])("rejects %o", (patch) => {
    expect(() => resolveConfig(patch)).toThrow(RangeError);
  });
});

describe("validateTimelocks", () => {
  const good = computeTimelocks();
  it("passes the computed plan with every check ok", () => {
    const r = validateTimelocks(good.t0Sec, good.t1Sec);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.checks.length).toBe(7);
  });
  it("rejects non positive and non finite values", () => {
    expect(failing(validateTimelocks(0, 100))).toEqual(["positive"]);
    expect(failing(validateTimelocks(10, Number.POSITIVE_INFINITY))).toEqual(["positive"]);
  });
  it("rejects T1 equal to or before T0", () => {
    expect(failing(validateTimelocks(good.t0Sec, good.t0Sec))).toContain("ordering");
    expect(failing(validateTimelocks(good.t1Sec, good.t0Sec))).toContain("ordering");
  });
  it("T0 exactly at the minimum passes, one block below fails", () => {
    const min = minimumT0Sec(DEFAULT_TIMELOCK_CONFIG);
    const t1 = min + 100_000;
    expect(failing(validateTimelocks(min, t1))).not.toContain("t0-covers-confirmations");
    expect(failing(validateTimelocks(min - 12, t1))).toContain("t0-covers-confirmations");
  });
  it("claim window exactly at the minimum passes, one block below fails", () => {
    const w = minimumClaimWindowSec(DEFAULT_TIMELOCK_CONFIG);
    const t0 = good.t0Sec;
    expect(failing(validateTimelocks(t0, t0 + w))).not.toContain("claim-window");
    expect(failing(validateTimelocks(t0, t0 + w - 12))).toContain("claim-window");
  });
  it("flags fewer confirmations than the Monero 10 block lock", () => {
    const r = validateTimelocks(good.t0Sec, good.t1Sec, { requiredConfirmations: 4 });
    expect(failing(r)).toContain("confirmations-cover-unlock");
    expect(r.valid).toBe(false);
  });
  it("flags a T1 that is earlier than the expected unlock time", () => {
    const r = validateTimelocks(600, 1200, {
      counterpartyLockAllowanceSec: 0, requiredConfirmations: 1, moneroLockBlocks: 10,
      ethHolderOnlineMarginSec: 0, xmrHolderOnlineMarginSec: 0,
    });
    expect(failing(r)).toContain("t1-covers-unlock");
  });
  it("flags values that are not block aligned", () => {
    expect(failing(validateTimelocks(good.t0Sec + 1, good.t1Sec + 1))).toContain("block-aligned");
  });
  it("every check carries an explanation", () => {
    for (const c of validateTimelocks(5, 4).checks) expect(c.explanation.length).toBeGreaterThan(10);
  });
});
