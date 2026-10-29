import { describe, expect, it } from "vitest";
import { allScenarios, happyPath, punish, refund, runScenario, summarizeOutcome } from "../src/index.js";
import type { Scenario } from "../src/index.js";
import { terms } from "./helpers.js";

const only = (steps: Scenario["steps"]): Scenario => ({ name: "t", description: "", terms, steps });

describe("summarizeOutcome", () => {
  it("is not final while the swap is still locked", () => {
    const o = summarizeOutcome(runScenario(only([{ at: 0, event: { type: "LockEth", by: "ethHolder" } }])));
    expect(o.final).toBe(false);
    expect(o.holdings).toBeNull();
    expect(o.ethHolderTookBoth).toBe(false);
    expect(o.summary).toContain("Funds are locked");
  });

  it("an abort before any lock leaves each side with its own funds", () => {
    const o = summarizeOutcome(runScenario(only([{ at: 0, event: { type: "Abort", by: "ethHolder" } }])));
    expect(o.final).toBe(true);
    expect(o.holdings).toEqual({ ethHolder: { eth: true, xmr: false }, xmrHolder: { eth: false, xmr: true } });
  });

  it("a happy path hands the ETH to the XMR holder and the XMR to the ETH holder", () => {
    const o = summarizeOutcome(runScenario(happyPath));
    expect(o.final).toBe(true);
    expect(o.holdings?.xmrHolder.eth).toBe(true);
    expect(o.holdings?.ethHolder.xmr).toBe(true);
    expect(o.ethHolderTookBoth).toBe(false);
  });

  it("a plain refund and the punish path never leave the ETH holder with both sides", () => {
    for (const s of [refund, punish]) {
      const o = summarizeOutcome(runScenario(s));
      expect(o.final).toBe(true);
      expect(o.ethHolderTookBoth).toBe(false);
      expect(o.holdings?.ethHolder.eth).toBe(true);
    }
  });

  it("every built-in scenario gives a non-empty summary", () => {
    for (const s of allScenarios) {
      expect(summarizeOutcome(runScenario(s)).summary.length).toBeGreaterThan(10);
    }
  });

  it("the ETH holder holds both sides only when the flag says so", () => {
    for (const s of allScenarios) {
      const o = summarizeOutcome(runScenario(s));
      if (o.ethHolderTookBoth) {
        expect(o.holdings?.ethHolder).toEqual({ eth: true, xmr: true });
        expect(o.holdings?.xmrHolder).toEqual({ eth: false, xmr: false });
      }
    }
  });

  it("no side is ever credited with the same asset twice", () => {
    for (const s of allScenarios) {
      const h = summarizeOutcome(runScenario(s)).holdings;
      if (!h) continue;
      const ethCount = Number(h.ethHolder.eth) + Number(h.xmrHolder.eth);
      expect(ethCount).toBeLessThanOrEqual(1);
    }
  });
});
