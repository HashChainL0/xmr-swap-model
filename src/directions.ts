import type { Direction, Party, Role, ScenarioResult } from "./types.js";

export const DIRECTIONS: readonly Direction[] = ["eth-to-xmr", "xmr-to-eth"];

export interface DirectionInfo {
  readonly direction: Direction;
  readonly userHolds: "ETH" | "XMR";
  readonly operatorHolds: "ETH" | "XMR";
  readonly user: Role;
  readonly operator: Role;
  /** Always the ETH holder, in both directions. */
  readonly locksFirst: Role;
  /** Always the XMR holder, in both directions. */
  readonly locksSecond: Role;
  readonly summary: string;
}

/**
 * The ETH holder locks first and the XMR holder locks second, whatever the
 * direction. In eth-to-xmr the user is the ETH holder and so locks first. In
 * xmr-to-eth the operator is the ETH holder and locks first, and the user
 * locks XMR second.
 */
export function directionInfo(direction: Direction): DirectionInfo {
  if (direction === "eth-to-xmr") {
    return {
      direction,
      userHolds: "ETH",
      operatorHolds: "XMR",
      user: "ethHolder",
      operator: "xmrHolder",
      locksFirst: "ethHolder",
      locksSecond: "xmrHolder",
      summary: "User holds ETH and locks first. Operator holds XMR and locks second.",
    };
  }
  return {
    direction,
    userHolds: "XMR",
    operatorHolds: "ETH",
    user: "xmrHolder",
    operator: "ethHolder",
    locksFirst: "ethHolder",
    locksSecond: "xmrHolder",
    summary: "User holds XMR and locks second. Operator holds ETH and locks first.",
  };
}

export function partyOf(direction: Direction, role: Role): Party {
  return directionInfo(direction).user === role ? "user" : "operator";
}

export interface LockedFunds {
  readonly role: Role;
  /** Only set when a direction is given. */
  readonly party: Party | null;
  readonly asset: "ETH" | "XMR";
  readonly lockedAt: number;
  /** Null when the funds are still locked or unspent at the end of the trace. */
  readonly releasedAt: number | null;
  /** Release (or the last trace time) minus lockedAt. */
  readonly lockedForSec: number;
  readonly stillLocked: boolean;
}

/**
 * Who has funds locked and for how long, read from a scenario trace.
 * ETH is released when the swap closes (claim or refund). XMR is released when
 * it is swept or recovered. A lock never released is measured to the last step.
 */
export function fundsLocked(result: ScenarioResult, direction: Direction | null = result.direction): LockedFunds[] {
  const ok = result.trace.filter((t) => t.ok);
  const end = result.trace.at(-1)?.at ?? 0;
  const partyFor = (role: Role): Party | null => (direction ? partyOf(direction, role) : null);
  const out: LockedFunds[] = [];

  const ethLock = ok.find((t) => t.event.type === "LockEth");
  if (ethLock) {
    const closed = result.finalState.closedAt;
    const releasedAt = closed ?? null;
    out.push({
      role: "ethHolder",
      party: partyFor("ethHolder"),
      asset: "ETH",
      lockedAt: ethLock.at,
      releasedAt,
      lockedForSec: (releasedAt ?? end) - ethLock.at,
      stillLocked: releasedAt === null,
    });
  }

  const xmrLock = ok.find((t) => t.event.type === "LockXmr");
  if (xmrLock) {
    const spent = ok.find((t) => t.event.type === "SweepXmr" || t.event.type === "RecoverXmr");
    const releasedAt = spent?.at ?? null;
    out.push({
      role: "xmrHolder",
      party: partyFor("xmrHolder"),
      asset: "XMR",
      lockedAt: xmrLock.at,
      releasedAt,
      lockedForSec: (releasedAt ?? end) - xmrLock.at,
      stillLocked: releasedAt === null,
    });
  }
  return out;
}
