import { computeTimelocks } from "./timelocks.js";
import type { Scenario, SwapTerms } from "./types.js";

const plan = computeTimelocks();

export const defaultTerms: SwapTerms = {
  ethAmountWei: 1_000_000_000_000_000_000n,
  xmrAmountPiconero: 5_000_000_000_000n,
  t0DurationSec: plan.t0Sec,
  t1DurationSec: plan.t1Sec,
  requiredConfirmations: plan.config.requiredConfirmations,
  lateClaimAllowed: false,
};

const { t0Sec: T0, t1Sec: T1 } = plan;

export const happyPath: Scenario = {
  name: "happy-path",
  description: "Both sides lock, ETH holder signals ready, XMR holder claims, ETH holder sweeps.",
  terms: defaultTerms,
  steps: [
    { at: 0, event: { type: "LockEth", by: "ethHolder" }, note: "ETH locked on Hash Chain, bound to B. T0 and T1 start counting." },
    { at: 600, event: { type: "LockXmr", by: "xmrHolder" }, note: "XMR sent to the joint address A + B." },
    { at: 1800, event: { type: "ObserveXmrConfirmations", confirmations: 6 }, note: "Not enough confirmations yet." },
    { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 }, note: "Lock confirmed and spendable." },
    { at: 3100, event: { type: "SignalReady", by: "ethHolder" }, note: "Signalled well before T0." },
    { at: 3400, event: { type: "Claim", by: "xmrHolder" }, note: "Claim publishes b." },
    { at: 3700, event: { type: "SweepXmr", by: "ethHolder" }, note: "ETH holder reads b and sweeps with a and b." },
  ],
};

export const refund: Scenario = {
  name: "refund",
  description: "Both sides lock but the ETH holder is offline past T0. Only a refund remains, and the XMR holder recovers.",
  terms: defaultTerms,
  steps: [
    { at: 0, event: { type: "LockEth", by: "ethHolder" } },
    { at: 600, event: { type: "LockXmr", by: "xmrHolder" } },
    { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
    { at: T0 + 60, event: { type: "SignalReady", by: "ethHolder" }, note: "ETH holder is back, but T0 has passed. Signal rejected." },
    { at: T0 + 120, event: { type: "Refund", by: "ethHolder" }, note: "Refund publishes a." },
    { at: T0 + 400, event: { type: "RecoverXmr", by: "xmrHolder" }, note: "XMR holder sweeps the lock back with a and b." },
  ],
};

export const punish: Scenario = {
  name: "punish",
  description:
    "Ready is signalled but the XMR holder does not claim before T1. The ETH holder refunds after T1. The spec has no bond, so the cost is a failed swap and delay.",
  terms: defaultTerms,
  steps: [
    { at: 0, event: { type: "LockEth", by: "ethHolder" } },
    { at: 600, event: { type: "LockXmr", by: "xmrHolder" } },
    { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
    { at: 3100, event: { type: "SignalReady", by: "ethHolder" } },
    { at: T1 - 60, event: { type: "Refund", by: "ethHolder" }, note: "Too early: T1 has not been reached." },
    { at: T1, event: { type: "Claim", by: "xmrHolder" }, note: "Too late: claim window closed at T1." },
    { at: T1 + 10, event: { type: "Refund", by: "ethHolder" }, note: "Refund publishes a." },
    { at: T1 + 600, event: { type: "RecoverXmr", by: "xmrHolder" }, note: "XMR holder recovers their XMR using a and b." },
  ],
};

export const scenarios: readonly Scenario[] = [happyPath, refund, punish];
