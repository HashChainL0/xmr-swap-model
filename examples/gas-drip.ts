import {
  assessClaimRoute, CHAIN_PROFILES, formatTrace, gasDripClaim, recommendedDripWei, recommendForProfile,
  relayedClaimByCounterparty, relayerCounterpartyOutcome, requiredClaimFundsWei, runScenario, sweepDataPosting,
} from "../src/index.js";
import type { ClaimRoute } from "../src/index.js";

console.log("Gas drip for a claim into a fresh address. Research model. Every number is illustrative.");
console.log();

const profile = CHAIN_PROFILES["layer-2-rollup"];
const executionGas = 100_000;
const maxFeePerGasWei = 1_000_000n;
const rec = recommendForProfile(profile, executionGas, 1.3);
console.log(`gas limit: execution ${executionGas} + data posting ${rec.input.dataPostingGas}, x1.3 = ${rec.recommendedGasLimit}`);
const drip = recommendedDripWei({ claimGasLimit: rec.recommendedGasLimit, maxFeePerGasWei, feeBufferBps: 15_000 });
const required = requiredClaimFundsWei(rec.recommendedGasLimit, maxFeePerGasWei);
console.log(`required claim funds: ${required} wei, drip with 1.5x fee buffer: ${drip} wei`);
console.log();

console.log("Why a fixed gas limit fails once a data posting fee exists (fixed limit 150000):");
for (const r of sweepDataPosting(150_000, executionGas, 1.3, [0, 20_000, 50_000, 100_000, 400_000])) {
  console.log(
    `  data posting ${String(r.dataPostingGas).padStart(6)}: fixed ${r.fixedLimitOk ? "ok" : `FAILS, short by ${r.fixedLimitShortfallGas}`}, recommended ${r.recommendedGasLimit}`,
  );
}
console.log();

console.log("Claim routes for a user whose receiving address starts with a zero balance:");
const routes: ClaimRoute[] = ["self", "self-with-gas-drip", "relayed-by-counterparty"];
for (const route of routes) {
  const a = assessClaimRoute(route, { userBalanceWei: 0n, dripWei: route === "self-with-gas-drip" ? drip : 0n, requiredWei: required });
  console.log(`  ${route}: ${a.verdict.toUpperCase()}, submitter ${a.submitter}, secret leaves user ${a.secretLeavesUser}`);
  for (const reason of a.reasons) console.log(`      ${reason}`);
}
console.log();
const t1 = relayedClaimByCounterparty.terms.t1DurationSec;
console.log(`A relayer that is the counterparty, if it holds b until T1 (${t1} s):`);
console.log(`  ${relayerCounterpartyOutcome(t1, t1).explanation}`);

for (const scenario of [gasDripClaim, relayedClaimByCounterparty]) {
  console.log();
  console.log("=".repeat(72));
  console.log(scenario.description);
  console.log();
  console.log(formatTrace(runScenario(scenario)));
}
