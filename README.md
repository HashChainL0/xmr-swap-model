# xmr-swap-model

![CI](https://github.com/HashChainL0/xmr-swap-model/actions/workflows/ci.yml/badge.svg)

A small reference model of the ETH and XMR atomic swap described in the [Hash Chain protocol spec](https://github.com/HashChainL0/protocol-spec). It has a pure swap state machine, a timelock calculator and a scripted scenario runner, so the rules in the spec can be run, tested and argued about.

> **Research model. Not a working swap. Do not use with funds.** This code holds no keys, runs no cryptography, and touches no network, RPC or wallet. It models states, events and deadlines only. Nothing here is audited or deployed. Parameters are placeholders.

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
| `src/simulate.ts` | Scenario runner with a fake clock |
| `src/scenarios.ts` | The three bundled scenarios |
| `examples/` | Runnable happy path, refund and punish traces |
| `test/` | Vitest suites |
| `docs/STATE-MACHINE.md` | Diagram, transition table, modelling choices |
| `docs/PARAMETERS.md` | Timelock math and constraints |

## Spec

- [11 Monero connection](https://github.com/HashChainL0/protocol-spec/blob/main/docs/11-connection-monero.md)
- [05 Private swaps](https://github.com/HashChainL0/protocol-spec/blob/main/docs/05-private-swaps.md)

## Open questions

- Timeout lengths and confirmation counts. Every default here is a guess, tracked in [protocol-spec issue #5](https://github.com/HashChainL0/protocol-spec/issues/5), "Research: timelock and refund parameters for Monero atomic swaps".
- Whether a claim at or after T1 is valid until the refund lands. The spec text can be read both ways, see [docs/STATE-MACHINE.md](docs/STATE-MACHINE.md).
- Griefing: the spec has no bond, so a silent counterparty can only cost the other side time. The model has no punishment beyond a failed swap.
- The cross-curve equality proof, counterparty discovery and private funding of the lock are out of scope here and open in the spec.

## Contributing

Issues and discussion are welcome, especially ones that find a state the model gets wrong. Code contributions are not accepted for now. See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [SECURITY.md](SECURITY.md). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Links

- GitHub: https://github.com/HashChainL0
- Spec: https://github.com/HashChainL0/protocol-spec

## License

Copyright (c) 2026 Hash Chain. All rights reserved. The source is published for reference and review only, and no permission is granted to copy, modify, distribute, sublicense or use it without prior written permission. See [LICENSE](LICENSE). The protocol spec it models is licensed separately under CC BY 4.0. The Hash Chain name and logo are covered separately in the brand kit.
