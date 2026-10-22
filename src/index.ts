export * from "./types.js";
export { createSwap, transition, availableActions, isFinal, roleOf } from "./state-machine.js";
export {
  DEFAULT_TIMELOCK_CONFIG,
  computeTimelocks,
  validateTimelocks,
  resolveConfig,
  minimumT0Sec,
  minimumClaimWindowSec,
} from "./timelocks.js";
export type { TimelockConfig, TimelockPlan, TimelockComponent, TimelockCheck, TimelockReport } from "./timelocks.js";
export { runScenario, formatTrace } from "./simulate.js";
export {
  defaultTerms, happyPath, refund, punish, scenarios,
  marginTerms, defaultClaimSafetyMarginSec, directionScenarios, claimSafetyScenarios, gasDripClaim,
  relayedClaimByCounterparty, directionScenarioList, claimSafetyScenarioList, allScenarios,
} from "./scenarios.js";
export { DIRECTIONS, directionInfo, partyOf, fundsLocked } from "./directions.js";
export type { DirectionInfo, LockedFunds } from "./directions.js";
export { summarizeOutcome } from "./outcome.js";
export type { Holdings, Outcome } from "./outcome.js";
export { classifyClaim, latestSafeClaimTime, recommendClaimSafetyMargin } from "./claim-safety.js";
export type { ClaimMarginInputs, ClaimMarginRecommendation } from "./claim-safety.js";
export { requiredClaimFundsWei, recommendedDripWei, assessClaimRoute, relayerCounterpartyOutcome } from "./gas-drip.js";
export type { GasDripInput, ClaimRouteAssessment, ClaimRouteContext, RouteVerdict, RelayerAttackOutcome } from "./gas-drip.js";
