import { corridorGasLimit, corridorList, corridorProfile, corridorWindows } from "../src/index.js";

console.log("Corridors in priority order, direct ETH<>XMR only. Illustrative numbers.\n");
for (const c of corridorList()) {
  const p = corridorProfile(c.id);
  const w = corridorWindows(c.id);
  console.log(`${c.order}. ${c.label}`);
  console.log(`   profile: ${p.id}, block time ${p.blockTimeSec} s, data fee counts against gas limit: ${p.dataFeeCountsAgainstGasLimit}`);
  console.log(`   directions: ${c.directions.join(", ")}`);
  console.log(`   T0 ${w.t0Sec} s, T1 ${w.t1Sec} s, claim safety margin ${w.claimSafetyMarginSec} s, latest safe claim ${w.latestSafeClaimSec} s`);
  const g = corridorGasLimit(c.id, 100_000, 1.2);
  console.log(`   claim gas limit for 100000 execution gas at 1.2x: ${g.recommendedGasLimit} (data posting component ${g.input.dataPostingGas})`);
  console.log(`   checks valid: ${w.report.valid}\n`);
}
