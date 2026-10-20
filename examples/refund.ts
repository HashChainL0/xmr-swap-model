import { refund, formatTrace, runScenario } from "../src/index.js";

console.log(refund.description);
console.log();
console.log(formatTrace(runScenario(refund)));
