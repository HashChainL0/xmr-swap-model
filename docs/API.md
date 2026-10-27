# API

> Research model. Not a working swap. Every function is pure arithmetic or a pure state transition: no keys, no network, no clock. Every default number is an illustrative placeholder.

Everything is exported from `src/index.ts` (`dist/src/index.js` after `npm run build`). This page lists what is there and which module owns it. Types are in `src/types.ts`.

## Conventions

- Times are seconds. `T0` and `T1` are offsets from the ETH lock, and `transition` takes an explicit `now` instead of reading a clock.
- Wei and piconero amounts are `bigint`. Gas units and seconds are `number`.
- Invalid arguments throw a `RangeError` that names the argument. A rejected swap event is not an exception: `transition` returns `{ ok: false, error }` with a `TransitionErrorCode`.
- Results are plain objects and are never mutated. `transition` returns a new state.

## State machine (`state-machine.ts`)

| Export | Purpose |
| --- | --- |
| `createSwap(terms)` | New swap in `None`. Validates the terms, including the optional claim safety margin |
| `transition(state, event, now)` | Applies one event. Returns `{ ok: true, state }` or `{ ok: false, error }` |
| `availableActions(state, now)` | Event types the state machine would accept right now |
| `isFinal(state)` | True in `Claimed`, `Refunded` and `Aborted` |
| `roleOf(event)` | The role an event is performed by, or `null` for an observation |

See [STATE-MACHINE.md](STATE-MACHINE.md) for the transition table.

## Timelocks and windows

| Export | Module | Purpose |
| --- | --- | --- |
| `computeTimelocks(config?)`, `DEFAULT_TIMELOCK_CONFIG` | `timelocks.ts` | `T0`, `T1` and an explanation per component |
| `validateTimelocks(t0, t1, config?)` | `timelocks.ts` | One check per constraint, each with an explanation |
| `resolveConfig`, `minimumT0Sec`, `minimumClaimWindowSec` | `timelocks.ts` | Defaults merged with overrides, and the lower bounds |
| `recommendWindows(inputs)`, `defaultWindowInputs(profile)` | `windows.ts` | Windows with detection latency, clock skew and the claim safety margin |

See [PARAMETERS.md](PARAMETERS.md).

## Claim safety and gas

| Export | Module | Purpose |
| --- | --- | --- |
| `classifyClaim(t1At, now, marginSec)` | `claim-safety.ts` | `safe`, `unsafe-margin` or `late`, with whether `b` is exposed if it reverts |
| `latestSafeClaimTime(t1At, marginSec)` | `claim-safety.ts` | `t1At - marginSec` |
| `recommendClaimSafetyMargin(inputs)` | `claim-safety.ts` | Margin from inclusion, congestion, detection and skew, rounded up to whole blocks |
| `recommendGasLimit`, `recommendForProfile` | `layer2.ts` | Gas limit from execution gas, data posting component and a multiplier |
| `checkFixedLimit`, `sweepDataPosting` | `layer2.ts` | Show a hard coded limit failing as the data component grows |
| `requiredClaimFundsWei`, `recommendedDripWei` | `gas-drip.ts` | Gas drip for a claim into a zero balance address |
| `assessClaimRoute`, `relayerCounterpartyOutcome` | `gas-drip.ts` | Verdict per claim route, and what a counterparty relayer gains by waiting |

See [CLAIM-SAFETY.md](CLAIM-SAFETY.md).

## Profiles and corridors

| Export | Module | Purpose |
| --- | --- | --- |
| `CHAIN_PROFILES`, `getChainProfile(id)` | `profiles.ts` | Chain profiles as plain data |
| `CORRIDORS`, `corridorList()`, `getCorridor(id)` | `corridors.ts` | The three direct corridors in priority order |
| `isCorridorId(value)`, `parseCorridorId(value)` | `corridors.ts` | Narrow a runtime string to a corridor id |
| `corridorProfile(id)`, `corridorWindows(id, overrides?)`, `corridorGasLimit(id, ...)` | `corridors.ts` | Profile, windows and claim gas limit for one corridor |

See [CORRIDORS.md](CORRIDORS.md).

## Directions, scenarios and outcomes

| Export | Module | Purpose |
| --- | --- | --- |
| `DIRECTIONS`, `directionInfo`, `partyOf`, `fundsLocked` | `directions.ts` | Role to party mapping and who has funds locked for how long |
| `runScenario(scenario)`, `formatTrace(result)` | `simulate.ts` | Run scripted events against a fake clock and print the trace |
| `scenarios`, `allScenarios`, `directionScenarios(direction)`, `claimSafetyScenarios(direction)` | `scenarios.ts` | Bundled scenarios |
| `summarizeOutcome(result)` | `outcome.ts` | Who ends up with what, including the case where one party ends with both sides |

## Stability

The package is private and not published. Names can change between releases of the model, and changes are listed in the [changelog](../CHANGELOG.md).
