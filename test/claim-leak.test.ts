import { describe, expect, it } from "vitest";
import {
  claimSafetyScenarios, defaultClaimSafetyMarginSec, DIRECTIONS, formatTrace, gasDripClaim, marginTerms,
  relayedClaimByCounterparty, runScenario, summarizeOutcome,
} from "../src/index.js";

const T1 = marginTerms.t1DurationSec;

describe.each(DIRECTIONS)("%s claim safety scenarios", (d) => {
  const [safe, inMargin, leak] = claimSafetyScenarios(d).map(runScenario);

  it("claim outside the margin completes without a flag", () => {
    expect(safe?.trace.every((t) => t.ok)).toBe(true);
    expect(safe?.unsafeClaimSteps).toEqual([]);
    expect(safe?.finalState.phase).toBe("Claimed");
  });

  it("claim inside the margin succeeds but is flagged", () => {
    expect(inMargin?.trace.every((t) => t.ok)).toBe(true);
    expect(inMargin?.unsafeClaimSteps).toHaveLength(1);
    expect(inMargin?.bExposed).toBe(false);
  });

  it("ignoring the rule leaks b and the ETH holder takes both sides", () => {
    expect(leak?.unsafeClaimSteps).toHaveLength(1);
    expect(leak?.bExposed).toBe(true);
    expect(leak?.finalState.phase).toBe("Refunded");
    expect(leak?.finalState.revealedA).toBe(true);
    const o = leak ? summarizeOutcome(leak) : null;
    expect(o?.ethHolderTookBoth).toBe(true);
    expect(o?.holdings?.ethHolder).toEqual({ eth: true, xmr: true });
    expect(o?.holdings?.xmrHolder).toEqual({ eth: false, xmr: false });
  });

  it("the XMR holder recovering first avoids the loss", () => {
    const sc = claimSafetyScenarios(d)[2]!;
    const r = runScenario({ ...sc, steps: [...sc.steps, { at: T1 + 20, event: { type: "RecoverXmr", by: "xmrHolder" } }] });
    expect(summarizeOutcome(r).ethHolderTookBoth).toBe(false);
  });
});

describe("margin default", () => {
  it("is shorter than the claim window", () => {
    expect(defaultClaimSafetyMarginSec).toBeGreaterThan(0);
    expect(defaultClaimSafetyMarginSec).toBeLessThan(marginTerms.t1DurationSec - marginTerms.t0DurationSec);
  });
});

describe("gas drip and relayed scenarios", () => {
  it("gas drip claim is a normal safe claim by the user", () => {
    const r = runScenario(gasDripClaim);
    expect(r.trace.every((t) => t.ok)).toBe(true);
    expect(r.claimRoute).toBe("self-with-gas-drip");
    expect(r.unsafeClaimSteps).toEqual([]);
    expect(summarizeOutcome(r).ethHolderTookBoth).toBe(false);
  });
  it("relayed claim by the counterparty ends with the operator holding both", () => {
    const r = runScenario(relayedClaimByCounterparty);
    expect(r.claimRoute).toBe("relayed-by-counterparty");
    expect(r.trace.filter((t) => !t.ok).map((t) => t.error?.code)).toEqual(["DEADLINE_NOT_REACHED"]);
    expect(r.finalState.phase).toBe("Refunded");
    const o = summarizeOutcome(r);
    expect(o.ethHolderTookBoth).toBe(true);
    expect(formatTrace(r)).toContain("outcome:");
  });
});
