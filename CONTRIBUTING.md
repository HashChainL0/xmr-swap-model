# Contributing

Thanks for reading the model closely. This repository is a research reference for the Hash Chain Monero swap, so the most useful contributions are corrections and counterexamples.

Issues and discussion are welcome. Code contributions (pull requests) are not accepted for now. The source is all rights reserved, so any code contribution would need a written agreement with Hash Chain first. Please open an issue instead and describe the change you have in mind.

## Ways to contribute

- **Report a mismatch** between the model and the [spec](https://github.com/HashChainL0/protocol-spec). Say which document and rule.
- **Add a failing scenario** that shows a state the model accepts and should reject, or the reverse.
- **Propose parameter reasoning** for the timelock defaults. The research thread is [protocol-spec issue #5](https://github.com/HashChainL0/protocol-spec/issues/5).
- **Point out small things** such as typos and unclear wording in an issue.
- **Report a security problem** privately. See [SECURITY.md](SECURITY.md).

## If a change has been agreed

This applies only after a written agreement.

1. Create a branch.
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

The repository is all rights reserved, see [LICENSE](LICENSE). Nothing you submit in an issue or discussion grants anyone a license to the code, and a code contribution is only considered under a written agreement.
