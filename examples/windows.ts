import { CHAIN_PROFILES, recommendWindows } from "../src/index.js";

console.log("Recommended windows. Research model. Every default is an illustrative placeholder.");
for (const profile of Object.values(CHAIN_PROFILES)) {
  const w = recommendWindows({ profile });
  console.log();
  console.log(`${profile.id}: ${profile.label}`);
  console.log(`  T0 = ${w.t0Sec} s (${(w.t0Sec / 3600).toFixed(2)} h), T1 = ${w.t1Sec} s (${(w.t1Sec / 3600).toFixed(2)} h)`);
  console.log(`  claim safety margin = ${w.claimSafetyMarginSec} s, latest safe claim at ${w.latestSafeClaimSec} s`);
  for (const c of w.t0Components) console.log(`  T0 part     ${c.name}: ${c.seconds} s`);
  for (const c of w.claimWindowComponents) console.log(`  window part ${c.name}: ${c.seconds} s`);
  console.log(`  constraint checks pass: ${w.report.valid}`);
}
