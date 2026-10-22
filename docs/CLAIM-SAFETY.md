# Claim safety

Research model. Not a working swap. This page explains one rule the model enforces in its simulator and why it exists. Every number is illustrative.

## The problem

The claim is the step that publishes the secret `b`. The XMR holder claims the ETH, and the claim transaction carries `b` so the ETH holder can sweep the XMR.

Whether a claim is valid depends on `T1`. Under the strict reading in [STATE-MACHINE.md](STATE-MACHINE.md) a claim at or after `T1` is rejected. But a transaction that is broadcast before `T1` can be included after it. When that happens the contract rejects it, the transaction reverts, and `b` is still readable:

- in the pending transaction before it is included,
- in the data of the reverted transaction afterwards.

So a claim that lands too close to `T1`, or after it, can fail and still reveal `b`.

## What the counterparty does with a leaked b

After `T1` the ETH holder can refund, which publishes `a`. If the ETH holder also read `b` from the failed claim, it now holds `a` and `b`, which are the two halves needed to spend the joint address. It keeps the refunded ETH and sweeps the XMR. The XMR holder is left with nothing, unless they recover the XMR first.

The contract cannot prevent this, because it never sees who read what.

## The rule

Do not broadcast a claim inside a safety margin before `T1`.

```
latest safe claim time = T1 - claimSafetyMargin
```

The model classifies every claim attempt:

| Zone | When | Meaning |
| --- | --- | --- |
| `safe` | before `T1 - margin` | Inclusion has room to slip without crossing `T1` |
| `unsafe-margin` | from `T1 - margin` up to `T1` | May revert if inclusion slips. A claim that happens to land is still flagged |
| `late` | at or after `T1` | Rejected (or racing the refund), and `b` is exposed either way |

Set the margin with `claimSafetyMarginSec` in the swap terms. It must be non-negative and shorter than the claim window `T1 - T0`, so a safe claim time always exists after `T0`. The state machine itself does not change: the margin never rejects a claim that the contract rules would accept. It is the simulator that flags it, because the harm of an unsafe claim is not visible to the contract.

## Sizing the margin

`recommendClaimSafetyMargin` adds three parts and rounds up to whole blocks:

```
margin = inclusionBlocks * blockTime * congestionFactor + detectionLatency + clockSkew
```

- Inclusion: how long a claim usually needs, scaled for a congested period.
- Detection latency: how long the claimer takes to learn the claim landed or is still pending. Slow log reads can make one poll take up to about 30 s.
- Clock skew: how far the claimer's clock may differ from contract time.

With the illustrative defaults (20 blocks of 12 s, factor 1.5, 30 s detection, 30 s skew) the margin is 420 s. These are placeholders, not measurements.

## Scenarios

`claimSafetyScenarios(direction)` returns three cases for either direction:

- `claim-with-margin`: claim just outside the margin. Not flagged.
- `claim-in-margin`: claim inside the margin. It lands in time and succeeds, and the simulator flags it as unsafe.
- `claim-after-deadline-leak`: the rule is ignored. The claim lands after `T1`, is rejected, and `b` is exposed. The ETH holder refunds and holds both sides. The trace shows `UNSAFE CLAIM` and `LEAK`, and the outcome line says the ETH holder took both.

Run `npm run example:unsafe-claim`.

What counts as a leak in the simulator: a rejected claim with `DEADLINE_PASSED`, or a claim after the refund (`INVALID_PHASE` in `Refunded`). A claim rejected for the wrong role or before ready is not counted, since an honest claimer would not have broadcast it.

## Who needs gas to claim

In `xmr-to-eth` the user is the XMR holder and claims the ETH. If the receiving address is fresh with a zero balance, the user cannot pay for the claim. There are two ways out, and one of them is unsafe.

### Gas drip (safe)

The operator sends a small amount of gas to the user's address at the ready step. The user then claims with their own transaction. `b` never leaves the user until the claim itself publishes it, and the operator controls no timing.

`recommendedDripWei` computes the amount: gas limit times max fee per gas times a fee buffer, rounded up. The gas limit comes from the layer 2 calculator in [PARAMETERS.md](PARAMETERS.md), so the drip still covers a claim when a data posting component grows. The drip does not need to be large, and a drip that is too small leaves the claim blocked, which the model reports.

### Relayed claim by the counterparty (unsafe)

The user hands `b` to the operator, who submits the claim. The operator is the party who benefits from a refund. It holds `b`, so it can wait past `T1`, refund, and use `a` and `b` to take the XMR. It ends with both sides. Nothing in the contract stops this and nothing forces the operator to submit.

`assessClaimRoute` marks this route `unsafe` even when everything is funded. `relayerCounterpartyOutcome` shows the two cases: submit before `T1` and the swap completes, but only by the relayer's choice, or hold `b` to `T1` or longer and take both sides. A rational counterparty relayer holds.

A relayer that is not the counterparty and gains nothing from a refund is a different case. The model does not claim it is safe either. It only shows that when the relayer is the counterparty, the user's secret is in the hands of the one party who profits from failure.

Run `npm run example:gas-drip`.

## What this does not cover

- No transaction is built or sent. Every figure is arithmetic on numbers the caller supplies.
- Mempool visibility, private submission paths and reorgs are not modelled. The model only says that a failed claim exposes `b`.
- The gas drip links the receiving address to the swap for the operator, who is a party to the swap anyway. Privacy of the receiving address beyond that is out of scope.
- `eth-to-xmr` has no gas drip question, because the user holds ETH and the operator, as XMR holder, is the one claiming.
