/**
 * Timelock calculator. Every default here is a placeholder. The real values
 * are open research, see protocol-spec issue #5.
 */
export interface TimelockConfig {
  /** Block time of the chain that runs the swap contract. */
  readonly ethSideBlockTimeSec: number;
  readonly moneroBlockTimeSec: number;
  /** Blocks before Monero outputs become spendable. */
  readonly moneroLockBlocks: number;
  /** Confirmations the ETH holder waits for before signalling ready. */
  readonly requiredConfirmations: number;
  /** Monero blocks are random in time, so n blocks can take longer than n * 120 s. */
  readonly moneroBlockVarianceFactor: number;
  /** Time for the XMR holder to see the ETH lock and broadcast the XMR lock. */
  readonly counterpartyLockAllowanceSec: number;
  /** Time the ETH holder may be offline before T0 and still signal ready. */
  readonly ethHolderOnlineMarginSec: number;
  /** Time the XMR holder may be offline between ready and T1 and still claim. */
  readonly xmrHolderOnlineMarginSec: number;
  /** Swap contract blocks allowed for the claim transaction to be included. */
  readonly claimInclusionBlocks: number;
}

export const DEFAULT_TIMELOCK_CONFIG: TimelockConfig = {
  ethSideBlockTimeSec: 12,
  moneroBlockTimeSec: 120,
  moneroLockBlocks: 10,
  requiredConfirmations: 10,
  moneroBlockVarianceFactor: 2,
  counterpartyLockAllowanceSec: 3600,
  ethHolderOnlineMarginSec: 4 * 3600,
  xmrHolderOnlineMarginSec: 6 * 3600,
  claimInclusionBlocks: 20,
};

export interface TimelockComponent {
  readonly name: string;
  readonly seconds: number;
  readonly explanation: string;
}

export interface TimelockPlan {
  readonly config: TimelockConfig;
  /** Seconds from the ETH lock to T0. */
  readonly t0Sec: number;
  /** Seconds from the ETH lock to T1. */
  readonly t1Sec: number;
  readonly t0Blocks: number;
  readonly t1Blocks: number;
  readonly components: readonly TimelockComponent[];
}

export interface TimelockCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly explanation: string;
}

export interface TimelockReport {
  readonly valid: boolean;
  readonly checks: readonly TimelockCheck[];
}

export function resolveConfig(partial: Partial<TimelockConfig> = {}): TimelockConfig {
  const config = { ...DEFAULT_TIMELOCK_CONFIG, ...partial };
  const positive: (keyof TimelockConfig)[] = [
    "ethSideBlockTimeSec",
    "moneroBlockTimeSec",
    "moneroLockBlocks",
    "requiredConfirmations",
    "moneroBlockVarianceFactor",
    "claimInclusionBlocks",
  ];
  const nonNegative: (keyof TimelockConfig)[] = [
    "counterpartyLockAllowanceSec",
    "ethHolderOnlineMarginSec",
    "xmrHolderOnlineMarginSec",
  ];
  for (const k of positive) {
    if (!Number.isFinite(config[k]) || config[k] <= 0) throw new RangeError(`${k} must be a positive number`);
  }
  for (const k of nonNegative) {
    if (!Number.isFinite(config[k]) || config[k] < 0) throw new RangeError(`${k} must be a non-negative number`);
  }
  for (const k of ["moneroLockBlocks", "requiredConfirmations", "claimInclusionBlocks"] as const) {
    if (!Number.isInteger(config[k])) throw new RangeError(`${k} must be an integer`);
  }
  return config;
}

const roundUpToBlocks = (sec: number, blockSec: number): number => Math.ceil(sec / blockSec) * blockSec;

/** Shortest T0 that still covers the lock allowance and the confirmation wait. */
export function minimumT0Sec(c: TimelockConfig): number {
  return c.counterpartyLockAllowanceSec + c.requiredConfirmations * c.moneroBlockTimeSec * c.moneroBlockVarianceFactor;
}

/** Shortest T1 - T0 that still covers the claim window. */
export function minimumClaimWindowSec(c: TimelockConfig): number {
  return c.xmrHolderOnlineMarginSec + c.claimInclusionBlocks * c.ethSideBlockTimeSec;
}

