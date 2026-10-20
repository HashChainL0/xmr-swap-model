import type {
  Phase,
  Role,
  SwapEvent,
  SwapEventType,
  SwapState,
  SwapTerms,
  TransitionErrorCode,
  TransitionResult,
} from "./types.js";

export function createSwap(terms: SwapTerms): SwapState {
  const { t0DurationSec: t0, t1DurationSec: t1, requiredConfirmations: conf } = terms;
  if (!Number.isFinite(t0) || t0 <= 0) throw new RangeError("t0DurationSec must be a positive number");
  if (!Number.isFinite(t1) || t1 <= t0) throw new RangeError("t1DurationSec must be greater than t0DurationSec");
  if (!Number.isInteger(conf) || conf < 1) throw new RangeError("requiredConfirmations must be a positive integer");
  if (terms.ethAmountWei <= 0n) throw new RangeError("ethAmountWei must be positive");
  if (terms.xmrAmountPiconero <= 0n) throw new RangeError("xmrAmountPiconero must be positive");
  return {
    phase: "None",
    terms,
    lastEventAt: 0,
    fundedAt: null,
    t0At: null,
    t1At: null,
    readyAt: null,
    closedAt: null,
    xmr: "NotLocked",
    xmrConfirmations: 0,
    revealedA: false,
    revealedB: false,
    readyWithoutConfirmedLock: false,
  };
}

const fail = (
  state: SwapState,
  event: SwapEvent,
  code: TransitionErrorCode,
  message: string,
): TransitionResult => ({
  ok: false,
  error: { code, message, event: event.type, phase: state.phase },
});

const ok = (state: SwapState): TransitionResult => ({ ok: true, state });

const spendable = (s: SwapState): boolean => s.xmr === "Confirmed";

/**
 * Pure transition function. `now` is swap contract time in seconds and must not
 * go backwards between events. The input state is never mutated.
 */
