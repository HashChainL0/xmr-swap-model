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
}

export interface ScenarioResult {
  readonly scenario: string;
  readonly trace: readonly TraceEntry[];
  readonly finalState: SwapState;
}
