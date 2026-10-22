import type { ClaimClassification } from "./types.js";

/**
 * A claim publishes b. If it lands too close to T1 or after it, the contract
 * may reject it, but the transaction data (and a pending transaction in the
 * mempool) already shows b. The counterparty can then refund and also sweep
 * the XMR with a and b. These helpers classify a claim against T1 and size the
 * margin. Everything is arithmetic on seconds, nothing is sent anywhere.
 */
export function classifyClaim(t1At: number, now: number, marginSec: number): ClaimClassification {
  if (!Number.isFinite(t1At) || !Number.isFinite(now)) throw new RangeError("t1At and now must be finite");
  if (!Number.isFinite(marginSec) || marginSec < 0) throw new RangeError("marginSec must be a non-negative number");
  const secondsToDeadline = t1At - now;
  if (now >= t1At) {
    return {
      zone: "late",
      secondsToDeadline,
      marginSec,
      mayRevert: true,
      revealsSecretIfReverted: true,
      explanation: `Claim at or after T1 (${-secondsToDeadline} s late). It is rejected or races the refund, and b is exposed either way.`,
    };
  }
  if (now >= t1At - marginSec) {
    return {
      zone: "unsafe-margin",
      secondsToDeadline,
      marginSec,
      mayRevert: true,
      revealsSecretIfReverted: true,
      explanation: `Claim ${secondsToDeadline} s before T1, inside the ${marginSec} s safety margin. Inclusion could slip past T1 and revert while b is already visible.`,
    };
  }
  return {
    zone: "safe",
    secondsToDeadline,
    marginSec,
    mayRevert: false,
    revealsSecretIfReverted: false,
    explanation: `Claim ${secondsToDeadline} s before T1, outside the ${marginSec} s safety margin.`,
  };
}

/** Last moment a claim should still be broadcast. */
export function latestSafeClaimTime(t1At: number, marginSec: number): number {
  return t1At - marginSec;
}

export interface ClaimMarginInputs {
  /** Blocks the claim usually needs to be included. */
  readonly inclusionBlocks: number;
  readonly blockTimeSec: number;
  /** Multiplier for a congested or slow period, at least 1. */
  readonly congestionFactor: number;
  /** Worst case time to learn that the claim landed or is still pending. */
  readonly detectionLatencySec: number;
  /** Allowed difference between the claimer's clock and contract time. */
  readonly clockSkewSec: number;
}

export interface ClaimMarginRecommendation {
  readonly inputs: ClaimMarginInputs;
  readonly inclusionSec: number;
  readonly marginSec: number;
}

/** Margin = inclusion time scaled for congestion + detection latency + clock skew, rounded up to whole blocks. */
export function recommendClaimSafetyMargin(inputs: ClaimMarginInputs): ClaimMarginRecommendation {
  const { inclusionBlocks, blockTimeSec, congestionFactor, detectionLatencySec, clockSkewSec } = inputs;
  if (!Number.isInteger(inclusionBlocks) || inclusionBlocks < 1) throw new RangeError("inclusionBlocks must be a positive integer");
  if (!Number.isFinite(blockTimeSec) || blockTimeSec <= 0) throw new RangeError("blockTimeSec must be positive");
  if (!Number.isFinite(congestionFactor) || congestionFactor < 1) throw new RangeError("congestionFactor must be at least 1");
  if (!Number.isFinite(detectionLatencySec) || detectionLatencySec < 0) throw new RangeError("detectionLatencySec must be non-negative");
  if (!Number.isFinite(clockSkewSec) || clockSkewSec < 0) throw new RangeError("clockSkewSec must be non-negative");
  const inclusionSec = inclusionBlocks * blockTimeSec * congestionFactor;
  const raw = inclusionSec + detectionLatencySec + clockSkewSec;
  return { inputs, inclusionSec, marginSec: Math.ceil(raw / blockTimeSec) * blockTimeSec };
}
