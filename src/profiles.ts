/**
 * Chain profiles as plain data. Every number is an illustrative default for
 * the model, not a measurement of any network. Replace them with real research
 * values before drawing any conclusion.
 */
export type ChainProfileId = "ethereum-l1" | "layer-2-rollup";

export interface ChainProfile {
  readonly id: ChainProfileId;
  readonly label: string;
  /** Illustrative. */
  readonly blockTimeSec: number;
  /** Illustrative blocks a claim usually needs to be included. */
  readonly claimInclusionBlocks: number;
  /** Illustrative worst case for one poll of event logs, so an event may be seen this much late. */
  readonly eventPollSec: number;
  /**
   * True when the cost of posting transaction data to a lower layer is charged
   * inside the gas the transaction uses, so a gas limit has to cover it.
   */
  readonly dataFeeCountsAgainstGasLimit: boolean;
  /** Illustrative range of the data posting component, in gas units, when it counts against the limit. */
  readonly dataPostingGasLow: number;
  readonly dataPostingGasHigh: number;
  readonly note: string;
}

export const CHAIN_PROFILES: Readonly<Record<ChainProfileId, ChainProfile>> = {
  "ethereum-l1": {
    id: "ethereum-l1",
    label: "Ethereum, no separate data fee",
    blockTimeSec: 12,
    claimInclusionBlocks: 20,
    eventPollSec: 30,
    dataFeeCountsAgainstGasLimit: false,
    dataPostingGasLow: 0,
    dataPostingGasHigh: 0,
    note: "Illustrative defaults. Calldata cost is part of execution gas, so a gas limit sized for the call is enough.",
  },
  "layer-2-rollup": {
    id: "layer-2-rollup",
    label: "Layer 2 rollup with a data posting fee",
    blockTimeSec: 2,
    claimInclusionBlocks: 30,
    eventPollSec: 30,
    dataFeeCountsAgainstGasLimit: true,
    dataPostingGasLow: 20_000,
    dataPostingGasHigh: 400_000,
    note: "Illustrative defaults. A data posting component moves with the cost of the lower layer and is charged inside the gas used, so a fixed limit can start failing with no change to the contract.",
  },
};

export function getChainProfile(id: ChainProfileId): ChainProfile {
  return CHAIN_PROFILES[id];
}
