import type { ChainProfile } from "./profiles.js";

/**
 * Gas limit calculator for chains that charge a data posting component.
 * Gas here is plain units, no prices. The model never estimates against a
 * live node, it only does arithmetic on the numbers it is given.
 *
 * recommended limit = ceil((execution gas + data posting gas) * safety multiplier)
 */
export interface GasLimitInput {
  /** Gas the call itself runs, measured or estimated by the caller. */
  readonly executionGas: number;
  /** Data posting component in gas units. Zero when the chain has none. */
  readonly dataPostingGas: number;
  /** At least 1. */
  readonly safetyMultiplier: number;
}

export interface GasLimitRecommendation {
  readonly input: GasLimitInput;
  readonly baseGas: number;
  readonly recommendedGasLimit: number;
  /** Gas above the base that the multiplier adds. */
  readonly headroomGas: number;
}

function checkGas(name: string, v: number, min: number): void {
  if (!Number.isFinite(v) || v < min) throw new RangeError(`${name} must be a finite number of at least ${min}`);
}

export function recommendGasLimit(input: GasLimitInput): GasLimitRecommendation {
  checkGas("executionGas", input.executionGas, 1);
  checkGas("dataPostingGas", input.dataPostingGas, 0);
  checkGas("safetyMultiplier", input.safetyMultiplier, 1);
  const baseGas = input.executionGas + input.dataPostingGas;
  const recommendedGasLimit = Math.ceil(baseGas * input.safetyMultiplier);
  return { input, baseGas, recommendedGasLimit, headroomGas: recommendedGasLimit - baseGas };
}

/** Recommendation for a chain profile. The data component is ignored when the profile does not charge it inside gas. */
export function recommendForProfile(
  profile: ChainProfile,
  executionGas: number,
  safetyMultiplier: number,
  dataPostingGas: number = profile.dataPostingGasHigh,
): GasLimitRecommendation {
  return recommendGasLimit({
    executionGas,
    dataPostingGas: profile.dataFeeCountsAgainstGasLimit ? dataPostingGas : 0,
    safetyMultiplier,
  });
}

export interface FixedLimitCheck {
  readonly fixedLimit: number;
  readonly executionGas: number;
  readonly dataPostingGas: number;
  readonly neededGas: number;
  readonly ok: boolean;
  /** Gas missing when the limit is too low, otherwise 0. */
  readonly shortfallGas: number;
  /** The data posting component above which this fixed limit fails. */
  readonly failsAboveDataPostingGas: number;
}

/** Whether a hard coded gas limit still covers the call at a given data posting component. */
export function checkFixedLimit(fixedLimit: number, executionGas: number, dataPostingGas: number): FixedLimitCheck {
  checkGas("fixedLimit", fixedLimit, 1);
  checkGas("executionGas", executionGas, 1);
  checkGas("dataPostingGas", dataPostingGas, 0);
  const neededGas = executionGas + dataPostingGas;
  return {
    fixedLimit,
    executionGas,
    dataPostingGas,
    neededGas,
    ok: fixedLimit >= neededGas,
    shortfallGas: Math.max(0, neededGas - fixedLimit),
    failsAboveDataPostingGas: Math.max(0, fixedLimit - executionGas),
  };
}

export interface SweepRow {
  readonly dataPostingGas: number;
  readonly fixedLimitOk: boolean;
  readonly fixedLimitShortfallGas: number;
  readonly recommendedGasLimit: number;
}

/**
 * Walks a fixed limit and the recommended limit across rising data posting
 * components. The fixed limit passes while the component is small and fails
 * once it grows, which is how a limit tuned before a data fee existed breaks.
 * The recommended limit is recomputed for each row and keeps covering it.
 */
export function sweepDataPosting(
  fixedLimit: number,
  executionGas: number,
  safetyMultiplier: number,
  dataPostingSamples: readonly number[],
): SweepRow[] {
  return dataPostingSamples.map((d) => {
    const c = checkFixedLimit(fixedLimit, executionGas, d);
    return {
      dataPostingGas: d,
      fixedLimitOk: c.ok,
      fixedLimitShortfallGas: c.shortfallGas,
      recommendedGasLimit: recommendGasLimit({ executionGas, dataPostingGas: d, safetyMultiplier }).recommendedGasLimit,
    };
  });
}
