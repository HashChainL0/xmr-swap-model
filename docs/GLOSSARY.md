# Glossary

> Research model. Not a working swap. These are the terms the code and the other pages use, in the same words as the [spec](https://github.com/HashChainL0/protocol-spec).

| Term | Meaning in this model |
| --- | --- |
| ETH holder | The party that starts with ETH and wants XMR. Locks first in `eth-to-xmr`, and is the party that signals ready |
| XMR holder | The party that starts with XMR and wants ETH. Locks second and claims the ETH |
| Joint address | The Monero address that holds the locked XMR. Spending it needs both secrets, `a` and `b` |
| Adaptor secret | The secret `b`. It is published by the claim transaction, which is why a claim that fails after being broadcast still leaks it |
| `a` | The ETH holder's secret half. It is published by the refund |
| `T0` | Offset from the ETH lock after which the ETH holder can no longer signal ready |
| `T1` | Offset from the ETH lock after which the claim is no longer valid (unless `lateClaimAllowed` is set) and the refund opens. `T1 - T0` is the claim window |
| Ready | The signal from the ETH holder that the XMR lock reached the required confirmations. It opens the claim window |
| Claim | The XMR holder takes the ETH and publishes `b` |
| Refund | The ETH holder takes the ETH back and publishes `a` |
| Claim safety margin | The span before `T1` in which a claim should not be broadcast, because inclusion could slip past `T1` while `b` is already visible |
| Zone | The classification of a claim time: `safe`, `unsafe-margin` or `late` |
| Gas drip | A small amount of gas money sent to a fresh zero balance address so the user can pay for their own claim |
| Relayed claim | A claim submitted by someone else. If that someone is the counterparty, it is always unsafe, see [CLAIM-SAFETY.md](CLAIM-SAFETY.md) |
| Chain profile | Plain data describing a swap contract chain: block time, claim inclusion blocks, poll time and whether a data posting fee counts against the gas limit |
| Corridor | A direct ETH<>XMR pair on one chain profile, see [CORRIDORS.md](CORRIDORS.md) |
| Data posting component | The part of the gas used that pays for posting transaction data to a lower layer. It moves with outside prices, so a fixed gas limit can start to fail |
| Detection latency | How late a watcher that polls event logs can see an event. One worst case poll is added each time a party must notice something before acting |
| Clock skew | Allowed difference between a party's clock and contract time |
| Congestion factor | A multiplier of at least 1 applied to claim inclusion time for a busy period |

All numbers in the model are placeholders. See [PARAMETERS.md](PARAMETERS.md).
