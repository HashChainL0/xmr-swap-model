import type { ClaimRoute } from "./types.js";

/**
 * Gas drip for a claim into a fresh zero balance address, as arithmetic and
 * rules only. No transaction is built or sent.
 *
 * Drip = gas limit * max fee per gas * fee buffer, rounded up. The fee buffer is
 * in basis points (10000 = 1x) so the sum stays in whole wei.
 */
export interface GasDripInput {
  readonly claimGasLimit: number;
  readonly maxFeePerGasWei: bigint;
  /** 10000 is 1x. Must be at least 10000. */
  readonly feeBufferBps: number;
}

export function requiredClaimFundsWei(gasLimit: number, maxFeePerGasWei: bigint): bigint {
  if (!Number.isInteger(gasLimit) || gasLimit < 1) throw new RangeError("gasLimit must be a positive integer");
  if (maxFeePerGasWei <= 0n) throw new RangeError("maxFeePerGasWei must be positive");
  return BigInt(gasLimit) * maxFeePerGasWei;
}

export function recommendedDripWei(input: GasDripInput): bigint {
  if (!Number.isInteger(input.feeBufferBps) || input.feeBufferBps < 10_000) {
    throw new RangeError("feeBufferBps must be an integer of at least 10000");
  }
  const base = requiredClaimFundsWei(input.claimGasLimit, input.maxFeePerGasWei);
  const scaled = base * BigInt(input.feeBufferBps);
  return (scaled + 9_999n) / 10_000n;
}

export type RouteVerdict = "safe" | "blocked" | "unsafe";

export interface ClaimRouteAssessment {
  readonly route: ClaimRoute;
  /** The party that signs and submits the claim transaction. */
  readonly submitter: "user" | "counterparty";
  /** True when b is handed to anyone before it is published by the claim itself. */
  readonly secretLeavesUser: boolean;
  readonly counterpartyControlsTiming: boolean;
  readonly canClaim: boolean;
  readonly verdict: RouteVerdict;
  readonly reasons: readonly string[];
}

export interface ClaimRouteContext {
  /** Balance of the user's receiving address before any drip. */
  readonly userBalanceWei: bigint;
  /** What the operator drips at the ready step. Zero for none. */
  readonly dripWei: bigint;
  readonly requiredWei: bigint;
}

/**
 * Compares who can claim and what it costs the user's secret.
 *
 * self: the user pays, so a zero balance address is blocked.
 * self-with-gas-drip: the operator only sends gas. The user still holds b and
 *   submits the claim, so the operator learns nothing early and controls no timing.
 * relayed-by-counterparty: the user hands b to the party who benefits from a
 *   refund. That party can hold b past T1, refund, and use a and b to take
 *   both sides. This is always unsafe.
 */
export function assessClaimRoute(route: ClaimRoute, ctx: ClaimRouteContext): ClaimRouteAssessment {
  const reasons: string[] = [];
  if (route === "relayed-by-counterparty") {
    reasons.push(
      "The relayer is the counterparty. It holds b before the claim is public and decides whether and when to submit.",
      "If it waits past T1, it refunds, which publishes a. It already has b, so it can sweep the XMR too and ends with both sides.",
      "The user gets no protection from the contract, because the contract never sees who held b.",
    );
    return {
      route,
      submitter: "counterparty",
      secretLeavesUser: true,
      counterpartyControlsTiming: true,
      canClaim: true,
      verdict: "unsafe",
      reasons,
    };
  }

  const funds = route === "self-with-gas-drip" ? ctx.userBalanceWei + ctx.dripWei : ctx.userBalanceWei;
  const canClaim = funds >= ctx.requiredWei;
  if (route === "self-with-gas-drip") {
    reasons.push("The operator sends gas only. b stays with the user until the user's own claim publishes it.");
    reasons.push(
      canClaim
        ? "The drip covers the required claim funds, so the user can claim without any prior balance."
        : "The drip is smaller than the required claim funds, so the claim would run out of gas or not be sent.",
    );
  } else {
    reasons.push("The user pays for the claim from their own balance, and b stays with the user.");
    if (!canClaim) reasons.push("The receiving address has no balance, so the user cannot claim. A gas drip or a funded address is needed.");
  }
  return {
    route,
    submitter: "user",
    secretLeavesUser: false,
    counterpartyControlsTiming: false,
    canClaim,
    verdict: canClaim ? "safe" : "blocked",
    reasons,
  };
}

export interface RelayerAttackOutcome {
  readonly relayerSubmitAt: number;
  readonly t1At: number;
  /** True when the relayer submits in time and the swap completes. */
  readonly swapCompletes: boolean;
  readonly relayerTakesBothSides: boolean;
  readonly explanation: string;
}

/**
 * What a self-interested relayer does with b. Submitting before T1 completes the
 * swap. Holding b to T1 or later lets it refund and keep both sides, so a
 * rational counterparty relayer waits. Pass Infinity for "never submits".
 */
export function relayerCounterpartyOutcome(t1At: number, relayerSubmitAt: number): RelayerAttackOutcome {
  if (Number.isNaN(t1At) || Number.isNaN(relayerSubmitAt)) throw new RangeError("times must be numbers");
  if (relayerSubmitAt < t1At) {
    return {
      relayerSubmitAt,
      t1At,
      swapCompletes: true,
      relayerTakesBothSides: false,
      explanation: "The relayer submitted before T1 and the swap completed. This only happens if the relayer chooses it. Nothing forces it.",
    };
  }
  return {
    relayerSubmitAt,
    t1At,
    swapCompletes: false,
    relayerTakesBothSides: true,
    explanation: "The relayer held b to T1 or later, refunded the ETH, and uses a and b to take the XMR. It ends with both sides.",
  };
}
