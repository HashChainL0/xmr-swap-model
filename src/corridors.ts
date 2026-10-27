import { CHAIN_PROFILES } from "./profiles.js";
import type { ChainProfile, ChainProfileId } from "./profiles.js";
import { recommendWindows } from "./windows.js";
import type { WindowInputs, WindowRecommendation } from "./windows.js";
import { DIRECTIONS } from "./directions.js";
import type { Direction } from "./types.js";

/**
 * Corridors are the ETH and XMR pairs the model is read against, in priority
 * order: Robinhood Chain first, Base second, Ethereum mainnet third.
 *
 * A corridor is direct. Its swap is held on that one chain and never routes
 * through another chain, so there is no bridging step and no second chain
 * profile to add up. Both swap directions are available in every corridor.
 *
 * The profile assigned to each corridor is a modelling assumption that picks
 * a set of illustrative parameters. It is not a measurement of the chain.
 * Replace it with measured values before drawing any conclusion.
 */
export type CorridorId = "robinhood-chain" | "base" | "ethereum";

export interface Corridor {
  readonly id: CorridorId;
  /** Priority order, 1 is first. */
  readonly order: 1 | 2 | 3;
  readonly label: string;
  /** The traded pair, always ETH against XMR. */
  readonly pair: "ETH<>XMR";
  /** The one chain profile used for this corridor. */
  readonly profile: ChainProfileId;
  readonly directions: readonly Direction[];
  /** Always direct. A corridor never routes through another chain. */
  readonly routing: "direct";
  readonly note: string;
}

export const CORRIDORS: Readonly<Record<CorridorId, Corridor>> = {
  "robinhood-chain": {
    id: "robinhood-chain",
    order: 1,
    label: "Robinhood Chain, ETH<>XMR",
    pair: "ETH<>XMR",
    profile: "layer-2-rollup",
    directions: DIRECTIONS,
    routing: "direct",
    note: "First corridor. Modelled with the layer 2 profile, so the gas limit must cover a data posting component. Illustrative, not measured.",
  },
  base: {
    id: "base",
    order: 2,
    label: "Base, ETH<>XMR",
    pair: "ETH<>XMR",
    profile: "layer-2-rollup",
    directions: DIRECTIONS,
    routing: "direct",
    note: "Second corridor. Modelled with the layer 2 profile. Illustrative, not measured.",
  },
  ethereum: {
    id: "ethereum",
    order: 3,
    label: "Ethereum mainnet, ETH<>XMR",
    pair: "ETH<>XMR",
    profile: "ethereum-l1",
    directions: DIRECTIONS,
    routing: "direct",
    note: "Third corridor. Modelled with the Ethereum profile, where no separate data fee counts against the gas limit. Illustrative, not measured.",
  },
};

/** Corridors in priority order. */
export function corridorList(): Corridor[] {
  return Object.values(CORRIDORS).sort((a, b) => a.order - b.order);
}

const CORRIDOR_IDS: readonly CorridorId[] = ["robinhood-chain", "base", "ethereum"];

/** True when a runtime value names a known corridor. */
export function isCorridorId(value: unknown): value is CorridorId {
  return typeof value === "string" && (CORRIDOR_IDS as readonly string[]).includes(value);
}

/** Narrows a string, for example a command line argument, to a corridor id or throws with the valid ids. */
export function parseCorridorId(value: string): CorridorId {
  if (!isCorridorId(value)) {
    throw new RangeError(`unknown corridor "${value}", expected one of: ${corridorList().map((c) => c.id).join(", ")}`);
  }
  return value;
}

export function getCorridor(id: CorridorId): Corridor {
  if (!isCorridorId(id)) throw new RangeError(`unknown corridor "${String(id)}"`);
  return CORRIDORS[id];
}

export function corridorProfile(id: CorridorId): ChainProfile {
  return CHAIN_PROFILES[getCorridor(id).profile];
}

/** T0, T1 and the claim safety margin for one corridor, with optional overrides of any window input. */
export function corridorWindows(id: CorridorId, overrides: Partial<Omit<WindowInputs, "profile">> = {}): WindowRecommendation {
  return recommendWindows({ ...overrides, profile: corridorProfile(id) });
}
