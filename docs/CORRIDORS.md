# Corridors

> Research model. Pre-launch, spec stage. Every number is an illustrative placeholder, not a measurement of any network.

## In short

A corridor is one ETH<>XMR pair read against one chain. The model has three, in priority order:

| Order | Corridor | Profile | Directions |
| --- | --- | --- | --- |
| 1 | Robinhood Chain, ETH<>XMR | `layer-2-rollup` | `eth-to-xmr`, `xmr-to-eth` |
| 2 | Base, ETH<>XMR | `layer-2-rollup` | `eth-to-xmr`, `xmr-to-eth` |
| 3 | Ethereum mainnet, ETH<>XMR | `ethereum-l1` | `eth-to-xmr`, `xmr-to-eth` |

The data is in `src/corridors.ts`. Run `npm run example:corridors`.

## Direct only

A corridor is direct. The swap is held on that one chain and never routes through another chain. There is no bridging step between corridors, so a corridor needs exactly one chain profile and its windows are not a sum over two chains. A user who holds ETH on one chain and wants XMR uses that chain's corridor.

The state machine, the roles and the safety rules are the same in every corridor. The ETH holder locks first, the XMR holder second, and a claim is never broadcast inside the safety margin before `T1`. Only the chain side parameters change.

## What changes between corridors

The chain side inputs come from the profile in `src/profiles.ts`: block time, claim inclusion blocks, worst case event poll, and whether a data posting fee counts against the gas limit. They change three results:

- Block alignment. `T0` and the claim window are rounded up to whole blocks of the corridor's chain.
- The claim safety margin. It is built from inclusion blocks, block time, congestion, detection latency and clock skew.
- The claim gas limit. Where a data posting component counts against the limit, a fixed limit can start failing with no change to the contract. See [PARAMETERS.md](PARAMETERS.md).

The Monero side does not change between corridors.

## Profile assignment is an assumption

The corridor to profile mapping only selects a set of placeholder numbers. It says nothing measured about Robinhood Chain, Base or Ethereum. The first two use the layer 2 profile because the model needs a case where a data posting component counts against the gas limit. Replace the mapping with measured values per chain before reading anything into the output. Measurement is open research, see the profile note in [PARAMETERS.md](PARAMETERS.md).

## Use

```ts
import { corridorList, corridorWindows } from "./src/index.js";

for (const c of corridorList()) {
  const w = corridorWindows(c.id);
  console.log(c.order, c.label, w.t0Sec, w.t1Sec, w.claimSafetyMarginSec);
}
```

`corridorWindows(id, overrides)` takes the same optional inputs as `recommendWindows`, except the profile, which the corridor supplies.