export function transition(state: SwapState, event: SwapEvent, now: number): TransitionResult {
  if (!Number.isFinite(now) || now < 0) {
    return fail(state, event, "INVALID_ARGUMENT", "now must be a non-negative finite number");
  }
  if (now < state.lastEventAt) {
    return fail(state, event, "CLOCK_REGRESSION", `now ${now} is before the last event at ${state.lastEventAt}`);
  }
  const at = (patch: Partial<SwapState>): TransitionResult => ok({ ...state, ...patch, lastEventAt: now });
  const needPhase = (...allowed: Phase[]): TransitionResult | null =>
    allowed.includes(state.phase)
      ? null
      : fail(state, event, "INVALID_PHASE", `${event.type} is not allowed in ${state.phase}`);

  switch (event.type) {
    case "Abort": {
      const bad = needPhase("None");
      if (bad) return bad;
      return at({ phase: "Aborted", closedAt: now });
    }

    case "LockEth": {
      const bad = needPhase("None");
      if (bad) return bad;
      if (event.by !== "ethHolder") return fail(state, event, "WRONG_ACTOR", "only the ETH holder locks ETH");
      return at({
        phase: "Funded",
        fundedAt: now,
        t0At: now + state.terms.t0DurationSec,
        t1At: now + state.terms.t1DurationSec,
      });
    }

    case "LockXmr": {
      const bad = needPhase("Funded");
      if (bad) return bad;
      if (event.by !== "xmrHolder") return fail(state, event, "WRONG_ACTOR", "only the XMR holder locks XMR");
      if (state.xmr !== "NotLocked") return fail(state, event, "INVALID_XMR_STATE", "XMR is already locked");
      return at({ xmr: "Locked", xmrConfirmations: 0 });
    }

    case "ObserveXmrConfirmations": {
      const bad = needPhase("Funded", "Ready");
      if (bad) return bad;
      if (state.xmr !== "Locked" && state.xmr !== "Confirmed") {
        return fail(state, event, "INVALID_XMR_STATE", "no XMR lock to observe");
      }
      if (!Number.isInteger(event.confirmations) || event.confirmations < state.xmrConfirmations) {
        return fail(state, event, "INVALID_ARGUMENT", "confirmations must be an integer and cannot decrease");
      }
      return at({
        xmrConfirmations: event.confirmations,
        xmr: event.confirmations >= state.terms.requiredConfirmations ? "Confirmed" : "Locked",
      });
    }

    case "XmrLockLost": {
      const bad = needPhase("Funded", "Ready");
      if (bad) return bad;
      if (state.xmr !== "Locked" && state.xmr !== "Confirmed") {
        return fail(state, event, "INVALID_XMR_STATE", "no XMR lock to lose");
      }
      return at({ xmr: "NotLocked", xmrConfirmations: 0 });
    }

    case "SignalReady": {
      const bad = needPhase("Funded");
      if (bad) return bad;
      if (event.by !== "ethHolder") return fail(state, event, "WRONG_ACTOR", "only the ETH holder signals ready");
      if (now >= (state.t0At ?? 0)) {
        return fail(state, event, "DEADLINE_PASSED", `T0 (${state.t0At}) has passed, only a refund is possible`);
      }
      return at({ phase: "Ready", readyAt: now, readyWithoutConfirmedLock: !spendable(state) });
    }

    case "Claim": {
      const bad = needPhase("Ready");
      if (bad) return bad;
      if (event.by !== "xmrHolder") return fail(state, event, "WRONG_ACTOR", "only the XMR holder claims");
      if (!state.terms.lateClaimAllowed && now >= (state.t1At ?? 0)) {
        return fail(state, event, "DEADLINE_PASSED", `T1 (${state.t1At}) has passed`);
      }
      return at({ phase: "Claimed", closedAt: now, revealedB: true });
    }

    case "Refund": {
      const bad = needPhase("Funded", "Ready");
      if (bad) return bad;
      if (event.by !== "ethHolder") return fail(state, event, "WRONG_ACTOR", "only the ETH holder refunds");
      if (state.phase === "Ready" && now < (state.t1At ?? 0)) {
        return fail(state, event, "DEADLINE_NOT_REACHED", `T1 (${state.t1At}) has not been reached`);
      }
      return at({ phase: "Refunded", closedAt: now, revealedA: true });
    }

    case "SweepXmr": {
      const bad = needPhase("Claimed");
      if (bad) return bad;
      if (event.by !== "ethHolder") return fail(state, event, "WRONG_ACTOR", "only the ETH holder sweeps after a claim");
      if (!state.revealedB) return fail(state, event, "SECRET_NOT_REVEALED", "b is not public");
      if (state.xmr === "NotLocked") return fail(state, event, "INVALID_XMR_STATE", "no XMR was locked, nothing to sweep");
      if (!spendable(state)) return fail(state, event, "XMR_NOT_SPENDABLE", "the XMR lock does not have enough confirmations yet");
      return at({ xmr: "SweptByEthHolder" });
    }

    case "RecoverXmr": {
      const bad = needPhase("Refunded");
      if (bad) return bad;
      if (event.by !== "xmrHolder") return fail(state, event, "WRONG_ACTOR", "only the XMR holder recovers after a refund");
      if (!state.revealedA) return fail(state, event, "SECRET_NOT_REVEALED", "a is not public");
      if (state.xmr === "NotLocked") return fail(state, event, "INVALID_XMR_STATE", "no XMR was locked, nothing to recover");
      if (!spendable(state)) return fail(state, event, "XMR_NOT_SPENDABLE", "the XMR lock does not have enough confirmations yet");
      return at({ xmr: "RecoveredByXmrHolder" });
    }
  }
}

/** Event types that would be accepted right now, for either role or the Monero observer. */
export function availableActions(state: SwapState, now: number): SwapEventType[] {
  const candidates: SwapEvent[] = [
    { type: "Abort", by: "ethHolder" },
    { type: "LockEth", by: "ethHolder" },
    { type: "LockXmr", by: "xmrHolder" },
    { type: "ObserveXmrConfirmations", confirmations: state.xmrConfirmations + 1 },
    { type: "XmrLockLost" },
    { type: "SignalReady", by: "ethHolder" },
    { type: "Claim", by: "xmrHolder" },
    { type: "Refund", by: "ethHolder" },
    { type: "SweepXmr", by: "ethHolder" },
    { type: "RecoverXmr", by: "xmrHolder" },
  ];
  return candidates.filter((e) => transition(state, e, now).ok).map((e) => e.type);
}

export function isFinal(state: SwapState): boolean {
  return state.phase === "Claimed" || state.phase === "Refunded" || state.phase === "Aborted";
}

export function roleOf(event: SwapEvent): Role | null {
  return "by" in event ? event.by : null;
}
