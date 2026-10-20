import { describe, expect, it } from "vitest";
import { availableActions, createSwap, isFinal, transition } from "../src/index.js";
import type { SwapEvent, SwapEventType, SwapState } from "../src/index.js";
import {
  abort, aborted, claim, claimed, conf10, funded, fundedLocked, lockEth, lockXmr, play, readyState,
  ready, recover, refund, refunded, sweep, terms,
} from "./helpers.js";

const code = (s: SwapState, e: SwapEvent, now: number): string => {
  const r = transition(s, e, now);
  return r.ok ? "ok" : r.error.code;
};

describe("createSwap", () => {
  it("starts in None with nothing locked", () => {
    const s = createSwap(terms);
    expect(s.phase).toBe("None");
    expect(s.xmr).toBe("NotLocked");
    expect(s.revealedA || s.revealedB).toBe(false);
  });
  it.each([
    { t0DurationSec: 0 },
    { t0DurationSec: 3000 },
    { t1DurationSec: 500 },
    { requiredConfirmations: 0 },
    { requiredConfirmations: 1.5 },
    { ethAmountWei: 0n },
    { xmrAmountPiconero: 0n },
  ])("rejects bad terms %o", (patch) => {
    expect(() => createSwap({ ...terms, ...patch })).toThrow(RangeError);
  });
});

describe("valid transitions", () => {
  it("None -> Funded on LockEth, sets T0 and T1 from the lock time", () => {
    const r = transition(createSwap(terms), lockEth, 100);
    expect(r.ok && r.state.phase).toBe("Funded");
    if (r.ok) {
      expect(r.state.t0At).toBe(1100);
      expect(r.state.t1At).toBe(3100);
      expect(r.state.fundedAt).toBe(100);
    }
  });
  it("None -> Aborted on Abort by either role", () => {
    for (const by of ["ethHolder", "xmrHolder"] as const) {
      const r = transition(createSwap(terms), { type: "Abort", by }, 5);
      expect(r.ok && r.state.phase).toBe("Aborted");
    }
  });
  it("Funded accepts LockXmr", () => {
    const r = transition(funded(), lockXmr, 10);
    expect(r.ok && r.state.xmr).toBe("Locked");
  });
  it("confirmations below the target keep Locked, at the target move to Confirmed", () => {
    const s = play([[0, lockEth], [1, lockXmr]]);
    const a = transition(s, { type: "ObserveXmrConfirmations", confirmations: 9 }, 2);
    expect(a.ok && a.state.xmr).toBe("Locked");
    const b = transition(s, conf10, 2);
    expect(b.ok && b.state.xmr).toBe("Confirmed");
  });
  it("XmrLockLost resets the lock after a reorg", () => {
    const r = transition(fundedLocked(), { type: "XmrLockLost" }, 30);
    expect(r.ok && r.state.xmr).toBe("NotLocked");
    expect(r.ok && r.state.xmrConfirmations).toBe(0);
  });
  it("Funded -> Ready before T0 with a confirmed lock", () => {
    const r = transition(fundedLocked(), ready, 999);
    expect(r.ok && r.state.phase).toBe("Ready");
    expect(r.ok && r.state.readyWithoutConfirmedLock).toBe(false);
  });
  it("Funded -> Ready without a confirmed lock is accepted but flagged", () => {
    const r = transition(funded(), ready, 5);
    expect(r.ok && r.state.phase).toBe("Ready");
    expect(r.ok && r.state.readyWithoutConfirmedLock).toBe(true);
  });
  it("Ready -> Claimed before T1 reveals b only", () => {
    const r = transition(readyState(), claim, 2999);
    expect(r.ok && r.state.phase).toBe("Claimed");
    expect(r.ok && [r.state.revealedA, r.state.revealedB]).toEqual([false, true]);
  });
  it("Funded -> Refunded at any time, before and after T0, reveals a only", () => {
    for (const now of [20, 999, 1000, 50_000]) {
      const r = transition(fundedLocked(), refund, now);
      expect(r.ok && r.state.phase).toBe("Refunded");
      expect(r.ok && [r.state.revealedA, r.state.revealedB]).toEqual([true, false]);
    }
  });
  it("Ready -> Refunded at T1", () => {
    const r = transition(readyState(), refund, 3000);
    expect(r.ok && r.state.phase).toBe("Refunded");
  });
  it("Claimed -> sweep by the ETH holder with a confirmed lock", () => {
    const r = transition(claimed(), sweep, 50);
    expect(r.ok && r.state.xmr).toBe("SweptByEthHolder");
  });
  it("Refunded -> recover by the XMR holder with a confirmed lock", () => {
    const r = transition(refunded(), recover, 2000);
    expect(r.ok && r.state.xmr).toBe("RecoveredByXmrHolder");
  });
  it("lateClaimAllowed keeps Claim valid after T1 until a refund lands", () => {
    const late = { ...terms, lateClaimAllowed: true };
    const s = play([[0, lockEth], [10, lockXmr], [20, conf10], [30, ready]], late);
    const r = transition(s, claim, 9999);
    expect(r.ok && r.state.phase).toBe("Claimed");
  });
  it("does not mutate the input state", () => {
    const s = funded();
    const snapshot = JSON.stringify(s, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
    transition(s, lockXmr, 10);
    expect(JSON.stringify(s, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))).toBe(snapshot);
  });
});

