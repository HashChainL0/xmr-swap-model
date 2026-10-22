import { recommendClaimSafetyMargin } from "./claim-safety.js";
import type { ChainProfile } from "./profiles.js";
import { validateTimelocks } from "./timelocks.js";
import type { TimelockReport } from "./timelocks.js";

/**
 * Window calculator that builds on the T0 and T1 math by adding event
 * detection latency, clock skew and the claim safety margin. Every default is
 * an illustrative placeholder.
 *
 * Detection: a watcher that polls event logs sees an event up to one poll
 * interval late, and slow log reads can make one poll take around 30 s. Each
 * time one party has to notice something before it can act, one worst case
 * poll is added.
 */
export interface WindowInputs {
  readonly profile: ChainProfile;
  readonly moneroBlockTimeSec: number;
  /** Monero blocks are random in time, so n blocks can take longer than n * block time. */
  readonly moneroBlockVarianceFactor: number;
  readonly requiredConfirmations: number;
  readonly moneroLockBlocks: number;
  /** Time for the XMR holder to check the terms and broadcast the lock, before detection and skew. */
  readonly counterpartyLockAllowanceSec: number;
  readonly ethHolderOnlineMarginSec: number;
  readonly xmrHolderOnlineMarginSec: number;
  /** Worst case seconds for one poll of event logs. */
  readonly detectionPollSec: number;
  /** Allowed difference between a party's clock and contract time. */
  readonly clockSkewSec: number;
  /** Scales claim inclusion time for a congested period, at least 1. */
  readonly congestionFactor: number;
}

export function defaultWindowInputs(profile: ChainProfile): WindowInputs {
  return {
    profile,
    moneroBlockTimeSec: 120,
    moneroBlockVarianceFactor: 2,
    requiredConfirmations: 10,
    moneroLockBlocks: 10,
    counterpartyLockAllowanceSec: 3600,
    ethHolderOnlineMarginSec: 4 * 3600,
    xmrHolderOnlineMarginSec: 6 * 3600,
    detectionPollSec: profile.eventPollSec,
    clockSkewSec: 30,
    congestionFactor: 1.5,
  };
}

export interface WindowComponent {
  readonly name: string;
  readonly seconds: number;
  readonly explanation: string;
}

export interface WindowRecommendation {
  readonly inputs: WindowInputs;
  readonly t0Sec: number;
  readonly t1Sec: number;
  readonly claimWindowSec: number;
  readonly claimSafetyMarginSec: number;
  /** Latest offset from the ETH lock for a safe claim. */
  readonly latestSafeClaimSec: number;
  readonly t0Components: readonly WindowComponent[];
  readonly claimWindowComponents: readonly WindowComponent[];
  readonly report: TimelockReport;
}

const roundUp = (sec: number, blockSec: number): number => Math.ceil(sec / blockSec) * blockSec;

export function recommendWindows(partial: Partial<WindowInputs> & Pick<WindowInputs, "profile">): WindowRecommendation {
  const i: WindowInputs = { ...defaultWindowInputs(partial.profile), ...partial };
  const positive = ["moneroBlockTimeSec", "moneroBlockVarianceFactor", "requiredConfirmations", "moneroLockBlocks"] as const;
  for (const k of positive) {
    if (!Number.isFinite(i[k]) || i[k] <= 0) throw new RangeError(`${k} must be a positive number`);
  }
  for (const k of ["counterpartyLockAllowanceSec", "ethHolderOnlineMarginSec", "xmrHolderOnlineMarginSec", "detectionPollSec", "clockSkewSec"] as const) {
    if (!Number.isFinite(i[k]) || i[k] < 0) throw new RangeError(`${k} must be a non-negative number`);
  }
  if (!Number.isFinite(i.congestionFactor) || i.congestionFactor < 1) throw new RangeError("congestionFactor must be at least 1");

  const blockSec = i.profile.blockTimeSec;
  const confirmWait = i.requiredConfirmations * i.moneroBlockTimeSec * i.moneroBlockVarianceFactor;
  const margin = recommendClaimSafetyMargin({
    inclusionBlocks: i.profile.claimInclusionBlocks,
    blockTimeSec: blockSec,
    congestionFactor: i.congestionFactor,
    detectionLatencySec: i.detectionPollSec,
    clockSkewSec: i.clockSkewSec,
  });

  // Before ready the ETH holder's lock must be seen by the XMR holder (one poll),
  // and the final Monero confirmation must be seen by the ETH holder (one poll).
  const t0Components: WindowComponent[] = [
    { name: "counterpartyLockAllowance", seconds: i.counterpartyLockAllowanceSec, explanation: "Time for the XMR holder to check the terms and broadcast the XMR lock." },
    { name: "confirmationWait", seconds: confirmWait, explanation: `${i.requiredConfirmations} Monero confirmations at ${i.moneroBlockTimeSec} s per block, scaled by ${i.moneroBlockVarianceFactor} for variance.` },
    { name: "detectionLatency", seconds: 2 * i.detectionPollSec, explanation: `Two worst case polls of ${i.detectionPollSec} s: one to see the ETH lock, one to see the last confirmation.` },
    { name: "clockSkew", seconds: i.clockSkewSec, explanation: "Allowance for a party's clock differing from contract time." },
    { name: "ethHolderOnlineMargin", seconds: i.ethHolderOnlineMarginSec, explanation: "Slack so a briefly offline ETH holder can still signal ready before T0." },
  ];
  const t0Sec = roundUp(t0Components.reduce((a, c) => a + c.seconds, 0), blockSec);

  // After ready the XMR holder must see it (one poll), then claim outside the margin.
  const claimWindowComponents: WindowComponent[] = [
    { name: "xmrHolderOnlineMargin", seconds: i.xmrHolderOnlineMarginSec, explanation: "Slack so a briefly offline XMR holder can notice ready and claim." },
    { name: "detectionLatency", seconds: i.detectionPollSec, explanation: `One worst case poll of ${i.detectionPollSec} s to see the ready signal.` },
    { name: "clockSkew", seconds: i.clockSkewSec, explanation: "Allowance for the claimer's clock differing from contract time." },
    { name: "claimSafetyMargin", seconds: margin.marginSec, explanation: "No claim should be broadcast inside this margin before T1. It covers congested inclusion, detection and skew, and sits at the end of the window so it does not eat the online margin." },
  ];
  const claimWindowSec = roundUp(claimWindowComponents.reduce((a, c) => a + c.seconds, 0), blockSec);
  const t1Sec = t0Sec + claimWindowSec;

  const report = validateTimelocks(t0Sec, t1Sec, {
    ethSideBlockTimeSec: blockSec,
    moneroBlockTimeSec: i.moneroBlockTimeSec,
    moneroLockBlocks: i.moneroLockBlocks,
    requiredConfirmations: i.requiredConfirmations,
    moneroBlockVarianceFactor: i.moneroBlockVarianceFactor,
    counterpartyLockAllowanceSec: i.counterpartyLockAllowanceSec,
    ethHolderOnlineMarginSec: i.ethHolderOnlineMarginSec,
    xmrHolderOnlineMarginSec: i.xmrHolderOnlineMarginSec,
    claimInclusionBlocks: i.profile.claimInclusionBlocks,
  });

  return {
    inputs: i,
    t0Sec,
    t1Sec,
    claimWindowSec,
    claimSafetyMarginSec: margin.marginSec,
    latestSafeClaimSec: t1Sec - margin.marginSec,
    t0Components,
    claimWindowComponents,
    report,
  };
}
