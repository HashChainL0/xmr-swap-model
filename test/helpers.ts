import { createSwap, transition } from "../src/index.js";
import type { SwapEvent, SwapState, SwapTerms } from "../src/index.js";

export const terms: SwapTerms = {
  ethAmountWei: 10n ** 18n,
  xmrAmountPiconero: 10n ** 12n,
  t0DurationSec: 1000,
  t1DurationSec: 3000,
  requiredConfirmations: 10,
  lateClaimAllowed: false,
};

export function play(steps: readonly (readonly [number, SwapEvent])[], t: SwapTerms = terms): SwapState {
  let s = createSwap(t);
  for (const [at, e] of steps) {
    const r = transition(s, e, at);
    if (!r.ok) throw new Error(`step ${e.type} at ${at} rejected: ${r.error.code}`);
    s = r.state;
  }
  return s;
}

export const lockEth: SwapEvent = { type: "LockEth", by: "ethHolder" };
export const lockXmr: SwapEvent = { type: "LockXmr", by: "xmrHolder" };
export const conf10: SwapEvent = { type: "ObserveXmrConfirmations", confirmations: 10 };
export const ready: SwapEvent = { type: "SignalReady", by: "ethHolder" };
export const claim: SwapEvent = { type: "Claim", by: "xmrHolder" };
export const refund: SwapEvent = { type: "Refund", by: "ethHolder" };
export const sweep: SwapEvent = { type: "SweepXmr", by: "ethHolder" };
export const recover: SwapEvent = { type: "RecoverXmr", by: "xmrHolder" };
export const abort: SwapEvent = { type: "Abort", by: "ethHolder" };

export const funded = (): SwapState => play([[0, lockEth]]);
export const fundedLocked = (): SwapState => play([[0, lockEth], [10, lockXmr], [20, conf10]]);
export const readyState = (): SwapState => play([[0, lockEth], [10, lockXmr], [20, conf10], [30, ready]]);
export const claimed = (): SwapState => play([[0, lockEth], [10, lockXmr], [20, conf10], [30, ready], [40, claim]]);
export const refunded = (): SwapState => play([[0, lockEth], [10, lockXmr], [20, conf10], [1500, refund]]);
export const aborted = (): SwapState => play([[0, abort]]);
