# Walkthrough with the default numbers

> Research model. Not a working swap. Every number below comes from placeholder defaults and is shown only so the arithmetic can be followed. Run the code to reproduce them.

## 1. The basic plan

`computeTimelocks()` with no arguments gives offsets from the moment the ETH is locked.

| Part | Seconds | How it is made |
| --- | --- | --- |
| Counterparty lock allowance | 3600 | Time for the XMR holder to check the terms and broadcast the XMR lock |
| Confirmation wait | 2400 | 10 confirmations x 120 s x variance factor 2 |
| ETH holder online margin | 14400 | Slack so a briefly offline ETH holder can still signal ready |
| **T0** | **20400** | The three parts above, 1700 blocks of 12 s |
| Claim window | 21840 | XMR holder online margin 21600 plus 20 blocks x 12 s for inclusion |
| **T1** | **42240** | T0 plus the claim window, 3520 blocks |

`validateTimelocks(20400, 42240)` passes every check. Shorten T0 to 3600 and `t0-covers-confirmations` fails, and the explanation states the 6000 s that T0 needs.

## 2. The same swap with detection latency and a safety margin

`recommendWindows` adds what the basic plan leaves out: event detection latency, clock skew and the claim safety margin. With the default inputs and the illustrative `ethereum-l1` profile:

| Part | Seconds |
| --- | --- |
| T0 components: lock allowance 3600, confirmation wait 2400, detection latency 60 (two polls of 30 s), clock skew 30, ETH holder online margin 14400 | 20490 |
| **T0**, rounded up to whole 12 s blocks | **20496** |
| Claim window components: XMR holder online margin 21600, detection latency 30, clock skew 30, claim safety margin 420 | 22080 |
| **T1** | **42576** |
| Latest safe claim, T1 minus the margin | 42156 |

The margin of 420 s is 20 blocks x 12 s x congestion factor 1.5 = 360 s, plus 30 s of detection and 30 s of skew, which is already a whole number of blocks.

## 3. The same on the layer 2 profile

The `layer-2-rollup` profile has a 2 s block time and 30 claim inclusion blocks, so the margin shrinks to 150 s and the windows come out at T0 20490 and T1 42300 (claim window 21810). The block time matters twice: it sets the rounding step and the time an inclusion takes. The data posting component does not change the windows. It changes the gas limit, see `recommendForProfile` and [PARAMETERS.md](PARAMETERS.md).

## 4. Reading a claim against the plan

Take T1 = 42576 and a margin of 420 s.

| Claim time (offset from the ETH lock) | `classifyClaim` zone | Why |
| --- | --- | --- |
| 40000 | `safe` | More than 420 s before T1 |
| 42200 | `unsafe-margin` | 376 s before T1, inside the margin. It could miss T1 and still show `b` |
| 42576 | `late` | At T1, so the claim is rejected while `b` is visible |

Run `npm run example:windows` and `npm run example:unsafe-claim` to see these printed, and read [CLAIM-SAFETY.md](CLAIM-SAFETY.md) for why the margin exists.