export function computeTimelocks(partial: Partial<TimelockConfig> = {}): TimelockPlan {
  const c = resolveConfig(partial);
  const confirmWait = c.requiredConfirmations * c.moneroBlockTimeSec * c.moneroBlockVarianceFactor;
  const t0Raw = c.counterpartyLockAllowanceSec + confirmWait + c.ethHolderOnlineMarginSec;
  const t0Sec = roundUpToBlocks(t0Raw, c.ethSideBlockTimeSec);
  const claimWindow = roundUpToBlocks(minimumClaimWindowSec(c), c.ethSideBlockTimeSec);
  const t1Sec = t0Sec + claimWindow;
  return {
    config: c,
    t0Sec,
    t1Sec,
    t0Blocks: t0Sec / c.ethSideBlockTimeSec,
    t1Blocks: t1Sec / c.ethSideBlockTimeSec,
    components: [
      {
        name: "counterpartyLockAllowance",
        seconds: c.counterpartyLockAllowanceSec,
        explanation: "Time for the XMR holder to see the ETH lock, check the terms and broadcast the XMR lock. Part of T0.",
      },
      {
        name: "confirmationWait",
        seconds: confirmWait,
        explanation: `${c.requiredConfirmations} Monero confirmations at ${c.moneroBlockTimeSec} s per block, scaled by ${c.moneroBlockVarianceFactor} for block time variance. Part of T0.`,
      },
      {
        name: "ethHolderOnlineMargin",
        seconds: c.ethHolderOnlineMarginSec,
        explanation: "Slack so an ETH holder who is briefly offline can still signal ready before T0. Part of T0.",
      },
      {
        name: "claimWindow",
        seconds: claimWindow,
        explanation: `Between ready and T1: the XMR holder's online margin plus ${c.claimInclusionBlocks} blocks of ${c.ethSideBlockTimeSec} s for inclusion. This is T1 - T0.`,
      },
    ],
  };
}

export function validateTimelocks(
  t0Sec: number,
  t1Sec: number,
  partial: Partial<TimelockConfig> = {},
): TimelockReport {
  const c = resolveConfig(partial);
  const checks: TimelockCheck[] = [];
  const add = (id: string, pass: boolean, passMsg: string, failMsg: string): void => {
    checks.push({ id, ok: pass, explanation: pass ? passMsg : failMsg });
  };

  const finite = Number.isFinite(t0Sec) && Number.isFinite(t1Sec) && t0Sec > 0 && t1Sec > 0;
  add("positive", finite, "T0 and T1 are positive.", "T0 and T1 must be positive finite numbers of seconds.");
  if (!finite) return { valid: false, checks };

  add(
    "ordering",
    t1Sec > t0Sec,
    "T1 is later than T0.",
    `T1 (${t1Sec} s) must be later than T0 (${t0Sec} s), otherwise there is no claim window between ready and refund.`,
  );

  const minT0 = minimumT0Sec(c);
  add(
    "t0-covers-confirmations",
    t0Sec >= minT0,
    `T0 covers the lock allowance and ${c.requiredConfirmations} confirmations (needs ${minT0} s).`,
    `T0 (${t0Sec} s) is shorter than the ${minT0} s needed for the XMR lock to be broadcast and reach ${c.requiredConfirmations} confirmations. The ETH holder could not signal ready in time on a valid lock.`,
  );

  add(
    "confirmations-cover-unlock",
    c.requiredConfirmations >= c.moneroLockBlocks,
    `${c.requiredConfirmations} confirmations are at least the ${c.moneroLockBlocks} blocks Monero needs to make an output spendable.`,
    `${c.requiredConfirmations} confirmations is below the ${c.moneroLockBlocks} blocks before a Monero output is spendable. A sweep could fail after ready.`,
  );

  const unlockSec = c.moneroLockBlocks * c.moneroBlockTimeSec * c.moneroBlockVarianceFactor;
  add(
    "t1-covers-unlock",
    t1Sec >= unlockSec,
    `T1 is later than the expected ${unlockSec} s for the Monero lock to unlock.`,
    `T1 (${t1Sec} s) is earlier than the expected ${unlockSec} s for the Monero lock to unlock. A refund could be reachable before the XMR is spendable.`,
  );

  const minWindow = minimumClaimWindowSec(c);
  add(
    "claim-window",
    t1Sec - t0Sec >= minWindow,
    `The claim window of ${t1Sec - t0Sec} s covers the required ${minWindow} s.`,
    `The claim window T1 - T0 (${t1Sec - t0Sec} s) is shorter than the required ${minWindow} s. The XMR holder may not get a claim included.`,
  );

  const aligned = t0Sec % c.ethSideBlockTimeSec === 0 && t1Sec % c.ethSideBlockTimeSec === 0;
  add(
    "block-aligned",
    aligned,
    `T0 and T1 are whole multiples of the ${c.ethSideBlockTimeSec} s block time.`,
    `T0 and T1 should be whole multiples of the ${c.ethSideBlockTimeSec} s block time so the deadlines fall on block boundaries.`,
  );

  return { valid: checks.every((k) => k.ok), checks };
}
