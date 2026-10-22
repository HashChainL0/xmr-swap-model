# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions describe the state of the model, not a deployed protocol.

## [Unreleased]

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
