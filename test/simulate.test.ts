import { describe, expect, it } from "vitest";
import {
  defaultTerms, formatTrace, happyPath, punish, refund, runScenario, scenarios,
} from "../src/index.js";
import type { Scenario } from "../src/index.js";

describe("runScenario", () => {
  it("happy path ends Claimed with b public and the XMR swept", () => {
    const r = runScenario(happyPath);
    expect(r.trace.every((t) => t.ok)).toBe(true);
    expect(r.finalState.phase).toBe("Claimed");
    expect(r.finalState.xmr).toBe("SweptByEthHolder");
    expect(r.finalState.revealedB).toBe(true);
    expect(r.finalState.revealedA).toBe(false);
    expect(r.trace.map((t) => t.phaseAfter)).toEqual([
      "Funded", "Funded", "Funded", "Funded", "Ready", "Claimed", "Claimed",
    ]);
  });

  it("refund scenario rejects the late ready signal, then refunds and recovers", () => {
    const r = runScenario(refund);
    const rejected = r.trace.filter((t) => !t.ok);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.error?.code).toBe("DEADLINE_PASSED");
    expect(r.finalState.phase).toBe("Refunded");
    expect(r.finalState.xmr).toBe("RecoveredByXmrHolder");
    expect(r.finalState.revealedA).toBe(true);
  });

  it("punish scenario rejects the early refund and the late claim", () => {
    const r = runScenario(punish);
    expect(r.trace.filter((t) => !t.ok).map((t) => t.error?.code)).toEqual([
      "DEADLINE_NOT_REACHED", "DEADLINE_PASSED",
    ]);
    expect(r.finalState.phase).toBe("Refunded");
    expect(r.finalState.xmr).toBe("RecoveredByXmrHolder");
  });

  it("a rejected step leaves state unchanged", () => {
    const r = runScenario(punish);
    const bad = r.trace.find((t) => !t.ok);
    expect(bad?.phaseAfter).toBe(bad?.phaseBefore);
  });

  it("records available actions after each step", () => {
    const r = runScenario(happyPath);
    expect(r.trace[0]?.available).toContain("SignalReady");
    expect(r.trace.at(-1)?.available).toEqual([]);
  });

  it("bad ready on a missing lock is flagged and the ETH holder cannot sweep", () => {
    const s: Scenario = {
      name: "bad-ready",
      description: "ready without a lock",
      terms: defaultTerms,
      steps: [
        { at: 0, event: { type: "LockEth", by: "ethHolder" } },
        { at: 10, event: { type: "SignalReady", by: "ethHolder" } },
        { at: 20, event: { type: "Claim", by: "xmrHolder" } },
        { at: 30, event: { type: "SweepXmr", by: "ethHolder" } },
      ],
    };
    const r = runScenario(s);
    expect(r.finalState.readyWithoutConfirmedLock).toBe(true);
    expect(r.trace[3]?.error?.code).toBe("INVALID_XMR_STATE");
  });

  it("abort scenario ends Aborted", () => {
    const r = runScenario({
      name: "abort", description: "", terms: defaultTerms,
      steps: [{ at: 0, event: { type: "Abort", by: "xmrHolder" } }],
    });
    expect(r.finalState.phase).toBe("Aborted");
  });

  it("throws when step times go backwards", () => {
    expect(() =>
      runScenario({
        name: "bad-clock", description: "", terms: defaultTerms,
        steps: [
          { at: 10, event: { type: "LockEth", by: "ethHolder" } },
          { at: 5, event: { type: "LockXmr", by: "xmrHolder" } },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("is deterministic", () => {
    const a = JSON.stringify(runScenario(punish), (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
    const b = JSON.stringify(runScenario(punish), (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
    expect(a).toBe(b);
  });
});

describe("formatTrace", () => {
  it("prints every step and marks rejections", () => {
    for (const sc of scenarios) {
      const out = formatTrace(runScenario(sc));
      expect(out).toContain(`scenario: ${sc.name}`);
      expect(out).toContain("final:");
    }
    expect(formatTrace(runScenario(punish))).toContain("REJECTED DEADLINE_PASSED");
  });
});
