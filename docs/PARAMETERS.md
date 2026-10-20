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

## What this does not cover

- Chain halts and censorship on the contract side. The spec notes a long halt may cause a refund instead of a claim.
- How the margins should be chosen for real users. That is the research question.
- Any link between these windows and a griefing bond or watchtower design.