describe("deadline boundaries", () => {
  it("SignalReady is rejected at T0 exactly and accepted one second before", () => {
    expect(code(fundedLocked(), ready, 999)).toBe("ok");
    expect(code(fundedLocked(), ready, 1000)).toBe("DEADLINE_PASSED");
  });
  it("Claim is rejected at T1 exactly and accepted one second before", () => {
    expect(code(readyState(), claim, 2999)).toBe("ok");
    expect(code(readyState(), claim, 3000)).toBe("DEADLINE_PASSED");
  });
  it("Refund from Ready is rejected one second before T1", () => {
    expect(code(readyState(), refund, 2999)).toBe("DEADLINE_NOT_REACHED");
    expect(code(readyState(), refund, 3000)).toBe("ok");
  });
});

const states: Record<string, () => SwapState> = {
  None: () => createSwap(terms),
  Funded: funded,
  Ready: readyState,
  Claimed: claimed,
  Refunded: refunded,
  Aborted: aborted,
};

const allowedPhases: Record<string, readonly string[]> = {
  Abort: ["None"],
  LockEth: ["None"],
  LockXmr: ["Funded"],
  ObserveXmrConfirmations: ["Funded", "Ready"],
  XmrLockLost: ["Funded", "Ready"],
  SignalReady: ["Funded"],
  Claim: ["Ready"],
  Refund: ["Funded", "Ready"],
  SweepXmr: ["Claimed"],
  RecoverXmr: ["Refunded"],
};

const events: SwapEvent[] = [
  abort, lockEth, lockXmr, { type: "ObserveXmrConfirmations", confirmations: 10 }, { type: "XmrLockLost" },
  ready, claim, refund, sweep, recover,
];

describe("invalid phase transitions are rejected", () => {
  for (const [name, make] of Object.entries(states)) {
    for (const e of events) {
      if (allowedPhases[e.type]?.includes(name)) continue;
      it(`${e.type} in ${name}`, () => {
        const r = transition(make(), e, 100_000);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error.code).toBe("INVALID_PHASE");
          expect(r.error.phase).toBe(name);
          expect(r.error.event).toBe(e.type);
        }
      });
    }
  }

  it("final phases accept no event at all", () => {
    for (const make of [claimed, refunded, aborted]) {
      const s = make();
      expect(isFinal(s)).toBe(true);
      for (const e of events) {
        if (e.type === "SweepXmr" && s.phase === "Claimed") continue;
        if (e.type === "RecoverXmr" && s.phase === "Refunded") continue;
        expect(transition(s, e, 100_000).ok).toBe(false);
      }
    }
  });
});

describe("actor checks", () => {
  it("rejects the wrong role", () => {
    const wrong: [SwapState, unknown, number][] = [
      [createSwap(terms), { type: "LockEth", by: "xmrHolder" }, 1],
      [funded(), { type: "LockXmr", by: "ethHolder" }, 10],
      [fundedLocked(), { type: "SignalReady", by: "xmrHolder" }, 30],
      [readyState(), { type: "Claim", by: "ethHolder" }, 40],
      [readyState(), { type: "Refund", by: "xmrHolder" }, 5000],
      [claimed(), { type: "SweepXmr", by: "xmrHolder" }, 50],
      [refunded(), { type: "RecoverXmr", by: "ethHolder" }, 2000],
    ];
    for (const [s, e, now] of wrong) expect(code(s, e as SwapEvent, now)).toBe("WRONG_ACTOR");
  });
});

