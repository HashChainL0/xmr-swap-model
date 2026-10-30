# Threat notes

> Research model. Not a working swap. This page lists the failure shapes the model can show, which scenario or helper shows each, and what the model leaves out. It is not a security analysis and it is not an audit. Please report mismatches with the spec as an issue.

## Shapes the model can show

| Shape | Who is hurt | Where to see it |
| --- | --- | --- |
| Second locker never locks | The first locker, by waiting. Funds return on refund | `grief-abandoned-lock` in `directionScenarios` |
| Free option: both locked, the ETH holder stalls | The XMR holder, whose XMR stays locked until the ETH holder refunds and publishes `a` | `grief-free-option` |
| Ready, the XMR holder never claims | The ETH holder waits until `T1`, then refunds | `grief-no-claim`, and `punish` |
| Claim broadcast inside the safety margin | The XMR holder. The claim can miss `T1` and still show `b` | `claim-in-margin` in `claimSafetyScenarios` |
| Claim after `T1` | The XMR holder. The claim is rejected, `b` is visible, the ETH holder refunds and sweeps | `claim-after-deadline-leak` |
| Relayed claim by the counterparty | The XMR holder. The relayer holds `b` and can wait past `T1` | `relayedClaimByCounterparty`, `relayerCounterpartyOutcome` |
| Claim into a zero balance address | The XMR holder, who cannot pay for the claim | `assessClaimRoute` with `self`, and the `gas-drip` example |
| Fixed gas limit on a chain with a data posting fee | The XMR holder. The claim can start failing with no change to the contract | `checkFixedLimit`, `sweepDataPosting` |
| Event detected late | Either side. A watcher that polls sees an event up to one poll late | `recommendWindows` adds the latency to both windows |

## What the model assumes

- Both sides follow the transition table. An invalid event is rejected, it is not simulated as an attack.
- Time is an input. There is no clock, no reordering and no mempool, so a front-run is described in prose and not simulated.
- The only privacy-relevant fact tracked is whether `b` or `a` became readable. Nothing else is revealed or hidden.
- Every number is a placeholder. A pass in the model is not evidence that a real parameter is safe.

## What the model leaves out

- Cryptography. There are no keys, adaptor signatures or proofs, only the state they would move.
- Real chain behavior: reorgs, fee markets, censorship and sequencer outages.
- Bonds, penalties and griefing economics. The spec has none, see the list of what is not covered at the end of [PARAMETERS.md](PARAMETERS.md).
- Network level attacks on the watcher, and the user interface.
- Anything about the Monero side beyond confirmations and the unlock delay.

## Reading a result

A `valid: true` timelock report only says the constraints in the model hold for the numbers given. A scenario that ends in `Claimed` only says the sequence was accepted by the state machine. Neither says a deployment would be safe. See [CLAIM-SAFETY.md](CLAIM-SAFETY.md) for the one rule the model argues for, and [STATE-MACHINE.md](STATE-MACHINE.md) for the open reading of a late claim.
