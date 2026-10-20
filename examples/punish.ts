import { punish, formatTrace, runScenario } from "../src/index.js";

console.log(punish.description);
console.log();
console.log(formatTrace(runScenario(punish)));
