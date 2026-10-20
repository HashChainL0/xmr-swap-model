# Contributing

Thanks for reading the model closely. This repository is a research reference for the Hash Chain Monero swap, so the most useful contributions are corrections and counterexamples.

## Ways to contribute

- **Report a mismatch** between the model and the [spec](https://github.com/HashChainL0/protocol-spec). Say which document and rule.
- **Add a failing scenario** that shows a state the model accepts and should reject, or the reverse.
- **Propose parameter reasoning** for the timelock defaults. The research thread is [protocol-spec issue #5](https://github.com/HashChainL0/protocol-spec/issues/5).
- **Fix small things** such as typos and unclear wording directly with a pull request.
- **Report a security problem** privately. See [SECURITY.md](SECURITY.md).

## Pull request process

1. Fork the repository and create a branch.
2. Change one topic per pull request.
3. Run `npm run typecheck` and `npm test`. Both must pass.
4. If you change a transition, update `docs/STATE-MACHINE.md` and add or change tests, including the invalid cases.
5. Explain in the description what changed and why, and link the spec section it follows.

## Style

- TypeScript strict, ESM, no `any`, no runtime dependencies.
- The state machine stays pure and deterministic: no clocks, randomness, I/O or network.
- Use the spec's terms: ETH holder, XMR holder, joint address, adaptor secret, `T0`, `T1`.
- Do not describe the model as audited, deployed or safe for funds.
- No invented numbers. Parameter defaults are placeholders and say so.
- Use commas, colons and periods. Do not use em dashes.
- Comments only where the logic is not obvious.

## Code of Conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contribution is licensed under the MIT License, the same license as the rest of the repository.
