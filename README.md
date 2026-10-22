# xmr-swap-model

![CI](https://github.com/HashChainL0/xmr-swap-model/actions/workflows/ci.yml/badge.svg)

A small reference model of the ETH and XMR atomic swap described in the [Hash Chain protocol spec](https://github.com/HashChainL0/protocol-spec). It has a pure swap state machine, timelock and gas limit calculators and a scripted scenario runner, for both directions of the swap, so the rules in the spec can be run, tested and argued about.

> **Research model. Not a working swap. Do not use with funds.** This code holds no keys, runs no cryptography, and touches no network, RPC or wallet. It models states, events and deadlines only. Nothing here is audited or deployed. Parameters are placeholders.

## What's new in 0.2.0

- **Both directions.** `eth-to-xmr` (user holds ETH, operator holds XMR) and `xmr-to-eth` (user holds XMR, operator holds ETH). The ETH holder always locks first and the XMR holder always locks second. Each direction has a happy path, a refund and three walk-away cases, with a report of who has funds locked and for how long.
- **Claim safety.** A claim that lands close to or after the second timeout can revert and still reveal the secret. The swap terms take a safety margin and the simulator flags an unsafe claim. A scenario shows the leak outcome when the rule is ignored.
- **Gas drip.** In `xmr-to-eth` the user claims into a fresh zero balance address. The operator drips a little gas at the ready step so the user claims for themselves. A claim relayed by the counterparty is shown as unsafe.
- **Calculators.** A layer 2 gas limit calculator (execution gas, data posting component, safety multiplier) that shows why fixed gas limits fail, and a window calculator with Monero confirmations and variance, event detection latency and clock skew. Chain profiles are plain data with illustrative defaults.
- **License.** All rights reserved, see [License](#license).

### Safety rules the model checks

1. The ETH holder locks first, the XMR holder second. Neither direction changes that.
2. Do not broadcast a claim inside the safety margin before `T1`. A claim that misses `T1` can fail and still publish the secret. See [docs/CLAIM-SAFETY.md](docs/CLAIM-SAFETY.md).
3. The claimer submits their own claim. Do not hand the claim secret to a relayer who is the counterparty.
4. Where the user's receiving address has no gas, the counterparty may send gas only, never take over the claim.
5. Do not use a fixed gas limit on a chain with a data posting fee. Recompute it from execution gas, the data component and a multiplier.

## Why

The Monero connection in the spec is prose and diagrams. Prose hides gaps, such as what exactly happens at T1 or whether ready can be signalled on a bad lock. A small executable model makes those cases concrete and gives reviewers something to break.

## Quickstart

Node 22 or newer.

```sh
npm install
npm run typecheck
npm test

npm run example:happy-path
npm run example:refund
npm run example:punish

npm run example:xmr-to-eth
npm run example:eth-to-xmr
npm run example:gas-drip
npm run example:unsafe-claim
npm run example:windows
```

Examples compile to `dist/` with `tsc` and run with plain `node`. There are no runtime dependencies.

```ts
import { createSwap, transition, computeTimelocks } from "./src/index.js";

const plan = computeTimelocks();
let swap = createSwap({
  ethAmountWei: 10n ** 18n,
  xmrAmountPiconero: 5n * 10n ** 12n,
  t0DurationSec: plan.t0Sec,
  t1DurationSec: plan.t1Sec,
  requiredConfirmations: 10,
  lateClaimAllowed: false,
});

const r = transition(swap, { type: "LockEth", by: "ethHolder" }, 0);
if (r.ok) swap = r.state;
```

## Terms

Taken from the spec: ETH holder (secret `a`, point `A`), XMR holder (secret `b`, point `B`), joint address, adaptor secret, `T0` and `T1`. States are `None`, `Funded`, `Ready`, `Claimed`, `Refunded`, plus `Aborted` for a swap dropped before any lock.

## Layout

| Path | Contents |
| --- | --- |
| `src/types.ts` | Roles, states, events, terms, trace types |
| `src/state-machine.ts` | Pure `transition(state, event, now)` |
| `src/timelocks.ts` | T0 and T1 calculator and constraint checks |
| `src/windows.ts` | Window calculator with detection latency and clock skew |
| `src/profiles.ts` | Chain profiles as plain data, illustrative defaults |
| `src/layer2.ts` | Gas limit calculator for a data posting component |
| `src/claim-safety.ts` | Claim classification and safety margin |
| `src/gas-drip.ts` | Gas drip amount and claim route assessment |
| `src/directions.ts` | Both directions, who has funds locked and for how long |
| `src/outcome.ts` | Who ends up with what |
| `src/simulate.ts` | Scenario runner with a fake clock |
| `src/scenarios.ts` | Bundled scenarios, three original and the per direction ones |
| `examples/` | Runnable traces and calculator output |
| `test/` | Vitest suites |
| `docs/STATE-MACHINE.md` | Diagram, transition table, both directions, modelling choices |
| `docs/PARAMETERS.md` | Timelock math, windows, profiles, gas limits |
| `docs/CLAIM-SAFETY.md` | The claim safety rule, gas drip and relayed claims |

## Spec

- [11 Monero connection](https://github.com/HashChainL0/protocol-spec/blob/main/docs/11-connection-monero.md)
- [05 Private swaps](https://github.com/HashChainL0/protocol-spec/blob/main/docs/05-private-swaps.md)

## Open questions

- Timeout lengths and confirmation counts. Every default here is a guess, tracked in [protocol-spec issue #5](https://github.com/HashChainL0/protocol-spec/issues/5), "Research: timelock and refund parameters for Monero atomic swaps".
- Whether a claim at or after T1 is valid until the refund lands. The spec text can be read both ways, see [docs/STATE-MACHINE.md](docs/STATE-MACHINE.md).
- Griefing: the spec has no bond, so a silent counterparty can only cost the other side time. The free option is explicit now: the ETH holder alone decides how long the XMR stays locked once both have locked. The model has no punishment beyond a failed swap.
- The cross-curve equality proof, counterparty discovery and private funding of the lock are out of scope here and open in the spec.

## Contributing

Issues and discussion are welcome, especially ones that find a state the model gets wrong. Code contributions are not accepted for now. See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [SECURITY.md](SECURITY.md). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Links

- GitHub: https://github.com/HashChainL0
- Spec: https://github.com/HashChainL0/protocol-spec

## License

Copyright (c) 2026 Hash Chain. All rights reserved. The source is published for reference and review only, and no permission is granted to copy, modify, distribute, sublicense or use it without prior written permission. See [LICENSE](LICENSE). The protocol spec it models is licensed separately under CC BY 4.0. The Hash Chain name and logo are covered separately in the brand kit.
