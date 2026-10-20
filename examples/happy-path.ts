import { happyPath, formatTrace, runScenario } from "../src/index.js";

console.log(happyPath.description);
console.log();
console.log(formatTrace(runScenario(happyPath)));