describe("Monero side rules", () => {
  it("LockXmr twice is rejected", () => {
    const s = play([[0, lockEth], [1, lockXmr]]);
    expect(code(s, lockXmr, 2)).toBe("INVALID_XMR_STATE");
  });
  it("observing confirmations with no lock is rejected", () => {
    expect(code(funded(), conf10, 5)).toBe("INVALID_XMR_STATE");
  });
  it("confirmations cannot decrease and must be integers", () => {
    const s = fundedLocked();
    expect(code(s, { type: "ObserveXmrConfirmations", confirmations: 3 }, 40)).toBe("INVALID_ARGUMENT");
    expect(code(s, { type: "ObserveXmrConfirmations", confirmations: 11.5 }, 40)).toBe("INVALID_ARGUMENT");
  });
  it("XmrLockLost with no lock is rejected", () => {
    expect(code(funded(), { type: "XmrLockLost" }, 5)).toBe("INVALID_XMR_STATE");
  });
  it("sweep after claim with no XMR lock is rejected", () => {
    const s = play([[0, lockEth], [5, ready], [6, claim]]);
    expect(code(s, sweep, 7)).toBe("INVALID_XMR_STATE");
    expect(s.readyWithoutConfirmedLock).toBe(true);
  });
  it("sweep with an unconfirmed lock is rejected until it matures", () => {
    const s = play([[0, lockEth], [1, lockXmr], [2, ready], [3, claim]]);
    expect(code(s, sweep, 4)).toBe("XMR_NOT_SPENDABLE");
  });
  it("recover with an unconfirmed lock is rejected", () => {
    const s = play([[0, lockEth], [1, lockXmr], [2, refund]]);
    expect(code(s, recover, 3)).toBe("XMR_NOT_SPENDABLE");
  });
  it("recover with no XMR lock is rejected", () => {
    const s = play([[0, lockEth], [2, refund]]);
    expect(code(s, recover, 3)).toBe("INVALID_XMR_STATE");
  });
  it("a reorg after Ready makes the later sweep impossible", () => {
    const s = play([[0, lockEth], [1, lockXmr], [2, conf10], [3, ready], [4, { type: "XmrLockLost" }], [5, claim]]);
    expect(s.xmr).toBe("NotLocked");
    expect(code(s, sweep, 6)).toBe("INVALID_XMR_STATE");
  });
  it("a second sweep is rejected", () => {
    const s = play([[0, lockEth], [1, lockXmr], [2, conf10], [3, ready], [4, claim], [5, sweep]]);
    expect(code(s, sweep, 6)).toBe("XMR_NOT_SPENDABLE");
  });
});

describe("clock", () => {
  it("rejects time going backwards", () => {
    expect(code(play([[100, lockEth]]), lockXmr, 50)).toBe("CLOCK_REGRESSION");
  });
  it("rejects a non-finite or negative now", () => {
    expect(code(createSwap(terms), lockEth, Number.NaN)).toBe("INVALID_ARGUMENT");
    expect(code(createSwap(terms), lockEth, -1)).toBe("INVALID_ARGUMENT");
  });
});

describe("availableActions (Monero observation events ignored)", () => {
  const types = (s: SwapState, now: number): SwapEventType[] =>
    availableActions(s, now).filter((t) => t !== "ObserveXmrConfirmations" && t !== "XmrLockLost");
  it("None offers Abort and LockEth", () => {
    expect(types(createSwap(terms), 0)).toEqual(["Abort", "LockEth"]);
  });
  it("Funded before T0 with a confirmed lock offers ready and refund", () => {
    expect(types(fundedLocked(), 100)).toEqual(["SignalReady", "Refund"]);
  });
  it("Funded after T0 offers refund only, ignoring Monero observations", () => {
    expect(types(fundedLocked(), 5000)).toEqual(["Refund"]);
  });
  it("Ready between T0 and T1 offers claim, no refund", () => {
    expect(types(readyState(), 100)).toEqual(["Claim"]);
  });
  it("Ready after T1 offers refund only", () => {
    expect(types(readyState(), 3000)).toEqual(["Refund"]);
  });
  it("final states offer nothing, except the sweep and recover", () => {
    expect(types(claimed(), 100)).toEqual(["SweepXmr"]);
    expect(types(refunded(), 2000)).toEqual(["RecoverXmr"]);
    expect(types(aborted(), 100)).toEqual([]);
  });
});
