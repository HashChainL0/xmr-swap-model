import { describe, expect, it } from "vitest";
import { assessClaimRoute, recommendedDripWei, relayerCounterpartyOutcome, requiredClaimFundsWei } from "../src/index.js";

describe("drip amount", () => {
  it("required funds are gas limit times max fee", () => {
    expect(requiredClaimFundsWei(100_000, 5n)).toBe(500_000n);
  });
  it("applies the buffer and rounds up", () => {
    expect(recommendedDripWei({ claimGasLimit: 100_000, maxFeePerGasWei: 5n, feeBufferBps: 15_000 })).toBe(750_000n);
    expect(recommendedDripWei({ claimGasLimit: 1, maxFeePerGasWei: 1n, feeBufferBps: 10_001 })).toBe(2n);
  });
  it("validates inputs", () => {
    expect(() => requiredClaimFundsWei(0, 1n)).toThrow(RangeError);
    expect(() => requiredClaimFundsWei(1.5, 1n)).toThrow(RangeError);
    expect(() => requiredClaimFundsWei(10, 0n)).toThrow(RangeError);
    expect(() => recommendedDripWei({ claimGasLimit: 10, maxFeePerGasWei: 1n, feeBufferBps: 9_999 })).toThrow(RangeError);
  });
});

describe("assessClaimRoute", () => {
  const required = 1_000n;
  it("self with a zero balance is blocked", () => {
    const a = assessClaimRoute("self", { userBalanceWei: 0n, dripWei: 0n, requiredWei: required });
    expect(a.verdict).toBe("blocked");
    expect(a.canClaim).toBe(false);
    expect(a.secretLeavesUser).toBe(false);
  });
  it("self with enough balance is safe", () => {
    expect(assessClaimRoute("self", { userBalanceWei: required, dripWei: 0n, requiredWei: required }).verdict).toBe("safe");
  });
  it("a drip unblocks a fresh address and the secret stays with the user", () => {
    const a = assessClaimRoute("self-with-gas-drip", { userBalanceWei: 0n, dripWei: required, requiredWei: required });
    expect(a.verdict).toBe("safe");
    expect(a.submitter).toBe("user");
    expect(a.secretLeavesUser).toBe(false);
    expect(a.counterpartyControlsTiming).toBe(false);
  });
  it("a drip that is too small is blocked", () => {
    expect(assessClaimRoute("self-with-gas-drip", { userBalanceWei: 0n, dripWei: required - 1n, requiredWei: required }).verdict).toBe("blocked");
  });
  it("a relayer that is the counterparty is unsafe even when everything is funded", () => {
    const a = assessClaimRoute("relayed-by-counterparty", { userBalanceWei: required, dripWei: required, requiredWei: required });
    expect(a.verdict).toBe("unsafe");
    expect(a.secretLeavesUser).toBe(true);
    expect(a.counterpartyControlsTiming).toBe(true);
    expect(a.submitter).toBe("counterparty");
    expect(a.reasons.join(" ")).toContain("both sides");
  });
});

describe("relayerCounterpartyOutcome", () => {
  it("submitting before T1 completes the swap, but only by the relayer's choice", () => {
    const o = relayerCounterpartyOutcome(1000, 999);
    expect(o.swapCompletes).toBe(true);
    expect(o.relayerTakesBothSides).toBe(false);
  });
  it("holding b to T1, or forever, lets the relayer take both sides", () => {
    expect(relayerCounterpartyOutcome(1000, 1000).relayerTakesBothSides).toBe(true);
    expect(relayerCounterpartyOutcome(1000, Number.POSITIVE_INFINITY).relayerTakesBothSides).toBe(true);
  });
  it("rejects NaN", () => {
    expect(() => relayerCounterpartyOutcome(Number.NaN, 1)).toThrow(RangeError);
  });
});
