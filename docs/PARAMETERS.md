# Parameters

The spec gives `T0` and `T1` as symbols and the confirmation count as "to be specified". Every number in this repository is a placeholder. The real values are open research, tracked in [protocol-spec issue #5](https://github.com/HashChainL0/protocol-spec/issues/5).

Both deadlines run on swap contract time, which the spec says is Hash Chain time. The model calls the contract chain's block time `ethSideBlockTimeSec` and defaults it to 12 s as a stand-in.

## Inputs

| Name | Default | Meaning |
| --- | --- | --- |
| `ethSideBlockTimeSec` | 12 | Block time of the chain running the swap contract |
| `moneroBlockTimeSec` | 120 | Target Monero block time |
| `moneroLockBlocks` | 10 | Blocks before a Monero output is spendable |
| `requiredConfirmations` | 10 | Confirmations before the ETH holder signals ready |
| `moneroBlockVarianceFactor` | 2 | Multiplier for Monero block times being random |
| `counterpartyLockAllowanceSec` | 3600 | Time for the XMR holder to see the ETH lock and broadcast the XMR lock |
| `ethHolderOnlineMarginSec` | 14400 | Slack for an offline ETH holder before T0 |
| `xmrHolderOnlineMarginSec` | 21600 | Slack for an offline XMR holder before T1 |
| `claimInclusionBlocks` | 20 | Contract blocks allowed for the claim to be included |

## Math

```
confirmationWait = requiredConfirmations * moneroBlockTimeSec * moneroBlockVarianceFactor
T0 = ceil_to_block(counterpartyLockAllowance + confirmationWait + ethHolderOnlineMargin)
claimWindow = ceil_to_block(xmrHolderOnlineMargin + claimInclusionBlocks * ethSideBlockTimeSec)
T1 = T0 + claimWindow
```

With the defaults: confirmation wait 2400 s, T0 20400 s (5.67 h), claim window 21840 s, T1 42240 s (11.73 h).

## Constraints

`validateTimelocks(t0, t1, config)` returns one entry per constraint, each with an explanation.

| Id | Constraint | Why |
| --- | --- | --- |
| `positive` | T0 and T1 are positive and finite | Basic sanity |
| `ordering` | T1 > T0 | Without a window between them, Ready could never be claimed before it can be refunded |
| `t0-covers-confirmations` | T0 >= lock allowance + confirmation wait | The ETH holder must be able to signal ready on a valid lock before T0 |
| `confirmations-cover-unlock` | requiredConfirmations >= moneroLockBlocks | A Monero output is not spendable before the lock blocks pass, so a sweep after ready could fail |
| `t1-covers-unlock` | T1 >= moneroLockBlocks * moneroBlockTimeSec * variance | A refund should not be reachable before the Monero lock can be spent |
| `claim-window` | T1 - T0 >= xmrHolderOnlineMargin + inclusion time | The XMR holder needs time to notice ready and get a claim included |
| `block-aligned` | T0 and T1 are multiples of the block time | Deadlines fall on block boundaries |

## Detection latency, clock skew and recommended windows

`recommendWindows` builds on the same idea and adds three things the plain calculator leaves out. Every default is an illustrative placeholder.

- Monero confirmations times block time, scaled by a variance factor, as before.
- Event detection latency. A watcher that polls event logs sees an event up to one poll late, and slow log reads can make a poll take about 30 s. One worst case poll is added each time a party has to notice something before acting: two before ready (the XMR holder sees the ETH lock, the ETH holder sees the last confirmation) and one in the claim window (the XMR holder sees ready).
- Clock skew allowance. Added to `T0` and to the claim window.

```
T0 = ceil_to_block(lockAllowance + confirmationWait + 2 * poll + skew + ethHolderOnlineMargin)
claimWindow = ceil_to_block(xmrHolderOnlineMargin + poll + skew + claimSafetyMargin)
T1 = T0 + claimWindow
```

The result lists every component, a `claimSafetyMarginSec` and a `latestSafeClaimSec`, and runs the checks above on the recommended `T0` and `T1`. Run `npm run example:windows`.

## Chain profiles

Profiles are plain data in `src/profiles.ts`: `ethereum-l1` and `layer-2-rollup`. Each has a block time, claim inclusion blocks, a worst case event poll, whether a data posting fee counts against the gas limit, and an illustrative range for that fee in gas units. The values are labelled illustrative in the profile itself. Nothing here is measured from a network.

## Layer 2 gas limits

Some chains charge a data posting component, the cost of publishing the transaction data to a lower layer. When that component is charged inside the gas a transaction uses, a gas limit has to cover it, and it moves with conditions the contract does not control.

```
recommended gas limit = ceil((execution gas + data posting gas) * safety multiplier)
```

A fixed limit tuned before the component existed passes while the component is small and fails once it grows, with no change to the contract. `checkFixedLimit` reports the data component above which a fixed limit fails, and `sweepDataPosting` walks a fixed limit and the recommended limit across rising components. On a profile that does not charge the component inside gas, `recommendForProfile` ignores it.

The same recommended limit feeds the claim gas drip, see [CLAIM-SAFETY.md](CLAIM-SAFETY.md).

## What this does not cover

- Chain halts and censorship on the contract side. The spec notes a long halt may cause a refund instead of a claim.
- How the margins should be chosen for real users. That is the research question.
- Real latency, congestion and fee behaviour on any network. All profile numbers are placeholders.
- Any link between these windows and a griefing bond or watchtower design.
