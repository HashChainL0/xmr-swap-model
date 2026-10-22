/** Roles are named as in docs/11-connection-monero.md of the protocol spec. */
export type Role = "ethHolder" | "xmrHolder";

/** Contract states from the spec, plus Aborted for a swap dropped before any lock. */
export type Phase = "None" | "Funded" | "Ready" | "Claimed" | "Refunded" | "Aborted";

export type XmrStatus =
  | "NotLocked"
  | "Locked"
  | "Confirmed"
  | "SweptByEthHolder"
  | "RecoveredByXmrHolder";

/** Terms agreed off chain before anything is locked. Durations are seconds of swap contract time. */
export interface SwapTerms {
  readonly ethAmountWei: bigint;
  readonly xmrAmountPiconero: bigint;
  /** T0 is measured from the ETH lock. */
  readonly t0DurationSec: number;
  /** T1 is measured from the ETH lock and must be later than T0. */
  readonly t1DurationSec: number;
  /** Monero confirmations the XMR lock needs before it counts as confirmed. */
  readonly requiredConfirmations: number;
  /**
   * The spec says the XMR holder claims "until T1" and that the first valid
   * action wins after T1. false means a claim at or after T1 is rejected.
   * true means a claim stays valid until the refund lands.
   */
  readonly lateClaimAllowed: boolean;
  /**
   * Seconds before T1 inside which a claim counts as unsafe. A claim landing in
   * this margin or after T1 may revert and still publish b. Zero or absent
   * means no margin. See docs/CLAIM-SAFETY.md.
   */
  readonly claimSafetyMarginSec?: number;
}

/**
 * The ETH holder always locks first and the XMR holder always locks second.
 * The direction only says which of them is the user and which is the operator.
 */
export type Direction = "eth-to-xmr" | "xmr-to-eth";

export type Party = "user" | "operator";

/** Who submits the claim transaction and who holds the claim secret b before it is public. */
export type ClaimRoute = "self" | "self-with-gas-drip" | "relayed-by-counterparty";

export type ClaimZone = "safe" | "unsafe-margin" | "late";

export interface ClaimClassification {
  readonly zone: ClaimZone;
  /** T1 minus the time of the attempt. Negative once T1 has passed. */
  readonly secondsToDeadline: number;
  readonly marginSec: number;
  /** True when inclusion could slip past T1 and the transaction revert. */
  readonly mayRevert: boolean;
  /** A reverted or rejected claim still carries b in its data. */
  readonly revealsSecretIfReverted: boolean;
  readonly explanation: string;
}

export interface SwapState {
  readonly phase: Phase;
  readonly terms: SwapTerms;
  readonly lastEventAt: number;
  readonly fundedAt: number | null;
  readonly t0At: number | null;
  readonly t1At: number | null;
  readonly readyAt: number | null;
  readonly closedAt: number | null;
  readonly xmr: XmrStatus;
  readonly xmrConfirmations: number;
  /** Refund publishes a, claim publishes b. */
  readonly revealedA: boolean;
  readonly revealedB: boolean;
  /** True when ready was signalled before the XMR lock had enough confirmations. */
  readonly readyWithoutConfirmedLock: boolean;
}

export type SwapEvent =
  | { readonly type: "Abort"; readonly by: Role }
  | { readonly type: "LockEth"; readonly by: "ethHolder" }
  | { readonly type: "LockXmr"; readonly by: "xmrHolder" }
  | { readonly type: "ObserveXmrConfirmations"; readonly confirmations: number }
  | { readonly type: "XmrLockLost" }
  | { readonly type: "SignalReady"; readonly by: "ethHolder" }
  | { readonly type: "Claim"; readonly by: "xmrHolder" }
  | { readonly type: "Refund"; readonly by: "ethHolder" }
  | { readonly type: "SweepXmr"; readonly by: "ethHolder" }
  | { readonly type: "RecoverXmr"; readonly by: "xmrHolder" };

export type SwapEventType = SwapEvent["type"];

export type TransitionErrorCode =
  | "INVALID_PHASE"
  | "WRONG_ACTOR"
  | "DEADLINE_PASSED"
  | "DEADLINE_NOT_REACHED"
  | "INVALID_XMR_STATE"
  | "XMR_NOT_SPENDABLE"
  | "SECRET_NOT_REVEALED"
  | "CLOCK_REGRESSION"
  | "INVALID_ARGUMENT";

export interface TransitionError {
  readonly code: TransitionErrorCode;
  readonly message: string;
  readonly event: SwapEventType;
  readonly phase: Phase;
}

export type TransitionResult =
  | { readonly ok: true; readonly state: SwapState }
  | { readonly ok: false; readonly error: TransitionError };

export interface TraceEntry {
  readonly step: number;
  readonly at: number;
  readonly event: SwapEvent;
  readonly ok: boolean;
  readonly phaseBefore: Phase;
  readonly phaseAfter: Phase;
  readonly xmrAfter: XmrStatus;
  readonly error: TransitionError | null;
  readonly available: readonly SwapEventType[];
  readonly note: string | null;
  /** Set for Claim events when the swap has a T1. */
  readonly claimSafety: ClaimClassification | null;
  /** True when a rejected claim still put b where the counterparty can read it. */
  readonly leaksB: boolean;
}

export interface ScenarioStep {
  readonly at: number;
  readonly event: SwapEvent;
  readonly note?: string;
}

export interface Scenario {
  readonly name: string;
  readonly description: string;
  readonly terms: SwapTerms;
  readonly steps: readonly ScenarioStep[];
  /** Set by the per direction scenarios. Roles are the same in both directions. */
  readonly direction?: Direction;
  /** Defaults to "self". */
  readonly claimRoute?: ClaimRoute;
}

export interface ScenarioResult {
  readonly scenario: string;
  readonly trace: readonly TraceEntry[];
  readonly finalState: SwapState;
  readonly direction: Direction | null;
  readonly claimRoute: ClaimRoute;
  /** True when b became readable to the ETH holder without a valid claim. */
  readonly bExposed: boolean;
  /** Step numbers of claims inside the safety margin or after T1. */
  readonly unsafeClaimSteps: readonly number[];
}
