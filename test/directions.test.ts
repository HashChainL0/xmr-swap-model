import { describe, expect, it } from "vitest";
import {
  DIRECTIONS, directionInfo, directionScenarioList, directionScenarios, fundsLocked, marginTerms, partyOf,
  runScenario, summarizeOutcome, formatTrace,
} from "../src/index.js";
import type { Direction } from "../src/index.js";

describe("directions", () => {
  it("the ETH holder locks first and the XMR holder second in both directions", () => {
    for (const d of DIRECTIONS) {
      const i = directionInfo(d);
      expect(i.locksFirst).toBe("ethHolder");
      expect(i.locksSecond).toBe("xmrHolder");
    }
  });
  it("eth-to-xmr: user holds ETH, operator holds XMR", () => {
    const i = directionInfo("eth-to-xmr");
    expect([i.userHolds, i.operatorHolds, i.user, i.operator]).toEqual(["ETH", "XMR", "ethHolder", "xmrHolder"]);
    expect(partyOf("eth-to-xmr", "ethHolder")).toBe("user");
  });
  it("xmr-to-eth: user holds XMR, operator holds ETH", () => {
    const i = directionInfo("xmr-to-eth");
    expect([i.userHolds, i.operatorHolds, i.user, i.operator]).toEqual(["XMR", "ETH", "xmrHolder", "ethHolder"]);
    expect(partyOf("xmr-to-eth", "ethHolder")).toBe("operator");
    expect(partyOf("xmr-to-eth", "xmrHolder")).toBe("user");
  });
});

const get = (d: Direction, name: string) => {
  const sc = directionScenarios(d).find((s) => s.name === `${d}/${name}`);
  if (!sc) throw new Error(`missing ${name}`);
  return runScenario(sc);
};

describe.each(DIRECTIONS)("%s scenarios", (d) => {
  it("has five scenarios with unique names and the direction set", () => {
    const list = directionScenarios(d);
    expect(list.map((s) => s.name)).toEqual(
      ["happy-path", "refund", "grief-abandoned-lock", "grief-free-option", "grief-no-claim"].map((n) => `${d}/${n}`),
    );
    expect(list.every((s) => s.direction === d)).toBe(true);
  });

  it("happy path: XMR holder gets ETH, ETH holder gets XMR", () => {
    const r = get(d, "happy-path");
    expect(r.trace.every((t) => t.ok)).toBe(true);
    expect(r.unsafeClaimSteps).toEqual([]);
    const o = summarizeOutcome(r);
    expect(o.holdings).toEqual({ ethHolder: { eth: false, xmr: true }, xmrHolder: { eth: true, xmr: false } });
    const locked = fundsLocked(r);
    expect(locked.map((l) => l.asset)).toEqual(["ETH", "XMR"]);
    expect(locked[0]?.party).toBe(d === "eth-to-xmr" ? "user" : "operator");
    expect(locked[0]?.lockedForSec).toBe(3400);
    expect(locked[1]?.lockedForSec).toBe(3700 - 600);
  });

  it("refund: both get their own funds back", () => {
    const r = get(d, "refund");
    expect(r.finalState.phase).toBe("Refunded");
    expect(summarizeOutcome(r).holdings).toEqual({ ethHolder: { eth: true, xmr: false }, xmrHolder: { eth: false, xmr: true } });
  });

  it("abandoned lock: only the ETH holder had funds locked, until T0", () => {
    const r = get(d, "grief-abandoned-lock");
    const locked = fundsLocked(r);
    expect(locked).toHaveLength(1);
    expect(locked[0]?.asset).toBe("ETH");
    expect(locked[0]?.lockedForSec).toBe(marginTerms.t0DurationSec);
    expect(r.finalState.phase).toBe("Refunded");
  });

  it("free option: the XMR stays locked until the ETH holder chooses to refund", () => {
    const r = get(d, "grief-free-option");
    expect(r.trace.filter((t) => !t.ok).map((t) => t.error?.code)).toEqual(["INVALID_PHASE"]);
    const xmr = fundsLocked(r).find((l) => l.asset === "XMR");
    expect(xmr?.lockedForSec).toBe(marginTerms.t1DurationSec + 86_700 - 600);
    expect(xmr?.stillLocked).toBe(false);
    expect(summarizeOutcome(r).ethHolderTookBoth).toBe(false);
  });

  it("no claim: ETH locked until T1, then refunded", () => {
    const r = get(d, "grief-no-claim");
    expect(r.trace.filter((t) => !t.ok).map((t) => t.error?.code)).toEqual(["DEADLINE_NOT_REACHED"]);
    const eth = fundsLocked(r).find((l) => l.asset === "ETH");
    expect(eth?.lockedForSec).toBe(marginTerms.t1DurationSec + 10);
  });

  it("notes name user and operator explicitly", () => {
    const text = formatTrace(get(d, "happy-path"));
    expect(text).toContain("User (");
    expect(text).toContain("Operator (");
  });
});

