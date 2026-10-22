import { recommendClaimSafetyMargin } from "./claim-safety.js";
import { directionInfo } from "./directions.js";
import { computeTimelocks } from "./timelocks.js";
import type { Direction, Role, Scenario, SwapTerms } from "./types.js";

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

/** Illustrative margin: 20 blocks of 12 s scaled by 1.5, plus 30 s detection and 30 s skew. */
export const defaultClaimSafetyMarginSec = recommendClaimSafetyMargin({
  inclusionBlocks: 20,
  blockTimeSec: 12,
  congestionFactor: 1.5,
  detectionLatencySec: 30,
  clockSkewSec: 30,
}).marginSec;

/** Same amounts and windows as defaultTerms, plus the claim safety margin. Amounts are illustrative. */
export const marginTerms: SwapTerms = { ...defaultTerms, claimSafetyMarginSec: defaultClaimSafetyMarginSec };

const M = defaultClaimSafetyMarginSec;

/** Names a role as the user or the operator of a direction, for notes. */
const label = (direction: Direction, role: Role): string => {
  const info = directionInfo(direction);
  const party = info.user === role ? "user" : "operator";
  return `${party} (${role === "ethHolder" ? "ETH holder" : "XMR holder"})`;
};

const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Happy path, refund and three walk-away cases for one direction. The state
 * machine is identical in both directions: the ETH holder locks first and the
 * XMR holder locks second. Only the labels in the notes change.
 */
