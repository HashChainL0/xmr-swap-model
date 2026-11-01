# FAQ

Short answers to questions people ask about this model. Longer explanations live in the other documents in this folder.

## Is this a swap client?

No. It is a research model. It simulates the swap state machine, the two deadlines and the claim safety rule so the numbers can be argued about in public. It holds no keys, talks to no chain and moves no funds.

## Why are there two deadlines?

`T0` is the last moment the ETH holder can signal ready. Until it does, the swap stays in `Funded` and the ETH holder can refund at any time. `T1` closes the claim window: after a ready signal the XMR holder must claim before `T1`, and from `T1` on the ETH holder can refund. Both are set when the ETH is locked. See [PARAMETERS.md](PARAMETERS.md).

## Where do the default numbers come from?

They are placeholders chosen to be plausible. None of them is a recommendation. The real values are open research, tracked in [protocol-spec issue #5](https://github.com/HashChainL0/protocol-spec/issues/5) and in [HIP-3](https://github.com/HashChainL0/hips/blob/main/hips/hip-0003.md). [WALKTHROUGH.md](WALKTHROUGH.md) shows how the defaults turn into a plan.

## Why is a claim late in the window unsafe?

A claim publishes the secret `b` on the contract chain. A claim broadcast too close to `T1` can miss the deadline and fail, yet still have published `b`. The ETH holder could then refund the ETH and sweep the XMR. The simulator flags claims inside the safety margin as unsafe. See [CLAIM-SAFETY.md](CLAIM-SAFETY.md).

## Can a swap start on one network and finish on another?

No. Each corridor keeps the whole swap on one network: Robinhood Chain, Base or Ethereum. There is no bridging step. See [CORRIDORS.md](CORRIDORS.md) and [HIP-5](https://github.com/HashChainL0/hips/blob/main/hips/hip-0005.md).

## Why does the layer 2 profile matter?

On a layer 2 the claim can need more gas than expected because of data posting costs, and block times differ from Ethereum. The model keeps a separate profile so the claim window is sized for the network it runs on.

## How do I propose different numbers?

Open an issue with the inputs you would change and why, or a pull request that changes the profile and the tests that depend on it. Changes to the protocol itself go through the [HIP process](https://github.com/HashChainL0/hips).
