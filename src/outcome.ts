import type { Role, ScenarioResult } from "./types.js";

export interface Holdings {
  /** Ends holding the ETH amount of the terms. */
  readonly eth: boolean;
  /** Ends holding the XMR amount of the terms. */
  readonly xmr: boolean;
}

export interface Outcome {
  readonly final: boolean;
  readonly holdings: Readonly<Record<Role, Holdings>> | null;
  /** The ETH holder ended with both sides. */
  readonly ethHolderTookBoth: boolean;
  readonly summary: string;
}

/**
 * Who ends up with what once a scenario is final. This reads the end state and
 * the exposure flags, it does not move anything. When b was exposed or handed
 * to a relayer that is the counterparty, and the swap was refunded, the ETH
 * holder has a and b and so can take the XMR as well as the refunded ETH.
 */
export function summarizeOutcome(result: ScenarioResult): Outcome {
  const s = result.finalState;
  const none: Holdings = { eth: false, xmr: false };
  if (s.phase !== "Claimed" && s.phase !== "Refunded" && s.phase !== "Aborted") {
    return { final: false, holdings: null, ethHolderTookBoth: false, summary: `Swap is still ${s.phase}. Funds are locked.` };
  }

  if (s.phase === "Aborted") {
    return {
      final: true,
      holdings: { ethHolder: { eth: true, xmr: false }, xmrHolder: { eth: false, xmr: true } },
      ethHolderTookBoth: false,
      summary: "Aborted before any lock. Each side keeps its own funds.",
    };
  }

  if (s.phase === "Claimed") {
    let ethHolder: Holdings = none;
    let xmrHolder: Holdings = { eth: true, xmr: false };
    let text = "XMR holder took the ETH.";
    if (s.xmr === "SweptByEthHolder") {
      ethHolder = { eth: false, xmr: true };
      text += " ETH holder swept the XMR.";
    } else if (s.xmr === "Confirmed") {
      ethHolder = { eth: false, xmr: true };
      text += " The XMR is spendable by the ETH holder with a and b.";
    } else if (s.xmr === "NotLocked") {
      xmrHolder = { eth: true, xmr: true };
      text += " No XMR was ever locked, so the XMR holder keeps the XMR too and the ETH holder lost the ETH.";
    } else {
      text += " The XMR lock is not confirmed yet, so nobody can spend it for now.";
    }
    return { final: true, holdings: { ethHolder, xmrHolder }, ethHolderTookBoth: false, summary: text };
  }

  const relayed = result.claimRoute === "relayed-by-counterparty";
  const knows = result.bExposed || relayed;
  const recovered = s.xmr === "RecoveredByXmrHolder";
  if (knows && !recovered && s.xmr !== "NotLocked") {
    const why = relayed ? "the relayer is the counterparty and held b" : "a reverted claim exposed b";
    return {
      final: true,
      holdings: { ethHolder: { eth: true, xmr: true }, xmrHolder: none },
      ethHolderTookBoth: true,
      summary: `Refunded, and ${why}. The ETH holder has a and b, so it keeps the refunded ETH and can sweep the XMR. The XMR holder is left with nothing unless they recover first.`,
    };
  }
  return {
    final: true,
    holdings: { ethHolder: { eth: true, xmr: false }, xmrHolder: { eth: false, xmr: true } },
    ethHolderTookBoth: false,
    summary: recovered
      ? "Refunded. ETH holder has the ETH back and the XMR holder recovered the XMR."
      : s.xmr === "NotLocked"
        ? "Refunded. ETH holder has the ETH back. No XMR was locked, so the XMR holder still has the XMR."
        : "Refunded. ETH holder has the ETH back and the XMR is recoverable by the XMR holder.",
  };
}
