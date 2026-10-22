# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions describe the state of the model, not a deployed protocol.

## [0.2.0] - 2026-10-22

### Added

- Both swap directions, `eth-to-xmr` and `xmr-to-eth`, with explicit roles: the ETH holder locks first and the XMR holder locks second. Per direction scenarios for the happy path, refund, an abandoned lock, the free option stall and a missing claim, plus a report of who has funds locked and for how long.
- Claim safety: optional `claimSafetyMarginSec` in the swap terms, a claim classification (`safe`, `unsafe-margin`, `late`), simulator flags for unsafe claims and exposed secrets, and a scenario showing the leak outcome when the rule is ignored.
- Outcome summary of who ends up with what, including the case where the ETH holder ends with both sides.
- Gas drip assessment for a claim into a fresh zero balance address, and a relayed claim by the counterparty shown as unsafe.
- Layer 2 gas limit calculator (execution gas, data posting component, safety multiplier) and a fixed limit sweep showing how a fixed limit fails.
- Window calculator with Monero confirmations and variance, event detection latency and clock skew, and chain profiles `ethereum-l1` and `layer-2-rollup` as plain data with illustrative defaults.
- Examples `xmr-to-eth`, `eth-to-xmr`, `gas-drip`, `unsafe-claim` and `windows`, and matching npm scripts.
- `docs/CLAIM-SAFETY.md`, and both directions, windows, profiles and gas limits in the existing docs.
- Vitest suites for all new logic.

### Changed

- License changed from MIT to all rights reserved. The source is published for reference and review only. `package.json` now says `UNLICENSED`. Contribution guidance updated: issues and discussion welcome, code contributions not accepted for now. Version 0.1.0 was published under MIT.

## [0.1.0] - 2026-10-20

### Added

- Pure swap state machine following the Monero connection spec: None, Funded, Ready, Claimed, Refunded, plus Aborted.
- Explicit rejection of invalid transitions, wrong roles, missed deadlines and clock regressions.
- Timelock calculator for T0 and T1 with per-constraint explanations.
- Scenario runner with a fake clock and trace formatter.
- Happy path, refund and punish examples.
- Vitest suites, state machine and parameter docs, CI workflow.