export function directionScenarios(direction: Direction): Scenario[] {
  const eth = label(direction, "ethHolder");
  const xmr = label(direction, "xmrHolder");
  const info = directionInfo(direction);
  const terms = marginTerms;
  const tag = `${direction}/`;
  const intro = `${direction}: ${info.summary}`;

  const happy: Scenario = {
    name: `${tag}happy-path`,
    direction,
    description: `${intro} Both lock, ready is signalled, the XMR holder claims, the ETH holder sweeps.`,
    terms,
    steps: [
      { at: 0, event: { type: "LockEth", by: "ethHolder" }, note: `${cap(eth)} locks first: ETH locked, T0 and T1 start counting.` },
      { at: 600, event: { type: "LockXmr", by: "xmrHolder" }, note: `${cap(xmr)} locks second: XMR sent to the joint address A + B.` },
      { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 }, note: "Lock confirmed and spendable." },
      { at: 3100, event: { type: "SignalReady", by: "ethHolder" }, note: `${cap(eth)} signals ready, well before T0.` },
      { at: 3400, event: { type: "Claim", by: "xmrHolder" }, note: `${cap(xmr)} claims the ETH, which publishes b. Far from T1, so a safe claim.` },
      { at: 3700, event: { type: "SweepXmr", by: "ethHolder" }, note: `${cap(eth)} reads b and sweeps the XMR with a and b.` },
    ],
  };

  const refundCase: Scenario = {
    name: `${tag}refund`,
    direction,
    description: `${intro} Both lock, but the ${eth} is offline past T0. Only a refund remains and the XMR comes back.`,
    terms,
    steps: [
      { at: 0, event: { type: "LockEth", by: "ethHolder" } },
      { at: 600, event: { type: "LockXmr", by: "xmrHolder" } },
      { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
      { at: T0 + 60, event: { type: "SignalReady", by: "ethHolder" }, note: `${cap(eth)} is back but T0 has passed. Signal rejected.` },
      { at: T0 + 120, event: { type: "Refund", by: "ethHolder" }, note: "Refund publishes a." },
      { at: T0 + 400, event: { type: "RecoverXmr", by: "xmrHolder" }, note: `${cap(xmr)} sweeps the lock back with a and b.` },
    ],
  };

  const abandonedLock: Scenario = {
    name: `${tag}grief-abandoned-lock`,
    direction,
    description: `${intro} Griefing: the ${xmr} never locks after the ${eth} locked. The ${eth} gives up and refunds. Only the ${eth} had funds locked, and only for as long as it chose to wait.`,
    terms,
    steps: [
      { at: 0, event: { type: "LockEth", by: "ethHolder" }, note: `${cap(eth)} locks first.` },
      { at: T0, event: { type: "Refund", by: "ethHolder" }, note: `No XMR lock appeared. In Funded the ${eth} can refund at any time, so the cost is waiting, not a forced lock-up. Refund publishes a.` },
    ],
  };

  const freeOption: Scenario = {
    name: `${tag}grief-free-option`,
    direction,
    description: `${intro} Free option: both locked, then the ${eth} stalls. It never signals ready and refunds late. The ${xmr} cannot recover the XMR until a is public, so the ${eth} alone decides how long the XMR stays locked.`,
    terms,
    steps: [
      { at: 0, event: { type: "LockEth", by: "ethHolder" } },
      { at: 600, event: { type: "LockXmr", by: "xmrHolder" }, note: `${cap(xmr)} locks XMR.` },
      { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
      { at: T0 + 60, event: { type: "RecoverXmr", by: "xmrHolder" }, note: `${cap(xmr)} tries to recover but a is not public. Rejected.` },
      { at: T1 + 86_400, event: { type: "Refund", by: "ethHolder" }, note: `One day after T1 the ${eth} finally refunds. Nothing forced it earlier. Publishes a.` },
      { at: T1 + 86_700, event: { type: "RecoverXmr", by: "xmrHolder" }, note: `${cap(xmr)} recovers the XMR.` },
    ],
  };

  const noClaim: Scenario = {
    name: `${tag}grief-no-claim`,
    direction,
    description: `${intro} Griefing: ready is signalled and the ${xmr} walks away. The ${eth}'s ETH is locked until T1, then refunded.`,
    terms,
    steps: [
      { at: 0, event: { type: "LockEth", by: "ethHolder" } },
      { at: 600, event: { type: "LockXmr", by: "xmrHolder" } },
      { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
      { at: 3100, event: { type: "SignalReady", by: "ethHolder" } },
      { at: T1 - 60, event: { type: "Refund", by: "ethHolder" }, note: `Too early. The ${eth} is locked until T1 and the ${xmr} still has time.` },
      { at: T1 + 10, event: { type: "Refund", by: "ethHolder" }, note: "T1 reached. Refund publishes a." },
      { at: T1 + 600, event: { type: "RecoverXmr", by: "xmrHolder" }, note: `${cap(xmr)} gets their XMR back. Nobody was paid for the time lost.` },
    ],
  };

  return [happy, refundCase, abandonedLock, freeOption, noClaim];
}

/** The claim safety rule in three cases, for one direction. */
export function claimSafetyScenarios(direction: Direction): Scenario[] {
  const eth = label(direction, "ethHolder");
  const xmr = label(direction, "xmrHolder");
  const intro = `${direction}: ${directionInfo(direction).summary}`;
  const terms = marginTerms;
  const setup = [
    { at: 0, event: { type: "LockEth", by: "ethHolder" } },
    { at: 600, event: { type: "LockXmr", by: "xmrHolder" } },
    { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
    { at: 3100, event: { type: "SignalReady", by: "ethHolder" } },
  ] as const;

  const safe: Scenario = {
    name: `${direction}/claim-with-margin`,
    direction,
    description: `${intro} The ${xmr} claims just outside the safety margin. Not flagged.`,
    terms,
    steps: [
      ...setup,
      { at: T1 - M - 60, event: { type: "Claim", by: "xmrHolder" }, note: `${M + 60} s before T1, outside the ${M} s margin. Claim publishes b and lands in time.` },
      { at: T1 - M + 300, event: { type: "SweepXmr", by: "ethHolder" } },
    ],
  };

  const inMargin: Scenario = {
    name: `${direction}/claim-in-margin`,
    direction,
    description: `${intro} The ${xmr} claims inside the safety margin. It happens to land before T1, so it succeeds, but the simulator flags it as unsafe.`,
    terms,
    steps: [
      ...setup,
      { at: T1 - 100, event: { type: "Claim", by: "xmrHolder" }, note: "100 s before T1. It landed this time. One slow block and it would not have." },
      { at: T1 + 200, event: { type: "SweepXmr", by: "ethHolder" } },
    ],
  };

  const leak: Scenario = {
    name: `${direction}/claim-after-deadline-leak`,
    direction,
    description: `${intro} The rule is ignored. The ${xmr} broadcasts a claim close to T1, it lands after T1 and reverts, but b was in the data. The ${eth} refunds and now holds a and b.`,
    terms,
    steps: [
      ...setup,
      { at: T1 + 6, event: { type: "Claim", by: "xmrHolder" }, note: "Broadcast 6 s before T1, landed 6 s after. Rejected on chain, yet b is readable in the transaction data." },
      { at: T1 + 12, event: { type: "Refund", by: "ethHolder" }, note: `${cap(eth)} refunds the ETH. This publishes a.` },
    ],
  };

  return [safe, inMargin, leak];
}

/**
 * XMR to ETH, the user claims on Ethereum or a layer 2 from a fresh address
 * with no balance. The operator sends a small gas drip at the ready step, so
 * the user claims themselves and b never leaves the user.
 */
export const gasDripClaim: Scenario = {
  name: "xmr-to-eth/gas-drip-claim",
  direction: "xmr-to-eth",
  claimRoute: "self-with-gas-drip",
  description:
    "xmr-to-eth: the user claims ETH into a fresh zero balance address. The operator drips a little gas at the ready step, so the user pays for and submits their own claim. b never leaves the user.",
  terms: marginTerms,
  steps: [
    { at: 0, event: { type: "LockEth", by: "ethHolder" }, note: "Operator (ETH holder) locks first." },
    { at: 600, event: { type: "LockXmr", by: "xmrHolder" }, note: "User (XMR holder) locks second. The user's receiving address on the ETH side is fresh and holds nothing." },
    { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
    { at: 3100, event: { type: "SignalReady", by: "ethHolder" }, note: "Operator signals ready and, in the same step, drips gas to the user's fresh address." },
    { at: 3400, event: { type: "Claim", by: "xmrHolder" }, note: "User claims with the dripped gas. The secret goes from the user to the contract and nowhere else." },
    { at: 3700, event: { type: "SweepXmr", by: "ethHolder" }, note: "Operator reads b from the claim and sweeps the XMR." },
  ],
};

/**
 * The unsafe contrast: the counterparty is the relayer. The user hands b to the
 * operator so the operator submits the claim. The operator holds b and simply
 * waits.
 */
export const relayedClaimByCounterparty: Scenario = {
  name: "xmr-to-eth/relayed-claim-by-counterparty",
  direction: "xmr-to-eth",
  claimRoute: "relayed-by-counterparty",
  description:
    "xmr-to-eth, unsafe: the user has no gas, so the operator offers to relay the claim and is given b. The operator holds b past T1, refunds, and has a and b. The operator takes the ETH and the XMR.",
  terms: marginTerms,
  steps: [
    { at: 0, event: { type: "LockEth", by: "ethHolder" } },
    { at: 600, event: { type: "LockXmr", by: "xmrHolder" } },
    { at: 3000, event: { type: "ObserveXmrConfirmations", confirmations: 10 } },
    { at: 3100, event: { type: "SignalReady", by: "ethHolder" }, note: "Ready. The user hands b to the operator to relay. From here the operator controls when, or whether, b is published." },
    { at: T1 - 60, event: { type: "Refund", by: "ethHolder" }, note: "Operator tries to refund early. Rejected until T1, so it waits." },
    { at: T1 + 10, event: { type: "Refund", by: "ethHolder" }, note: "Operator never submitted the claim. Refund publishes a, and the operator already holds b." },
  ],
};

export const directionScenarioList: readonly Scenario[] = [
  ...directionScenarios("eth-to-xmr"),
  ...directionScenarios("xmr-to-eth"),
];

export const claimSafetyScenarioList: readonly Scenario[] = [
  ...claimSafetyScenarios("eth-to-xmr"),
  ...claimSafetyScenarios("xmr-to-eth"),
  gasDripClaim,
  relayedClaimByCounterparty,
];

export const allScenarios: readonly Scenario[] = [...scenarios, ...directionScenarioList, ...claimSafetyScenarioList];