describe("both directions run the same rules", () => {
  it("traces are identical apart from notes and names", () => {
    const strip = (d: Direction) =>
      directionScenarios(d).map((s) =>
        runScenario(s).trace.map((t) => [t.at, t.event.type, t.ok, t.phaseAfter, t.xmrAfter]),
      );
    expect(strip("eth-to-xmr")).toEqual(strip("xmr-to-eth"));
  });
  it("every direction scenario terminates", () => {
    for (const s of directionScenarioList) expect(summarizeOutcome(runScenario(s)).final).toBe(true);
  });
});

describe("fundsLocked and summarizeOutcome edge cases", () => {
  it("reports unreleased locks to the last step", () => {
    const r = runScenario({
      name: "open", description: "", terms: marginTerms,
      steps: [
        { at: 0, event: { type: "LockEth", by: "ethHolder" } },
        { at: 100, event: { type: "LockXmr", by: "xmrHolder" } },
        { at: 500, event: { type: "ObserveXmrConfirmations", confirmations: 3 } },
      ],
    });
    const l = fundsLocked(r, null);
    expect(l.every((x) => x.stillLocked && x.party === null)).toBe(true);
    expect(l.map((x) => x.lockedForSec)).toEqual([500, 400]);
    const o = summarizeOutcome(r);
    expect(o.final).toBe(false);
    expect(o.holdings).toBeNull();
  });
  it("abort leaves each side its own funds", () => {
    const r = runScenario({
      name: "abort", description: "", terms: marginTerms,
      steps: [{ at: 0, event: { type: "Abort", by: "xmrHolder" } }],
    });
    expect(fundsLocked(r)).toEqual([]);
    expect(summarizeOutcome(r).holdings?.ethHolder.eth).toBe(true);
  });
  it("a claim on a missing XMR lock leaves the XMR holder with both", () => {
    const r = runScenario({
      name: "bad", description: "", terms: marginTerms,
      steps: [
        { at: 0, event: { type: "LockEth", by: "ethHolder" } },
        { at: 10, event: { type: "SignalReady", by: "ethHolder" } },
        { at: 20, event: { type: "Claim", by: "xmrHolder" } },
      ],
    });
    expect(summarizeOutcome(r).holdings?.xmrHolder).toEqual({ eth: true, xmr: true });
  });
  it("a claim on an unconfirmed lock leaves the XMR pending for both", () => {
    const r = runScenario({
      name: "pending", description: "", terms: marginTerms,
      steps: [
        { at: 0, event: { type: "LockEth", by: "ethHolder" } },
        { at: 5, event: { type: "LockXmr", by: "xmrHolder" } },
        { at: 10, event: { type: "SignalReady", by: "ethHolder" } },
        { at: 20, event: { type: "Claim", by: "xmrHolder" } },
      ],
    });
    expect(summarizeOutcome(r).holdings).toEqual({ ethHolder: { eth: false, xmr: false }, xmrHolder: { eth: true, xmr: false } });
  });
});
