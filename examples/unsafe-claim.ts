import {
  claimSafetyScenarios, defaultClaimSafetyMarginSec, formatTrace, marginTerms, runScenario,
} from "../src/index.js";

console.log("Claim safety. Research model, illustrative numbers.");
console.log(`T1 = ${marginTerms.t1DurationSec} s after the ETH lock, safety margin = ${defaultClaimSafetyMarginSec} s.`);
console.log("A claim inside the margin or after T1 may revert and still publish b.");

for (const scenario of claimSafetyScenarios("xmr-to-eth")) {
  console.log();
  console.log("=".repeat(72));
  console.log(scenario.description);
  console.log();
  console.log(formatTrace(runScenario(scenario)));
}
