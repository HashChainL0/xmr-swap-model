import { directionInfo, directionScenarios, formatTrace, fundsLocked, runScenario } from "../src/index.js";
import type { Direction } from "../src/index.js";

/** Prints every scenario of one direction with who had funds locked and for how long. */
export function printDirection(direction: Direction): void {
  const info = directionInfo(direction);
  console.log(`${direction}: ${info.summary}`);
  console.log("Research model. Amounts and times are illustrative.");
  for (const scenario of directionScenarios(direction)) {
    const result = runScenario(scenario);
    console.log();
    console.log("=".repeat(72));
    console.log(scenario.description);
    console.log();
    console.log(formatTrace(result));
    console.log();
    for (const l of fundsLocked(result)) {
      const who = l.party ?? l.role;
      const end = l.stillLocked ? "still locked at the last step" : `released at t=${l.releasedAt}s`;
      console.log(`locked: ${who} ${l.asset} from t=${l.lockedAt}s, ${end}, ${l.lockedForSec} s (${(l.lockedForSec / 3600).toFixed(2)} h)`);
    }
  }
}
